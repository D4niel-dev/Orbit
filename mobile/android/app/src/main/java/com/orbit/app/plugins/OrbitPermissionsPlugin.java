package com.orbit.app.plugins;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Check and request the runtime permissions Orbit needs — in one place.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this, the app asked for permissions from three unrelated spots and
 * none of them could tell whether the answer was already yes:
 *
 *   - MainActivity asked for POST_NOTIFICATIONS on every cold start;
 *   - the web layer called LocalNotifications.requestPermissions() at boot;
 *   - and it opened the CAMERA on every launch — `getUserMedia({video:true})`
 *     then immediately stopping the tracks — purely to provoke the OS prompt.
 *
 * The last one is the worst: the camera indicator lit up on every start whether
 * or not the user was about to scan anything. And because nothing could READ the
 * current state, a granted permission was asked for again, forever.
 *
 * checkSelfPermission() is the missing piece — it answers "is this already
 * granted?" without provoking anything — and that is what makes a startup pass
 * possible that asks only for what is actually missing.
 *
 * The web layer owns the presentation (a bottom sheet, in the app's own
 * vocabulary). This plugin only answers questions and raises the system dialogs.
 */
@CapacitorPlugin(
    name = "OrbitPermissions",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "nearby", strings = { Manifest.permission.NEARBY_WIFI_DEVICES })
    }
)
public class OrbitPermissionsPlugin extends Plugin {

    private static final String TAG = "OrbitPermissions";

    /** Every runtime permission the app asks about, in the order the sheet shows them. */
    private static final String[] ALIASES = { "notifications", "camera", "microphone", "nearby" };

    /**
     * The current state of everything, plus the battery exemption.
     *
     * Battery is NOT a runtime permission — it has no dialog and is granted from
     * a Settings screen — so it is reported here as `granted` / `prompt` and
     * requested through its own method.
     */
    @PluginMethod
    public void check(PluginCall call) {
        call.resolve(state());
    }

    /**
     * Ask for every alias that is not already granted.
     *
     * Anything already granted is left alone — asking again for a permission the
     * user has given is what made the old startup feel like it was nagging.
     */
    @PluginMethod
    public void request(PluginCall call) {
        java.util.List<String> missing = new java.util.ArrayList<>();
        for (String alias : ALIASES) {
            if (getPermissionState(alias) != PermissionState.GRANTED) missing.add(alias);
        }
        if (missing.isEmpty()) {
            call.resolve(state());
            return;
        }
        requestPermissionForAliases(missing.toArray(new String[0]), call, "afterRequest");
    }

    /** Capacitor hands the result back here; resolve with the state as it now stands. */
    @PermissionCallback
    private void afterRequest(PluginCall call) {
        if (call == null) return;
        call.resolve(state());
    }

    /**
     * The battery-optimisation exemption.
     *
     * Special-cased everywhere because it is not a permission: Android shows a
     * system dialog raised by an Intent, and the answer only shows up in
     * PowerManager. Without it the OS is free to freeze the foreground service and
     * a message can sit undelivered until the app is next opened.
     */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        openSettingsIntent(call, Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
    }

    /**
     * "Install unknown apps" — what Orbit needs to update itself.
     *
     * ⚠ NOT A RUNTIME PERMISSION EITHER, for the same reason as battery: it is an
     * appop, so `requestPermissions()` cannot raise it and there is no dialog to
     * accept. It is granted from a Settings screen, which is why it is a row of
     * its own in the sheet rather than part of the Allow button.
     *
     * ⚠ IT WAS ALREADY BEING ASKED FOR, AT THE WORST POSSIBLE MOMENT.
     * OrbitP2PPlugin.installApk() opens this same Settings screen and then
     * rejects the call with NEED_INSTALL_PERMISSION — so the user tapped Update,
     * waited for a download, and was thrown into Settings with the update
     * abandoned. Asking at startup means the download is not wasted.
     */
    @PluginMethod
    public void requestInstallPackages(PluginCall call) {
        openSettingsIntent(call, Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
    }

    /**
     * Open a Settings screen for this package, then resolve with the state as it
     * stands. The answer arrives on a screen we do not control, so the real value
     * is read on the next check() rather than here — the web layer re-checks when
     * the app comes back to the foreground.
     */
    private void openSettingsIntent(PluginCall call, String action) {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(action, Uri.parse("package:" + ctx.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "could not open the settings screen for " + action, e);
        }
        call.resolve(state());
    }

    /** The whole picture, as a flat object the web layer can compare against. */
    private JSObject state() {
        JSObject out = new JSObject();
        for (String alias : ALIASES) {
            // ⚠ getPermissionState() is a MAP LOOKUP — `bridge.getPermissionStates(this)`
            // keyed by alias — so an alias the bridge does not know about comes back
            // null. Calling toString() on that would NPE and take the whole sheet
            // down, so an unknown alias reads as "prompt": askable, never fatal.
            PermissionState st = getPermissionState(alias);
            out.put(alias, st == null ? "prompt" : st.toString());
        }
        // The two appops, reported in the same vocabulary as the permissions so
        // the web layer does not need to know they are a different kind of thing.
        out.put("battery", isIgnoringBatteryOptimizations() ? "granted" : "prompt");
        out.put("installPackages", canInstallPackages() ? "granted" : "prompt");
        out.put("sdk", Build.VERSION.SDK_INT);
        return out;
    }

    /**
     * Whether Orbit may hand an APK to the system installer.
     *
     * ⚠ Always true below API 26: "install unknown apps" was a single global
     * switch then, not a per-app appop, so there is nothing this app can ask for
     * and reporting "prompt" would put a row in the sheet that can never be
     * satisfied.
     */
    private boolean canInstallPackages() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
            Context ctx = getContext();
            return ctx.getPackageManager().canRequestPackageInstalls();
        } catch (Exception e) {
            // Unknown reads as "already fine": a wrong answer here costs the user
            // one unnecessary Settings trip, not a broken update.
            return true;
        }
    }

    private boolean isIgnoringBatteryOptimizations() {
        try {
            Context ctx = getContext();
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        } catch (Exception e) {
            // Unknown is reported as "not exempt" rather than throwing: a wrong
            // answer here only costs the user one dialog.
            return false;
        }
    }
}

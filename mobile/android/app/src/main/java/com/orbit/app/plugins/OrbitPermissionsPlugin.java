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
        try {
            Context ctx = getContext();
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) {
                call.resolve(state());
                return;
            }
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + ctx.getPackageName()));
            // The app's own REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission (in the
            // manifest) is what allows this intent to raise the dialog directly.
            getActivity().startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "could not open the battery-optimisation dialog", e);
        }
        // The user answers in a system dialog, so the real state is read on the
        // next check rather than here.
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
        out.put("battery", isIgnoringBatteryOptimizations() ? "granted" : "prompt");
        out.put("sdk", Build.VERSION.SDK_INT);
        return out;
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

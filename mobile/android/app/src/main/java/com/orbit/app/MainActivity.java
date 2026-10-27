package com.orbit.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.orbit.app.plugins.OrbitP2PPlugin;
import com.orbit.app.services.OrbitForegroundService;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Install splash screen BEFORE super.onCreate() — prevents splash exit from re-showing bars
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        if (splashScreen != null) {
            splashScreen.setKeepOnScreenCondition(() -> false);
        }

        // Register plugin BEFORE super.onCreate() — known requirement from v0.0.9.1-beta fix
        registerPlugin(OrbitP2PPlugin.class);
        registerPlugin(com.orbit.app.plugins.OrbitSharePlugin.class);
        // Checks and requests the runtime permissions the app needs. The web layer
        // owns the sheet that explains them; this only answers and raises dialogs.
        registerPlugin(com.orbit.app.plugins.OrbitPermissionsPlugin.class);
        // Native WebRTC DataChannel for the hybrid transport. ⚠ There is no Capacitor WebRTC
        // plugin to adopt (checked npm), and the WebView's RTCPeerConnection dies when the
        // app is backgrounded — so the connection has to live in native code.
        registerPlugin(com.orbit.app.plugins.OrbitWebRTCPlugin.class);

        super.onCreate(savedInstanceState);

        // A share that started the app. This runs before the WebView exists, so
        // the intent is parked for the web layer to collect when it is ready.
        com.orbit.app.plugins.OrbitSharePlugin.stashIntent(getApplicationContext(), getIntent());

        // ⚠ NO PERMISSION IS ASKED FOR HERE ANY MORE.
        //
        // This used to raise the POST_NOTIFICATIONS dialog on every cold start,
        // unconditionally — it could not tell whether the answer was already yes,
        // so a user who had granted it was asked again, forever.
        //
        // Asking now happens once, in the web layer, through OrbitPermissions:
        // it reads the current state first and only raises a dialog for what is
        // actually missing. One funnel, and the sheet can explain WHY before the
        // system dialog appears. See js/components/permission-gate.js.

        enableImmersiveMode();
        createNotificationChannels();
        startForegroundService();
    }

    /**
     * A share arriving while Orbit is already running.
     *
     * `singleTask` in the manifest means Android reuses this instance instead of
     * starting a second copy, so the intent lands here rather than in onCreate —
     * and if the web layer had already collected the previous one, this is a
     * fresh share that needs its own stash.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Keep getIntent() in step, or a later read returns the stale one.
        setIntent(intent);
        com.orbit.app.plugins.OrbitSharePlugin.stashIntent(getApplicationContext(), intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        enableImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    private void enableImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // API 30+ — modern WindowInsetsController API
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            // API 24-29 — legacy SYSTEM_UI_FLAG approach
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            );
        }
    }

    private void createNotificationChannels() {
        // All channels live in OrbitNotifications. Creating only the service channel
        // here is what left "orbit_messages" undefined — and Android silently drops
        // a notification posted to a channel that does not exist.
        try {
            OrbitNotifications.ensureChannels(this);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void startForegroundService() {
        try {
            var serviceIntent = new Intent(this, OrbitForegroundService.class);
            serviceIntent.setAction(OrbitForegroundService.ACTION_START);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void stopForegroundService() {
        try {
            var serviceIntent = new Intent(this, OrbitForegroundService.class);
            serviceIntent.setAction(OrbitForegroundService.ACTION_STOP);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

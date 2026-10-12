package com.orbit.app.plugins;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import com.orbit.app.services.OrbitForegroundService;
import com.orbit.app.services.OrbitForegroundService.FgEvent;

@CapacitorPlugin(name = "OrbitP2P")
public class OrbitP2PPlugin extends Plugin {

    private static final String TAG = "OrbitP2P";
    // Ceiling for reading a backup file out of Downloads in one go. The JS reader
    // holds the whole file too, so this is not a new limit — it turns an
    // uncatchable WebView OOM into a message that names the size.
    private static final long MAX_BACKUP_BYTES = 128L * 1024 * 1024;
    private final Handler drainHandler = new Handler(Looper.getMainLooper());
    private volatile OrbitForegroundService boundService = null;
    private boolean serviceBound = false;
    private boolean serviceStarting = false;
    private final Runnable drainRunnable = new Runnable() {
        @Override
        public void run() {
            drainEvents();
            drainHandler.postDelayed(this, 100);
        }
    };

    // Foreground tracking — updated by JS via setForeground()
    private volatile boolean _isForeground = true;
    // Our own user id, set by JS via setIdentity(). Needed to tell whether an
    // incoming message actually @mentions us while the WebView is paused.
    private volatile String _selfId = "";
    private android.app.Application.ActivityLifecycleCallbacks _lifecycle = null;
    private int _startedActivities = 0;

    // ── Service lifecycle ──

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            Log.d(TAG, "Service connected");
            if (service instanceof OrbitForegroundService.ServiceBinder) {
                boundService = ((OrbitForegroundService.ServiceBinder) service).getService();
            }
            serviceBound = true;
            startDraining();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.d(TAG, "Service disconnected");
            serviceBound = false;
            boundService = null;
            stopDraining();
        }
    };

    private void ensureServiceRunning() {
        Context ctx = getContext();
        if (ctx == null) return;
        if (boundService != null) return;
        if (serviceStarting) return;
        serviceStarting = true;
        Intent intent = new Intent(ctx, OrbitForegroundService.class);
        ctx.startForegroundService(intent);
        ctx.bindService(intent, connection, Context.BIND_AUTO_CREATE);
    }

    private void stopService() {
        Context ctx = getContext();
        if (ctx == null) return;
        stopDraining();
        if (serviceBound) {
            try { ctx.unbindService(connection); } catch (Exception ignored) {}
            serviceBound = false;
        }
        Intent intent = new Intent(ctx, OrbitForegroundService.class);
        ctx.stopService(intent);
        serviceStarting = false;
    }

    // ── Event draining ──

    private void startDraining() {
        drainHandler.removeCallbacks(drainRunnable);
        drainHandler.post(drainRunnable);
    }

    private void stopDraining() {
        drainHandler.removeCallbacks(drainRunnable);
    }

    private void drainEvents() {
        FgEvent ev;
        while ((ev = OrbitForegroundService.eventQueue.poll()) != null) {
            if (ev == null) continue;
            try {
                switch (ev.type) {
                    case "message":
                        JSObject msgObj = new JSObject();
                        msgObj.put("connectionId", ev.connectionId);
                        msgObj.put("data", ev.data);
                        notifyListeners("onMessage", msgObj);
                        // Create native notification if app is in background
                        // (JS WebView may be paused, so LocalNotifications.schedule() is unreliable)
                        if (!_isForeground) {
                            postMessageNotification(ev.data);
                        }
                        break;
                    case "connection":
                        JSObject connObj = new JSObject();
                        connObj.put("connectionId", ev.connectionId);
                        connObj.put("host", ev.host != null ? ev.host : "");
                        notifyListeners("onConnection", connObj);
                        break;
                    case "disconnect":
                        JSObject discObj = new JSObject();
                        discObj.put("connectionId", ev.connectionId);
                        notifyListeners("onDisconnect", discObj);
                        break;
                    case "peerFound":
                        JSObject peerObj = new JSObject();
                        peerObj.put("host", ev.host);
                        peerObj.put("beacon", ev.data);
                        notifyListeners("onPeerFound", peerObj);
                        break;
                    case "sendFailed":
                    case "connectFailed":
                        JSObject errObj = new JSObject();
                        errObj.put("connectionId", ev.connectionId);
                        errObj.put("error", ev.data);
                        errObj.put("host", ev.host != null ? ev.host : "");
                        notifyListeners("on" + Character.toUpperCase(ev.type.charAt(0)) + ev.type.substring(1), errObj);
                        break;
                }
            } catch (Exception e) {
                Log.e(TAG, "Error draining event: " + e.getMessage());
            }
        }
    }

    // ── Native background notification ──

    private void postMessageNotification(String rawData) {
        try {
            org.json.JSONObject pkt = new org.json.JSONObject(rawData);
            org.json.JSONObject payload = pkt.optJSONObject("payload");
            if (payload == null) return;

            String fromId = payload.optString("from", "");
            String text = payload.optString("text", "");
            String fromName = payload.optString("fromName", fromId);
            String chatId = payload.optString("chatId", "");
            String groupId = payload.optString("groupId", "");

            if (fromId.isEmpty() && groupId.isEmpty()) return;
            if (text.isEmpty()) text = "(media / attachment)";
            if (fromName.isEmpty()) fromName = fromId;

            Context ctx = getContext();
            if (ctx == null) return;

            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            // Tap opens main activity
            Intent intent = new Intent(ctx, com.orbit.app.MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                ctx, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Route through the shared notification layer. The old code built the
            // notification inline against channel "orbit_messages", which nothing
            // ever created — Android silently drops a notification whose channel is
            // missing, so this path never showed anything on API 26+. It also used
            // android.R.drawable.ic_dialog_info, the generic info icon.
            boolean isMention = false;
            org.json.JSONArray mentions = payload.optJSONArray("mentions");
            if (mentions != null && mentions.length() > 0 && _selfId != null && !_selfId.isEmpty()) {
                for (int i = 0; i < mentions.length(); i++) {
                    org.json.JSONObject m = mentions.optJSONObject(i);
                    if (m != null && _selfId.equals(m.optString("userId", ""))) { isMention = true; break; }
                }
            }

            // Group key = the chat, so several messages from one chat collapse into a
            // single notification instead of stacking.
            String groupKey = !chatId.isEmpty() ? chatId : groupId;

            // The avatar comes from the cache the renderer pushes (see
            // OrbitNotifications.setPeerAvatars) — this path only has the packet,
            // and a MESSAGE packet deliberately carries no image.
            String avatar = com.orbit.app.OrbitNotifications.avatarFor(fromId);

            com.orbit.app.OrbitNotifications.post(
                    ctx,
                    isMention ? com.orbit.app.OrbitNotifications.Kind.MENTION
                              : com.orbit.app.OrbitNotifications.Kind.MESSAGE,
                    fromName, text, groupKey, intent, avatar);
            Log.d(TAG, "Posted native notification from " + fromName + (isMention ? " (mention)" : ""));
        } catch (Exception e) {
            Log.e(TAG, "Failed to post native notification", e);
        }
    }

    // ── Plugin lifecycle ──

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "Plugin load");
        registerLifecycle();
    }

    /**
     * Track foreground/background from the activity lifecycle, natively.
     *
     * This used to depend on JS: the app's appStateChange listener (from the
     * Capacitor App plugin) called setForeground(). But that plugin is not installed,
     * so the listener was never registered, _isForeground stayed true forever, and
     * the background notification path — gated on !_isForeground — never ran.
     * Watching the lifecycle here removes the dependency, and is strictly more
     * reliable: the whole point is to keep working while the WebView is paused.
     */
    private void registerLifecycle() {
        try {
            final android.app.Application app = getActivity().getApplication();
            _lifecycle = new android.app.Application.ActivityLifecycleCallbacks() {
                @Override public void onActivityStarted(android.app.Activity activity) {
                    _startedActivities++;
                    if (_startedActivities == 1) setForegroundState(true);
                }
                @Override public void onActivityStopped(android.app.Activity activity) {
                    _startedActivities = Math.max(0, _startedActivities - 1);
                    if (_startedActivities == 0) setForegroundState(false);
                }
                @Override public void onActivityCreated(android.app.Activity a, android.os.Bundle b) {}
                @Override public void onActivityResumed(android.app.Activity a) {}
                @Override public void onActivityPaused(android.app.Activity a) {}
                @Override public void onActivitySaveInstanceState(android.app.Activity a, android.os.Bundle b) {}
                @Override public void onActivityDestroyed(android.app.Activity a) {}
            };
            app.registerActivityLifecycleCallbacks(_lifecycle);
        } catch (Exception e) {
            Log.w(TAG, "Could not register lifecycle callbacks", e);
        }
    }

    private void setForegroundState(boolean fg) {
        if (_isForeground == fg) return;
        _isForeground = fg;
        Log.d(TAG, "Foreground -> " + fg);
        // Keep JS in sync without needing the Capacitor App plugin.
        JSObject data = new JSObject();
        data.put("isForeground", fg);
        notifyListeners("foreground", data);
    }

    /**
     * Hands a downloaded APK to the system installer.
     *
     * Orbit is sideloaded, so this is the only way an update can be applied. Android
     * requires the user to have allowed "install unknown apps" for Orbit; on API 26+
     * we check that up front and send them to the right settings screen rather than
     * letting the install fail with no explanation. JS tells the two failure modes
     * apart by the rejection code.
     */
    @PluginMethod
    public void installApk(PluginCall call) {
        try {
            String path = call.getString("path", "");
            if (path == null || path.isEmpty()) { call.reject("path is required"); return; }

            Context ctx = getContext();
            if (ctx == null) { call.reject("no context"); return; }

            java.io.File file = new java.io.File(ctx.getCacheDir(), path);
            if (!file.exists()) { call.reject("APK not found: " + path); return; }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !ctx.getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(
                        android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        android.net.Uri.parse("package:" + ctx.getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(settings);
                call.reject("Allow Orbit to install updates, then try again.",
                            "NEED_INSTALL_PERMISSION");
                return;
            }

            android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(
                    ctx, ctx.getPackageName() + ".fileprovider", file);

            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                           | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(install);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "installApk failed", e);
            call.reject("Could not start the installer: " + e.getMessage());
        }
    }

    /**
     * Zips a vault directory into a single file in the cache dir.
     *
     * The v2 vault is a DIRECTORY of chunk files (see components/vault.js), which is
     * what makes a large account backable-up at all — but a directory cannot be shared
     * or moved off the device as-is. Zipping it here, natively, gets real DEFLATE from
     * the platform instead of a hand-rolled JS encoder, and produces one artifact the
     * share sheet can hand to Drive, Files, or another device.
     */
    @PluginMethod
    public void zipVault(PluginCall call) {
        try {
            String srcDir = call.getString("srcDir", "");
            if (srcDir == null || srcDir.isEmpty()) { call.reject("srcDir is required"); return; }

            Context ctx = getContext();
            if (ctx == null) { call.reject("no context"); return; }

            java.io.File src = new java.io.File(ctx.getFilesDir(), srcDir);
            if (!src.isDirectory()) { call.reject("vault not found: " + srcDir); return; }

            String name = src.getName();
            java.io.File out = new java.io.File(ctx.getCacheDir(), name + ".zip");
            if (out.exists() && !out.delete()) { /* overwrite anyway */ }

            int count = 0;
            long bytes = 0;
            java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(
                    new java.io.BufferedOutputStream(new java.io.FileOutputStream(out)));
            try {
                zos.setLevel(java.util.zip.Deflater.BEST_SPEED);
                java.io.File[] children = src.listFiles();
                if (children == null) { call.reject("vault is empty"); return; }

                byte[] buf = new byte[64 * 1024];
                for (java.io.File child : children) {
                    if (child.isDirectory()) {
                        java.io.File[] inner = child.listFiles();
                        if (inner == null) continue;
                        for (java.io.File f : inner) {
                            java.io.FileInputStream in = new java.io.FileInputStream(f);
                            try {
                                zos.putNextEntry(new java.util.zip.ZipEntry(
                                        child.getName() + "/" + f.getName()));
                                int n;
                                while ((n = in.read(buf)) > 0) { zos.write(buf, 0, n); bytes += n; }
                                zos.closeEntry();
                                count++;
                            } finally {
                                in.close();
                            }
                        }
                    } else {
                        java.io.FileInputStream in = new java.io.FileInputStream(child);
                        try {
                            zos.putNextEntry(new java.util.zip.ZipEntry(child.getName()));
                            int n;
                            while ((n = in.read(buf)) > 0) { zos.write(buf, 0, n); bytes += n; }
                            zos.closeEntry();
                            count++;
                        } finally {
                            in.close();
                        }
                    }
                }
            } finally {
                zos.close();
            }

            JSObject res = new JSObject();
            res.put("path", out.getName());          // relative to the cache dir
            res.put("size", out.length());
            res.put("entries", count);
            res.put("sourceBytes", bytes);
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "zipVault failed", e);
            call.reject("Could not zip the backup: " + e.getMessage());
        }
    }

    /**
     * Shares a file from the cache dir through the system share sheet.
     *
     * This is how a backup gets off the device. On Android 10+ an app cannot simply
     * write into a browsable public folder, so handing a content:// URI to the share
     * sheet is both the correct pattern and the more useful one — the user picks where
     * it goes (Files, Drive, another device over Orbit itself).
     */
    @PluginMethod
    public void shareFile(PluginCall call) {
        try {
            String path = call.getString("path", "");
            String mime = call.getString("mime", "application/octet-stream");
            String title = call.getString("title", "Share");
            if (path == null || path.isEmpty()) { call.reject("path is required"); return; }

            Context ctx = getContext();
            if (ctx == null) { call.reject("no context"); return; }

            java.io.File file = new java.io.File(ctx.getCacheDir(), path);
            if (!file.exists()) { call.reject("file not found: " + path); return; }

            android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(
                    ctx, ctx.getPackageName() + ".fileprovider", file);

            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "shareFile failed", e);
            call.reject("Could not share the file: " + e.getMessage());
        }
    }

    /**
     * Copies a file from the cache dir into the public Downloads folder.
     *
     * This is the better default for a large backup: the share sheet works, but
     * email and most chat apps will refuse a 500 MB attachment, whereas Downloads is
     * exactly where someone goes looking for a backup file afterwards.
     *
     * On Android 10+ MediaStore is the only way to write somewhere a file manager can
     * see without asking for a storage permission. On API 24-28 it falls back to the
     * public directory plus a media scan — that path needs WRITE_EXTERNAL_STORAGE at
     * runtime, so if it is refused we reject and JS falls back to sharing instead of
     * failing with no explanation.
     */
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        try {
            String path = call.getString("path", "");
            String mime = call.getString("mime", "application/zip");
            String displayName = call.getString("displayName", "orbit-backup.zip");
            if (path == null || path.isEmpty()) { call.reject("path is required"); return; }

            Context ctx = getContext();
            if (ctx == null) { call.reject("no context"); return; }

            java.io.File src = new java.io.File(ctx.getCacheDir(), path);
            if (!src.exists()) { call.reject("file not found: " + path); return; }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                android.content.ContentValues cv = new android.content.ContentValues();
                cv.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, displayName);
                cv.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mime);
                cv.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,
                       android.os.Environment.DIRECTORY_DOWNLOADS);

                android.net.Uri item = ctx.getContentResolver().insert(
                        android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (item == null) { call.reject("Could not create the Downloads entry"); return; }

                java.io.InputStream in = new java.io.FileInputStream(src);
                java.io.OutputStream os = ctx.getContentResolver().openOutputStream(item);
                if (os == null) { in.close(); call.reject("Could not open Downloads for writing"); return; }
                try {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                } finally {
                    try { in.close(); } catch (Exception e) {}
                    try { os.close(); } catch (Exception e) {}
                }
                JSObject res = new JSObject();
                res.put("uri", item.toString());
                res.put("displayName", displayName);
                res.put("location", "Downloads");
                call.resolve(res);
                return;
            }

            // API 24-28
            java.io.File dir = android.os.Environment.getExternalStoragePublicDirectory(
                    android.os.Environment.DIRECTORY_DOWNLOADS);
            if (dir == null || (!dir.exists() && !dir.mkdirs())) {
                call.reject("NEED_SHARE", "Downloads is not writable on this device");
                return;
            }
            java.io.File out = new java.io.File(dir, displayName);
            java.io.InputStream in = new java.io.FileInputStream(src);
            java.io.OutputStream os = new java.io.FileOutputStream(out);
            try {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            } finally {
                try { in.close(); } catch (Exception e) {}
                try { os.close(); } catch (Exception e) {}
            }
            android.media.MediaScannerConnection.scanFile(
                    ctx, new String[]{ out.getAbsolutePath() }, null, null);

            JSObject res = new JSObject();
            res.put("uri", android.net.Uri.fromFile(out).toString());
            res.put("displayName", displayName);
            res.put("location", "Downloads");
            call.resolve(res);
        } catch (Exception e) {
            Log.w(TAG, "saveToDownloads failed", e);
            call.reject("NEED_SHARE", "Could not save to Downloads: " + e.getMessage());
        }
    }

    /**
     * Lists backup files sitting in the public Downloads folder.
     *
     * ⚠ WHY THIS EXISTS — the export and the restore disagreed about where a
     * backup lives. saveToDownloads() below writes the exported .zip into the
     * PUBLIC Downloads folder via MediaStore, and nothing ever read that folder
     * back: findBackupFiles() in components/vault.js scanned only the app's own
     * data directory. So the one copy that survives deleting the app was invisible
     * to "Find backups" — the export worked, the restore worked, and the file
     * could not be found.
     *
     * No permission on API 29+: scoped storage lets an app read back the rows it
     * contributed itself, which is exactly the set we want. On API 24-28 it lists
     * the public directory, which needs READ_EXTERNAL_STORAGE (declared with
     * maxSdkVersion="32"); if that is refused we return an empty list rather than
     * failing, because "nothing found" is the honest answer and a crash inside
     * Settings is not.
     */
    @PluginMethod
    public void listDownloadBackups(PluginCall call) {
        JSObject res = new JSObject();
        JSArray files = new JSArray();
        try {
            Context ctx = getContext();
            if (ctx == null) { res.put("files", files); call.resolve(res); return; }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                String[] proj = {
                        android.provider.MediaStore.MediaColumns.DISPLAY_NAME,
                        android.provider.MediaStore.MediaColumns.SIZE,
                        android.provider.MediaStore.MediaColumns.DATE_MODIFIED
                };
                // A name filter keeps other apps' zips out of the list even when a
                // storage permission happens to have been granted. SQLite LIKE is
                // case-insensitive for ASCII, so this covers Orbit/orbit.
                String sel = android.provider.MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?";
                String[] args = { "%orbit%" };

                android.database.Cursor c = ctx.getContentResolver().query(
                        android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        proj, sel, args,
                        android.provider.MediaStore.MediaColumns.DATE_MODIFIED + " DESC");
                if (c != null) {
                    int iName = c.getColumnIndex(android.provider.MediaStore.MediaColumns.DISPLAY_NAME);
                    int iSize = c.getColumnIndex(android.provider.MediaStore.MediaColumns.SIZE);
                    int iMod = c.getColumnIndex(android.provider.MediaStore.MediaColumns.DATE_MODIFIED);
                    while (c.moveToNext()) {
                        String name = iName >= 0 ? c.getString(iName) : null;
                        if (!isBackupName(name)) continue;
                        JSObject row = new JSObject();
                        row.put("name", name);
                        row.put("size", iSize >= 0 ? c.getLong(iSize) : 0);
                        // ⚠ DATE_MODIFIED is in SECONDS; every other mtime in this
                        // app is in ms, and a seconds value read as ms lands in 1970.
                        row.put("mtime", (iMod >= 0 ? c.getLong(iMod) : 0) * 1000L);
                        files.put(row);
                    }
                    c.close();
                }
                res.put("files", files);
                call.resolve(res);
                return;
            }

            // API 24-28: the public directory directly.
            java.io.File dir = android.os.Environment.getExternalStoragePublicDirectory(
                    android.os.Environment.DIRECTORY_DOWNLOADS);
            if (dir != null && dir.isDirectory()) {
                java.io.File[] children = dir.listFiles();
                if (children != null) {
                    for (java.io.File f : children) {
                        if (f == null || !f.isFile()) continue;
                        if (!isBackupName(f.getName())) continue;
                        JSObject row = new JSObject();
                        row.put("name", f.getName());
                        row.put("size", f.length());
                        row.put("mtime", f.lastModified());
                        files.put(row);
                    }
                }
            }
            res.put("files", files);
            call.resolve(res);
        } catch (Exception e) {
            // Never fail the caller. An unreadable Downloads folder means "nothing
            // found", not a broken Settings screen.
            Log.w(TAG, "listDownloadBackups failed", e);
            JSObject empty = new JSObject();
            empty.put("files", new JSArray());
            call.resolve(empty);
        }
    }

    /**
     * Reads one backup back out of Downloads, as base64.
     *
     * The exact mirror of saveToDownloads(). Base64 because that is what the JS
     * reader already expects from the Filesystem plugin — the bytes go into the
     * same OrbitBackupArchive.read(), so a file restored from Downloads and a file
     * restored from the app folder cannot disagree about the format.
     *
     * ⚠ The whole file is held in memory (as the JS path already did), so it is
     * capped. A backup past the cap is refused with a message that names the size
     * rather than killed by an OOM, which on Android is not catchable.
     */
    @PluginMethod
    public void readDownloadBackup(PluginCall call) {
        try {
            String name = call.getString("name", "");
            Context ctx = getContext();
            if (ctx == null) { call.reject("no context"); return; }
            if (name == null || name.isEmpty()) { call.reject("name is required"); return; }

            java.io.InputStream in;
            long declared = 0;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                android.net.Uri item = findDownloadByName(ctx, name);
                if (item == null) { call.reject("That backup is no longer in Downloads"); return; }
                in = ctx.getContentResolver().openInputStream(item);
            } else {
                java.io.File dir = android.os.Environment.getExternalStoragePublicDirectory(
                        android.os.Environment.DIRECTORY_DOWNLOADS);
                java.io.File f = dir == null ? null : new java.io.File(dir, name);
                if (f == null || !f.isFile()) { call.reject("That backup is no longer in Downloads"); return; }
                declared = f.length();
                if (declared > MAX_BACKUP_BYTES) {
                    call.reject("That backup is " + (declared / (1024 * 1024)) +
                                " MB, too large to restore on this device");
                    return;
                }
                in = new java.io.FileInputStream(f);
            }

            if (in == null) { call.reject("Could not open that backup"); return; }

            java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
            try {
                byte[] chunk = new byte[64 * 1024];
                long total = 0;
                int n;
                while ((n = in.read(chunk)) > 0) {
                    total += n;
                    if (total > MAX_BACKUP_BYTES) {
                        call.reject("That backup is larger than this app can restore (" +
                                    (MAX_BACKUP_BYTES / (1024 * 1024)) + " MB limit)");
                        return;
                    }
                    buf.write(chunk, 0, n);
                }
            } finally {
                try { in.close(); } catch (Exception ignored) {}
            }

            byte[] bytes = buf.toByteArray();
            if (bytes.length == 0) { call.reject("That backup file is empty"); return; }

            JSObject res = new JSObject();
            res.put("name", name);
            res.put("size", bytes.length);
            res.put("data", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP));
            call.resolve(res);
        } catch (Exception e) {
            Log.w(TAG, "readDownloadBackup failed", e);
            call.reject("Could not read that backup: " + e.getMessage());
        }
    }

    /** The MediaStore row for `name`, newest first, as a content:// URI. */
    private android.net.Uri findDownloadByName(Context ctx, String name) {
        android.database.Cursor c = null;
        try {
            c = ctx.getContentResolver().query(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    new String[] { android.provider.BaseColumns._ID },
                    android.provider.MediaStore.MediaColumns.DISPLAY_NAME + " = ?",
                    new String[] { name },
                    android.provider.MediaStore.MediaColumns.DATE_MODIFIED + " DESC");
            if (c != null && c.moveToFirst()) {
                long id = c.getLong(0);
                return android.content.ContentUris.withAppendedId(
                        android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, id);
            }
        } catch (Exception e) {
            Log.w(TAG, "findDownloadByName failed", e);
        } finally {
            if (c != null) { try { c.close(); } catch (Exception ignored) {} }
        }
        return null;
    }

    /** A file name that looks like an Orbit backup. Mirrors BACKUP_EXT in vault.js. */
    private static boolean isBackupName(String name) {
        if (name == null) return false;
        String lower = name.toLowerCase(java.util.Locale.US);
        return lower.endsWith(".orzip") || lower.endsWith(".zip");
    }

    /** Closes the app so a freshly installed update can take effect. */
    @PluginMethod
    public void exitApp(PluginCall call) {
        try {
            android.app.Activity activity = getActivity();
            call.resolve();
            if (activity != null) {
                activity.finishAffinity();
                new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override public void run() { System.exit(0); }
                }, 300);
            }
        } catch (Exception e) {
            Log.w(TAG, "exitApp failed", e);
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        try {
            if (_lifecycle != null && getActivity() != null) {
                getActivity().getApplication().unregisterActivityLifecycleCallbacks(_lifecycle);
                _lifecycle = null;
            }
        } catch (Exception e) { /* activity already gone */ }
        Log.d(TAG, "handleOnDestroy — stopping service drain only, service keeps running");
        stopDraining();
        try {
            Context ctx = getContext();
            if (ctx != null && serviceBound) {
                ctx.unbindService(connection);
                serviceBound = false;
            }
        } catch (Exception ignored) {}
    }

    // ── Plugin methods ──

    /** JS tells us who the local user is, so the native path can spot @mentions. */
    @PluginMethod
    public void setIdentity(PluginCall call) {
        _selfId = call.getString("userId", "");
        call.resolve();
    }

    /** Renderer pushes {userId: avatarDataUrl} so background notifications can
     *  show the sender's face. See OrbitNotifications.setPeerAvatars. */
    @PluginMethod
    public void setPeerAvatars(PluginCall call) {
        try {
            com.orbit.app.OrbitNotifications.setPeerAvatars(call.getObject("avatars", new JSObject()));
            call.resolve();
        } catch (Exception e) {
            call.reject("setPeerAvatars failed: " + e.getMessage());
        }
    }

    /**
     * Posts any Orbit notification from JS. This is how the app surfaces events the
     * native layer cannot see on its own — @mentions, incoming calls, update
     * availability, background work — using the same channels and icons as the
     * native path.
     *
     * kind: MESSAGE | MENTION | CALL | VIDEO_CALL | UPDATE | PROGRESS | ERROR | SUCCESS
     */
    @PluginMethod
    public void notify(PluginCall call) {
        try {
            String kindName = call.getString("kind", "MESSAGE");
            com.orbit.app.OrbitNotifications.Kind kind;
            try {
                kind = com.orbit.app.OrbitNotifications.Kind.valueOf(kindName);
            } catch (IllegalArgumentException bad) {
                kind = com.orbit.app.OrbitNotifications.Kind.MESSAGE;
            }
            com.orbit.app.OrbitNotifications.post(
                    getContext(), kind,
                    call.getString("title", "Orbit"),
                    call.getString("text", ""),
                    call.getString("groupKey", null),
                    new android.content.Intent(getContext(), com.orbit.app.MainActivity.class),
                    call.getString("avatar", null),
                    // Present only for a direct message — a group reply needs a
                    // target the notification does not have, and a reply box that
                    // cannot say where it is going is worse than none.
                    call.getString("replyToChatId", null));
            call.resolve();
        } catch (Exception e) {
            call.reject("notify failed: " + e.getMessage());
        }
    }

    /**
     * Replies typed into the notification shade while the app was not running.
     *
     * `peek` returns them and leaves them queued; the web layer sends each one and
     * then calls `clearReplies`. Doing it in that order means a crash mid-send
     * replays a reply rather than losing it — a duplicate is visible and
     * fixable, a dropped message is neither.
     */
    @PluginMethod
    public void getPendingReplies(PluginCall call) {
        try {
            com.getcapacitor.JSArray arr = new com.getcapacitor.JSArray();
            for (org.json.JSONObject o : com.orbit.app.receivers.OrbitReplyReceiver.peek()) {
                arr.put(o);
            }
            JSObject out = new JSObject();
            out.put("replies", arr);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("could not read pending replies: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearPendingReplies(PluginCall call) {
        com.orbit.app.receivers.OrbitReplyReceiver.clear();
        call.resolve();
    }

    @PluginMethod
    public void setForeground(PluginCall call) {
        _isForeground = call.getBoolean("isForeground", true);
        call.resolve();
    }

    @PluginMethod
    public void startServer(PluginCall call) {
        int port = call.getInt("port", 46000);
        ensureServiceRunning();
        // Pass port to service via intent extra
        Context ctx = getContext();
        if (ctx != null) {
            Intent intent = new Intent(ctx, OrbitForegroundService.class);
            intent.putExtra("tcpPort", port);
            intent.putExtra("startNetworking", true);
            ctx.startForegroundService(intent);
        }
        call.resolve(new JSObject().put("port", port));
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        if (boundService != null) {
            boundService.stopServer();
        }
        call.resolve();
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 46000);
        String peerId = call.getString("peerId", host + ":" + port);
        int timeoutMs = call.getInt("timeout", 30000);
        ensureServiceRunning();
        if (boundService != null) {
            boundService.connectToPeer(host, port, peerId, timeoutMs);
            call.resolve(new JSObject().put("connectionId", peerId));
        } else {
            // Service not yet bound — queue connection via intent
            Context ctx = getContext();
            if (ctx != null) {
                Intent intent = new Intent(ctx, OrbitForegroundService.class);
                intent.putExtra("connectHost", host);
                intent.putExtra("connectPort", port);
                intent.putExtra("connectPeerId", peerId);
                intent.putExtra("connectTimeout", timeoutMs);
                ctx.startForegroundService(intent);
            }
            call.resolve(new JSObject().put("connectionId", peerId));
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String connectionId = call.getString("connectionId");
        if (boundService != null) {
            boundService.disconnectPeer(connectionId);
        }
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        String connectionId = call.getString("connectionId");
        String data = call.getString("data");
        if (boundService != null) {
            boundService.sendData(connectionId, data, new OrbitForegroundService.SendCallback() {
                @Override
                public void onSuccess() {
                    call.resolve();
                }
                @Override
                public void onError(String error) {
                    call.reject(error);
                }
            });
        } else {
            call.reject("Service not available");
        }
    }

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        JSObject beacon = call.getObject("beacon", new JSObject());
        int discoveryPort = call.getInt("discoveryPort", 45678);
        ensureServiceRunning();

        // Store beacon data on service
        if (boundService != null) {
            boundService.updateBeacon(beacon.toString());
        }

        Context ctx = getContext();
        if (ctx != null) {
            Intent intent = new Intent(ctx, OrbitForegroundService.class);
            intent.putExtra("udpPort", discoveryPort);
            intent.putExtra("beaconJson", beacon.toString());
            intent.putExtra("startNetworking", true);
            ctx.startForegroundService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        if (boundService != null) {
            boundService.stopDiscovery();
        }
        call.resolve();
    }

    @PluginMethod
    public void startNetwork(PluginCall call) {
        ensureServiceRunning();
        Context ctx = getContext();
        if (ctx != null) {
            Intent intent = new Intent(ctx, OrbitForegroundService.class);
            intent.putExtra("startNetworking", true);
            ctx.startForegroundService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopNetwork(PluginCall call) {
        stopService();
        call.resolve();
    }

    @PluginMethod
    public void isPeerConnected(PluginCall call) {
        String peerId = call.getString("peerId");
        boolean connected = boundService != null && boundService.isConnected(peerId);
        call.resolve(new JSObject().put("connected", connected));
    }

    @PluginMethod
    public void getConnections(PluginCall call) {
        String[] conns = boundService != null ? boundService.getConnectionIds() : new String[0];
        JSObject result = new JSObject();
        result.put("connections", conns);
        call.resolve(result);
    }

    @PluginMethod
    public void getLocalIps(PluginCall call) {
        // Used to build QR pairing payloads — the WebView has no way to
        // enumerate network interfaces on its own.
        String[] ips = boundService != null ? boundService.getLocalIpsForPairing() : new String[0];
        JSObject result = new JSObject();
        result.put("ips", ips);
        call.resolve(result);
    }

    @PluginMethod
    public void cleanup(PluginCall call) {
        // DO NOT call stopService() here! That would stop the Android foreground service
        // asynchronously — onServiceDisconnected fires after a delay, so boundService is
        // still non-null when initP2P() immediately calls startServer()/startDiscovery().
        // Their ensureServiceRunning() sees boundService != null and skips re-starting,
        // leaving the service dead with no networking.
        //
        // The JS side (p2p-mobile.js) already clears connections, pending messages, and
        // removes native event listeners via removeAllListeners(). The Java side needs
        // nothing more for a clean re-init.
        Log.d(TAG, "cleanup called — JS listener reset only, service left running");
        call.resolve();
    }
}

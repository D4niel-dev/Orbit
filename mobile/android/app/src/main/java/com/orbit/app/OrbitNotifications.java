package com.orbit.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * The single place Orbit posts Android notifications from.
 *
 * Before this existed, the only native notification was an incoming message, and
 * it was posted to a channel ("orbit_messages") that nothing ever created — on
 * API 26+ a notification posted to an unknown channel is silently dropped, so
 * background message notifications never appeared at all. Every notification also
 * used {@code android.R.drawable.ic_dialog_info}, Android's built-in info icon,
 * which is why they all showed the same generic "i".
 *
 * Channels are created up front by {@link #ensureChannels(Context)} so a channel
 * always exists before anything posts to it. Channel settings are immutable once
 * created — if you need a different importance later you must use a new id, since
 * an existing channel's importance is only changeable by the user.
 */
public final class OrbitNotifications {

    // ── channel ids ──
    public static final String CH_SERVICE    = "orbit_service";     // persistent "connected" notice
    public static final String CH_MESSAGES   = "orbit_messages";    // incoming messages
    public static final String CH_MENTIONS   = "orbit_mentions";    // @mentions
    public static final String CH_CALLS      = "orbit_calls";       // incoming calls
    public static final String CH_UPDATES    = "orbit_updates";     // app updates
    public static final String CH_BACKGROUND = "orbit_background";  // progress / background work

    /** Matches res/values/colors.xml colorAccent, so notifications look like Orbit. */
    private static final int ACCENT = 0xFF89B4FA;

    /**
     * What a notification is about. Decides the channel and the priority.
     *
     * Every kind shares one small icon — the Orbit mark — because the icon is
     * how a user tells which app a notification came from, and per-kind glyphs
     * (a chat bubble, a phone, a tick) made Orbit's notifications look like
     * generic system ones. Channels still separate the kinds, so per-kind
     * muting and importance are unchanged.
     */
    public enum Kind {
        // ⚠ THE LAST FIELD IS HOW LONG THE NOTIFICATION LIVES. Dan: "some of the
        // notification outside of the app just stays there and won't close after awhile,
        // make them close after awhile - except for the replying notification."
        // A shade full of week-old messages is how people stop reading notifications, and
        // the ones that linger are exactly the ones already dealt with.
        //
        // The replyable notification is the exception and is handled in post(): a reply
        // typed with Orbit closed is QUEUED and the notification is the only record that
        // it has not been sent yet. Expiring it would silently drop that.
        MESSAGE   (CH_MESSAGES,   NotificationCompat.PRIORITY_HIGH,    30 * 60 * 1000L),
        MENTION   (CH_MENTIONS,   NotificationCompat.PRIORITY_HIGH,    30 * 60 * 1000L),
        // Longer, because a missed call is the one thing here somebody may come back for.
        CALL      (CH_CALLS,      NotificationCompat.PRIORITY_MAX,     60 * 60 * 1000L),
        VIDEO_CALL(CH_CALLS,      NotificationCompat.PRIORITY_MAX,     60 * 60 * 1000L),
        UPDATE    (CH_UPDATES,    NotificationCompat.PRIORITY_DEFAULT, 10 * 60 * 1000L),
        // ⚠ Not short: this tracks work the user started. If it is still going after half
        // an hour, something is wrong anyway.
        PROGRESS  (CH_BACKGROUND, NotificationCompat.PRIORITY_LOW,     30 * 60 * 1000L),
        ERROR     (CH_MESSAGES,   NotificationCompat.PRIORITY_HIGH,    10 * 60 * 1000L),
        SUCCESS   (CH_MESSAGES,   NotificationCompat.PRIORITY_DEFAULT, 10 * 60 * 1000L);

        public final String channel;
        public final int priority;
        public final long timeoutMs;

        Kind(String channel, int priority, long timeoutMs) {
            this.channel = channel;
            this.priority = priority;
            this.timeoutMs = timeoutMs;
        }
    }

    /**
     * Avatars for peers, keyed by userId, pushed here by the renderer.
     *
     * The background notification is posted from the NATIVE message handler, which
     * only has the packet — and a MESSAGE packet carries no avatar (adding one would
     * put a thumbnail on every message). So the renderer pushes the avatars it knows
     * about whenever they change, and this is what the native path looks up. Bounded
     * on both axes: one entry per peer, and oversized values are ignored.
     */
    private static final java.util.Map<String, String> PEER_AVATARS =
            new java.util.concurrent.ConcurrentHashMap<>();
    private static final int MAX_AVATAR_CHARS = 65536;
    private static final int MAX_AVATAR_ENTRIES = 200;

    /** Replace the cache with the renderer's current view of its friends' avatars. */
    public static void setPeerAvatars(org.json.JSONObject map) {
        if (map == null) return;
        try {
            PEER_AVATARS.clear();
            java.util.Iterator<String> keys = map.keys();
            int taken = 0;
            while (keys.hasNext() && taken < MAX_AVATAR_ENTRIES) {
                String id = keys.next();
                String avatar = map.optString(id, null);
                if (id == null || id.isEmpty() || avatar == null || avatar.isEmpty()) continue;
                if (!avatar.startsWith("data:image")) continue;   // only what we can decode
                if (avatar.length() > MAX_AVATAR_CHARS) continue; // a full-res image, not a thumb
                PEER_AVATARS.put(id, avatar);
                taken++;
            }
        } catch (Throwable t) {
            // A malformed push must never break notifications.
        }
    }

    /** The cached avatar for a peer, or null. */
    public static String avatarFor(String userId) {
        if (userId == null || userId.isEmpty()) return null;
        return PEER_AVATARS.get(userId);
    }

    private OrbitNotifications() {}

    // ── channels ──

    /** Creates every channel. Safe to call on each app start; existing channels are left alone. */
    public static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;

        // importance: LOW = silent, DEFAULT = sound, HIGH = sound + heads-up banner
        channel(nm, CH_SERVICE,    "Orbit Connection",   "Keeps Orbit reachable in the background", NotificationManager.IMPORTANCE_LOW,  false);
        channel(nm, CH_MESSAGES,   "Messages",           "New messages from your peers",            NotificationManager.IMPORTANCE_HIGH, true);
        channel(nm, CH_MENTIONS,   "Mentions",           "When someone @mentions you",              NotificationManager.IMPORTANCE_HIGH, true);
        channel(nm, CH_CALLS,      "Calls",              "Incoming voice and video calls",          NotificationManager.IMPORTANCE_HIGH, true);
        channel(nm, CH_UPDATES,    "App updates",        "New Orbit versions",                      NotificationManager.IMPORTANCE_DEFAULT, false);
        channel(nm, CH_BACKGROUND, "Background activity", "Transfers and other background work",    NotificationManager.IMPORTANCE_LOW,  false);
    }

    private static void channel(NotificationManager nm, String id, String name,
                                String desc, int importance, boolean vibrate) {
        NotificationChannel c = new NotificationChannel(id, name, importance);
        c.setDescription(desc);
        if (vibrate) c.enableVibration(true);
        c.setShowBadge(importance >= NotificationManager.IMPORTANCE_DEFAULT);
        nm.createNotificationChannel(c);
    }

    // ── posting ──

    /**
     * Posts a notification, replacing any earlier one with the same group key.
     *
     * @param groupKey stable id so repeats collapse instead of stacking — pass the
     *                 chat id for messages, or null for a one-off notification.
     */
    public static void post(Context ctx, Kind kind, String title, String text,
                            String groupKey, Intent contentIntent) {
        post(ctx, kind, title, text, groupKey, contentIntent, null);
    }

    /**
     * @param avatarDataUrl optional sender avatar as a data URL. It becomes the
     *        notification's large icon, so the status bar carries Orbit's mark
     *        (the small icon) while the notification itself carries the face of
     *        whoever wrote — the pairing Discord uses, and the reason a glance at
     *        the shade tells you who it is without reading the title. Null, or
     *        anything that will not decode, simply leaves the large icon off.
     */
    public static void post(Context ctx, Kind kind, String title, String text,
                            String groupKey, Intent contentIntent, String avatarDataUrl) {
        post(ctx, kind, title, text, groupKey, contentIntent, avatarDataUrl, null);
    }

    /**
     * @param replyToChatId when set, the notification carries an inline reply box
     *        that answers without opening Orbit. This is the interaction people
     *        actually use a messenger for — you get a message, you answer it, you
     *        put the phone down — and making them open the app to do it is what
     *        makes an app feel like a website in a wrapper.
     *
     *        ⚠ Only the reply path that Android can complete while the app is
     *        running is wired. A reply typed with Orbit closed is QUEUED by
     *        OrbitReplyReceiver and sent when the app is next opened, because
     *        delivering it immediately would mean running the P2P stack from a
     *        broadcast receiver. The notification stays until then rather than
     *        pretending it went.
     */
    public static void post(Context ctx, Kind kind, String title, String text,
                            String groupKey, Intent contentIntent, String avatarDataUrl,
                            String replyToChatId) {
        if (ctx == null) return;
        try {
            ensureChannels(ctx);

            PendingIntent pi = null;
            if (contentIntent != null) {
                contentIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                pi = PendingIntent.getActivity(ctx, 0, contentIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            }

            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, kind.channel)
                    .setSmallIcon(R.drawable.ic_notify_orbit)
                    .setContentTitle(title == null ? "Orbit" : title)
                    .setContentText(text == null ? "" : text)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(text == null ? "" : text))
                    .setColor(ACCENT)
                    .setPriority(kind.priority)
                    .setAutoCancel(true);

            // ⚠⚠ A NOTIFICATION THAT OUTLIVES ITS MOMENT IS NOISE, AND THE NOISE IS WHAT
            // MAKES PEOPLE TURN NOTIFICATIONS OFF. Every kind expires on its own schedule
            // (see Kind), with one deliberate exception below.
            //
            // ⚠ THE REPLYABLE NOTIFICATION IS THE EXCEPTION. A reply typed while Orbit is
            // closed is QUEUED by OrbitReplyReceiver and sent when the app next opens; the
            // notification is the only record that it has not gone yet. Expiring it would
            // drop the user's reply silently, which is far worse than a lingering card.
            //
            // ⚠ setTimeoutAfter is a no-op below API 26 (Android 8). minSdk here is 24, so
            // on 7.x these notifications still sit until tapped or swiped. The platform
            // offers no equivalent, and the alternative — a handler that cancels by id —
            // would race the app being killed.
            if (replyToChatId == null || replyToChatId.isEmpty()) {
                b.setTimeoutAfter(kind.timeoutMs);
            }
            android.graphics.Bitmap large = decodeAvatar(avatarDataUrl);
            if (large != null) b.setLargeIcon(large);
            if (pi != null) b.setContentIntent(pi);

            int id = (groupKey == null || groupKey.isEmpty())
                    ? (int) (System.currentTimeMillis() & 0x7FFFFFFF)
                    : groupKey.hashCode();

            if (replyToChatId != null && !replyToChatId.isEmpty()) {
                androidx.core.app.RemoteInput remoteInput = new androidx.core.app.RemoteInput.Builder(
                        "orbit_reply_text").setLabel("Reply").build();

                Intent replyIntent = new Intent(ctx, com.orbit.app.receivers.OrbitReplyReceiver.class);
                replyIntent.putExtra(com.orbit.app.receivers.OrbitReplyReceiver.EXTRA_CHAT_ID, replyToChatId);
                replyIntent.putExtra(com.orbit.app.receivers.OrbitReplyReceiver.EXTRA_NOTIF_ID, id);

                // One request code per notification, or every reply is delivered
                // to whichever notification registered last.
                PendingIntent replyPi = PendingIntent.getBroadcast(ctx, id, replyIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);

                NotificationCompat.Action action = new NotificationCompat.Action.Builder(
                        R.drawable.ic_notify_orbit, "Reply", replyPi)
                        .addRemoteInput(remoteInput)
                        .setAllowGeneratedReplies(true)
                        .build();
                b.addAction(action);
            }

            NotificationManagerCompat.from(ctx).notify(id, b.build());
        } catch (SecurityException e) {
            // POST_NOTIFICATIONS not granted (API 33+) — nothing to do, the user said no.
        } catch (Exception e) {
            android.util.Log.e("OrbitNotifications", "post failed", e);
        }
    }

    /** Convenience: a notification that just opens the app. */
    public static void post(Context ctx, Kind kind, String title, String text, String groupKey) {
        post(ctx, kind, title, text, groupKey, new Intent(ctx, MainActivity.class), null);
    }

    /** Decode a data-URL avatar into a Bitmap. Never throws, never returns junk. */
    private static android.graphics.Bitmap decodeAvatar(String dataUrl) {
        if (dataUrl == null || dataUrl.isEmpty()) return null;
        try {
            String b64 = dataUrl;
            int comma = b64.indexOf(',');
            if (b64.startsWith("data:") && comma > 0) b64 = b64.substring(comma + 1);
            byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            if (bytes == null || bytes.length == 0) return null;
            return android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Throwable t) {
            return null;
        }
    }
}

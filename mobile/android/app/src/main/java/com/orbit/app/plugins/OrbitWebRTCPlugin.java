package com.orbit.app.plugins;

import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.webrtc.DataChannel;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpReceiver;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Native WebRTC DataChannel for the mobile half of the hybrid transport.
 *
 * ⚠⚠ WHY THIS EXISTS AT ALL. There is no Capacitor WebRTC plugin on npm (checked:
 * capacitor-webrtc, @capacitor-community/webrtc, @capgo/webrtc and capacitor-plugin-webrtc
 * are all absent; cordova-plugin-iosrtc is iOS-only and untouched since 2023). And the
 * WebView's own RTCPeerConnection is not an option: Android kills the renderer's timers and
 * sockets when the app is backgrounded, which is exactly when a messenger must stay
 * connected. So the connection lives here, in the process the foreground service keeps alive.
 *
 * ⚠ IT CARRIES OPAQUE STRINGS. Same rule as the desktop transport: no message knowledge, no
 * encryption here. The E2EE layer above produces the bytes and does not care which
 * transport moved them.
 *
 * ⚠ EVERYTHING RUNS ON ONE WORKER THREAD WITH A LOOPER. WebRTC requires it, and mixing
 * threads here produces failures that look like network problems.
 */
@CapacitorPlugin(name = "OrbitWebRTC")
public class OrbitWebRTCPlugin extends Plugin {

    private static final String TAG = "OrbitWebRTC";
    private static final String CHANNEL_LABEL = "orbit";

    private PeerConnectionFactory factory;
    private HandlerThread worker;
    private Handler workerHandler;

    private final Map<String, PeerConnection> peers = new ConcurrentHashMap<>();
    private final Map<String, DataChannel> channels = new ConcurrentHashMap<>();

    @Override
    public void load() {
        worker = new HandlerThread("orbit-webrtc");
        worker.start();
        workerHandler = new Handler(worker.getLooper());
        workerHandler.post(new Runnable() {
            @Override public void run() {
                PeerConnectionFactory.initialize(
                        PeerConnectionFactory.InitializationOptions.builder(getContext())
                                .createInitializationOptions());
                factory = PeerConnectionFactory.builder().createPeerConnectionFactory();
                Log.i(TAG, "factory ready");
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        for (String id : new ArrayList<>(peers.keySet())) closePeer(id);
        if (worker != null) worker.quitSafely();
    }

    /** Build the PeerConnection and, for the offerer, the DataChannel. */
    @PluginMethod
    public void createPeer(final PluginCall call) {
        final String peerId = call.getString("peerId");
        final boolean isOfferer = call.getBoolean("offerer", Boolean.TRUE);
        if (peerId == null) { call.reject("peerId is required"); return; }

        workerHandler.post(new Runnable() {
            @Override public void run() {
                try {
                    if (factory == null) { call.reject("WebRTC factory is not ready"); return; }
                    closePeer(peerId);

                    List<PeerConnection.IceServer> ice = new ArrayList<>();
                    com.getcapacitor.JSArray servers = call.getArray("iceServers");
                    if (servers != null) {
                        for (int i = 0; i < servers.length(); i++) {
                            String url = servers.optString(i, null);
                            if (url != null && !url.isEmpty()) {
                                ice.add(PeerConnection.IceServer.builder(url).createIceServer());
                            }
                        }
                    }

                    PeerConnection.RTCConfiguration cfg = new PeerConnection.RTCConfiguration(ice);
                    cfg.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
                    cfg.bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE;
                    cfg.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY;

                    PeerConnection pc = factory.createPeerConnection(cfg, new PeerObserver(peerId));
                    if (pc == null) { call.reject("could not create a PeerConnection"); return; }
                    peers.put(peerId, pc);

                    if (isOfferer) attachChannel(peerId, pc.createDataChannel(CHANNEL_LABEL, new DataChannel.Init()));

                    JSObject ret = new JSObject();
                    ret.put("peerId", peerId);
                    ret.put("offerer", isOfferer);
                    call.resolve(ret);
                } catch (Exception e) {
                    Log.e(TAG, "createPeer failed", e);
                    call.reject("createPeer failed: " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void createOffer(final PluginCall call) { createDescription(call, true); }

    @PluginMethod
    public void createAnswer(final PluginCall call) { createDescription(call, false); }

    private void createDescription(final PluginCall call, final boolean offer) {
        final String peerId = call.getString("peerId");
        final PeerConnection pc = peerId == null ? null : peers.get(peerId);
        if (pc == null) { call.reject("no peer for " + peerId); return; }

        workerHandler.post(new Runnable() {
            @Override public void run() {
                SdpObserver observer = new SimpleSdpObserver() {
                    @Override public void onCreateSuccess(final SessionDescription sdp) {
                        // ⚠ Set local BEFORE resolving: the caller sends the SDP, and a
                        // remote peer answering an offer we never applied is the classic
                        // "connection works only sometimes" failure.
                        pc.setLocalDescription(new SimpleSdpObserver() {
                            @Override public void onSetSuccess() {
                                JSObject ret = new JSObject();
                                ret.put("type", sdp.type.canonicalForm());
                                ret.put("sdp", sdp.description);
                                call.resolve(ret);
                            }
                            @Override public void onSetFailure(String error) { call.reject("setLocalDescription: " + error); }
                        }, sdp);
                    }
                    @Override public void onCreateFailure(String error) { call.reject("createDescription: " + error); }
                };
                if (offer) pc.createOffer(observer, new MediaConstraints());
                else pc.createAnswer(observer, new MediaConstraints());
            }
        });
    }

    @PluginMethod
    public void setRemoteDescription(final PluginCall call) {
        final String peerId = call.getString("peerId");
        final String type = call.getString("type");
        final String sdp = call.getString("sdp");
        final PeerConnection pc = peerId == null ? null : peers.get(peerId);
        if (pc == null) { call.reject("no peer for " + peerId); return; }
        if (sdp == null) { call.reject("sdp is required"); return; }

        workerHandler.post(new Runnable() {
            @Override public void run() {
                SessionDescription.Type t = "offer".equals(type)
                        ? SessionDescription.Type.OFFER : SessionDescription.Type.ANSWER;
                pc.setRemoteDescription(new SimpleSdpObserver() {
                    @Override public void onSetSuccess() { call.resolve(); }
                    @Override public void onSetFailure(String error) { call.reject("setRemoteDescription: " + error); }
                }, new SessionDescription(t, sdp));
            }
        });
    }

    @PluginMethod
    public void addIceCandidate(final PluginCall call) {
        final String peerId = call.getString("peerId");
        final String candidate = call.getString("candidate");
        final String sdpMid = call.getString("sdpMid", "");
        final Integer sdpMLineIndex = call.getInt("sdpMLineIndex", 0);
        final PeerConnection pc = peerId == null ? null : peers.get(peerId);
        if (pc == null) { call.reject("no peer for " + peerId); return; }
        if (candidate == null) { call.reject("candidate is required"); return; }

        workerHandler.post(new Runnable() {
            @Override public void run() {
                // ⚠ No resolve-on-error: a candidate that cannot be added is not fatal, and
                // the JS side buffers candidates anyway. Rejecting here would surface as a
                // connection failure for something the ICE agent recovers from.
                pc.addIceCandidate(new IceCandidate(sdpMid, sdpMLineIndex, candidate));
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void send(final PluginCall call) {
        final String peerId = call.getString("peerId");
        final String data = call.getString("data");
        final DataChannel channel = peerId == null ? null : channels.get(peerId);
        if (channel == null) { call.reject("no data channel for " + peerId); return; }
        if (data == null) { call.reject("data is required"); return; }

        workerHandler.post(new Runnable() {
            @Override public void run() {
                try {
                    // ⚠ binary=false: these are JSON strings, and a binary frame would need
                    // a decode step on the far side for no reason.
                    ByteBuffer buf = ByteBuffer.wrap(data.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    boolean ok = channel.send(new DataChannel.Buffer(buf, false));
                    JSObject ret = new JSObject();
                    ret.put("sent", ok);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("send failed: " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void close(final PluginCall call) {
        final String peerId = call.getString("peerId");
        if (peerId == null) { call.reject("peerId is required"); return; }
        workerHandler.post(new Runnable() {
            @Override public void run() {
                closePeer(peerId);
                call.resolve();
            }
        });
    }

    // ── internals ────────────────────────────────────────────────────────────

    private void closePeer(String peerId) {
        DataChannel ch = channels.remove(peerId);
        if (ch != null) { try { ch.close(); } catch (Exception ignored) {} }
        PeerConnection pc = peers.remove(peerId);
        if (pc != null) { try { pc.close(); } catch (Exception ignored) {} }
    }

    private void attachChannel(final String peerId, final DataChannel channel) {
        if (channel == null) return;
        channels.put(peerId, channel);
        channel.registerObserver(new DataChannel.Observer() {
            @Override public void onBufferedAmountChange(long previousAmount) { }
            @Override public void onStateChange() {
                String state = channel.state().name();
                JSObject ev = new JSObject();
                ev.put("peerId", peerId);
                ev.put("state", state);
                if (channel.state() == DataChannel.State.OPEN) notifyListeners("dataOpen", ev);
                else if (channel.state() == DataChannel.State.CLOSED) notifyListeners("dataClosed", ev);
            }
            @Override public void onMessage(DataChannel.Buffer buffer) {
                try {
                    ByteBuffer data = buffer.data;
                    byte[] bytes = new byte[data.remaining()];
                    data.get(bytes);
                    JSObject ev = new JSObject();
                    ev.put("peerId", peerId);
                    ev.put("data", new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
                    notifyListeners("dataMessage", ev);
                } catch (Exception e) {
                    Log.e(TAG, "onMessage failed", e);
                }
            }
        });
    }

    private class PeerObserver implements PeerConnection.Observer {
        private final String peerId;
        PeerObserver(String peerId) { this.peerId = peerId; }

        @Override public void onIceCandidate(IceCandidate candidate) {
            JSObject ev = new JSObject();
            ev.put("peerId", peerId);
            ev.put("candidate", candidate.sdp);
            ev.put("sdpMid", candidate.sdpMid);
            ev.put("sdpMLineIndex", candidate.sdpMLineIndex);
            notifyListeners("iceCandidate", ev);
        }

        @Override public void onIceConnectionChange(PeerConnection.IceConnectionState state) {
            JSObject ev = new JSObject();
            ev.put("peerId", peerId);
            ev.put("state", state.name());
            notifyListeners("connectionState", ev);
        }

        @Override public void onDataChannel(DataChannel channel) {
            // The answerer receives the channel here; there is no createDataChannel call.
            attachChannel(peerId, channel);
        }

        @Override public void onSignalingChange(PeerConnection.SignalingState state) { }
        @Override public void onIceConnectionReceivingChange(boolean receiving) { }
        @Override public void onIceGatheringChange(PeerConnection.IceGatheringState state) { }
        @Override public void onIceCandidatesRemoved(IceCandidate[] candidates) { }
        @Override public void onAddStream(MediaStream stream) { }
        @Override public void onRemoveStream(MediaStream stream) { }
        @Override public void onRenegotiationNeeded() { }
        @Override public void onAddTrack(RtpReceiver receiver, MediaStream[] streams) { }
    }

    /** Only the callbacks this plugin actually uses; the rest stay empty. */
    private static class SimpleSdpObserver implements SdpObserver {
        @Override public void onCreateSuccess(SessionDescription sdp) { }
        @Override public void onSetSuccess() { }
        @Override public void onCreateFailure(String error) { }
        @Override public void onSetFailure(String error) { }
    }
}

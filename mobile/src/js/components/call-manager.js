// mobile/src/js/components/call-manager.js
// Voice & video calling for Android — mirrors desktop's webrtc-call.js
// (CallManager + CallModal) on the mobile UI and transport.
//
// Signalling rides the existing P2P transport, so it is encrypted in transit
// like any other packet:
//   caller  --CALL_OFFER(sdp)-->  callee      (rings)
//   caller  <--CALL_ANSWER(sdp)-- callee      (accepted)
//   both    <-> CALL_ICE_CANDIDATE            (trickle ICE)
//   either  --> CALL_END / CALL_DECLINE
//
// The packet types were already in shared/network/protocol.js, so no protocol
// change was needed — only the mobile side that was missing.
//
// NOTE ON CONNECTION IDS: on mobile the native P2P plugin uses the PEER'S USER
// ID as the connectionId (OrbitP2PPlugin.connect resolves `connectionId: peerId`).
// So `Orbit.P2P.send(peerUserId, packet)` is the way to reach a peer, and an
// incoming packet's `data.connectionId` is the sender's user id.
//
// Exposes window.OrbitCallUI (the fullscreen surface) and window.OrbitCall
// (the signalling manager).

(function() {
  'use strict';

  var ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Ringtone. Path is relative to the mobile entry page (mobile/src/index.html);
  // shared/sounds/ is copied into the bundle by `npm run mobile:sync`, and ships
  // to desktop too via electron-builder's extraResources (where it would instead
  // resolve as ../../shared/sounds/…).
  // Swap this one line to use any of the other clips in shared/sounds/.
  var RING_SOUND = 'shared/sounds/Call-ring-1.mp3';

  // How long the phone rings before giving up. The clip is ~21.5 s, so it loops
  // roughly four times across this window.
  var RING_WINDOW_MS = 90000;   // 1m30

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    if (window.Sanitize && window.Sanitize.escapeHtml) return window.Sanitize.escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtTime(total) {
    var m = Math.floor(total / 60), s = total % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ────────────────────────── ring / vibration ────────────────────────── */

  var Ringer = {
    _ctx: null,
    _audio: null,
    _timer: null,
    _vibTimer: null,
    _stopTimer: null,
    _onExpired: null,

    // Chromium refuses navigator.vibrate until the page has had user activation,
    // and logs a warning every time it refuses. Check that condition instead of
    // firing a blocked call (and a console warning) on every ring.
    _interacted: false,
    _canVibrate: function() {
      try {
        // This is exactly the check Chromium makes before allowing vibrate.
        if (navigator.userActivation &&
            typeof navigator.userActivation.hasBeenActive === 'boolean') {
          return navigator.userActivation.hasBeenActive;
        }
      } catch (e) {}
      return this._interacted;
    },

    /**
     * Ring for up to RING_WINDOW_MS, looping the clip, then stop and report
     * expiry so the caller can treat it as no-answer / missed.
     *
     * @param onExpired  called once when the 1m30 window runs out
     */
    start: function(onExpired) {
      var self = this;
      this.stop();                     // never stack two ringers
      this._onExpired = (typeof onExpired === 'function') ? onExpired : null;

      // ---- the ringtone, looped ----
      // Capacitor sets setMediaPlaybackRequiresUserGesture(false) on the Android
      // WebView, so this plays without a tap. If it is blocked anyway (or the
      // asset is missing) we fall back to a generated tone rather than leaving
      // the user with a silent incoming call.
      var played = false;
      try {
        var a = new Audio(RING_SOUND);
        a.loop = true;
        a.preload = 'auto';
        a.volume = 1;
        this._audio = a;
        var p = a.play();
        if (p && p.catch) {
          p.then(function() { played = true; })
           .catch(function(err) {
             console.warn('[Call] ringtone playback blocked:', err && err.name);
             self._startBeep();
           });
        } else {
          played = true;
        }
      } catch (e) {
        console.warn('[Call] ringtone unavailable:', e && e.message);
      }
      // If the element never even got a play() promise (very old engines), beep.
      if (!played && !this._audio) this._startBeep();

      // ---- vibration, alongside ----
      try {
        if (navigator.vibrate && this._canVibrate()) {
          navigator.vibrate([500, 400, 500, 400, 500]);
          this._vibTimer = setInterval(function() {
            try {
              if (navigator.vibrate && self._canVibrate()) navigator.vibrate([500, 400, 500, 400, 500]);
            } catch (e) {}
          }, 3000);
        }
      } catch (e) {}

      // ---- hard stop at 1m30 ----
      this._stopTimer = setTimeout(function() {
        var cb = self._onExpired;
        self.stop();
        if (cb) cb();
      }, RING_WINDOW_MS);
    },

    /** Generated two-tone ring, used only if the mp3 cannot play. */
    _startBeep: function() {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!this._ctx) this._ctx = new AC();
        var ctx = this._ctx;
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function() {});
        var beep = function(freq, at, dur) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
          gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(ctx.currentTime + at);
          osc.stop(ctx.currentTime + at + dur + 0.02);
        };
        var pattern = function() { beep(660, 0, 0.35); beep(880, 0.45, 0.35); };
        pattern();
        this._timer = setInterval(pattern, 2400);
      } catch (e) { /* silent — vibration still works */ }
    },

    stop: function() {
      this._onExpired = null;
      if (this._stopTimer) { clearTimeout(this._stopTimer); this._stopTimer = null; }
      try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
      if (this._vibTimer) { clearInterval(this._vibTimer); this._vibTimer = null; }
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (this._audio) {
        try { this._audio.pause(); this._audio.currentTime = 0; } catch (e) {}
        this._audio = null;
      }
    }
  };

  // Fallback for engines without userActivation: remember the first interaction.
  try {
    ['pointerdown', 'keydown', 'touchstart'].forEach(function(ev) {
      document.addEventListener(ev, function() { Ringer._interacted = true; }, { once: true, passive: true });
    });
  } catch (e) {}

  /* ────────────────────────── the call surface ────────────────────────── */

  window.OrbitCallUI = {
    overlay: null,
    timerInterval: null,
    seconds: 0,
    isVideo: false,
    isIncoming: false,

    _build: function(info, isVideo, isIncoming) {
      var name = info.name || info.username || 'Unknown';
      var initial = name.charAt(0).toUpperCase();
      var avatarHtml = info.avatar
        ? '<img src="' + esc(info.avatar) + '" alt="">'
        : '<span>' + esc(initial) + '</span>';

      var stageInner;
      if (isVideo) {
        stageInner =
          '<video id="orbit-call-remote-video" class="orbit-call-remote-video" autoplay playsinline></video>' +
          '<div id="orbit-call-avatar-wrap" class="orbit-call-avatar-wrap is-hidden">' +
            '<div class="orbit-call-avatar orbit-call-avatar-lg">' + avatarHtml + '</div>' +
          '</div>' +
          '<div id="orbit-call-local-wrap" class="orbit-call-local-wrap' + (isIncoming ? ' is-hidden' : '') + '">' +
            '<video id="orbit-call-local-video" class="orbit-call-local-video" autoplay playsinline muted></video>' +
          '</div>';
      } else {
        stageInner =
          '<div id="orbit-call-avatar-wrap" class="orbit-call-avatar-wrap' + (isIncoming ? ' is-ringing' : '') + '">' +
            '<div class="orbit-call-avatar orbit-call-avatar-lg">' + avatarHtml + '</div>' +
            '<div class="orbit-call-wave"><span></span><span></span><span></span><span></span><span></span></div>' +
          '</div>';
      }

      var controls;
      if (isIncoming) {
        controls =
          '<div class="orbit-call-controls">' +
            '<button class="orbit-call-btn orbit-call-btn-danger" id="orbit-call-decline" aria-label="Decline">' +
              '<i data-lucide="phone-off"></i></button>' +
            '<button class="orbit-call-btn orbit-call-btn-accept" id="orbit-call-accept" aria-label="Accept">' +
              '<i data-lucide="phone"></i></button>' +
          '</div>';
      } else {
        controls =
          '<div class="orbit-call-controls">' +
            '<button class="orbit-call-btn" id="orbit-call-mute" aria-label="Mute"><i data-lucide="mic"></i></button>' +
            '<button class="orbit-call-btn orbit-call-btn-danger" id="orbit-call-end" aria-label="End call">' +
              '<i data-lucide="phone-off"></i></button>' +
            '<button class="orbit-call-btn" id="orbit-call-speaker" aria-label="Speaker"><i data-lucide="volume-2"></i></button>' +
            (isVideo ? '<button class="orbit-call-btn" id="orbit-call-camera" aria-label="Camera"><i data-lucide="video"></i></button>' : '') +
          '</div>';
      }

      var overlay = document.createElement('div');
      overlay.className = 'orbit-call-overlay';
      overlay.id = 'orbit-call-overlay';
      overlay.innerHTML =
        '<div class="orbit-call-stage">' + stageInner + '</div>' +
        '<div class="orbit-call-info">' +
          '<div class="orbit-call-name" id="orbit-call-name">' + esc(name) + '</div>' +
          '<div class="orbit-call-status" id="orbit-call-status">' +
            (isIncoming ? (isVideo ? 'Incoming video call' : 'Incoming voice call') : 'Calling\u2026') +
          '</div>' +
          '<div class="orbit-call-timer" id="orbit-call-timer" style="display:none;">00:00</div>' +
        '</div>' +
        controls;
      return overlay;
    },

    show: function(info, isVideo, isIncoming) {
      this.hide();
      this.isVideo = !!isVideo;
      this.isIncoming = !!isIncoming;
      this.seconds = 0;

      var overlay = this._build(info || {}, !!isVideo, !!isIncoming);
      document.body.appendChild(overlay);
      this.overlay = overlay;
      if (window.lucide) { try { lucide.createIcons({ root: overlay }); } catch (e) {} }

      var self = this;
      var on = function(id, fn) { var b = el(id); if (b) b.addEventListener('click', fn); };

      on('orbit-call-end', function() { if (window.OrbitCall) window.OrbitCall.endCall(); });
      on('orbit-call-decline', function() { if (window.OrbitCall) window.OrbitCall.declineIncoming(); });
      on('orbit-call-accept', function() { if (window.OrbitCall) window.OrbitCall.acceptIncoming(); });

      on('orbit-call-mute', function() {
        var st = window.OrbitCall && window.OrbitCall.localStream;
        if (!st) return;
        var tracks = st.getAudioTracks();
        if (!tracks.length) return;
        var enabled = !tracks[0].enabled;
        tracks[0].enabled = enabled;
        this.classList.toggle('is-off', !enabled);
        this.innerHTML = '<i data-lucide="' + (enabled ? 'mic' : 'mic-off') + '"></i>';
        if (window.lucide) { try { lucide.createIcons({ root: this }); } catch (e) {} }
      });

      on('orbit-call-speaker', function() {
        // The WebView cannot switch Android's audio route (that needs a native
        // AudioManager call), so this mutes/unmutes the remote audio instead —
        // the same thing desktop's speaker button does.
        var v = el('orbit-call-remote-video');
        var a = el('orbit-call-remote-audio');
        var target = v || a;
        if (!target) return;
        target.muted = !target.muted;
        this.classList.toggle('is-off', target.muted);
        this.innerHTML = '<i data-lucide="' + (target.muted ? 'volume-x' : 'volume-2') + '"></i>';
        if (window.lucide) { try { lucide.createIcons({ root: this }); } catch (e) {} }
      });

      on('orbit-call-camera', function() {
        var st = window.OrbitCall && window.OrbitCall.localStream;
        if (!st) return;
        var tracks = st.getVideoTracks();
        if (!tracks.length) return;
        var enabled = !tracks[0].enabled;
        tracks[0].enabled = enabled;
        this.classList.toggle('is-off', !enabled);
        this.innerHTML = '<i data-lucide="' + (enabled ? 'video' : 'video-off') + '"></i>';
        if (window.lucide) { try { lucide.createIcons({ root: this }); } catch (e) {} }
      });
    },

    setCallerName: function(name) {
      var n = el('orbit-call-name');
      if (n) n.textContent = name || '';
    },

    updateStatus: function(text) {
      var s = el('orbit-call-status');
      if (s) s.textContent = text || '';
    },

    /** Swap in the live video elements once media is flowing. */
    attachLocal: function(stream) {
      var v = el('orbit-call-local-video');
      if (v) { v.srcObject = stream; var w = el('orbit-call-local-wrap'); if (w) w.classList.remove('is-hidden'); }
    },

    attachRemote: function(stream) {
      var v = el('orbit-call-remote-video');
      if (v) {
        v.srcObject = stream;
        var w = el('orbit-call-avatar-wrap');
        if (w) w.classList.add('is-hidden');
        var l = el('orbit-call-local-wrap');
        if (l) l.classList.remove('is-hidden');
        return;
      }
      // Audio-only call: route the remote stream through a hidden element so the
      // speaker button still has something to mute.
      var a = el('orbit-call-remote-audio');
      if (!a) {
        a = document.createElement('audio');
        a.id = 'orbit-call-remote-audio';
        a.autoplay = true;
        a.style.display = 'none';
        document.body.appendChild(a);
      }
      a.srcObject = stream;
    },

    startTimer: function() {
      if (this.timerInterval) return;
      var self = this;
      this.seconds = 0;
      var t = el('orbit-call-timer');
      if (t) { t.style.display = ''; t.textContent = '00:00'; }
      this.timerInterval = setInterval(function() {
        self.seconds++;
        var e = el('orbit-call-timer');
        if (e) e.textContent = fmtTime(self.seconds);
      }, 1000);
    },

    hide: function() {
      Ringer.stop();
      if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
      this.seconds = 0;
      if (this.overlay) {
        try { this.overlay.remove(); } catch (e) {}
        this.overlay = null;
      }
      var a = el('orbit-call-remote-audio');
      if (a) { try { a.srcObject = null; a.remove(); } catch (e) {} }
    }
  };

  /* ────────────────────────── signalling ────────────────────────── */

  window.OrbitCall = {
    activeCall: null,      // { isVideo, direction }
    localStream: null,
    remoteStream: null,
    pc: null,
    peerId: null,
    incoming: null,        // { from, sdp, isVideo, callerName, callerAvatar }
    _pendingIce: [],
    // Call-log bookkeeping: did media ever flow, and why did it end?
    _connected: false,
    _endReason: null,      // 'declined' | 'busy' | 'no-answer' | 'missed' | 'failed'
    _logged: false,

    isSupported: function() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
                window.RTCPeerConnection);
    },

    _send: function(type, payload, peerId) {
      try {
        if (!window.Orbit || !Orbit.P2P || !Orbit.Protocol) return;
        var me = (MStore.user && MStore.user.id) || 'mobile';
        var target = peerId || this.peerId;
        if (!target) return;
        Orbit.P2P.send(target, Orbit.Protocol.createPacket(type, me, target, payload))
          .catch(function(e) { console.warn('[Call] send failed:', type, e && e.message); });
      } catch (e) {
        console.warn('[Call] send threw:', type, e && e.message);
      }
    },

    _friendFor: function(userId) {
      var friends = (typeof MStore !== 'undefined' && MStore.friends) || [];
      for (var i = 0; i < friends.length; i++) {
        // ⚠ Via the shared resolver — a friend record is keyed by `userId`, not
        // `peerId`, so the old id/peerId pair never matched a real contact.
        if (window.orbitIsFriend ? window.orbitIsFriend(friends[i], userId)
                                 : (String(friends[i].id) === String(userId) ||
                                    String(friends[i].peerId) === String(userId))) return friends[i];
      }
      return null;
    },

    _mediaFor: function(isVideo) {
      var constraints = { audio: true };
      if (isVideo) constraints.video = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } };
      return navigator.mediaDevices.getUserMedia(constraints);
    },

    /** Human-readable reason for a getUserMedia failure. */
    _mediaError: function(err) {
      var n = err && err.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') return 'Microphone/camera permission denied';
      if (n === 'NotFoundError' || n === 'DevicesNotFoundError') return 'No microphone or camera found';
      if (n === 'NotReadableError' || n === 'TrackStartError') return 'Microphone or camera is already in use';
      return (err && err.message) || 'Could not access microphone/camera';
    },

    _createPeerConnection: function(peerId) {
      var self = this;
      var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.pc = pc;

      if (this.localStream) {
        this.localStream.getTracks().forEach(function(track) { pc.addTrack(track, self.localStream); });
      }

      pc.ontrack = function(event) {
        self._connected = true;
        self.remoteStream = event.streams[0];
        window.OrbitCallUI.attachRemote(self.remoteStream);
        window.OrbitCallUI.updateStatus('Connected');
        window.OrbitCallUI.startTimer();
      };

      pc.onicecandidate = function(event) {
        if (event.candidate) {
          self._send(Orbit.Protocol.Types.CALL_ICE_CANDIDATE, {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          }, peerId);
        }
      };

      pc.onconnectionstatechange = function() {
        var st = pc.connectionState;
        if (st === 'connected') {
          self._connected = true;
          window.OrbitCallUI.updateStatus('Connected');
          window.OrbitCallUI.startTimer();
        } else if (st === 'failed') {
          console.warn('[Call] connection failed');
          self._endReason = 'failed';
          if (typeof showToast === 'function') showToast('Call connection failed', 'error');
          self.cleanup();
        } else if (st === 'disconnected') {
          // Transient on mobile (radio handoff). Only give up if it does not
          // recover — 'failed' is the terminal state.
          window.OrbitCallUI.updateStatus('Reconnecting\u2026');
        }
      };

      return pc;
    },

    /* ── outgoing ── */
    startCall: function(isVideo, peerId) {
      var self = this;
      if (!this.isSupported()) {
        if (typeof showToast === 'function') showToast('Calling is not supported on this device', 'error');
        return false;
      }
      if (this.activeCall) {
        if (typeof showToast === 'function') showToast('Already in a call', 'info');
        return false;
      }
      var friend = this._friendFor(peerId);
      var info = {
        name: (friend && friend.name) || peerId,
        avatar: friend ? friend.avatar : null
      };
      this.peerId = peerId;
      this._connected = false;
      this._endReason = null;
      this._logged = false;
      window.OrbitCallUI.show(info, isVideo, false);

      this._mediaFor(isVideo).then(function(stream) {
        self.localStream = stream;
        self.activeCall = { isVideo: !!isVideo, direction: 'outgoing' };
        window.OrbitCallUI.attachLocal(stream);

        var pc = self._createPeerConnection(peerId);
        return pc.createOffer().then(function(offer) { return pc.setLocalDescription(offer); });
      }).then(function() {
        var offer = self.pc.localDescription;
        var me = MStore.user || {};
        self._send(Orbit.Protocol.Types.CALL_OFFER, {
          sdp: offer.sdp,
          type: offer.type,
          callerId: me.id,
          callerName: me.name,
          callerAvatar: me.avatar || null,
          isVideo: !!(self.activeCall && self.activeCall.isVideo)
        }, peerId);
        // Ringback for the caller, and the no-answer timeout in one: the ringer
        // stops itself after RING_WINDOW_MS and reports expiry here.
        Ringer.start(function() {
          if (self.activeCall && self.activeCall.direction === 'outgoing' && self.pc &&
              self.pc.connectionState !== 'connected') {
            if (typeof showToast === 'function') showToast('No answer', 'info');
            self._endReason = 'no-answer';
            self.endCall();
          }
        });
      }).catch(function(err) {
        console.warn('[Call] start failed:', err);
        if (typeof showToast === 'function') showToast(self._mediaError(err), 'error');
        self._endReason = 'failed';
        self.cleanup();
      });
      return true;
    },

    /* ── incoming offer ── */
    handleOffer: function(payload, fromId) {
      if (!payload || !payload.sdp) return;
      // Busy: tell the caller rather than silently ignoring them.
      if (this.activeCall) {
        this._send(Orbit.Protocol.Types.CALL_DECLINE, { reason: 'busy' }, fromId);
        return;
      }
      var friend = this._friendFor(fromId);
      this.peerId = fromId;
      this._connected = false;
      this._endReason = null;
      this._logged = false;
      this.incoming = {
        from: fromId,
        sdp: payload.sdp,
        isVideo: !!payload.isVideo,
        callerName: payload.callerName || (friend && friend.name) || fromId,
        callerAvatar: payload.callerAvatar || (friend ? friend.avatar : null)
      };
      window.OrbitCallUI.show(
        { name: this.incoming.callerName, avatar: this.incoming.callerAvatar },
        this.incoming.isVideo, true
      );
      // Ring for 1m30. If it expires the caller has already given up (their own
      // window is the same length), so dismiss rather than leaving a stuck ring
      // screen behind if their CALL_END never arrives.
      // If the app is not on screen, the full-screen call UI is invisible — raise a
      // real system notification so the call is not silently missed. When the app
      // IS on screen the ring UI is the alert, so a notification would double-alert.
      if (window.orbitNotify && window.orbitIsBackground && window.orbitIsBackground()) {
        window.orbitNotify(
          this.incoming.isVideo ? 'VIDEO_CALL' : 'CALL',
          this.incoming.callerName || 'Incoming call',
          this.incoming.isVideo ? 'Incoming video call' : 'Incoming voice call',
          'call_' + fromId
        );
      }

      var self = this;
      Ringer.start(function() {
        if (self.incoming) {
          if (typeof showToast === 'function') showToast('Missed call', 'info');
          self._endReason = 'missed';
          self.cleanup();
        }
      });
    },

    acceptIncoming: function() {
      var self = this;
      var inc = this.incoming;
      if (!inc) return;
      Ringer.stop();
      if (!this.isSupported()) {
        if (typeof showToast === 'function') showToast('Calling is not supported on this device', 'error');
        this.declineIncoming();
        return;
      }
      window.OrbitCallUI.updateStatus('Connecting\u2026');

      this._mediaFor(inc.isVideo).then(function(stream) {
        self.localStream = stream;
        self.activeCall = { isVideo: inc.isVideo, direction: 'incoming' };
        // Re-render the surface in its in-call form. The incoming layout carries
        // Accept/Decline instead of the mute/end/speaker controls, so without
        // this the answering side is left staring at a ring screen it cannot
        // mute or hang up from. (Desktop does the same thing in answerCall.)
        window.OrbitCallUI.show({ name: inc.callerName, avatar: inc.callerAvatar }, inc.isVideo, false);
        window.OrbitCallUI.updateStatus('Connecting\u2026');
        window.OrbitCallUI.attachLocal(stream);

        var pc = self._createPeerConnection(inc.from);
        return pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: inc.sdp }))
          .then(function() { return self._drainPendingIce(); })
          .then(function() { return pc.createAnswer(); })
          .then(function(answer) { return pc.setLocalDescription(answer); });
      }).then(function() {
        var answer = self.pc.localDescription;
        self._send(Orbit.Protocol.Types.CALL_ANSWER, {
          sdp: answer.sdp,
          type: answer.type,
          answererId: (MStore.user && MStore.user.id) || 'mobile'
        }, inc.from);
        self.incoming = null;
      }).catch(function(err) {
        console.warn('[Call] accept failed:', err);
        if (typeof showToast === 'function') showToast(self._mediaError(err), 'error');
        self.declineIncoming();
      });
    },

    declineIncoming: function() {
      var inc = this.incoming;
      Ringer.stop();
      this._endReason = 'declined';
      if (inc) this._send(Orbit.Protocol.Types.CALL_DECLINE, { reason: 'declined' }, inc.from);
      this.cleanup();
    },

    /* ── remote answer ── */
    handleAnswer: function(payload) {
      if (!this.pc || !payload || !payload.sdp) return;
      var self = this;
      // They picked up — cut the ringback immediately.
      Ringer.stop();
      this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }))
        .then(function() { return self._drainPendingIce(); })
        .then(function() { window.OrbitCallUI.updateStatus('Connecting\u2026'); })
        .catch(function(err) { console.warn('[Call] setRemoteDescription(answer) failed:', err); });
    },

    /* ── trickle ICE ── */
    handleIceCandidate: function(payload) {
      if (!payload || !payload.candidate) return;
      var candidate = new RTCIceCandidate({
        candidate: payload.candidate,
        sdpMid: payload.sdpMid,
        sdpMLineIndex: payload.sdpMLineIndex
      });
      // Candidates can arrive before the remote description is set — hold them.
      if (!this.pc || !this.pc.remoteDescription || !this.pc.remoteDescription.type) {
        this._pendingIce.push(candidate);
        return;
      }
      this.pc.addIceCandidate(candidate).catch(function(err) {
        console.warn('[Call] addIceCandidate failed:', err);
      });
    },

    _drainPendingIce: function() {
      if (!this.pc || !this._pendingIce.length) { this._pendingIce = []; return Promise.resolve(); }
      var queued = this._pendingIce;
      this._pendingIce = [];
      var pc = this.pc;
      return Promise.all(queued.map(function(c) {
        return pc.addIceCandidate(c).catch(function(err) {
          console.warn('[Call] queued addIceCandidate failed:', err);
        });
      }));
    },

    /* ── teardown from the far side ── */
    handleEnd: function() {
      if (!this.activeCall && !this.incoming) return;
      if (typeof showToast === 'function') showToast('Call ended', 'info');
      this.cleanup();
    },

    handleDecline: function(payload) {
      Ringer.stop();
      var busy = payload && payload.reason === 'busy';
      this._endReason = busy ? 'busy' : 'declined';
      if (typeof showToast === 'function') {
        showToast(busy ? 'They are already on a call' : 'Call declined', 'warning');
      }
      this.cleanup();
    },

    /* ── user-initiated teardown ── */
    endCall: function() {
      if (this.activeCall || this.incoming) {
        this._send(Orbit.Protocol.Types.CALL_END, {
          userId: (MStore.user && MStore.user.id) || 'mobile'
        });
      }
      this.cleanup();
    },

    cleanup: function() {
      // ── Record the call in the chat before the state is torn down ──
      // Must happen FIRST: everything below (and OrbitCallUI.hide()) clears the
      // duration and the call metadata this needs.
      this._logCall();

      Ringer.stop();
      if (this.localStream) {
        try { this.localStream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
        this.localStream = null;
      }
      this.remoteStream = null;
      if (this.pc) {
        try {
          this.pc.ontrack = null;
          this.pc.onicecandidate = null;
          this.pc.onconnectionstatechange = null;
          this.pc.close();
        } catch (e) {}
        this.pc = null;
      }
      this._pendingIce = [];
      this.activeCall = null;
      this.incoming = null;
      this.peerId = null;
      this._connected = false;
      this._endReason = null;
      window.OrbitCallUI.hide();
    },

    /**
     * Append a call-log entry to the chat. Runs once per call, on whichever side
     * is tearing down — each side keeps its own record, so no extra packet is
     * needed and a lost CALL_END cannot leave one side without history.
     */
    _logCall: function() {
      if (this._logged) return;
      var call = this.activeCall || this.incoming;
      if (!call || !this.peerId) return;
      this._logged = true;

      // OrbitCallUI.seconds is the connected-time counter, so it is 0 for a call
      // that never connected.
      var durationSec = Math.floor(window.OrbitCallUI.seconds || 0);
      var direction = this.activeCall
        ? (this.activeCall.direction || 'outgoing')
        : 'incoming';

      var outcome;
      if (this._connected) {
        outcome = 'ended';
      } else if (this._endReason) {
        outcome = this._endReason;
      } else {
        // Hung up before media flowed, with no explicit reason.
        outcome = (direction === 'incoming') ? 'missed' : 'no-answer';
      }

      var kind = (this.activeCall && this.activeCall.isVideo) ||
                 (this.incoming && this.incoming.isVideo) ? 'video' : 'voice';

      if (window.OrbitCallLog && typeof window.OrbitCallLog.add === 'function') {
        window.OrbitCallLog.add({
          peerId: this.peerId,
          kind: kind,
          outcome: outcome,
          durationSec: outcome === 'ended' ? durationSec : 0,
          direction: direction
        });
      }
    }
  };

  /* ── If a call is somehow live when the app is torn down, release the media
        so the mic/camera indicator does not stay on. ── */
  window.addEventListener('pagehide', function() {
    if (window.OrbitCall && (window.OrbitCall.activeCall || window.OrbitCall.localStream)) {
      window.OrbitCall.endCall();
    }
  });
})();

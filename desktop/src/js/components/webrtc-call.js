// Ringtone. Shares the same clip as mobile (shared/sounds/, shipped into the
// installer by electron-builder's extraResources). Desktop resolves it from the
// app directory; the CSP's media-src 'self' already permits it.
var CALL_RING_SOUND = '../../shared/sounds/Call-ring-1.mp3';
// Ring for 1m30, looping the ~21.5 s clip, then stop. Mirrors mobile.
var CALL_RING_WINDOW_MS = 90000;

var CallRingtone = {
  _audio: null,
  _stopTimer: null,

  start: function() {
    var self = this;
    this.stop();
    try {
      var a = new Audio(CALL_RING_SOUND);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 1;
      this._audio = a;
      var p = a.play();
      if (p && p.catch) {
        p.catch(function(err) { console.warn('[Call] ringtone playback blocked:', err && err.name); });
      }
    } catch (e) {
      console.warn('[Call] ringtone unavailable:', e && e.message);
    }
    // Hard stop after the ring window, so it cannot ring forever if the far end
    // vanishes without sending CALL_END.
    this._stopTimer = setTimeout(function() { self.stop(); }, CALL_RING_WINDOW_MS);
  },

  stop: function() {
    if (this._stopTimer) { clearTimeout(this._stopTimer); this._stopTimer = null; }
    if (this._audio) {
      try { this._audio.pause(); this._audio.currentTime = 0; } catch (e) {}
      this._audio = null;
    }
  }
};

/* ─── Call log entries in the chat ───
   A finished call leaves a message with a `call` object instead of `text`, so it
   sits in the timeline with a timestamp and can be deleted like any other
   message. Mirrors mobile's window.OrbitCallLog. */
window.OrbitCallLog = {
  _esc: function(s) {
    if (window.Sanitize && window.Sanitize.escapeHtml) return window.Sanitize.escapeHtml(s);
    return String(s == null ? '' : s);
  },

  _fmtDuration: function(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = (m < 10 ? '0' : '') + m, ss = (s < 10 ? '0' : '') + s;
    return h > 0 ? (h + ':' + mm + ':' + ss) : (m + ':' + ss);
  },

  /** HTML for a call entry. Returns '' for anything without a `call` object. */
  render: function(msg) {
    if (!msg || !msg.call) return '';
    var c = msg.call;
    var esc = this._esc;
    var isVideo = c.kind === 'video';
    var peerId = c.peerId || '';
    var title = isVideo ? 'Video call' : 'Voice call';
    var sub = '';
    var icon = isVideo ? 'video' : 'phone';
    var muted = false;

    switch (c.outcome) {
      case 'ended':
        sub = this._fmtDuration(c.durationSec);
        break;
      case 'missed':
        title = isVideo ? 'Missed video call' : 'Missed voice call';
        sub = 'No answer'; icon = 'phone-missed'; muted = true;
        break;
      case 'declined':
        sub = 'Declined'; icon = 'phone-off'; muted = true;
        break;
      case 'no-answer':
        sub = 'No answer'; icon = 'phone-missed'; muted = true;
        break;
      case 'busy':
        sub = 'They were on another call'; icon = 'phone-off'; muted = true;
        break;
      case 'failed':
        sub = 'Call failed'; icon = 'phone-off'; muted = true;
        break;
      default:
        sub = 'Call ended'; muted = true;
    }

    return '<div class="call-log' + (muted ? ' is-muted' : '') + '">' +
      '<div class="call-log-icon"><i data-lucide="' + icon + '"></i></div>' +
      '<div class="call-log-body">' +
        '<div class="call-log-title">' + esc(title) + '</div>' +
        '<div class="call-log-sub">' + esc(sub) + '</div>' +
      '</div>' +
      '<button class="call-log-again" data-call-again="' + esc(peerId) + '" data-call-video="' + (isVideo ? '1' : '0') + '" title="Call again">' +
        '<i data-lucide="' + (isVideo ? 'video' : 'phone') + '"></i>' +
        '<span>Call again</span>' +
      '</button>' +
    '</div>';
  },

  /** Record a finished call in the chat. `entry` = { peerId, kind, outcome,
   *  durationSec, direction }. Each side keeps its own record, so no extra
   *  packet is needed and a lost CALL_END cannot leave one side without history. */
  add: function(entry) {
    try {
      if (!entry || !entry.peerId || !window.store) return;
      var st = window.store.getState();
      var me = (st.currentUser && st.currentUser.userId) || '';
      var peerId = String(entry.peerId);

      window.store.addMessage(peerId, {
        id: 'call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        // Desktop decides own-vs-other by comparing sender to currentUser.
        sender: entry.direction === 'outgoing' ? me : peerId,
        timestamp: new Date().toISOString(),
        call: {
          kind: entry.kind === 'video' ? 'video' : 'voice',
          outcome: entry.outcome || 'ended',
          durationSec: Math.max(0, Math.floor(entry.durationSec || 0)),
          peerId: peerId
        }
      });
    } catch (e) {
      console.warn('[CallLog] failed to record call:', e && e.message);
    }
  }
};

function _callAvatarColor(str) {
  if (!str) return '#5865f2';
  var h = 0;
  for (var i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
  return 'hsl(' + (Math.abs(h) % 360) + ', 45%, 35%)';
}

window.CallModal = {
  overlay: null,
  timerInterval: null,
  seconds: 0,
  isGroup: false,

  /**
   * Show or hide the "your camera is off" placeholder over the self-view.
   *
   * ⚠ ONE DEFINITION. This was written out TWICE — once in the 1:1 camera handler and
   * once in the group one — byte-for-byte identical, hardcoded white-alpha values and
   * all. Two copies of anything is one too many, and this pair was already at the
   * point where a fix to one would have missed the other.
   *
   * The disc colour stays `_callAvatarColor`: a per-person hue is what lets you tell
   * participants apart at a glance, which is a different job from a contact avatar and
   * deliberately not the accent disc.
   */
  _paintLocalPlaceholder(off) {
    var lv = document.getElementById('local-video');
    var ph = document.getElementById('local-placeholder');
    if (!lv || !ph) return;
    if (!off) {
      lv.style.display = 'block';
      ph.style.display = 'none';
      ph.innerHTML = '';
      return;
    }
    var cu = (window.store.getState() || {}).currentUser || {};
    lv.style.display = 'none';
    ph.style.display = 'flex';
    ph.style.background = _callAvatarColor(cu.username);
    ph.innerHTML = cu.avatar
      ? '<img src="' + window.Sanitize.escapeHtml(cu.avatar) + '" class="cal-pip-avatar-img" alt="">'
      : '<span class="cal-pip-avatar-initial">' + window.Sanitize.escapeHtml((cu.username || '?').charAt(0).toUpperCase()) + '</span>';
  },

  show(callerInfo, isVideo, isIncoming, ring) {
    this.hide();   // also stops any ringtone still playing
    this.isGroup = false;
    this.seconds = 0;
    // Ring unless told otherwise. Defaulting to the incoming case means every
    // existing incoming-call site rings without any change; the outgoing caller
    // passes true explicitly, while the "accepted an incoming call" re-render in
    // answerCall passes isIncoming=false and so stays silent — otherwise the
    // callee's phone would keep ringing after they picked up.
    if (ring === undefined ? !!isIncoming : !!ring) CallRingtone.start();
    var overlay = document.createElement('div');
    // ⚠ The overlay's appearance is `cal-*` classes in styles/redesign.css now, not
    // an inline cssText. It was `rgba(0,0,0,0.85)` with the content floating on it and
    // NO surface of its own — so 15% of the app showed through and the caller's name
    // sat on top of whatever chat was behind it.
    overlay.className = 'call-modal-overlay';

    var callerName = (callerInfo.username || callerInfo.name || 'Unknown');
    var callStatus = isIncoming ? 'Incoming Call...' : 'Calling...';

    // ⚠ `callerName` is interpolated with escapeHtml now. It went in RAW — the group
    // title beside it has always been escaped, so a display name containing `<` broke
    // the markup in one path and not the other.
    var avatarHtml = callerInfo.avatar
      ? '<img src="' + window.Sanitize.escapeHtml(callerInfo.avatar) + '" class="cal-avatar-img" alt="">'
      : '<span class="cal-avatar-initial">' + window.Sanitize.escapeHtml((callerInfo.username || '?').charAt(0).toUpperCase()) + '</span>';

    var mediaArea;
    if (isVideo) {
      // The placeholder sits UNDER the video, so it shows only while there is no
      // stream. It used to be the word "Video" at 15% opacity — a debug artefact
      // where a face belongs.
      mediaArea =
        '<div id="call-video-container" class="cal-video">' +
          '<div class="cal-remote-empty">' + avatarHtml + '</div>' +
          '<video id="remote-video" autoplay playsinline class="cal-remote-video"></video>' +
          '<div id="local-video-wrap" class="cal-pip">' +
            '<video id="local-video" autoplay playsinline muted class="cal-pip-video"></video>' +
            '<div id="local-placeholder" class="cal-pip-placeholder"></div>' +
          '</div>' +
        '</div>';
    } else {
      // ⚠ The five bars are the SAME height and their stagger is CSS, not five
      // hand-written inline styles. They also stop when the call connects (see
      // `.is-connected` in the stylesheet): a waveform that animates whether or not
      // anybody is speaking is decoration pretending to be a level meter.
      mediaArea =
        '<div id="call-audio-area" class="cal-audio">' +
          '<div class="cal-avatar">' + avatarHtml + '</div>' +
          '<div class="cal-wave" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>' +
        '</div>';
    }

    var bottomBtns;
    if (isIncoming) {
      bottomBtns =
        '<div class="cal-controls cal-controls-answer">' +
          '<button id="call-decline-btn" class="cal-btn cal-btn-lg cal-btn-danger" title="Decline"><i data-lucide="phone-off"></i></button>' +
          '<button id="call-accept-btn" class="cal-btn cal-btn-lg cal-btn-success" title="Accept"><i data-lucide="phone"></i></button>' +
        '</div>';
    } else {
      var cameraBtnHtml = isVideo
        ? '<button id="call-camera-btn" class="cal-btn cal-btn-ghost" title="Camera"><i data-lucide="video"></i></button>'
        : '';
      bottomBtns =
        '<div class="cal-controls">' +
          cameraBtnHtml +
          '<button id="call-mute-btn" class="cal-btn cal-btn-ghost" title="Mute"><i data-lucide="mic"></i></button>' +
          '<button id="call-end-btn" class="cal-btn cal-btn-lg cal-btn-danger" title="Hang up"><i data-lucide="phone-off"></i></button>' +
          '<button id="call-speaker-btn" class="cal-btn cal-btn-ghost" title="Speaker"><i data-lucide="volume-2"></i></button>' +
        '</div>';
    }

    overlay.innerHTML =
      '<div id="call-modal-inner" class="cal-inner">' +
        mediaArea +
        '<div id="call-name-text" class="cal-name">' + window.Sanitize.escapeHtml(callerName) + '</div>' +
        '<div id="call-status-text" class="cal-status">' + window.Sanitize.escapeHtml(callStatus) + '</div>' +
        '<div id="call-timer" class="cal-timer">00:00</div>' +
        bottomBtns +
      '</div>';

    if (!document.getElementById('call-modal-styles')) {
      var style = document.createElement('style');
      style.id = 'call-modal-styles';
      style.textContent = '@keyframes audioWave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }';
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    this.overlay = overlay;
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    var endBtn = overlay.querySelector('#call-end-btn');
    if (endBtn) endBtn.addEventListener('click', function() { if (window.CallManager) window.CallManager.endCall(); });
    var declineBtn = overlay.querySelector('#call-decline-btn');
    if (declineBtn) declineBtn.addEventListener('click', function() { if (window.CallManager) window.CallManager._declineCall(); });
    var acceptBtn = overlay.querySelector('#call-accept-btn');
    if (acceptBtn) acceptBtn.addEventListener('click', function() { if (window.CallManager) window.CallManager._acceptIncoming(); });
    var muteBtn = overlay.querySelector('#call-mute-btn');
    if (muteBtn) muteBtn.addEventListener('click', function() {
      if (window.CallManager && window.CallManager.localStream) {
        var enabled = !window.CallManager.localStream.getAudioTracks()[0].enabled;
        window.CallManager.localStream.getAudioTracks()[0].enabled = enabled;
        this.querySelector('svg').setAttribute('data-lucide', enabled ? 'mic' : 'mic-off');
        this.title = enabled ? 'Mute' : 'Unmute';
        if (window.lucide) window.lucide.createIcons({ root: this });
      }
    });
    var speakerBtn = overlay.querySelector('#call-speaker-btn');
    if (speakerBtn) speakerBtn.addEventListener('click', function() {
      var vid = document.getElementById('remote-video');
      if (vid) {
        vid.muted = !vid.muted;
        this.querySelector('svg').setAttribute('data-lucide', vid.muted ? 'volume-x' : 'volume-2');
        this.title = vid.muted ? 'Unmute Speaker' : 'Mute Speaker';
        if (window.lucide) window.lucide.createIcons({ root: this });
      }
    });
    var cameraBtn = overlay.querySelector('#call-camera-btn');
    if (cameraBtn) cameraBtn.addEventListener('click', function() {
      if (window.CallManager && window.CallManager.localStream) {
        var tracks = window.CallManager.localStream.getVideoTracks();
        if (tracks.length > 0) {
          var enabled = !tracks[0].enabled;
          tracks[0].enabled = enabled;
          this.querySelector('svg').setAttribute('data-lucide', enabled ? 'video' : 'video-off');
          this.title = enabled ? 'Camera' : 'Camera Off';
          if (window.lucide) window.lucide.createIcons({ root: this });
          this._paintLocalPlaceholder(!enabled);
        }
      }
    });
  },

  showGroup(groupTitle, participants, isVideo, ring) {
    this.hide();
    this.isGroup = true;
    this.seconds = 0;
    if (ring) CallRingtone.start();
    this._participants = participants || {};
    var overlay = document.createElement('div');
    overlay.className = 'call-modal-overlay';

    var pCount = Object.keys(participants).length;
    var cols = pCount <= 2 ? 'repeat(' + pCount + ', 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))';

    var videoArea = isVideo
      ? '<div id="call-video-container" class="cal-video cal-video-group">' +
          '<div id="group-remote-videos" class="cal-grid" style="grid-template-columns:' + cols + ';"></div>' +
        '</div>'
      : '<div id="call-audio-area" class="cal-audio cal-audio-group">' +
          '<div id="group-participant-avatars" class="cal-participants"></div>' +
        '</div>';

    overlay.innerHTML =
      '<div id="call-modal-inner" class="cal-inner cal-inner-group">' +
        '<div class="cal-group-title">' + window.Sanitize.escapeHtml(groupTitle) + '</div>' +
        '<div id="call-participant-count" class="cal-count">' + pCount + ' participant' + (pCount !== 1 ? 's' : '') + '</div>' +
        videoArea +
        '<div id="call-status-text" class="cal-status">Calling...</div>' +
        '<div id="call-timer" class="cal-timer">00:00</div>' +
        '<div class="cal-controls">' +
          (isVideo ? '<button id="call-camera-btn" class="cal-btn cal-btn-ghost" title="Camera"><i data-lucide="video"></i></button>' : '') +
          '<button id="call-mute-btn" class="cal-btn cal-btn-ghost" title="Mute"><i data-lucide="mic"></i></button>' +
          '<button id="call-end-btn" class="cal-btn cal-btn-lg cal-btn-danger" title="Hang up"><i data-lucide="phone-off"></i></button>' +
          '<button id="call-speaker-btn" class="cal-btn cal-btn-ghost" title="Speaker"><i data-lucide="volume-2"></i></button>' +
        '</div>' +
      '</div>';

    if (!document.getElementById('call-modal-styles')) {
      var style = document.createElement('style');
      style.id = 'call-modal-styles';
      style.textContent = '@keyframes audioWave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }';
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    this.overlay = overlay;
    this._renderGroupParticipants(participants, isVideo);
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    var endBtn = overlay.querySelector('#call-end-btn');
    if (endBtn) endBtn.addEventListener('click', function() { if (window.CallManager) window.CallManager.endCall(); });
    var muteBtn = overlay.querySelector('#call-mute-btn');
    if (muteBtn) muteBtn.addEventListener('click', function() {
      if (window.CallManager && window.CallManager.localStream) {
        var enabled = !window.CallManager.localStream.getAudioTracks()[0].enabled;
        window.CallManager.localStream.getAudioTracks()[0].enabled = enabled;
        this.querySelector('svg').setAttribute('data-lucide', enabled ? 'mic' : 'mic-off');
        this.title = enabled ? 'Mute' : 'Unmute';
        if (window.lucide) window.lucide.createIcons({ root: this });
      }
    });
    var speakerBtn = overlay.querySelector('#call-speaker-btn');
    if (speakerBtn) speakerBtn.addEventListener('click', function() {
      var vids = document.querySelectorAll('#group-remote-videos video');
      var muted = vids.length > 0 && vids[0].muted;
      vids.forEach(function(v) { v.muted = !muted; });
      this.querySelector('svg').setAttribute('data-lucide', !muted ? 'volume-x' : 'volume-2');
      this.title = !muted ? 'Unmute Speaker' : 'Mute Speaker';
      if (window.lucide) window.lucide.createIcons({ root: this });
    });
    var cameraBtn = overlay.querySelector('#call-camera-btn');
    if (cameraBtn) cameraBtn.addEventListener('click', function() {
      if (window.CallManager && window.CallManager.localStream) {
        var tracks = window.CallManager.localStream.getVideoTracks();
        if (tracks.length > 0) {
          var enabled = !tracks[0].enabled;
          tracks[0].enabled = enabled;
          this.querySelector('svg').setAttribute('data-lucide', enabled ? 'video' : 'video-off');
          this.title = enabled ? 'Camera' : 'Camera Off';
          if (window.lucide) window.lucide.createIcons({ root: this });
          this._paintLocalPlaceholder(!enabled);
        }
      }
    });
  },

  _renderGroupParticipants(participants, isVideo) {
    if (!this.overlay) return;
    this._participants = participants;
    var pCount = Object.keys(participants).length;
    var countEl = this.overlay.querySelector('#call-participant-count');
    if (countEl) countEl.textContent = pCount + ' participant' + (pCount !== 1 ? 's' : '');

    if (isVideo) {
      var grid = this.overlay.querySelector('#group-remote-videos');
      if (!grid) return;
      grid.innerHTML = '';
      var cols = pCount <= 2 ? 'repeat(' + pCount + ', 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))';
      grid.style.gridTemplateColumns = cols;
      var userIds = Object.keys(participants);
      var currentUserId = (window.store.getState().currentUser || {}).userId;
      userIds.forEach(function(uid) {
        var p = participants[uid];
        var isMe = uid === currentUserId;
        var wrapper = document.createElement('div');
        wrapper.className = 'cal-tile';
        var nameLabel = isMe ? 'You' : (p.name || '');
        var vidId = isMe ? 'local-video' : 'gvid-' + uid.replace(/[^a-zA-Z0-9]/g, '_');
        var placeholderHtml = isMe ? '<div id="local-placeholder" class="cal-pip-placeholder"></div>' : '';
        // ⚠ Something behind the video. Before their stream arrives a tile was an
        // empty grey box with a name chip on it — it said "this person is here" and
        // nothing else. Their avatar goes under the video, the same way the 1:1
        // screen does it, so it shows only while there is no picture.
        var tileAvatar = p.avatar
          ? '<img src="' + window.Sanitize.escapeHtml(p.avatar) + '" class="cal-tile-avatar-img" alt="">'
          : '<span class="cal-tile-avatar-initial">' + window.Sanitize.escapeHtml((p.name || '?').charAt(0).toUpperCase()) + '</span>';
        wrapper.innerHTML =
          '<div class="cal-tile-empty">' + tileAvatar + '</div>' +
          '<video id="' + vidId + '" autoplay playsinline ' + (isMe ? 'muted' : '') + ' class="cal-tile-video"></video>' +
          placeholderHtml +
          '<div class="cal-tile-name">' + window.Sanitize.escapeHtml(nameLabel) + '</div>';
        grid.appendChild(wrapper);
        // Attach local stream to local video immediately if available
        if (isMe && window.CallManager && window.CallManager.localStream) {
          var lv = wrapper.querySelector('#local-video');
          if (lv) lv.srcObject = window.CallManager.localStream;
        }
      });
    } else {
      var container = this.overlay.querySelector('#group-participant-avatars');
      if (!container) return;
      container.innerHTML = '';
      var userIds = Object.keys(participants);
      userIds.forEach(function(uid) {
        var p = participants[uid];
        var isMe = uid === (window.store.getState().currentUser || {}).userId;
        var nameLabel = isMe ? 'You' : (p.name || '');
        // ⚠ No accent border on an accent disc — it was `2px solid
        // var(--accent-primary)` around a `--accent-primary` fill, which is a ring
        // you cannot see drawn around the thing it matches.
        var avatarHtml = p.avatar
          ? '<img src="' + window.Sanitize.escapeHtml(p.avatar) + '" class="cal-participant-img" alt="">'
          : '<span class="cal-participant-initial">' + window.Sanitize.escapeHtml((p.name || '?').charAt(0).toUpperCase()) + '</span>';
        var item = document.createElement('div');
        item.className = 'cal-participant';
        item.innerHTML = avatarHtml + '<div class="cal-participant-name">' + window.Sanitize.escapeHtml(nameLabel) + '</div>';
        container.appendChild(item);
      });
    }
  },

  addParticipant(userId, name, avatar) {
    if (!this._participants) this._participants = {};
    this._participants[userId] = { name: name, avatar: avatar };
    var isVideo = !!(this.overlay && this.overlay.querySelector('#group-remote-videos'));
    this._renderGroupParticipants(this._participants, isVideo);
    return this._participants;
  },

  removeParticipant(userId) {
    if (!this._participants) return;
    delete this._participants[userId];
    var isVideo = !!(this.overlay && this.overlay.querySelector('#group-remote-videos'));
    this._renderGroupParticipants(this._participants, isVideo);
  },

  updateGroupStatus(text) {
    var el = this.overlay && this.overlay.querySelector('#call-status-text');
    if (el) el.textContent = text;
  },

  updateStatus(text) {
    var el = this.overlay && this.overlay.querySelector('#call-status-text');
    if (el) el.textContent = text;
  },

  setCallerName(name) {
    var el = this.overlay && this.overlay.querySelector('#call-name-text');
    if (el) el.textContent = name;
  },

  startTimer() {
    // Media is flowing — stop ringing.
    CallRingtone.stop();
    // ⚠ And stop the waveform. `is-connected` settles it into a flat, even row: the
    // five bars animated whether or not anybody was speaking, which is decoration
    // pretending to be a level meter. Motion belongs to "connecting"; once the timer
    // is running, the timer is the sign of life.
    var inner = this.overlay && this.overlay.querySelector('#call-modal-inner');
    if (inner) inner.classList.add('is-connected');
    var el = this.overlay && this.overlay.querySelector('#call-timer');
    if (el) el.style.display = 'block';
    var statusEl = this.overlay && this.overlay.querySelector('#call-status-text');
    if (statusEl) statusEl.style.display = this.isGroup ? 'block' : 'none';
    if (this.isGroup && statusEl) statusEl.textContent = 'Connected';
    this.seconds = 0;
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(function() {
      this.seconds++;
      var m = Math.floor(this.seconds / 60);
      var s = this.seconds % 60;
      var display = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      var timerEl = this.overlay && this.overlay.querySelector('#call-timer');
      if (timerEl) timerEl.textContent = display;
    }.bind(this), 1000);
  },

  hide() {
    CallRingtone.stop();
    clearInterval(this.timerInterval);
    this.isGroup = false;
    this._participants = null;
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
};

window.CallManager = {
  activeCall: null,
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  dataChannel: null,
  targetUserId: null,
  targetPeerIp: null,
  incomingCallData: null,
  peerConnections: {},
  participants: {},
  groupCallId: null,
  // Call-log bookkeeping: did media ever flow, and why did it end?
  _connected: false,
  _endReason: null,
  _logged: false,
  _ringTimer: null,

  startCall(isVideo, targetUserId, targetPeerIp) {
    var state = window.store.getState();
    var currentUser = state.currentUser;
    var friend = state.friends.find(function(f) { return f.userId === targetUserId; });
    if (!friend || !currentUser) return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.Toast) window.Toast.show('Call Error', 'WebRTC not supported in this browser.', 'error');
      return false;
    }
    this.targetUserId = targetUserId;
    this.targetPeerIp = targetPeerIp;
    this._connected = false;
    this._endReason = null;
    this._logged = false;
    var constraints = { audio: true };
    if (isVideo) constraints.video = { width: { ideal: 640 }, height: { ideal: 480 } };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        this.localStream = stream;
        this.activeCall = { isVideo: isVideo, direction: 'outgoing', isGroup: false };
        if (window.CallModal) {
          // ring=true: the caller hears ringback until the far end answers.
          window.CallModal.show({ username: friend.username, avatar: friend.avatar }, isVideo, false, true);
          var localVid = document.getElementById('local-video');
          if (localVid) localVid.srcObject = stream;
        }
        this._createPeerConnection(targetUserId, isVideo);
        return this.peerConnection.createOffer();
      }.bind(this))
      .then(function(offer) {
        return this.peerConnection.setLocalDescription(offer);
      }.bind(this))
      .then(function() {
        var offer = this.peerConnection.localDescription;
        var packet = {
          sdp: offer.sdp, type: offer.type,
          callerId: window.store.getState().currentUser.userId,
          callerName: window.store.getState().currentUser.username,
          callerAvatar: window.store.getState().currentUser.avatar,
          isVideo: this.activeCall ? this.activeCall.isVideo : false
        };
        if (window.orbitAPI) {
          window.orbitAPI.networkSend(targetUserId, targetPeerIp, window.Protocol.Types.CALL_OFFER, packet);
          if (window.Toast) window.Toast.show('Calling', 'Calling ' + (friend.username || 'friend') + '...');
        }
        // Same 1m30 window as the ringtone. Without this an unanswered call
        // leaves the caller on a dead screen forever.
        if (this._ringTimer) clearTimeout(this._ringTimer);
        this._ringTimer = setTimeout(function() {
          if (this._connected || !this.activeCall) return;
          if (window.Toast) window.Toast.show('No answer', 'They did not pick up.', 'info');
          this._endReason = 'no-answer';
          this.endCall();
        }.bind(this), CALL_RING_WINDOW_MS);
      }.bind(this))
      .catch(function(err) {
        console.error('Call start error:', err);
        if (window.Toast) window.Toast.show('Call Error', err.message || 'Failed to start call', 'error');
        this.cleanup();
      }.bind(this));
    return true;
  },

  // ---- Group Call ----
  startGroupCall(isVideo, groupId) {
    var state = window.store.getState();
    var currentUser = state.currentUser;
    var group = state.groups.find(function(g) { return g.groupId === groupId; });
    if (!group || !currentUser) return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.Toast) window.Toast.show('Call Error', 'WebRTC not supported.', 'error');
      return false;
    }
    var members = group.members || [];
    var otherMembers = members.filter(function(m) {
      var mid = typeof m === 'string' ? m : m.userId;
      return mid !== currentUser.userId;
    });
    if (otherMembers.length === 0) {
      if (window.Toast) window.Toast.show('Call Error', 'No other members in this group.', 'error');
      return false;
    }
    this.groupCallId = groupId;
    this.peerConnections = {};
    this.participants = {};
    this.participants[currentUser.userId] = { name: currentUser.username, avatar: currentUser.avatar };
    var initialParticipants = {};
    initialParticipants[currentUser.userId] = { name: currentUser.username, avatar: currentUser.avatar };
    otherMembers.forEach(function(m) {
      var mid = typeof m === 'string' ? m : m.userId;
      var friend = state.friends.find(function(f) { return f.userId === mid; });
      initialParticipants[mid] = { name: friend ? friend.username : mid, avatar: friend ? friend.avatar : null };
    });
    var constraints = { audio: true };
    if (isVideo) constraints.video = { width: { ideal: 640 }, height: { ideal: 480 } };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        this.localStream = stream;
        this.activeCall = { isVideo: isVideo, direction: 'outgoing', isGroup: true, groupId: groupId };
        if (window.CallModal) {
          window.CallModal.showGroup(group.groupName, initialParticipants, isVideo, true);
          var localVid = document.getElementById('local-video');
          if (localVid) localVid.srcObject = stream;
          window.CallModal.updateGroupStatus('Calling ' + otherMembers.length + ' member' + (otherMembers.length !== 1 ? 's' : '') + '...');
        }
        otherMembers.forEach(function(m) {
          var mid = typeof m === 'string' ? m : m.userId;
          var friend = state.friends.find(function(f) { return f.userId === mid; });
          if (friend) {
            this.participants[mid] = { name: friend.username, avatar: friend.avatar };
            this._createGroupPeerConnection(mid, friend.ip || '', isVideo, groupId);
          }
        }.bind(this));
      }.bind(this))
      .catch(function(err) {
        console.error('Group call start error:', err);
        if (window.Toast) window.Toast.show('Call Error', err.message || 'Failed to start group call', 'error');
        this.cleanup();
      }.bind(this));
    return true;
  },

  _createGroupPeerConnection(userId, peerIp, isVideo, groupId) {
    var pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    this.peerConnections[userId] = pc;
    if (this.localStream) {
      this.localStream.getTracks().forEach(function(track) {
        pc.addTrack(track, this.localStream);
      }.bind(this));
    }
    pc.ontrack = function(event) {
      if (!this.participants[userId]) return;
      var safeId = 'gvid-' + userId.replace(/[^a-zA-Z0-9]/g, '_');
      var vid = document.getElementById(safeId);
      if (vid) {
        vid.srcObject = event.streams[0];
      } else if (!this.activeCall.isVideo && window.CallModal) {
        window.CallModal.startTimer();
      }
      if (window.CallModal && this.activeCall.isVideo) {
        var allConnected = Object.keys(this.peerConnections).every(function(uid) {
          return this.peerConnections[uid].connectionState === 'connected';
        }.bind(this));
        if (allConnected) window.CallModal.startTimer();
      }
    }.bind(this);
    pc.onicecandidate = function(event) {
      if (event.candidate && window.orbitAPI) {
        window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_ICE_CANDIDATE, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          groupId: groupId
        });
      }
    }.bind(this);
    pc.onconnectionstatechange = function() {
      if (pc.connectionState === 'connected') {
        this._connected = true;
        if (window.CallModal) window.CallModal.addParticipant(userId,
          (this.participants[userId] || {}).name || userId,
          (this.participants[userId] || {}).avatar || null
        );
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (window.CallModal) window.CallModal.removeParticipant(userId);
        delete this.peerConnections[userId];
        if (Object.keys(this.peerConnections).length === 0) {
          if (window.Toast) window.Toast.show('Call Ended', 'All participants left.', 'info');
          this.cleanup();
        }
      }
    }.bind(this);
    pc.createOffer()
      .then(function(offer) { return pc.setLocalDescription(offer); }.bind(this))
      .then(function() {
        var offer = pc.localDescription;
        if (window.orbitAPI) {
          var group = window.store.getState().groups.find(function(g) { return g.groupId === groupId; });
          window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_OFFER, {
            sdp: offer.sdp, type: offer.type,
            callerId: window.store.getState().currentUser.userId,
            callerName: window.store.getState().currentUser.username,
            callerAvatar: window.store.getState().currentUser.avatar,
            isVideo: isVideo,
            groupId: groupId,
            groupName: group ? group.groupName : 'Group'
          });
        }
      }.bind(this))
      .catch(function(err) {
        console.error('Group offer error for ' + userId + ':', err);
        delete this.peerConnections[userId];
      }.bind(this));
    return pc;
  },

  _createPeerConnection(targetUserId, isVideo) {
    var config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    this.peerConnection = new RTCPeerConnection(config);
    if (this.localStream) {
      this.localStream.getTracks().forEach(function(track) {
        this.peerConnection.addTrack(track, this.localStream);
      }.bind(this));
    }
    this.peerConnection.ontrack = function(event) {
      this._connected = true;
      this.remoteStream = event.streams[0];
      var remoteVid = document.getElementById('remote-video');
      if (remoteVid) remoteVid.srcObject = this.remoteStream;
      if (window.CallModal) window.CallModal.startTimer();
    }.bind(this);
    this.peerConnection.onicecandidate = function(event) {
      if (event.candidate && window.orbitAPI && this.targetUserId) {
        window.orbitAPI.networkSend(this.targetUserId, this.targetPeerIp, window.Protocol.Types.CALL_ICE_CANDIDATE, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        });
      }
    }.bind(this);
    this.peerConnection.onconnectionstatechange = function() {
      if (this.peerConnection.connectionState === 'connected') {
        this._connected = true;
      }
      if (this.peerConnection.connectionState === 'disconnected' || this.peerConnection.connectionState === 'failed') {
        if (this._connected) {
          if (window.Toast) window.Toast.show('Call Ended', 'Connection lost.', 'info');
        } else {
          this._endReason = 'failed';
        }
        this.cleanup();
      }
    }.bind(this);
    return this.peerConnection;
  },

  answerCall(callData) {
    var state = window.store.getState();
    var callerId = callData.callerId;
    var friend = state.friends.find(function(f) { return f.userId === callerId; });
    if (!friend) return;
    this.targetUserId = callerId;
    this.targetPeerIp = friend.ip || state.remoteIp;
    var isVideo = callData.isVideo;
    var constraints = { audio: true };
    if (isVideo) constraints.video = { width: { ideal: 640 }, height: { ideal: 480 } };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        this.localStream = stream;
        this.activeCall = { isVideo: isVideo, direction: 'incoming', isGroup: false };
        if (window.CallModal) {
          window.CallModal.show({ username: friend.username, avatar: friend.avatar }, isVideo, false);
          var localVid = document.getElementById('local-video');
          if (localVid) localVid.srcObject = stream;
          window.CallModal.updateStatus('Connecting...');
        }
        this._createPeerConnection(callerId, isVideo);
        var remoteDesc = new RTCSessionDescription({ type: 'offer', sdp: callData.sdp });
        return this.peerConnection.setRemoteDescription(remoteDesc);
      }.bind(this))
      .then(function() { return this.peerConnection.createAnswer(); }.bind(this))
      .then(function(answer) { return this.peerConnection.setLocalDescription(answer); }.bind(this))
      .then(function() {
        var answer = this.peerConnection.localDescription;
        if (window.orbitAPI) {
          window.orbitAPI.networkSend(this.targetUserId, this.targetPeerIp, window.Protocol.Types.CALL_ANSWER, {
            sdp: answer.sdp, type: answer.type,
            answererId: window.store.getState().currentUser.userId,
            answererName: window.store.getState().currentUser.username
          });
        }
      }.bind(this))
      .catch(function(err) {
        console.error('Answer call error:', err);
        if (window.Toast) window.Toast.show('Call Error', err.message || 'Failed to answer call', 'error');
        this.cleanup();
      }.bind(this));
  },

  // ---- Answer a group call offer (join group call) ----
  _answerGroupCall(callData, groupId) {
    var state = window.store.getState();
    var currentUser = state.currentUser;
    var callerId = callData.callerId;
    var group = state.groups.find(function(g) { return g.groupId === groupId; });
    if (!group || !currentUser) return;
    this.groupCallId = groupId;
    var isVideo = callData.isVideo;
    var constraints = { audio: true };
    if (isVideo) constraints.video = { width: { ideal: 640 }, height: { ideal: 480 } };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        this.localStream = stream;
        this.activeCall = { isVideo: isVideo, direction: 'incoming', isGroup: true, groupId: groupId };
        var initialParticipants = {};
        initialParticipants[currentUser.userId] = { name: currentUser.username, avatar: currentUser.avatar };
        initialParticipants[callerId] = { name: callData.callerName || callerId, avatar: callData.callerAvatar || null };
        if (window.CallModal) {
          window.CallModal.showGroup(group.groupName, initialParticipants, isVideo);
          var localVid = document.getElementById('local-video');
          if (localVid) localVid.srcObject = stream;
          window.CallModal.updateGroupStatus('Connecting...');
        }
        this.participants = {};
        this.participants[currentUser.userId] = { name: currentUser.username, avatar: currentUser.avatar };
        this.participants[callerId] = { name: callData.callerName || callerId, avatar: callData.callerAvatar || null };
        this.peerConnections = {};
        this._createGroupPeerConnectionAnswer(callerId, state.friends.find(function(f) { return f.userId === callerId; }), callData, isVideo, groupId);
      }.bind(this))
      .catch(function(err) {
        console.error('Join group call error:', err);
        if (window.Toast) window.Toast.show('Call Error', err.message || 'Failed to join group call', 'error');
        this.cleanup();
      }.bind(this));
  },

  _createGroupPeerConnectionAnswer(userId, friend, callData, isVideo, groupId) {
    var peerIp = friend ? friend.ip : '';
    var pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    this.peerConnections[userId] = pc;
    if (this.localStream) {
      this.localStream.getTracks().forEach(function(track) {
        pc.addTrack(track, this.localStream);
      }.bind(this));
    }
    pc.ontrack = function(event) {
      var safeId = 'gvid-' + userId.replace(/[^a-zA-Z0-9]/g, '_');
      var vid = document.getElementById(safeId);
      if (vid) vid.srcObject = event.streams[0];
      if (window.CallModal) window.CallModal.startTimer();
    }.bind(this);
    pc.onicecandidate = function(event) {
      if (event.candidate && window.orbitAPI) {
        window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_ICE_CANDIDATE, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          groupId: groupId
        });
      }
    }.bind(this);
    pc.onconnectionstatechange = function() {
      if (pc.connectionState === 'connected') {
        this._connected = true;
        if (window.CallModal) window.CallModal.addParticipant(userId, callData.callerName || userId, callData.callerAvatar || null);
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (window.CallModal) window.CallModal.removeParticipant(userId);
        delete this.peerConnections[userId];
        if (Object.keys(this.peerConnections).length === 0) { this.cleanup(); }
      }
    }.bind(this);
    var remoteDesc = new RTCSessionDescription({ type: 'offer', sdp: callData.sdp });
    pc.setRemoteDescription(remoteDesc)
      .then(function() { return pc.createAnswer(); }.bind(this))
      .then(function(answer) { return pc.setLocalDescription(answer); }.bind(this))
      .then(function() {
        var answer = pc.localDescription;
        if (window.orbitAPI) {
          window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_ANSWER, {
            sdp: answer.sdp, type: answer.type,
            answererId: window.store.getState().currentUser.userId,
            answererName: window.store.getState().currentUser.username
          });
        }
      }.bind(this))
      .catch(function(err) {
        console.error('Group answer error for ' + userId + ':', err);
        delete this.peerConnections[userId];
      }.bind(this));
    return pc;
  },

  _connectGroupParticipant(userId, callerName, callerAvatar, offerSdp, isVideo, groupId) {
    if (this.peerConnections[userId]) return;
    var state = window.store.getState();
    var friend = state.friends.find(function(f) { return f.userId === userId; });
    var peerIp = friend ? friend.ip : '';
    this.participants[userId] = { name: callerName || userId, avatar: callerAvatar || null };
    if (window.CallModal) window.CallModal.addParticipant(userId, callerName || userId, callerAvatar || null);
    var pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    this.peerConnections[userId] = pc;
    if (this.localStream) {
      this.localStream.getTracks().forEach(function(track) {
        pc.addTrack(track, this.localStream);
      }.bind(this));
    }
    pc.ontrack = function(event) {
      var safeId = 'gvid-' + userId.replace(/[^a-zA-Z0-9]/g, '_');
      var vid = document.getElementById(safeId);
      if (vid) vid.srcObject = event.streams[0];
    }.bind(this);
    pc.onicecandidate = function(event) {
      if (event.candidate && window.orbitAPI) {
        window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_ICE_CANDIDATE, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          groupId: groupId
        });
      }
    }.bind(this);
    pc.onconnectionstatechange = function() {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (window.CallModal) window.CallModal.removeParticipant(userId);
        delete this.peerConnections[userId];
      }
    }.bind(this);
    var remoteDesc = new RTCSessionDescription({ type: 'offer', sdp: offerSdp });
    pc.setRemoteDescription(remoteDesc)
      .then(function() { return pc.createAnswer(); }.bind(this))
      .then(function(answer) { return pc.setLocalDescription(answer); }.bind(this))
      .then(function() {
        var answer = pc.localDescription;
        if (window.orbitAPI) {
          window.orbitAPI.networkSend(userId, peerIp, window.Protocol.Types.CALL_ANSWER, {
            sdp: answer.sdp, type: answer.type,
            answererId: window.store.getState().currentUser.userId,
            answererName: window.store.getState().currentUser.username
          });
        }
      }.bind(this))
      .catch(function(err) {
        console.error('Group connect error for ' + userId + ':', err);
        delete this.peerConnections[userId];
      }.bind(this));
  },

  addIceCandidate(candidateData) {
    if (!this.peerConnection) return;
    try {
      var candidate = new RTCIceCandidate(candidateData);
      this.peerConnection.addIceCandidate(candidate);
    } catch (err) {
      console.error('Add ICE candidate error:', err);
    }
  },

  addGroupIceCandidate(userId, candidateData) {
    var pc = this.peerConnections[userId];
    if (!pc) return;
    try {
      var candidate = new RTCIceCandidate(candidateData);
      pc.addIceCandidate(candidate);
    } catch (err) {
      console.error('Add group ICE candidate error:', err);
    }
  },

  _acceptIncoming() {
    if (this.incomingCallData) {
      if (this.incomingCallData.groupId) {
        this._answerGroupCall(this.incomingCallData, this.incomingCallData.groupId);
      } else {
        this.answerCall(this.incomingCallData);
      }
      this.incomingCallData = null;
    }
  },

  _declineIncomingGroup() {
    if (this.incomingCallData && window.orbitAPI) {
      window.orbitAPI.networkSend(this.incomingCallData.callerId, this.targetPeerIp, window.Protocol.Types.CALL_DECLINE, { groupId: this.incomingCallData.groupId });
    }
    this.incomingCallData = null;
    if (window.CallModal) window.CallModal.hide();
    this.cleanup();
  },

  _declineCall() {
    if (this.incomingCallData && this.incomingCallData.groupId) {
      this._declineIncomingGroup();
      return;
    }
    this._endReason = 'declined';
    if (window.orbitAPI && this.targetUserId) {
      window.orbitAPI.networkSend(this.targetUserId, this.targetPeerIp, window.Protocol.Types.CALL_DECLINE, {});
    }
    if (window.CallModal) window.CallModal.updateStatus('Declined');
    setTimeout(function() {
      if (window.CallModal) window.CallModal.hide();
      this.cleanup();
    }.bind(this), 1000);
  },

  endCall() {
    if (this.activeCall && this.activeCall.isGroup) {
      Object.keys(this.peerConnections).forEach(function(uid) {
        if (window.orbitAPI) {
          window.orbitAPI.networkSend(uid, '', window.Protocol.Types.CALL_END, { userId: window.store.getState().currentUser.userId, groupId: this.groupCallId });
        }
      }.bind(this));
    } else if (window.orbitAPI && this.targetUserId) {
      window.orbitAPI.networkSend(this.targetUserId, this.targetPeerIp, window.Protocol.Types.CALL_END, {});
    }
    this.cleanup();
  },

  _removeGroupParticipant(userId) {
    if (window.CallModal) window.CallModal.removeParticipant(userId);
    var pc = this.peerConnections[userId];
    if (pc) {
      try { pc.close(); } catch(e) {}
      delete this.peerConnections[userId];
    }
    delete this.participants[userId];
    if (Object.keys(this.peerConnections).length === 0) {
      if (window.Toast) window.Toast.show('Call Ended', 'All participants left.', 'info');
      this.cleanup();
    }
  },

  cleanup() {
    // Must run FIRST — everything below clears the duration and metadata it needs.
    this._logCall();
    this.activeCall = null;
    this.targetUserId = null;
    this.targetPeerIp = null;
    this.incomingCallData = null;
    this.remoteStream = null;
    this.groupCallId = null;
    this.participants = {};
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch(e) {}
      this.peerConnection = null;
    }
    Object.keys(this.peerConnections).forEach(function(uid) {
      try { this.peerConnections[uid].close(); } catch(e) {}
    }.bind(this));
    this.peerConnections = {};
    if (this._ringTimer) { clearTimeout(this._ringTimer); this._ringTimer = null; }
    if (this.localStream) {
      this.localStream.getTracks().forEach(function(t) { t.stop(); });
      this.localStream = null;
    }
    this._connected = false;
    this._endReason = null;
    if (window.CallModal) window.CallModal.hide();
  },

  /**
   * Append a call-log entry to the chat. Runs once per call, on whichever side is
   * tearing down, so each side keeps its own record.
   */
  _logCall() {
    if (this._logged) return;
    var call = this.activeCall || this.incomingCallData;
    var peerId = this.targetUserId;
    if (!call || !peerId) return;
    this._logged = true;

    // CallModal.seconds is the connected-time counter, so it is 0 when the call
    // never connected.
    var durationSec = Math.floor((window.CallModal && window.CallModal.seconds) || 0);
    var direction = this.activeCall
      ? (this.activeCall.direction || 'outgoing')
      : 'incoming';

    var outcome;
    if (this._connected) outcome = 'ended';
    else if (this._endReason) outcome = this._endReason;
    else outcome = (direction === 'incoming') ? 'missed' : 'no-answer';

    var kind = (this.activeCall && this.activeCall.isVideo) ||
               (this.incomingCallData && this.incomingCallData.isVideo) ? 'video' : 'voice';

    if (window.OrbitCallLog) {
      window.OrbitCallLog.add({
        peerId: peerId,
        kind: kind,
        outcome: outcome,
        durationSec: outcome === 'ended' ? durationSec : 0,
        direction: direction
      });
    }
  }
};

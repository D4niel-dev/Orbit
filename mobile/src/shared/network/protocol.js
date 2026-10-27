// shared/network/protocol.js
// Packet protocol definitions — unified between desktop and mobile

window.Orbit = window.Orbit || {};

Orbit.Protocol = {
  Types: {
    // Core messaging
    MESSAGE: 'MESSAGE',
    TYPING: 'TYPING',
    REACTION: 'REACTION',
    MESSAGE_EDIT: 'MESSAGE_EDIT',
    MESSAGE_DELETE: 'MESSAGE_DELETE',
    READ: 'READ',
    READ_RECEIPT: 'READ_RECEIPT',
    EDIT_MESSAGE: 'EDIT_MESSAGE',
    SYSTEM: 'SYSTEM',

    // ── Trust & reputation (v1.0.0, Part 2 pillar 1) ──────────────────────
    // ⚠ IDENTITY_KEY carries the sender's ECDSA **signing** public key. It is NOT
    // the E2EE key: that one is ECDH and cannot produce a signature. Without this
    // packet a REPUTATION_ALERT cannot be verified, and the web of trust would be
    // unverifiable hearsay.
    IDENTITY_KEY: 'IDENTITY_KEY',
    REPUTATION_ALERT: 'REPUTATION_ALERT',

    // ── Hybrid transport: WebRTC signalling (v1.0.0, Part 1) ──────────────
    // ⚠ These carry SDP and ICE candidates, never message content. The DataChannel they
    // establish carries the same E2EE ciphertext the TCP path does — the app-level
    // encryption sits ABOVE the transport, so switching transports must not change what
    // a message looks like on the wire.
    WEBRTC_OFFER: 'WEBRTC_OFFER',
    WEBRTC_ANSWER: 'WEBRTC_ANSWER',
    WEBRTC_CANDIDATE: 'WEBRTC_CANDIDATE',

    // Discovery & presence
    BEACON: 'BEACON',
    DISCOVERY: 'DISCOVERY',
    DISCOVERY_RESPONSE: 'DISCOVERY_RESPONSE',
    ONLINE: 'ONLINE',
    OFFLINE: 'OFFLINE',
    PING: 'PING',
    PONG: 'PONG',
    FIND: 'FIND',
    REQUEST: 'REQUEST',
    ACCEPT: 'ACCEPT',

    // File transfer (desktop chunk-based)
    FILE_TRANSFER_START: 'FILE_TRANSFER_START',
    FILE_CHUNK: 'FILE_CHUNK',
    FILE_TRANSFER_END: 'FILE_TRANSFER_END',
    // FILE_TRANSFER_RESUME payload contract (receiver → sender):
    //   { fileId, receivedCount, hash }
    //   - receivedCount: number of contiguous 64KB chunks the receiver has
    //     already stored (== the next expected chunkIndex)
    //   - hash: SHA-256 (hex) of the partial file as received, i.e. of the
    //     first receivedCount chunks. The sender compares it against a hash
    //     of its own file's prefix to confirm the partial belongs to the same
    //     file before re-sending chunks from receivedCount..totalChunks-1.
    FILE_TRANSFER_RESUME: 'FILE_TRANSFER_RESUME',
    // File transfer (mobile offer-based)
    FILE_TRANSFER_OFFER: 'FILE_TRANSFER_OFFER',
    FILE_TRANSFER_ACCEPT: 'FILE_TRANSFER_ACCEPT',
    FILE_TRANSFER_PROGRESS: 'FILE_TRANSFER_PROGRESS',
    FILE_TRANSFER_COMPLETE: 'FILE_TRANSFER_COMPLETE',
    // Shared file transfer types
    FILE_TRANSFER_CANCEL: 'FILE_TRANSFER_CANCEL',
    FILE_TRANSFER_REJECT: 'FILE_TRANSFER_REJECT',

    // Groups
    GROUP_CREATE: 'GROUP_CREATE',
    GROUP_INVITE: 'GROUP_INVITE',
    GROUP_JOIN: 'GROUP_JOIN',
    GROUP_JOIN_REQUEST: 'GROUP_JOIN_REQUEST',
    GROUP_JOIN_RESPONSE: 'GROUP_JOIN_RESPONSE',
    GROUP_JOIN_ACCEPT: 'GROUP_JOIN_ACCEPT',
    GROUP_JOIN_DENY: 'GROUP_JOIN_DENY',
    GROUP_LEAVE: 'GROUP_LEAVE',
    // Carries a whitelisted slice of settings between a user's OWN devices. See
    // shared/network/settings-sync.js for what travels and how an incoming payload is
    // validated — the receive side must never trust the sender.
    SETTINGS_SYNC: 'SETTINGS_SYNC',
    GROUP_MEMBER_ADDED: 'GROUP_MEMBER_ADDED',
    GROUP_OWNER_TRANSFER: 'GROUP_OWNER_TRANSFER',
    PIN_MESSAGE: 'PIN_MESSAGE',
    UNPIN_MESSAGE: 'UNPIN_MESSAGE',

    // WebRTC calls
    CALL_OFFER: 'CALL_OFFER',
    CALL_ANSWER: 'CALL_ANSWER',
    CALL_ICE_CANDIDATE: 'CALL_ICE_CANDIDATE',
    CALL_END: 'CALL_END',
    CALL_DECLINE: 'CALL_DECLINE',

    // E2EE
    E2EE_KEY_EXCHANGE: 'E2EE_KEY_EXCHANGE',

    // ── Account transfer ──
    // Carries a whole account from a desktop to a phone over the direct
    // connection QR pairing already opens. The phone learns the link token by
    // SCANNING it off the desktop's screen, which is what authorises the pull —
    // any other device on the LAN does not have it.
    //   REQUEST  phone   → desktop  { token, deviceName }
    //   OFFER    desktop → phone    { transferId, salt, iterations, manifest }
    //   CHUNK    desktop → phone    { transferId, seq, total, data }
    //   DONE     desktop → phone    { transferId }
    //   RESULT   phone   → desktop  { transferId, ok, error }
    TRANSFER_REQUEST: 'TRANSFER_REQUEST',
    TRANSFER_OFFER: 'TRANSFER_OFFER',
    TRANSFER_CHUNK: 'TRANSFER_CHUNK',
    TRANSFER_DONE: 'TRANSFER_DONE',
    TRANSFER_RESULT: 'TRANSFER_RESULT'
  },

  createPacket(type, fromId, toId, payload) {
    return JSON.stringify({
      packetId: null,
      type: type,
      from: fromId || '',
      senderId: fromId || '',
      to: toId,
      timestamp: new Date().toISOString(),
      payload: payload || {}
    });
  },

  parsePacket(data) {
    try {
      return JSON.parse(data);
    } catch(e) {
      return null;
    }
  }
};

const net = require('net');
const Protocol = require('./protocol');
const EventEmitter = require('events');
const dlog = require('../log');

const MAX_PAYLOAD_SIZE = 4194304; // 4 MB — prevent oversized frames

class SocketManager extends EventEmitter {
  constructor(identityProvider) {
    super();
    this.TCP_PORT = 46000;
    this.server = null;
    this.identityProvider = identityProvider;

    // Map of peerId -> net.Socket
    this.connections = new Map();

    // Per-socket write queues to prevent interleaving on shared sockets
    this._writeQueues = new Map();
    this._writing = new Set();

    // Pending connections and message queues for fire-and-forget sends
    this._pendingConnects = new Map();
    this._pendingMessages = new Map();

    // Heartbeat intervals (PING/PONG)
    this._heartbeatIntervals = new Map();
    this._lastDataTime = new Map();
    this._pongPending = new Map();
    // Round-trip times: peerId -> ms (updated on each PONG). Exposed for the
    // network-map visualizer via window.SocketManager._rtts.
    this._rtts = new Map();
    // When each PING was sent (peerId -> ms) so PONG can derive RTT
    this._pingSentAt = new Map();
    // Adaptive heartbeat: tracks consecutive missed PONGs per peer
    // Higher count → network degraded → more tolerant thresholds
    this._heartbeatQuality = new Map();
    this._reconnectTimers = new Map();
    this._reconnectAttempts = new Map();
    this._reconnectEnabled = true;
    this._reconnectInterval = 10000;
    this._peerIps = new Map();
    this._peerPorts = new Map();
    this._shuttingDown = false;
  }

  setReconnect(enabled, intervalMs) {
    this._reconnectEnabled = enabled;
    if (intervalMs) this._reconnectInterval = intervalMs;
  }

  _startHeartbeat(peerId, socket) {
    this._lastDataTime.set(peerId, Date.now());
    if (this._heartbeatIntervals.has(peerId)) {
      clearInterval(this._heartbeatIntervals.get(peerId));
    }

    // Each peer gets its own adaptive heartbeat quality tracker
    if (!this._heartbeatQuality.has(peerId)) {
      this._heartbeatQuality.set(peerId, { missedPongs: 0, consecutiveSuccess: 0 });
    }

    // Adaptive idle threshold based on network quality
    // Healthy (0 missed): 30s → Aggressive, catches dead connections fast
    // Degraded (1 missed): 45s → More tolerant, gives peer more time
    // Unstable (2 missed): 60s → Even more tolerant
    // Bad (3+ missed): 120s → Very tolerant, avoids false drops on flaky networks
    var idleThreshold = 30000 + Math.min(90000, (this._heartbeatQuality.get(peerId).missedPongs || 0) * 15000);

    // Adaptive check interval: slower checks on degraded networks reduces overhead
    var checkInterval = Math.min(30000, 15000 + (this._heartbeatQuality.get(peerId).missedPongs || 0) * 5000);

    var interval = setInterval(() => {
      if (socket.destroyed) {
        this._stopHeartbeat(peerId);
        return;
      }
      var lastData = this._lastDataTime.get(peerId) || 0;
      var idle = Date.now() - lastData;
      if (idle > idleThreshold) {
        if (this._pongPending.get(peerId)) {
          // PONG was expected but didn't arrive — network may be degraded
          var quality = this._heartbeatQuality.get(peerId);
          if (quality) {
            quality.missedPongs = Math.min(10, (quality.missedPongs || 0) + 1);
            quality.consecutiveSuccess = 0;
          }
          dlog('[P2P] No PONG from', peerId, '— missed total:', (quality ? quality.missedPongs : 0));
          // Don't close immediately — send another PING and be more tolerant
          this._pongPending.set(peerId, false);
          var pingPacket = Protocol.createPacket(Protocol.Types.PING, 'system', peerId, { ts: Date.now() });
          this._pingSentAt.set(peerId, Date.now());
          try { this._enqueueWrite(socket, Protocol.serialize(pingPacket)); } catch(e) {}
          this._lastDataTime.set(peerId, Date.now());
          return;
        }
        this._pongPending.set(peerId, true);
        var pingPacket = Protocol.createPacket(Protocol.Types.PING, 'system', peerId, { ts: Date.now() });
        this._pingSentAt.set(peerId, Date.now());
        try { this._enqueueWrite(socket, Protocol.serialize(pingPacket)); } catch(e) {}
      }
    }, checkInterval);
    this._heartbeatIntervals.set(peerId, interval);
  }

  _stopHeartbeat(peerId) {
    if (this._heartbeatIntervals.has(peerId)) {
      clearInterval(this._heartbeatIntervals.get(peerId));
      this._heartbeatIntervals.delete(peerId);
    }
    this._lastDataTime.delete(peerId);
    this._pongPending.delete(peerId);
    this._pingSentAt.delete(peerId);
    this._rtts.delete(peerId);
    this._heartbeatQuality.delete(peerId);
  }

  _scheduleReconnect(peerId, ip, port) {
    if (!this._reconnectEnabled) return;
    var attempts = this._reconnectAttempts.get(peerId) || 0;
    if (attempts >= 5) {
      dlog('[P2P] Max reconnect attempts reached for', peerId);
      this._reconnectAttempts.delete(peerId);
      return;
    }
    // Check peer didn't reconnect via another path while we waited
    var reconnected = this.connections.get(peerId);
    if (reconnected && !reconnected.destroyed) {
      dlog('[P2P] Peer already reconnected, cancel scheduled reconnect');
      this._reconnectAttempts.delete(peerId);
      this._reconnectTimers.delete(peerId);
      return;
    }
    // Cancel any existing reconnect timer to prevent duplicates
    this._cancelReconnect(peerId);
    
    // Exponential backoff: baseDelay * 2^attempts, capped at 60s
    // attempt 0: 10s, attempt 1: 20s, attempt 2: 40s, attempt 3+: 60s
    var delay = Math.min(60000, this._reconnectInterval * Math.pow(2, attempts));
    dlog('[P2P] Reconnect to', peerId, 'in', delay, 'ms (attempt', attempts + 1, ') - exponential backoff');
    var timer = setTimeout(() => {
      this._reconnectTimers.delete(peerId);
      // Double-check connection didn't establish while we waited
      var reconnected2 = this.connections.get(peerId);
      if (reconnected2 && !reconnected2.destroyed) {
        dlog('[P2P] Peer reconnected before scheduled retry, cancel');
        this._reconnectAttempts.delete(peerId);
        return;
      }
      // Use the IP/port passed in (mobile bridge updates)
      if (ip) {
        dlog('[P2P] Using updated IP from mobile bridge:', ip + ':' + (port || 46000));
        this._peerIps.set(peerId, ip);
        this._peerPorts.set(peerId, port || 46000);
      }
      var savedIp = ip || this._peerIps.get(peerId);
      var savedPort = port || this._peerPorts.get(peerId) || 46000;
      if (savedIp) {
        this.connectToPeer(peerId, savedIp, savedPort).catch(function(err) {
          console.error('[Reconnect] Connection to', peerId, 'failed:', err && err.message);
        });
      }
    }, delay);
    this._reconnectTimers.set(peerId, timer);
    this._reconnectAttempts.set(peerId, attempts + 1);
  }

  _cancelReconnect(peerId) {
    if (this._reconnectTimers.has(peerId)) {
      clearTimeout(this._reconnectTimers.get(peerId));
      this._reconnectTimers.delete(peerId);
    }
    this._reconnectAttempts.delete(peerId);
  }

  // Serialize writes to a socket so concurrent sendMessage/Broadcast calls
  // never interleave bytes on the length-prefixed TCP stream.
  _enqueueWrite(socket, buffer) {
    const key = (socket.remoteAddress && socket.remotePort) ? socket.remoteAddress + ':' + socket.remotePort : socket.__orbitKey;
    if (!this._writeQueues.has(key)) {
      this._writeQueues.set(key, []);
    }
    this._writeQueues.get(key).push(buffer);
    this._processQueue(socket, key);
  }

  _processQueue(socket, key) {
    if (this._writing.has(key)) return;
    const queue = this._writeQueues.get(key);
    if (!queue || queue.length === 0) return;

    this._writing.add(key);
    const buffer = queue.shift();

    if (socket && !socket.destroyed) {
      socket.write(buffer, () => {
        this._writing.delete(key);
        this._processQueue(socket, key);
      });
    } else {
      this._writing.delete(key);
      this._writeQueues.delete(key);
    }
  }

  startServer() {
    this.server = net.createServer((socket) => {
      dlog('New incoming TCP connection from', socket.remoteAddress);
      this.setupSocket(socket, null);

      // Send identity beacon over TCP so peer can discover us
      this.sendBeacon(socket);
    });

    this.server.on('error', (err) => {
      console.error('TCP Server error:', err);
    });

    this.server.listen(this.TCP_PORT, () => {
      dlog(`TCP Server listening on port ${this.TCP_PORT}`);
    });
  }

  sendBeacon(socket) {
    const identity = this.identityProvider();
    if (!identity || !identity.userId) return;
    const beaconData = {
      userId: identity.userId,
      username: identity.username,
      usertag: identity.usertag,
      avatarHash: identity.avatar ? 'has_avatar' : null,
      avatar: identity.avatar || null,
      status: identity.status || 'online',
      bio: identity.bio || '',
      banner: identity.banner || null,
      publicKey: identity.publicKey || null,
      profileFrame: identity.profileFrame || null,
      tcpPort: this.TCP_PORT || 46000,
      device: 'desktop'
    };
    
    // Validate tcpPort is a valid number
    if (typeof identity.tcpPort === 'number' && identity.tcpPort > 0) {
      beaconData.tcpPort = identity.tcpPort;
    }
    
    const packet = Protocol.createPacket(Protocol.Types.BEACON, identity.userId, 'ALL', beaconData);
    const serialized = Protocol.serialize(packet);
    try {
      if (socket && !socket.destroyed) this._enqueueWrite(socket, serialized);
    } catch (e) {
      // Ignore write errors on beacon
    }
  }

  connectToPeer(peerId, ip, port = 46000) {
    if (this._shuttingDown) { return Promise.reject(new Error('Shutting down')); }
    const existing = this.connections.get(peerId);
    if (existing && !existing.destroyed) {
      // If IP changed, the old connection is likely dead (half-open).
      // Destroy it and proceed with a fresh connection.
      var oldIp = existing.remoteAddress;
      if (oldIp && ip && oldIp !== ip) {
        dlog('[P2P] IP changed for', peerId, '(' + oldIp, '->', ip + '), reconnecting');
        existing.destroy();
        this.connections.delete(peerId);
      } else {
        return Promise.resolve(existing);
      }
    }

    // Reuse in-progress connection promise to avoid duplicates
    if (this._pendingConnects.has(peerId)) {
      return this._pendingConnects.get(peerId);
    }

    // Save IP and port for reconnect
    if (ip) this._peerIps.set(peerId, ip);
    this._peerPorts.set(peerId, port || 46000);

    const promise = new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.__orbitKey = peerId;

      // Connection timeout — fail fast
      socket.setTimeout(8000);

      socket.on('timeout', () => {
        this._pendingConnects.delete(peerId);
        socket.destroy(new Error('Connection timeout'));
        reject(new Error('Connection timeout to ' + ip));
      });

      socket.connect(port, ip, () => {
        dlog(`Connected to peer ${peerId} at ${ip}:${port}`);
        this.connections.set(peerId, socket);
        this.setupSocket(socket, peerId);
        this._pendingConnects.delete(peerId);
        socket.setTimeout(0); // Disable idle timeout — heartbeat manages connection health

        // Send identity beacon over TCP so peer can discover us
        this.sendBeacon(socket);

        // Flush any messages queued while connecting
        this._flushPending(peerId, socket);
        // Reconnect hook: lets the transfer layer ask peers to resume partials
        this.emit('peer-connected', peerId);
        resolve(socket);
      });

      socket.on('error', (err) => {
        console.error(`Connection error to ${ip}:`, err.message);
        this.connections.delete(peerId);
        this._pendingConnects.delete(peerId);
        reject(err);
      });
    });

    this._pendingConnects.set(peerId, promise);
    return promise;
  }

  _flushPending(peerId, socket) {
    if (!this._pendingMessages.has(peerId)) return;
    const queue = this._pendingMessages.get(peerId);
    if (socket && !socket.destroyed) {
      queue.forEach((buffer) => {
        this._enqueueWrite(socket, buffer);
      });
    }
    this._pendingMessages.delete(peerId);
  }

  setupSocket(socket, knownPeerId) {
    let buffer = Buffer.alloc(0);
    let currentPeerId = knownPeerId;

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);

      // Basic framing loop
      while (buffer.length >= 4) {
        const payloadLength = buffer.readUInt32BE(0);

        if (payloadLength > 100 * 1024) {
          dlog('[RECV] frame size=' + (payloadLength / 1024).toFixed(1) + 'KB from=' + (currentPeerId || socket.remoteAddress));
        }

        // Guard against oversized frames (BUG-DT-2)
        if (payloadLength <= 0 || payloadLength > MAX_PAYLOAD_SIZE) {
          console.error(`Invalid payload length ${payloadLength}, closing connection`);
          socket.destroy();
          return;
        }

        if (buffer.length >= 4 + payloadLength) {
          const payloadBuffer = buffer.subarray(4, 4 + payloadLength);
          buffer = buffer.subarray(4 + payloadLength); // Consume

          try {
            const jsonStr = payloadBuffer.toString('utf8');
            const packet = JSON.parse(jsonStr);

            // If we didn't know the peerId (incoming conn), register it now
            var senderId = packet.from || packet.senderId;
            if ((!currentPeerId || currentPeerId === 'manual') && senderId) {
              if (currentPeerId) this.connections.delete(currentPeerId);
              currentPeerId = senderId;
              this.connections.set(currentPeerId, socket);
              // Track socket for write queue cleanup
              socket.__orbitKey = currentPeerId;
              // Send our BEACON so the connecting peer can identify us
              this.sendBeacon(socket);
              // Start heartbeat now that we know the peerId
              this._startHeartbeat(currentPeerId, socket);
              // Reconnect hook (inbound reconnects too)
              this.emit('peer-connected', currentPeerId);
            }

            // Store peer's TCP port from beacon for reconnect
            if (packet.payload && packet.payload.tcpPort && currentPeerId) {
              this._peerPorts.set(currentPeerId, packet.payload.tcpPort);
            }

            // Attach sender IP for BEACON IP fallback (Bug #1)
            packet._fromIp = socket.remoteAddress;

            // Track last data time for heartbeat
            if (currentPeerId) {
              this._lastDataTime.set(currentPeerId, Date.now());
              this._reconnectAttempts.delete(currentPeerId);
              this._pongPending.delete(currentPeerId);
              // Any data = connection alive → improve quality score
              var quality = this._heartbeatQuality.get(currentPeerId);
              if (quality && quality.missedPongs > 0) {
                quality.missedPongs = Math.max(0, quality.missedPongs - 1);
              }
            }

            // Handle PING/PONG
            if (packet.type === Protocol.Types.PING) {
              var pongPacket = Protocol.createPacket(Protocol.Types.PONG, 'system', currentPeerId || 'unknown', { ts: Date.now() });
              try { this._enqueueWrite(socket, Protocol.serialize(pongPacket)); } catch(e) {}
              continue;
            }
            if (packet.type === Protocol.Types.PONG) {
              if (currentPeerId) {
                this._pongPending.delete(currentPeerId);
                // RTT = now - when our PING went out; if no PING is in flight
                // (e.g. first PONG), fall back to the PONG's own send timestamp.
                var sentAt = this._pingSentAt.get(currentPeerId);
                var pongTs = packet.payload && typeof packet.payload.ts === 'number' ? packet.payload.ts : null;
                var rtt = Date.now() - (typeof sentAt === 'number' ? sentAt : (pongTs || Date.now()));
                this._rtts.set(currentPeerId, Math.max(0, rtt));
                // PONG received successfully — improve quality score
                var quality = this._heartbeatQuality.get(currentPeerId);
                if (quality) {
                  quality.missedPongs = 0;
                  quality.consecutiveSuccess = Math.min(10, (quality.consecutiveSuccess || 0) + 1);
                }
              }
              continue;
            }

            // Emit to main process which forwards to renderer
            this.emit('message', packet);
          } catch (err) {
            console.error('Failed to parse incoming packet:', err);
          }
        } else {
          break; // Wait for more data
        }
      }
    });

    socket.on('error', (err) => {
      console.error(`Socket error for peer ${currentPeerId || 'unknown'}:`, err.message);
      // close event will fire after error, handling cleanup
    });

    socket.on('close', () => {
      dlog(`Connection closed with peer ${currentPeerId || 'unknown'}`);
      var savedIp = currentPeerId ? this._peerIps.get(currentPeerId) : null;
      if (currentPeerId) {
        this.connections.delete(currentPeerId);
        // Write queue is keyed by IP:port (or __orbitKey fallback) — compute the same key for cleanup
        var writeKey = (socket.remoteAddress && socket.remotePort) ? socket.remoteAddress + ':' + socket.remotePort : socket.__orbitKey;
        this._writeQueues.delete(writeKey);
        this._stopHeartbeat(currentPeerId);
        this.emit('peer-disconnected', currentPeerId);
      }
      // Schedule reconnect if enabled
      if (currentPeerId && savedIp) {
        var savedPort = this._peerPorts.get(currentPeerId);
        this._scheduleReconnect(currentPeerId, savedIp, savedPort);
      }
    });

    // Start heartbeat after socket is established
    if (currentPeerId) {
      this._startHeartbeat(currentPeerId, socket);
    }
    // Also save remote address for reconnect
    if (socket.remoteAddress) {
      this._peerIps.set(currentPeerId || socket.remoteAddress, socket.remoteAddress);
    }
  }

  sendMessage(toPeerId, toIp, type, payload) {
    if (this._shuttingDown) return false;
    const identity = this.identityProvider();
    if (!identity || !identity.userId) return false;

    const packet = Protocol.createPacket(type, identity.userId, toPeerId, payload);
    const serialized = Protocol.serialize(packet);

    let socket = this.connections.get(toPeerId);
    if (!socket && toIp) {
      // Check if connection is already in progress
      if (this._pendingConnects.has(toPeerId)) {
        // Queue message for flush after connect completes
        if (!this._pendingMessages.has(toPeerId)) {
          this._pendingMessages.set(toPeerId, []);
        }
        this._pendingMessages.get(toPeerId).push(serialized);
        return true;
      }

      // Fire-and-forget connect — connection success/failure handled internally
      this.connectToPeer(toPeerId, toIp).then((s) => {
        this._enqueueWrite(s, serialized);
      }).catch(() => {
        console.error(`Cannot send message: Connection to ${toPeerId} failed.`);
      });
      return true; // optimistic
    }

    if (socket && !socket.destroyed) {
      this._enqueueWrite(socket, serialized);
      return true;
    } else {
      console.error(`Cannot send message: Peer ${toPeerId} not connected and no IP provided.`);
      return false;
    }
  }

  broadcastToGroup(members, type, payload, senderId) {
    const identity = this.identityProvider();
    if (!identity || !identity.userId) return 0;

    let sentCount = 0;
    members.forEach(m => {
      if (m.userId !== senderId && m.ip) {
        const packet = Protocol.createPacket(type, identity.userId, m.userId, { ...payload, chatId: m.groupId || payload.chatId });
        const serialized = Protocol.serialize(packet);
        let socket = this.connections.get(m.userId);
        if (!socket) {
          if (this._pendingConnects.has(m.userId)) {
            if (!this._pendingMessages.has(m.userId)) {
              this._pendingMessages.set(m.userId, []);
            }
            this._pendingMessages.get(m.userId).push(serialized);
            sentCount++;
            return;
          }
          // Fire-and-forget connect
          this.connectToPeer(m.userId, m.ip).then((s) => {
            this._enqueueWrite(s, serialized);
          }).catch(function(err) {
            console.error('[Broadcast] connect/send to', m.userId, 'failed:', (err && err.message) || err);
          });
          sentCount++;
        } else if (socket && !socket.destroyed) {
          this._enqueueWrite(socket, serialized);
          sentCount++;
        }
      }
    });
    return sentCount;
  }

  stop() {
    this._shuttingDown = true;
    if (this.server) {
      this.server.close();
    }
    for (const [id, socket] of this.connections.entries()) {
      socket.destroy();
    }
    this.connections.clear();
    this._writeQueues.clear();
    this._writing.clear();
    this._pendingConnects.clear();
    this._pendingMessages.clear();
    // Clean up heartbeats
    for (const [id] of this._heartbeatIntervals) {
      this._stopHeartbeat(id);
    }
    // Clean up reconnect timers
    for (const [id, timer] of this._reconnectTimers) {
      clearTimeout(timer);
    }
    this._reconnectTimers.clear();
    this._reconnectAttempts.clear();
    this._heartbeatQuality.clear();
    this._rtts.clear();
    this._pingSentAt.clear();
    this._peerIps.clear();
    this._peerPorts.clear();
  }
}

module.exports = SocketManager;

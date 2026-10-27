#!/usr/bin/env node
'use strict';

/**
 * Orbit signalling relay.
 *
 * ⚠⚠ WHAT THIS SERVER CAN AND CANNOT SEE, because it is the whole privacy argument for
 * using one. It carries SDP and ICE candidates between exactly two peers in a room, and
 * nothing else. It never sees a message, a file, a contact list or an identity — once the
 * DataChannel is up, both sides stop talking to it and the conversation is peer to peer.
 *
 * It DOES see connection metadata: which two IP addresses are pairing, when, and how much
 * signalling traffic passes. That is unavoidable for anything that introduces two peers,
 * and it is why the URL is configurable rather than hard-coded to somebody else's server.
 *
 * ⚠ NO PERSISTENCE, NO PAYLOAD LOGGING. Rooms live in memory and die with the process;
 * signalling payloads are forwarded and dropped. The only log lines are lifecycle events.
 *
 * Run:  node relay/server.js            (listens on 8787 by default)
 *       PORT=9000 node relay/server.js
 */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT, 10) || 8787;
const MAX_ROOM = 2;                    // a chat is a pair; a third joiner is refused
const MAX_PAYLOAD_BYTES = 64 * 1024;   // SDP with many candidates is a few KB

/** room -> Map(peerId -> ws) */
const rooms = new Map();

function roomOf(name) {
  if (!rooms.has(name)) rooms.set(name, new Map());
  return rooms.get(name);
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(msg)); } catch (e) { /* peer vanished mid-send */ }
  }
}

const server = http.createServer((req, res) => {
  // A health endpoint, so a deploy can tell "running" from "crash-looping".
  if (req.url === '/health') {
    let peers = 0;
    rooms.forEach((m) => { peers += m.size; });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, peers }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD_BYTES });

wss.on('connection', (ws) => {
  ws.room = null;
  ws.peerId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) {
      return send(ws, { t: 'error', message: 'bad json' });
    }
    if (!msg || typeof msg.t !== 'string') return send(ws, { t: 'error', message: 'no type' });

    if (msg.t === 'join') {
      const room = String(msg.room || '').slice(0, 128);
      const peer = String(msg.peer || '').slice(0, 128);
      if (!room || !peer) return send(ws, { t: 'error', message: 'room and peer are required' });

      const members = roomOf(room);
      if (members.size >= MAX_ROOM && !members.has(peer)) {
        return send(ws, { t: 'error', message: 'room is full' });
      }

      // A rejoin with the same peer id replaces the old socket — a client that
      // reconnected should not be locked out by its own ghost.
      const existing = members.get(peer);
      if (existing && existing !== ws) {
        try { existing.close(); } catch (e) {}
      }

      ws.room = room;
      ws.peerId = peer;
      members.set(peer, ws);

      send(ws, { t: 'joined', room, peer, peers: Array.from(members.keys()).filter((p) => p !== peer) });
      members.forEach((other, id) => { if (id !== peer) send(other, { t: 'peer-joined', peer }); });
      return;
    }

    if (msg.t === 'signal') {
      if (!ws.room || !ws.peerId) return send(ws, { t: 'error', message: 'join a room first' });
      const members = rooms.get(ws.room);
      if (!members) return send(ws, { t: 'error', message: 'no such room' });

      const target = msg.to ? members.get(String(msg.to)) : Array.from(members.values()).find((w) => w !== ws);
      if (!target) return send(ws, { t: 'error', message: 'peer not connected' });

      // ⚠ FORWARDED VERBATIM. The relay does not parse, inspect or store `payload` — it
      // could not read a message if it wanted to, because there are no messages here.
      send(target, { t: 'signal', from: ws.peerId, kind: msg.kind, payload: msg.payload });
      return;
    }

    if (msg.t === 'leave') { ws.close(); return; }

    send(ws, { t: 'error', message: 'unknown type' });
  });

  ws.on('close', () => {
    if (!ws.room) return;
    const members = rooms.get(ws.room);
    if (!members) return;
    if (members.get(ws.peerId) === ws) members.delete(ws.peerId);
    members.forEach((other) => send(other, { t: 'peer-left', peer: ws.peerId }));
    if (members.size === 0) rooms.delete(ws.room);
    console.log('[relay] left room=' + ws.room + ' peer=' + ws.peerId + ' remaining=' + members.size);
  });

  ws.on('error', () => { /* a dead socket is cleaned up by 'close' */ });
});

server.listen(PORT, () => {
  console.log('[relay] listening on :' + PORT + ' — signalling only, no message content');
});

// A relay that dies silently is worse than one that does not start: let the supervisor see it.
process.on('uncaughtException', (e) => { console.error('[relay] uncaught', e); process.exit(1); });

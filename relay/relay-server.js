#!/usr/bin/env node
// relay-server.js — WebSocket relay for Turns (2-player authoritative host model)

const http = require('http');
const { WebSocketServer } = require('ws');

const port = parseInt(process.argv[2] || '8765', 10);

// Map<code, { hostWs, guestWs, createdAt }>
const rooms = {};

function getRoom(code) {
  if (!rooms[code]) rooms[code] = { hostWs: null, guestWs: null, createdAt: Date.now() };
  return rooms[code];
}

function pruneRoom(code) {
  const r = rooms[code];
  if (r && !r.hostWs && !r.guestWs) delete rooms[code];
}

function sendTo(ws, obj) {
  if (ws && ws.readyState === 1) try { ws.send(JSON.stringify(obj)); } catch { /**/ }
}

function isAlive(ws) {
  return ws && ws.readyState === 1 && ws._alive !== false;
}

// ── HTTP health + discovery ────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (req.method === 'GET' && req.url === '/discover') {
    const waiting = Object.entries(rooms)
      .filter(([, r]) => r.hostWs && isAlive(r.hostWs) && !r.guestWs)
      .map(([code]) => ({ code }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: 'Turns Relay', rooms: waiting }));
    return;
  }
  res.writeHead(404); res.end();
});

// ── WebSocket relay ────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

const HEARTBEAT_MS = 30_000;
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws._alive === false) { ws.terminate(); return; }
    ws._alive = false;
    try { ws.ping(); } catch { /**/ }
  });
}, HEARTBEAT_MS);

wss.on('connection', ws => {
  ws._room  = null;
  ws._role  = null;
  ws._alive = true;

  ws.on('pong', () => { ws._alive = true; });

  ws.on('message', raw => {
    ws._alive = true;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── Role registration ──────────────────────────────────────────────────
    if (msg.type === 'role') {
      const code = (msg.room || '').toUpperCase().trim();
      if (!code) { sendTo(ws, { type: 'error', msg: 'No room code' }); return; }
      const room = getRoom(code);

      if (msg.role === 'host') {
        if (room.hostWs && isAlive(room.hostWs)) {
          sendTo(ws, { type: 'error', msg: 'Room already has a host' }); return;
        }
        room.hostWs = ws;
        ws._room = code; ws._role = 'host';
        sendTo(ws, { type: 'joined', role: 'host' });
        console.log(`[relay] host joined room=${code}`);

      } else if (msg.role === 'guest') {
        if (!room.hostWs || !isAlive(room.hostWs)) {
          sendTo(ws, { type: 'error', msg: 'No host in that room' }); return;
        }
        if (room.guestWs && isAlive(room.guestWs)) {
          sendTo(ws, { type: 'error', msg: 'Room is full' }); return;
        }
        room.guestWs = ws;
        ws._room = code; ws._role = 'guest';
        sendTo(ws, { type: 'joined', role: 'guest' });
        sendTo(room.hostWs, { type: 'guest_joined' });
        console.log(`[relay] guest joined room=${code}`);
      }
      return;
    }

    // ── Game traffic routing ───────────────────────────────────────────────
    if (!ws._room || !rooms[ws._room]) return;
    const room = rooms[ws._room];

    let obj;
    try { obj = JSON.parse(raw); } catch { return; }
    obj.from = ws._role;

    if (ws._role === 'host' && room.guestWs) {
      sendTo(room.guestWs, obj);
    } else if (ws._role === 'guest' && room.hostWs) {
      sendTo(room.hostWs, obj);
    }
  });

  ws.on('close', () => {
    const code = ws._room;
    if (!code || !rooms[code]) return;
    const room = rooms[code];

    if (ws._role === 'host') {
      console.log(`[relay] host left room=${code}`);
      room.hostWs = null;
      if (room.guestWs) sendTo(room.guestWs, { type: 'opponent_left' });
    } else if (ws._role === 'guest') {
      console.log(`[relay] guest left room=${code}`);
      room.guestWs = null;
      if (room.hostWs) sendTo(room.hostWs, { type: 'opponent_left' });
    }
    pruneRoom(code);
  });
});

httpServer.listen(port, () => {
  console.log(`[relay] Turns relay listening on port ${port}`);
});

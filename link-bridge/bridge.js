#!/usr/bin/env node
/**
 * Kick & Snare — Ableton Link Bridge v2.0
 *
 * Utilise Carabiner (binaire précompilé, gratuit) comme pont Link.
 * Aucune compilation C++/Python requise — juste Node.js + ws.
 *
 * SETUP:
 *   1. Télécharger Carabiner : https://github.com/Deep-Symmetry/carabiner/releases
 *      → Lancer Carabiner (double-clic ou terminal : ./carabiner)
 *
 *   2. npm install  (installe seulement "ws", pur JavaScript)
 *      node bridge.js
 *
 *   3. Dans Kick & Snare → [LINK] → ws://localhost:9898 → CONNECT
 */

const net = require('net');
const { WebSocketServer } = require('ws');
const { createServer } = require('http');

const CARABINER_PORT = 17000;
const WS_PORT       = process.env.PORT || 9898;

let carabinerSocket = null;
let state = { bpm: 120, playing: false, peers: 0 };

const server = createServer();
const wss    = new WebSocketServer({ server });

/* ── Carabiner helpers ─────────────────────────────── */

function toCarabiner(cmd) {
  if (carabinerSocket && !carabinerSocket.destroyed) {
    carabinerSocket.write(cmd + '\n');
  }
}

function parseCarabiner(line) {
  const bpm     = line.match(/:bpm ([0-9.]+)/);
  const peers   = line.match(/:peers ([0-9]+)/);
  const playing = line.match(/:playing (true|false)/);
  let changed = false;
  if (bpm)     { state.bpm     = Math.round(parseFloat(bpm[1]) * 10) / 10; changed = true; }
  if (peers)   { state.peers   = parseInt(peers[1]);                        changed = true; }
  if (playing) { state.playing = playing[1] === 'true';                     changed = true; }
  if (changed) broadcast({ type: 'state', ...state });
}

function connectCarabiner() {
  const sock = net.createConnection(CARABINER_PORT, '127.0.0.1');

  sock.on('connect', () => {
    console.log('[Bridge] Carabiner connecté sur port', CARABINER_PORT);
    carabinerSocket = sock;
    toCarabiner('(carabiner-state)');
    toCarabiner('(enable-start-stop-sync)');
  });

  let buf = '';
  sock.on('data', d => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    lines.forEach(l => l.trim() && parseCarabiner(l));
  });

  sock.on('close', () => {
    carabinerSocket = null;
    console.log('[Bridge] Carabiner déconnecté — nouvelle tentative dans 3s...');
    setTimeout(connectCarabiner, 3000);
  });

  sock.on('error', err => {
    carabinerSocket = null;
    if (err.code === 'ECONNREFUSED') {
      console.log('[Bridge] ⚠  Carabiner introuvable sur le port 17000.');
      console.log('           → Lance Carabiner d\'abord, puis relance ce script.');
    }
    setTimeout(connectCarabiner, 3000);
  });
}

/* ── WebSocket server ──────────────────────────────── */

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}

wss.on('connection', (ws, req) => {
  console.log('[Bridge] Navigateur connecté :', req.socket.remoteAddress);
  ws.send(JSON.stringify({ type: 'state', ...state }));

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'setBpm')     toCarabiner(`(bpm ${Number(msg.bpm).toFixed(2)})`);
      if (msg.type === 'setPlaying') toCarabiner(msg.playing ? '(start-playing)' : '(stop-playing)');
    } catch {}
  });

  ws.on('close', () => console.log('[Bridge] Navigateur déconnecté'));
});

/* ── Start ─────────────────────────────────────────── */

server.listen(WS_PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  Kick & Snare — Link Bridge  v2.0       ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  WebSocket : ws://localhost:${WS_PORT}        ║`);
  console.log(`║  Carabiner : localhost:${CARABINER_PORT}           ║`);
  console.log('╚══════════════════════════════════════════╝\n');
  console.log('Connexion à Carabiner...');
  connectCarabiner();
});

process.on('SIGINT', () => {
  console.log('\n[Bridge] Arrêt.');
  if (carabinerSocket) carabinerSocket.destroy();
  process.exit(0);
});

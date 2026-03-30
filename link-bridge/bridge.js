#!/usr/bin/env node
/**
 * Kick & Snare — Link Bridge v2.1
 * ZERO DÉPENDANCE — Node.js uniquement, aucun "npm install".
 *
 * SETUP :
 *   1. Installe Node.js  →  https://nodejs.org  (bouton "LTS")
 *   2. Lance Carabiner   →  https://github.com/Deep-Symmetry/carabiner/releases
 *   3. node bridge.js
 *   4. Dans Kick & Snare : [LINK] → CONNECT
 */
'use strict';

const crypto = require('crypto');
const http   = require('http');
const net    = require('net');

const WS_PORT        = 9898;
const CARABINER_PORT = 17000;

/* ═══ WebSocket — implémentation pure Node.js ═══════════ */

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsHandshake(req, socket) {
  const key    = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
}

function wsFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const n = payload.length;
  let hdr;
  if (n < 126)        { hdr = Buffer.from([0x81, n]); }
  else if (n < 65536) { hdr = Buffer.alloc(4); hdr[0]=0x81; hdr[1]=126; hdr.writeUInt16BE(n,2); }
  else                { hdr = Buffer.alloc(10); hdr[0]=0x81; hdr[1]=127; hdr.writeBigUInt64BE(BigInt(n),2); }
  return Buffer.concat([hdr, payload]);
}

// Retourne le reste du buffer non consommé, ou null si close frame reçu.
function wsParse(buf, onText, onClose) {
  let i = 0;
  while (i < buf.length) {
    const start  = i;
    if (i + 2 > buf.length) { i = start; break; }

    const opcode = buf[i] & 0x0f;
    const masked  = (buf[i + 1] & 0x80) !== 0;
    let plen      = buf[i + 1] & 0x7f;
    i += 2;

    if (plen === 126) {
      if (i + 2 > buf.length) { i = start; break; }
      plen = buf.readUInt16BE(i); i += 2;
    } else if (plen === 127) {
      if (i + 8 > buf.length) { i = start; break; }
      plen = Number(buf.readBigUInt64BE(i)); i += 8;
    }

    const maskStart = i;
    if (masked) {
      if (i + 4 > buf.length) { i = start; break; }
      i += 4;
    }
    if (i + plen > buf.length) { i = start; break; }

    const payload = Buffer.from(buf.slice(i, i + plen));
    if (masked) {
      const mk = buf.slice(maskStart, maskStart + 4);
      for (let k = 0; k < payload.length; k++) payload[k] ^= mk[k % 4];
    }
    i += plen;

    if (opcode === 0x8) { onClose(); return null; }
    if (opcode === 0x1) onText(payload.toString('utf8'));
  }
  return buf.slice(i);
}

/* ═══ État partagé ═══════════════════════════════════════ */

let state      = { bpm: 120, playing: false, peers: 0 };
let caraSocket = null;
const clients  = new Set();

function broadcast(obj) {
  const frame = wsFrame(JSON.stringify(obj));
  for (const s of clients) { try { s.write(frame); } catch {} }
}

/* ═══ Carabiner (Ableton Link) ═══════════════════════════ */

function toCarabiner(cmd) {
  if (caraSocket && !caraSocket.destroyed) caraSocket.write(cmd + '\n');
}

function parseCarabiner(line) {
  const mBpm  = line.match(/:bpm ([0-9.]+)/);
  const mPeer = line.match(/:peers ([0-9]+)/);
  const mPlay = line.match(/:playing (true|false)/);
  let changed = false;
  if (mBpm)  { state.bpm     = Math.round(parseFloat(mBpm[1]) * 10) / 10;  changed = true; }
  if (mPeer) { state.peers   = parseInt(mPeer[1]);                           changed = true; }
  if (mPlay) { state.playing = mPlay[1] === 'true';                          changed = true; }
  if (changed) broadcast({ type: 'state', ...state });
}

function connectCarabiner() {
  const sock = net.createConnection(CARABINER_PORT, '127.0.0.1');

  sock.on('connect', () => {
    console.log('[Bridge] ✓ Carabiner connecté sur port ' + CARABINER_PORT);
    caraSocket = sock;
    toCarabiner('(carabiner-state)');
    toCarabiner('(enable-start-stop-sync)');
  });

  let cbuf = '';
  sock.on('data', d => {
    cbuf += d.toString();
    const lines = cbuf.split('\n');
    cbuf = lines.pop();
    lines.forEach(l => l.trim() && parseCarabiner(l));
  });

  sock.on('close', () => {
    caraSocket = null;
    console.log('[Bridge] Carabiner déconnecté — nouvelle tentative dans 3s…');
    setTimeout(connectCarabiner, 3000);
  });

  sock.on('error', err => {
    caraSocket = null;
    if (err.code === 'ECONNREFUSED')
      console.log('[Bridge] ⚠  Carabiner introuvable sur le port 17000\n         → Lance Carabiner avant ce script.');
    setTimeout(connectCarabiner, 3000);
  });
}

/* ═══ Serveur HTTP + WebSocket ═══════════════════════════ */

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Kick & Snare Link Bridge v2.1\n');
});

server.on('upgrade', (req, socket) => {
  if ((req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.destroy(); return;
  }
  wsHandshake(req, socket);
  clients.add(socket);
  console.log('[Bridge] Navigateur connecté');
  socket.write(wsFrame(JSON.stringify({ type: 'state', ...state })));

  let rbuf = Buffer.alloc(0);
  socket.on('data', chunk => {
    rbuf = Buffer.concat([rbuf, chunk]);
    const rest = wsParse(
      rbuf,
      text => {
        try {
          const msg = JSON.parse(text);
          if (msg.type === 'setBpm')     toCarabiner(`(bpm ${Number(msg.bpm).toFixed(2)})`);
          if (msg.type === 'setPlaying') toCarabiner(msg.playing ? '(start-playing)' : '(stop-playing)');
        } catch {}
      },
      () => { clients.delete(socket); socket.destroy(); }
    );
    if (rest !== null) rbuf = rest;
  });
  socket.on('close', () => { clients.delete(socket); console.log('[Bridge] Navigateur déconnecté'); });
  socket.on('error', ()  => clients.delete(socket));
});

server.listen(WS_PORT, () => {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   Kick & Snare — Link Bridge  v2.1        ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║   WebSocket : ws://localhost:${WS_PORT}          ║`);
  console.log(`║   Carabiner : localhost:${CARABINER_PORT}              ║`);
  console.log('╚════════════════════════════════════════════╝\n');
  connectCarabiner();
});

process.on('SIGINT', () => { console.log('\n[Bridge] Arrêt.'); process.exit(0); });

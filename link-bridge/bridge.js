#!/usr/bin/env node
/**
 * Kick & Snare — Link Bridge v2.2 (auto-detect Carabiner API)
 * ZERO DÉPENDANCE — Node.js uniquement.
 */
'use strict';

const crypto = require('crypto');
const http   = require('http');
const net    = require('net');

const WS_PORT        = 9898;
const CARABINER_PORT = 17000;

/* ═══ WebSocket helpers ══════════════════════════════════ */
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function wsHandshake(req, socket) {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + WS_MAGIC).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
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
function wsParse(buf, onText, onClose) {
  let i = 0;
  while (i < buf.length) {
    const start = i;
    if (i + 2 > buf.length) { i = start; break; }
    const opcode = buf[i] & 0x0f;
    const masked  = (buf[i+1] & 0x80) !== 0;
    let plen      = buf[i+1] & 0x7f;
    i += 2;
    if (plen === 126) { if (i+2>buf.length){i=start;break;} plen=buf.readUInt16BE(i);i+=2; }
    else if (plen === 127) { if (i+8>buf.length){i=start;break;} plen=Number(buf.readBigUInt64BE(i));i+=8; }
    const maskStart = i;
    if (masked) { if (i+4>buf.length){i=start;break;} i+=4; }
    if (i+plen>buf.length){i=start;break;}
    const payload = Buffer.from(buf.slice(i, i+plen));
    if (masked) { const mk=buf.slice(maskStart,maskStart+4); for(let k=0;k<payload.length;k++) payload[k]^=mk[k%4]; }
    i += plen;
    if (opcode===0x8){onClose();return null;}
    if (opcode===0x1) onText(payload.toString('utf8'));
  }
  return buf.slice(i);
}

/* ═══ State ══════════════════════════════════════════════ */
let state       = { bpm: 120, playing: false, peers: 0 };
let caraSocket  = null;
let bpmCmdFmt   = null;
let pendingProbe = {};
const clients   = new Set();

function broadcast(obj) {
  const frame = wsFrame(JSON.stringify(obj));
  for (const s of clients) { try { s.write(frame); } catch {} }
}

/* ═══ Carabiner ══════════════════════════════════════════ */
function toCarabiner(cmd) {
  if (caraSocket && !caraSocket.destroyed) {
    console.log('[→ Carabiner]', cmd);
    caraSocket.write(cmd + '\n');
  }
}

// Send BPM using whichever format was auto-detected
function sendBpm(bpm) {
  const b2 = Number(bpm).toFixed(2);
  const b4 = Number(bpm).toFixed(4);
  switch (bpmCmdFmt) {
    case 'old':   toCarabiner(`bpm ${b2}`); break;              // Carabiner 1.x (no parens)
    case 'new':   toCarabiner(`(bpm ${b2})`); break;            // Carabiner 2.x
    case 'tempo': toCarabiner(`(tempo {:bpm ${b4}})`); break;   // Carabiner 2.x alt
    default:
      // Still detecting — try most likely formats
      toCarabiner(`bpm ${b2}`);
      setTimeout(() => toCarabiner(`(bpm ${b2})`), 150);
  }
}

// Send play/stop command using correct protocol
function sendPlaying(playing) {
  if (bpmCmdFmt === 'old' || bpmCmdFmt === null) {
    toCarabiner(playing ? 'start-playing' : 'stop-playing');    // old protocol
  }
  if (bpmCmdFmt === 'new' || bpmCmdFmt === 'tempo' || bpmCmdFmt === null) {
    setTimeout(() => toCarabiner(playing ? '(start-playing)' : '(stop-playing)'), bpmCmdFmt ? 0 : 100);
  }
}

function parseCarabiner(line) {
  const clean = line.trim();
  console.log('[← Carabiner]', clean);

    // Track "unsupported" responses for each probe format
  if (clean.includes('unsupported') && clean.includes('bpm 777'))   pendingProbe.oldRejected  = true;
  if (clean.includes('unsupported') && clean.includes('(bpm 777'))  pendingProbe.newRejected  = true;
  if (clean.includes('unsupported') && clean.includes('(tempo '))   pendingProbe.tempoRejected = true;

  // If BPM changes to probe value 777, one of our commands worked
  if (!bpmCmdFmt && clean.match(/:bpm\s+777/)) {
    if (!pendingProbe.oldRejected)   { bpmCmdFmt = 'old'; }
    else if (!pendingProbe.newRejected)  { bpmCmdFmt = 'new'; }
    else if (!pendingProbe.tempoRejected){ bpmCmdFmt = 'tempo'; }
    if (bpmCmdFmt) console.log('[Bridge] ✓ Protocole BPM détecté:', bpmCmdFmt);
  }

  const mBpm  = clean.match(/:bpm ([0-9.]+)/);
  const mPeer = clean.match(/:peers ([0-9]+)/);
  const mPlay = clean.match(/:playing (true|false)/);
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

    // Probe: try both old protocol (no parens) and new protocol (parens)
    // Old Carabiner 1.x: "bpm 120.0", "status { :bpm X :start X :beat X }"
    // New Carabiner 2.x: "(bpm 120.0)", "(status {:bpm X :playing Y :peers N})"
    setTimeout(() => {
      console.log('[Bridge] === Sonde protocole Carabiner ===');
      toCarabiner('bpm 777.0');    // old protocol (no parens) — probe first
    }, 800);
    setTimeout(() => {
      if (!bpmCmdFmt) toCarabiner('(bpm 777.0)');  // new protocol (with parens)
    }, 1400);
    setTimeout(() => {
      if (!bpmCmdFmt) toCarabiner('(tempo {:bpm 777.0})'); // newest format
    }, 2000);
    setTimeout(() => {
      if (!bpmCmdFmt) {
        console.log('[Bridge] ⚠  Aucun format BPM accepté — sync App→Note non disponible');
        console.log('[Bridge]    Note→App BPM continue de fonctionner (lecture seule)');
      } else {
        console.log('[Bridge] ✓ Prêt — protocole:', bpmCmdFmt);
      }
    }, 3000);

    // Enable start-stop sync for both protocol versions
    toCarabiner('enable-start-stop-sync');          // old protocol
    setTimeout(() => {
      toCarabiner('(enable-start-stop-sync)');      // new protocol
      toCarabiner('(start-stop-sync {:enabled true})');
    }, 200);
  });

  let cbuf = '';
  sock.on('data', d => {
    cbuf += d.toString();
    const lines = cbuf.split('\n');
    cbuf = lines.pop();
    lines.forEach(l => l.trim() && parseCarabiner(l));
  });
  sock.on('close', () => {
    caraSocket = null; bpmCmdFmt = null; pendingProbe = {};
    console.log('[Bridge] Carabiner déconnecté — nouvelle tentative dans 3s…');
    setTimeout(connectCarabiner, 3000);
  });
  sock.on('error', err => {
    caraSocket = null; bpmCmdFmt = null; pendingProbe = {};
    if (err.code === 'ECONNREFUSED') console.log('[Bridge] ⚠  Carabiner introuvable sur le port 17000');
    setTimeout(connectCarabiner, 3000);
  });
}

/* ═══ HTTP + WebSocket server ═══════════════════════════ */
const server = http.createServer((_req, res) => { res.writeHead(200); res.end('Kick & Snare Link Bridge v2.2\n'); });

server.on('upgrade', (req, socket) => {
  if ((req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  wsHandshake(req, socket);
  clients.add(socket);
  console.log('[Bridge] Navigateur connecté — format BPM détecté:', bpmCmdFmt || 'en cours de détection...');
  socket.write(wsFrame(JSON.stringify({ type: 'state', ...state })));

  let rbuf = Buffer.alloc(0);
  socket.on('data', chunk => {
    rbuf = Buffer.concat([rbuf, chunk]);
    const rest = wsParse(rbuf,
      text => {
        try {
          const msg = JSON.parse(text);
          if (msg.type === 'setBpm')     sendBpm(msg.bpm);
          if (msg.type === 'setPlaying') sendPlaying(msg.playing);
        } catch {}
      },
      () => { clients.delete(socket); socket.destroy(); }
    );
    if (rest !== null) rbuf = rest;
  });
  socket.on('close', () => { clients.delete(socket); console.log('[Bridge] Navigateur déconnecté'); });
  socket.on('error', () => clients.delete(socket));
});

server.listen(WS_PORT, () => {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   Kick & Snare — Link Bridge  v2.2        ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║   WebSocket : ws://localhost:${WS_PORT}          ║`);
  console.log(`║   Carabiner : localhost:${CARABINER_PORT}              ║`);
  console.log('╚════════════════════════════════════════════╝\n');
  connectCarabiner();
});

process.on('SIGINT', () => { console.log('\n[Bridge] Arrêt.'); process.exit(0); });

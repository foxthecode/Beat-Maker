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
    case 'v1': toCarabiner(`(bpm ${b2})`); break;
    case 'v2': toCarabiner(`(tempo {:bpm ${b4}})`); break;
    case 'v3': toCarabiner(`bpm ${b2}`); break;
    case 'v4': toCarabiner(`tempo ${b2}`); break;
    case 'v5': toCarabiner(`{"bpm":${b2}}`); break;
    default:
      // Still detecting — try all formats
      toCarabiner(`(bpm ${b2})`);
      setTimeout(() => toCarabiner(`(tempo {:bpm ${b4}})`), 100);
      setTimeout(() => toCarabiner(`bpm ${b2}`), 200);
  }
}

function parseCarabiner(line) {
  const clean = line.trim();
  console.log('[← Carabiner]', clean);

    // Auto-detect which BPM command worked: look for "unsupported" echoing the exact probe string
  if (clean.includes('unsupported') && clean.includes('(bpm '))    pendingProbe.v1rejected = true;
  if (clean.includes('unsupported') && clean.includes('(tempo '))   pendingProbe.v2rejected = true;
  if (clean.includes('unsupported') && clean.includes('bpm 777'))   pendingProbe.v3rejected = true;
  if (clean.includes('unsupported') && clean.includes('tempo 777')) pendingProbe.v4rejected = true;
  if (clean.includes('unsupported') && clean.includes('"bpm"'))     pendingProbe.v5rejected = true;

  // If BPM changes to our probe value (777), that format worked
  const probeBpm = clean.match(/:bpm\s+777\./) || clean.match(/"bpm"\s*:\s*777/);
  if (probeBpm && !bpmCmdFmt) {
    if (!pendingProbe.v1rejected) bpmCmdFmt = 'v1';
    else if (!pendingProbe.v2rejected) bpmCmdFmt = 'v2';
    else if (!pendingProbe.v3rejected) bpmCmdFmt = 'v3';
    else if (!pendingProbe.v4rejected) bpmCmdFmt = 'v4';
    else if (!pendingProbe.v5rejected) bpmCmdFmt = 'v5';
    if (bpmCmdFmt) console.log('[Bridge] ✓ Format BPM détecté:', bpmCmdFmt);
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

    // Send init commands — probe both API versions
    toCarabiner('(carabiner-state)');
    toCarabiner('(enable-start-stop-sync)');        // Carabiner v1
    toCarabiner('(start-stop-sync {:enabled true})'); // Carabiner v2

    // Probe BPM command formats with BPM=777 as distinctive value
    // Each format tried 400ms apart so responses can be matched to commands
    const probeDelay = 800;
    setTimeout(() => {
      console.log('[Bridge] === Sonde formats de commande BPM ===');
      toCarabiner('(bpm 777.0)');          // v1: Deep Symmetry Carabiner 1.x
    }, probeDelay);
    setTimeout(() => toCarabiner('(tempo {:bpm 777.0})'), probeDelay + 400);  // v2: Carabiner 2.x
    setTimeout(() => toCarabiner('bpm 777.0'), probeDelay + 800);             // v3: no parens
    setTimeout(() => toCarabiner('tempo 777.0'), probeDelay + 1200);          // v4: no parens alt
    setTimeout(() => toCarabiner('{"bpm":777.0}'), probeDelay + 1600);        // v5: JSON
    setTimeout(() => {
      if (!bpmCmdFmt) {
        console.log('[Bridge] ⚠  Aucun format BPM accepté — sync App→Note non disponible');
        console.log('[Bridge]    Le BPM Note→App continue de fonctionner (lecture seule)');
      } else {
        console.log('[Bridge] ✓ Prêt — format BPM actif:', bpmCmdFmt);
      }
    }, probeDelay + 3000);
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
          if (msg.type === 'setPlaying') toCarabiner(msg.playing ? '(start-playing)' : '(stop-playing)');
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

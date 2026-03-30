#!/usr/bin/env node
/**
 * Kick & Snare — Ableton Link Bridge v1.0
 *
 * Runs on your local machine to connect Kick & Snare (browser)
 * to an Ableton Link session (Ableton Note, Ableton Live, Traktor…)
 *
 * Setup:
 *   cd link-bridge
 *   npm install
 *   node bridge.js
 *
 * Then in Kick & Snare, click [LINK] → enter ws://localhost:9898 → Connect
 */

const AbletonLink = require('abletonlink');
const { WebSocketServer } = require('ws');
const { createServer } = require('http');

const PORT = process.env.PORT || 9898;
const QUANTUM = 4;

const link = new AbletonLink(120, QUANTUM, true);
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Kick & Snare Link Bridge running');
});
const wss = new WebSocketServer({ server });

let lastBpm = null;
let lastPlaying = null;

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

link.startUpdate(16, (beat, phase, bpm, isPlaying, numPeers) => {
  const roundedBpm = Math.round(bpm * 10) / 10;
  if (roundedBpm !== lastBpm || isPlaying !== lastPlaying) {
    lastBpm = roundedBpm;
    lastPlaying = isPlaying;
    broadcast({ type: 'state', bpm: roundedBpm, playing: isPlaying, peers: numPeers, beat, phase });
  }
});

link.on('numPeers', peers => {
  broadcast({ type: 'peers', peers });
});

wss.on('connection', (ws, req) => {
  const addr = req.socket.remoteAddress;
  console.log(`[Bridge] Connected: ${addr}`);

  ws.send(JSON.stringify({
    type: 'state',
    bpm: Math.round(link.bpm * 10) / 10,
    playing: link.isPlayingOnUpdate,
    peers: link.numPeers,
    beat: link.beat,
    phase: link.phase
  }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'setBpm' && typeof msg.bpm === 'number') {
        link.bpm = msg.bpm;
        console.log(`[Bridge] BPM set to ${msg.bpm}`);
      }
      if (msg.type === 'setPlaying') {
        msg.playing ? link.play() : link.stop();
        console.log(`[Bridge] ${msg.playing ? 'Play' : 'Stop'}`);
      }
    } catch {}
  });

  ws.on('close', () => console.log(`[Bridge] Disconnected: ${addr}`));
});

server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Kick & Snare — Link Bridge  v1.0  ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`\n  WebSocket : ws://localhost:${PORT}`);
  console.log('\n  Dans Kick & Snare :');
  console.log('    1. Cliquer [LINK]');
  console.log(`    2. Entrer  ws://localhost:${PORT}`);
  console.log('    3. Cliquer [CONNECT]');
  console.log('\n  En attente de connexion...\n');
});

process.on('SIGINT', () => {
  console.log('\n[Bridge] Arrêt.');
  link.stopUpdate();
  process.exit(0);
});

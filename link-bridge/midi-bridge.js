#!/usr/bin/env node
/**
 * Kick & Snare — MIDI Bridge  v1.0
 * Relie ton Oxygen Pro Mini à l'app via WebSocket.
 * Aucun droit admin requis — installe les dépendances dans le dossier courant.
 *
 * Usage :
 *   node midi-bridge.js
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const WS_PORT = 9899;
const DIR     = __dirname;

// ── Auto-install deps ───────────────────────────────────────────────────────
function tryRequire(id, localPath) {
  try { return require(localPath || id); } catch(_) { return null; }
}

function npmInstall(pkg) {
  process.stdout.write(`  npm install ${pkg} ... `);
  const r = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--save', pkg],
    { cwd: DIR, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  if (r.status !== 0) {
    console.log('ERREUR');
    console.error(r.stderr?.toString());
    process.exit(1);
  }
  console.log('OK');
}

let midi = tryRequire('midi');
if (!midi) { npmInstall('midi'); midi = require('midi'); }

let wsLib = tryRequire('ws');
if (!wsLib) { npmInstall('ws'); wsLib = require('ws'); }
const { WebSocketServer } = wsLib;

// ── MIDI input ──────────────────────────────────────────────────────────────
const input = new midi.Input();
const count = input.getPortCount();

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   Kick & Snare — MIDI Bridge  v1.0          ║');
console.log('╠══════════════════════════════════════════════╣');
console.log(`║   WebSocket : ws://localhost:${WS_PORT}            ║`);
console.log('╚══════════════════════════════════════════════╝\n');

if (count === 0) {
  console.error('✕ Aucun port MIDI détecté.');
  console.error('  → Branche l\'Oxygen Pro Mini et relance ce script.');
  process.exit(1);
}

console.log(`Ports MIDI détectés (${count}) :`);
let targetPort = 0;
for (let i = 0; i < count; i++) {
  const name = input.getPortName(i);
  console.log(`  [${i}] ${name}`);
  if (/oxygen/i.test(name) || /m-audio/i.test(name)) targetPort = i;
}

const portName = input.getPortName(targetPort);
console.log(`\n→ Connexion sur [${targetPort}] ${portName}`);
input.openPort(targetPort);
input.ignoreTypes(false, false, false); // sysex, timing, active sensing

// ── WebSocket server ────────────────────────────────────────────────────────
const clients = new Set();
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('listening', () => {
  console.log(`✓ WebSocket actif sur ws://localhost:${WS_PORT}`);
  console.log('\nEn attente de l\'app… (Ctrl+C pour quitter)\n');
});

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`⚡ App connectée (${clients.size} client(s))`);
  ws.on('close', () => { clients.delete(ws); console.log('  App déconnectée'); });
});

// ── MIDI → WebSocket ────────────────────────────────────────────────────────
input.on('message', (_dt, msg) => {
  const [status, note, vel] = msg;
  const type  = status & 0xF0;
  const ch    = status & 0x0F;

  const noteOn  = type === 0x90 && vel > 0;
  const noteOff = type === 0x80 || (type === 0x90 && vel === 0);

  const typeName = noteOn ? 'noteon' : noteOff ? 'noteoff' : type === 0xB0 ? 'cc' : 'other';

  const json = JSON.stringify({ type: typeName, note, vel, ch });

  if (clients.size > 0) {
    clients.forEach(ws => { if (ws.readyState === 1) ws.send(json); });
  }

  if (noteOn) {
    const noteName = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][note % 12];
    const oct      = Math.floor(note / 12) - 1;
    process.stdout.write(`  ♪ ${noteName}${oct} (${note}) vel=${vel}\n`);
  } else if (type === 0xB0 && vel > 0) {
    process.stdout.write(`  CC${note} val=${vel}\n`);
  }
});

process.on('SIGINT', () => {
  console.log('\nFermeture…');
  input.closePort();
  wss.close();
  process.exit(0);
});

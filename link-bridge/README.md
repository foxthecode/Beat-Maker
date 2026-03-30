# Kick & Snare — Ableton Link Bridge v2

Connecte Kick & Snare (navigateur) à une session Ableton Link
(Ableton Note, Ableton Live, Traktor, etc.) **sans compilation C++**.

## Prérequis

- **Node.js 18+** : https://nodejs.org
- **Carabiner** (binaire précompilé, gratuit) :
  https://github.com/Deep-Symmetry/carabiner/releases

## Setup (3 étapes)

### 1. Lancer Carabiner

Télécharge le binaire pour ton OS depuis :
https://github.com/Deep-Symmetry/carabiner/releases

- **Mac** : `./carabiner` dans le terminal (ou double-clic)
- **Windows** : double-clic sur `carabiner.exe`

Carabiner écoute sur le port 17000 par défaut.

### 2. Lancer le bridge

```bash
cd link-bridge
npm install        # installe seulement "ws" (pur JavaScript, rapide)
node bridge.js
```

### 3. Connecter dans Kick & Snare

1. Ouvrir Kick & Snare dans Chrome
2. Cliquer **[🔗 LINK]** dans la barre transport
3. URL : `ws://localhost:9898` (déjà pré-rempli)
4. Cliquer **CONNECT**

## Depuis un autre appareil (ex: iPhone avec Ableton Note)

Si Kick & Snare tourne sur ton téléphone :
1. Trouve l'IP locale de ton Mac/PC :
   - Mac : `ipconfig getifaddr en0`
   - Windows : `ipconfig` → Adresse IPv4
2. Dans Kick & Snare, entre `ws://192.168.x.x:9898`

Les deux appareils doivent être sur le même réseau WiFi.

## Ce que ça synchronise

- **BPM** — bidirectionnel (Kick & Snare ↔ Ableton Note / Live)
- **Play / Stop** — optionnel (case "Sync Play/Stop" dans l'app)
- **Nombre de pairs** — affiché en temps réel dans l'app

## Architecture

```
Kick & Snare (navigateur HTTPS)
    ↕ WebSocket ws://localhost:9898
bridge.js (Node.js, pur JS)
    ↕ TCP localhost:17000
Carabiner (binaire précompilé)
    ↕ UDP multicast (WiFi local)
Ableton Note / Live / Traktor
```

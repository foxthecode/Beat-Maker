# Kick & Snare — Ableton Link Bridge

Connecte Kick & Snare (navigateur) à une session Ableton Link
(Ableton Note, Ableton Live, Traktor, etc.)

## Prérequis

- Node.js 18+
- Python 3 (pour compiler le module natif)
- Compilateur C++ :
  - **Mac** : `xcode-select --install`
  - **Windows** : Visual Studio Build Tools + "Desktop development with C++"
  - **Linux** : `build-essential`

## Installation

```bash
cd link-bridge
npm install
```

## Utilisation

```bash
node bridge.js
```

Puis dans Kick & Snare (Chrome/Edge) :
1. Cliquer **[LINK]** dans la barre transport
2. Entrer `ws://localhost:9898`
3. Cliquer **[CONNECT]**

L'app apparaît maintenant comme pair dans Ableton Note / Live.

## Depuis un autre appareil (ex: téléphone)

Si Kick & Snare tourne sur ton téléphone et le bridge sur ton Mac/PC :

1. Trouve l'IP locale de ton ordinateur :
   - Mac : `ipconfig getifaddr en0`
   - Windows : `ipconfig` → IPv4
2. Dans Kick & Snare, entre `ws://192.168.x.x:9898`

Les deux appareils doivent être sur le même réseau WiFi.

## Ce que ça synchronise

- **BPM** — bidirectionnel (Kick & Snare ↔ Ableton Note)
- **Play / Stop** — bidirectionnel
- **Nombre de pairs** — affiché dans l'app

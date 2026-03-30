# Kick & Snare — Link Bridge v2.1

Synchronise le BPM avec Ableton Note, Ableton Live, Traktor, etc.
**Aucun npm install requis** — juste Node.js + Carabiner.

---

## Setup (3 étapes)

### Étape 1 — Installer Node.js (si pas déjà fait)

→ https://nodejs.org → bouton **"LTS"** → installer, redémarrer PowerShell.

Vérifier :
```
node --version
```
Doit afficher `v18.x.x` ou plus.

---

### Étape 2 — Télécharger et lancer Carabiner

→ https://github.com/Deep-Symmetry/carabiner/releases

- **Windows** : télécharger `carabiner-win64.zip`, dézipper, double-cliquer sur `carabiner.exe`
- **Mac** : télécharger le binaire, dans le terminal : `./carabiner`

Carabiner doit rester ouvert en fond.

---

### Étape 3 — Lancer le bridge

Copier `bridge.js` dans un dossier (ex: `C:\Users\TON_NOM\link-bridge\`).

Dans PowerShell :
```powershell
cd C:\Users\TON_NOM\link-bridge
node bridge.js
```

Tu dois voir :
```
╔════════════════════════════════════════════╗
║   Kick & Snare — Link Bridge  v2.1        ║
╠════════════════════════════════════════════╣
║   WebSocket : ws://localhost:9898          ║
║   Carabiner : localhost:17000              ║
╚════════════════════════════════════════════╝

✓ Carabiner connecté sur port 17000
```

---

### Étape 4 — Connecter dans Kick & Snare

1. Ouvrir Kick & Snare dans Chrome
2. Cliquer **[🔗 LINK]** dans la barre transport
3. URL : `ws://localhost:9898` (déjà pré-rempli)
4. Cliquer **CONNECT** → statut vert ✓

---

## Dépannage

| Symptôme | Solution |
|----------|----------|
| `node` non reconnu | Réinstalle Node.js et redémarre PowerShell |
| `⚠ Carabiner introuvable` | Lance `carabiner.exe` avant `node bridge.js` |
| Statut "Échec" dans l'app | Vérifie que le bridge tourne (`node bridge.js` dans PowerShell) |
| Pas de pairs Ableton Note | Les deux appareils doivent être sur le même réseau WiFi |

## Architecture

```
Kick & Snare (navigateur)
    ↕ WebSocket ws://localhost:9898
bridge.js (Node.js, zéro dépendance)
    ↕ TCP localhost:17000
Carabiner (binaire précompilé)
    ↕ UDP multicast (WiFi)
Ableton Note / Live / Traktor
```

# PROMPT POUR REPLIT — Live Sample Recording + Sample FX

## CONTEXTE PRÉALABLE

Voici une proposition de prompt pour implémenter la possibilité d'enregistrer ses propres samples avec le micro et une option de modification de sample (pitch,…). Analyse le et vérifie que cela est cohérent avec notre projet. Vérifie les faiblesses éventuelles et propose des actions correctives avant d'exécuter.

---

## OBJECTIF

Implémenter 2 fonctionnalités dans `KickAndSnare.tsx` :

1. **Sample Loader étendu** — le bouton ♪ ouvre un choix "Fichier local" / "Enregistrement micro", avec enregistrement live + trimming waveform + validation
2. **Quick Sample FX** — un panneau simplifié (pitch, filter, saturation) accessible depuis Live Pads

## RÈGLES ABSOLUES

- **Ne JAMAIS modifier** la classe `Eng` (Audio Engine, lignes ~219-780) sauf pour ajouter UNE méthode `loadBuffer(id, audioBuffer)` 
- **Ne JAMAIS modifier** le composant `FXRack` (lignes ~785-1372)
- **Ne JAMAIS modifier** le scheduler `schLoop` (lignes ~2027-2112)
- **Ne JAMAIS modifier** les composants existants `TrackRow`, `LooperPanel`, `PatternBank`, `TransportBar`
- **Ne JAMAIS supprimer** de code existant — uniquement ajouter
- **Arrêter la lecture** (`startStop()` si `playing`) avant d'ouvrir l'interface d'enregistrement ou le file picker
- Tester que le build TypeScript passe sans erreur
- Compatible desktop + mobile (touch events)

---

## ÉTAPE 1 — Méthode `engine.loadBuffer()`

Dans la classe `Eng`, ajouter une seule méthode après `loadUrl()` (ligne ~648) :

```typescript
// Assign a pre-decoded AudioBuffer directly (used by live recording trimmer)
loadBuffer(id: string, buffer: AudioBuffer) {
  this.init();
  if (!this.ch[id]) this._build(id);
  this.buf[id] = buffer;
}
```

**Pourquoi** : le recording produit un `AudioBuffer` via `decodeAudioData`. Aujourd'hui `engine.load()` prend un `File`, mais nous avons déjà un `AudioBuffer` décodé et trimé. Plutôt que de ré-encoder en WAV puis re-décoder (perte de qualité + latence), on l'assigne directement.

---

## ÉTAPE 2 — Composant `SampleLoaderModal`

Créer un nouveau fichier `src/components/SampleLoaderModal.tsx`.

### Interface / Props

```typescript
interface SampleLoaderModalProps {
  open: boolean;
  trackId: string;
  trackLabel: string;
  trackColor: string;
  onClose: () => void;
  onFileLoaded: (trackId: string, file: File) => void;        // existing file flow
  onBufferLoaded: (trackId: string, buffer: AudioBuffer, name: string) => void; // new recording flow
  audioCtx: AudioContext | null;  // engine.ctx, needed for decodeAudioData
}
```

### Flow interne

```
[MODALE FULLSCREEN — overlay sombre z-index:9999]
  │
  ├── État initial : CHOIX
  │     ├── Bouton "📁 Fichier local"  → appelle onFileLoaded flow (ferme modale, ouvre file picker)
  │     └── Bouton "🎤 Enregistrer"    → passe en état RECORDING
  │
  ├── État RECORDING :
  │     ├── Indicateur "En écoute..." avec animation de volume (AnalyserNode)
  │     ├── Bouton "● REC" (rouge) → démarre MediaRecorder
  │     ├── Bouton "■ STOP" (apparaît pendant l'enregistrement) → arrête MediaRecorder
  │     └── Timer qui affiche la durée en cours
  │
  ├── État TRIM (après stop) :
  │     ├── Canvas waveform : dessine le PCM du buffer décodé
  │     ├── 2 handles draggables (start/end) sur le canvas — positions en % 
  │     ├── Bouton "▶ Preview" — joue le segment trimé via un BufferSource temporaire
  │     ├── Bouton "Re-record" — revient à RECORDING
  │     └── Bouton "✓ Valider" — crée un trimmed AudioBuffer et appelle onBufferLoaded
  │
  └── Bouton "✕ Fermer" (coin supérieur droit) → onClose
```

### Détails d'implémentation critique

**Enregistrement** :
```typescript
const stream = await navigator.mediaDevices.getUserMedia({ 
  audio: { 
    echoCancellation: false,  // IMPORTANT : désactiver pour samples musicaux
    noiseSuppression: false,
    autoGainControl: false 
  } 
});
const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
// Fallback si opus non supporté :
// MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? ... : 'audio/webm'
const chunks: Blob[] = [];
recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
recorder.onstop = async () => {
  stream.getTracks().forEach(t => t.stop()); // CRUCIAL: libérer le micro
  const blob = new Blob(chunks, { type: recorder.mimeType });
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  // → passer en état TRIM avec ce buffer
};
```

**Waveform canvas** :
```typescript
function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer, startPct: number, endPct: number) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  
  // Fond
  ctx.fillStyle = 'rgba(0,0,0,0.03)';
  ctx.fillRect(0, 0, width, height);
  
  // Zone sélectionnée
  ctx.fillStyle = 'rgba(255,149,0,0.08)';
  ctx.fillRect(width * startPct, 0, width * (endPct - startPct), height);
  
  // Waveform
  ctx.beginPath();
  ctx.strokeStyle = trackColor;
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x++) {
    const i = Math.floor(x * step);
    let min = 1, max = -1;
    for (let j = 0; j < step && i + j < data.length; j++) {
      const v = data[i + j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const yMin = ((1 + min) / 2) * height;
    const yMax = ((1 + max) / 2) * height;
    ctx.moveTo(x, yMin);
    ctx.lineTo(x, yMax);
  }
  ctx.stroke();
  
  // Handles
  [startPct, endPct].forEach((pct, i) => {
    ctx.fillStyle = i === 0 ? '#30D158' : '#FF2D55';
    ctx.fillRect(width * pct - 2, 0, 4, height);
  });
}
```

**Trim** — créer un nouveau buffer à partir de la sélection :
```typescript
function trimBuffer(buffer: AudioBuffer, startPct: number, endPct: number, ctx: AudioContext): AudioBuffer {
  const startSample = Math.floor(buffer.length * startPct);
  const endSample = Math.floor(buffer.length * endPct);
  const length = endSample - startSample;
  const trimmed = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = trimmed.getChannelData(ch);
    for (let i = 0; i < length; i++) dst[i] = src[startSample + i];
  }
  return trimmed;
}
```

**Handle dragging** (compatible mouse + touch) :
```typescript
const onHandleDown = (e: React.PointerEvent, handle: 'start' | 'end') => {
  e.preventDefault();
  const canvas = canvasRef.current!;
  const rect = canvas.getBoundingClientRect();
  const onMove = (ev: PointerEvent) => {
    const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    if (handle === 'start') setStartPct(Math.min(x, endPct - 0.01));
    else setEndPct(Math.max(x, startPct + 0.01));
  };
  const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
};
```

### Style de la modale

```typescript
// Overlay
{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', 
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
// Contenu
{ background: th.bg, borderRadius: 16, padding: 20, maxWidth: 500, width: '100%', 
  maxHeight: '90vh', overflow: 'auto' }
```

---

## ÉTAPE 3 — Intégration dans KickAndSnare.tsx

### 3a. State nouveau (ajouter après ligne ~1454)

```typescript
const [sampleModalOpen, setSampleModalOpen] = useState(false);
const [sampleModalTrack, setSampleModalTrack] = useState<string>('');
```

### 3b. Modifier `ldFile()` (ligne ~2919)

Remplacer :
```typescript
const ldFile = tid => { ldRef.current = tid; if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); } };
```

Par :
```typescript
const ldFile = (tid: string) => {
  // Stop playback before loading — prevents audio glitches
  if (playing) { startStop(); }
  setSampleModalTrack(tid);
  setSampleModalOpen(true);
};
```

### 3c. Callbacks pour la modale (ajouter après `ldFile`)

```typescript
const onSampleFile = (tid: string, file: File) => {
  setSampleModalOpen(false);
  // Reuse existing file loading logic
  engine.init();
  engine.load(tid, file).then(ok => {
    if (ok) {
      setSmpN(p => ({ ...p, [tid]: file.name }));
      engine.play(tid, 1, 0, R.fx[tid]);
    }
  });
};

const onSampleBuffer = (tid: string, buffer: AudioBuffer, name: string) => {
  setSampleModalOpen(false);
  engine.init();
  engine.loadBuffer(tid, buffer);
  setSmpN(p => ({ ...p, [tid]: name }));
  engine.play(tid, 1, 0, R.fx[tid]);
};
```

### 3d. Rendre la modale (ajouter juste après le `<input type="file" .../>`, ligne ~3011)

```tsx
<SampleLoaderModal
  open={sampleModalOpen}
  trackId={sampleModalTrack}
  trackLabel={ALL_TRACKS_COMBINED.find(t => t.id === sampleModalTrack)?.label || sampleModalTrack}
  trackColor={ALL_TRACKS_COMBINED.find(t => t.id === sampleModalTrack)?.color || '#FF9500'}
  onClose={() => setSampleModalOpen(false)}
  onFileLoaded={onSampleFile}
  onBufferLoaded={onSampleBuffer}
  audioCtx={engine.ctx}
/>
```

### 3e. Import en haut du fichier

```typescript
import SampleLoaderModal from './components/SampleLoaderModal';
```

---

## ÉTAPE 4 — Bouton ♪ sur Live Pads

Dans la section `{/* ── LIVE PADS ── */}` (ligne ~3441), ajouter un bouton AVANT le looper banner :

```tsx
{view === "pads" && (
  <div style={{ padding: "12px 0" }}>
    {/* Sample loader + Quick FX buttons — top bar */}
    <div style={{ display: "flex", gap: 6, marginBottom: 8, justifyContent: "space-between" }}>
      <button
        onClick={() => {
          // Open a small picker to choose which track to load a sample for
          const tid = prompt(`Load sample for which track?\n${atO.map((t, i) => `${i + 1}. ${t.label}`).join('\n')}\n\nEnter number:`);
          const idx = parseInt(tid || '') - 1;
          if (idx >= 0 && idx < atO.length) ldFile(atO[idx].id);
        }}
        style={{
          padding: "6px 14px", borderRadius: 8,
          border: `1px solid rgba(255,149,0,0.3)`, background: "rgba(255,149,0,0.08)",
          color: "#FF9500", fontSize: 10, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit"
        }}
      >
        ♪ LOAD SAMPLE
      </button>
      <button
        onClick={() => setShowQuickFx(p => !p)}
        style={{
          padding: "6px 14px", borderRadius: 8,
          border: `1px solid ${showQuickFx ? 'rgba(191,90,242,0.4)' : 'rgba(191,90,242,0.2)'}`,
          background: showQuickFx ? "rgba(191,90,242,0.12)" : "rgba(191,90,242,0.04)",
          color: "#BF5AF2", fontSize: 10, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit"
        }}
      >
        🎛 SAMPLE FX
      </button>
    </div>
    {/* Quick FX panel — inline, shows below buttons */}
    {showQuickFx && <QuickSampleFx tracks={atO} fx={fx} setFx={setFx} engine={engine} th={th} DEFAULT_FX={DEFAULT_FX} />}
    {/* ... existing TipBadge + Looper banner + Pads grid below ... */}
```

> **NOTE** : le `prompt()` pour choisir la piste est un placeholder simple. L'idéal est un petit dropdown ou un mini-grid de boutons colorés avec les noms de pistes. Mais le `prompt()` marche en attendant et ne risque pas de casser le layout.

**Alternative recommandée au `prompt()`** — un petit menu inline :

```tsx
const [pickTrackFor, setPickTrackFor] = useState<'sample' | null>(null);

// Bouton ♪ LOAD SAMPLE → setPickTrackFor('sample')
// Si pickTrackFor === 'sample', afficher un row de mini-boutons colorés :
{pickTrackFor === 'sample' && (
  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8, padding: '6px 8px', borderRadius: 8, background: th.surface, border: `1px solid ${th.sBorder}` }}>
    <span style={{ fontSize: 8, color: th.dim, width: '100%' }}>Load sample for:</span>
    {atO.map(t => (
      <button key={t.id} onClick={() => { setPickTrackFor(null); ldFile(t.id); }}
        style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${t.color}33`, background: t.color + '10', color: t.color, fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        {t.icon} {t.label}
      </button>
    ))}
    <button onClick={() => setPickTrackFor(null)} style={{ marginLeft: 'auto', padding: '4px 8px', border: 'none', borderRadius: 4, background: 'rgba(255,55,95,0.1)', color: '#FF375F', fontSize: 8, cursor: 'pointer', fontFamily: 'inherit' }}>CANCEL</button>
  </div>
)}
```

---

## ÉTAPE 5 — Composant `QuickSampleFx`

Créer `src/components/QuickSampleFx.tsx` :

```tsx
import { useState } from 'react';

interface QuickSampleFxProps {
  tracks: Array<{ id: string; label: string; color: string; icon: string }>;
  fx: Record<string, any>;
  setFx: (fn: (prev: Record<string, any>) => Record<string, any>) => void;
  engine: any;
  th: any;
  DEFAULT_FX: Record<string, any>;
}

export default function QuickSampleFx({ tracks, fx, setFx, engine, th, DEFAULT_FX }: QuickSampleFxProps) {
  const [selTrack, setSelTrack] = useState(tracks[0]?.id || '');
  const tr = tracks.find(t => t.id === selTrack);
  const f = fx[selTrack] || { ...DEFAULT_FX };

  const update = (key: string, value: number) => {
    setFx(prev => {
      const nf = { ...(prev[selTrack] || { ...DEFAULT_FX }), [key]: value };
      engine.uFx(selTrack, nf);  // real-time update, no latency
      return { ...prev, [selTrack]: nf };
    });
  };

  const Knob = ({ label, value, min, max, step, unit, color, k }: any) => {
    const pct = ((value - min) / (max - min)) * 100;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: th.dim }}>{label}</span>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => update(k, Number(e.target.value))}
          style={{ width: '100%', accentColor: color, height: 4 }}
        />
        <span style={{ fontSize: 8, fontWeight: 700, color, fontFamily: 'monospace' }}>
          {typeof value === 'number' ? value.toFixed(step < 1 ? 1 : 0) : value}{unit}
        </span>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: th.surface, border: `1px solid rgba(191,90,242,0.15)` }}>
      {/* Track selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {tracks.map(t => (
          <button key={t.id} onClick={() => setSelTrack(t.id)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 9, fontWeight: 700,
              border: `1px solid ${selTrack === t.id ? t.color + '55' : th.sBorder}`,
              background: selTrack === t.id ? t.color + '15' : 'transparent',
              color: selTrack === t.id ? t.color : th.dim,
              cursor: 'pointer', fontFamily: 'inherit'
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {/* Parameters */}
      {tr && (
        <div style={{ display: 'flex', gap: 12 }}>
          <Knob label="PITCH" value={f.pitch} min={-12} max={12} step={1} unit="st" color={tr.color} k="pitch" />
          <Knob label="FILTER" value={f.cut} min={20} max={20000} step={100} unit="Hz" color="#555" k="cut" />
          <Knob label="DRIVE" value={f.drive} min={0} max={100} step={1} unit="%" color="#FF9500" k="drive" />
          <Knob label="VOLUME" value={f.vol} min={0} max={100} step={1} unit="%" color="#888" k="vol" />
        </div>
      )}
    </div>
  );
}
```

**Pourquoi `engine.uFx()` directement dans `onChange`** : c'est exactement ce que fait le `FXRack` existant (ligne 3421). Les paramètres sont appliqués en temps réel via `setTargetAtTime` dans le moteur audio → zéro latence, zéro bug.

---

## ÉTAPE 6 — State supplémentaire dans KickAndSnare.tsx

Ajouter après les states existants (~ligne 1454) :

```typescript
const [showQuickFx, setShowQuickFx] = useState(false);
const [pickTrackFor, setPickTrackFor] = useState<'sample' | null>(null);
```

---

## RÉSUMÉ DES FICHIERS MODIFIÉS/CRÉÉS

| Fichier | Action | Risque |
|---------|--------|--------|
| `src/components/SampleLoaderModal.tsx` | **NOUVEAU** | Aucun (composant isolé) |
| `src/components/QuickSampleFx.tsx` | **NOUVEAU** | Aucun (composant isolé) |
| `src/KickAndSnare.tsx` ligne ~648 | **AJOUT** `loadBuffer()` dans Eng | Minimal (1 méthode ajoutée) |
| `src/KickAndSnare.tsx` ligne ~1454 | **AJOUT** 3 states | Aucun |
| `src/KickAndSnare.tsx` ligne ~2919 | **MODIF** `ldFile()` | Moyen — tester que ♪ fonctionne partout |
| `src/KickAndSnare.tsx` après ~2920 | **AJOUT** callbacks onSampleFile/onSampleBuffer | Aucun |
| `src/KickAndSnare.tsx` ligne ~3011 | **AJOUT** render SampleLoaderModal | Aucun |
| `src/KickAndSnare.tsx` ligne ~3441 | **AJOUT** boutons + QuickFx dans Live Pads | Faible — ajout avant l'existant |

---

## PIÈGES À ÉVITER

1. **Ne pas oublier `stream.getTracks().forEach(t => t.stop())`** après l'enregistrement — sinon le micro reste actif (led allumée, batterie vidée)
2. **`echoCancellation: false`** est CRUCIAL pour les samples musicaux — sinon le navigateur filtre les transients
3. **Ne pas appeler `decodeAudioData` deux fois** sur le même ArrayBuffer — il est "consumed" après le premier appel. Cloner si nécessaire : `arrayBuffer.slice(0)`
4. **Le `MediaRecorder` peut ne pas supporter `audio/webm;codecs=opus`** sur Safari — fallback vers `audio/mp4` ou `audio/webm` sans codec spécifié
5. **Canvas waveform** : utiliser `requestAnimationFrame` pour redessiner pendant le drag des handles, pas dans le `onMove` directement
6. **La modale doit être un Portal** (ou au minimum avoir `position:fixed` + `z-index:9999`) pour s'afficher au-dessus de tout
7. **QuickSampleFx** : les ranges HTML `<input type="range">` sont suffisants pour un accès rapide. Ne pas réimplémenter des faders custom — le FXRack complet est là pour ça
8. **L'arrêt de la lecture dans `ldFile()`** : vérifier que `startStop` est bien défini avant de l'appeler (il l'est via `ssRef.current`)
9. **Mobile Safari** : `getUserMedia` nécessite HTTPS. Le dev server de Vite en local marche mais pas un déploiement HTTP non-sécurisé

---

## TEST CHECKLIST

Après implémentation, vérifier :

- [ ] ♪ sur une piste séquenceur → modale s'ouvre, lecture stoppée
- [ ] ♪ sur une piste euclidien → même comportement
- [ ] "Fichier local" dans la modale → file picker s'ouvre, sample se charge normalement
- [ ] "Enregistrer" → micro activé, voyant visible
- [ ] REC/STOP → waveform affichée
- [ ] Drag des handles start/end → waveform se redessine avec zone sélectionnée
- [ ] Preview → segment trimé audible
- [ ] Valider → sample chargé, nom "Rec: [trackname]" visible dans ♪
- [ ] LOAD SAMPLE sur Live Pads → sélection de piste → modale
- [ ] SAMPLE FX sur Live Pads → panneau inline avec pitch/filter/drive/volume
- [ ] Modif d'un paramètre QuickFx pendant la lecture → effet immédiat, pas de glitch
- [ ] Fermer la modale sans valider → rien ne change
- [ ] Mobile : tous les boutons et drags fonctionnent au touch
- [ ] Build TypeScript : `npx tsc --noEmit` passe sans erreur

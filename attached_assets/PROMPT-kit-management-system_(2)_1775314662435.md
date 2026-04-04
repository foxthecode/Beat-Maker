# PROMPT REPLIT — Kit Management System (inspiré Flip/Koala)

## CONTEXTE PRÉALABLE

Voici une proposition de prompt pour refondre complètement le système de gestion des kits dans Kick & Snare. L'objectif est de passer d'un simple sélecteur ◀ ▶ à un vrai gestionnaire de kits avec sauvegarde, composition et banque de samples. Analyse le et vérifie que cela est cohérent avec notre projet. Vérifie les faiblesses éventuelles et propose des actions correctives avant d'exécuter.

---

## ANALYSE DU CODE EXISTANT

### Ce qui existe déjà
- `DRUM_KITS` (lignes 95-120) : 8 kits prédéfinis avec `id`, `name`, `icon`, `samples` (URLs), `shape` (paramètres de synthèse)
- `kitIdx` state (ligne 1441) : index du kit actif
- `applyKit()` (ligne 2736) : charge les samples + applique les shapes FX
- Sélecteur dans le header (lignes 3029-3066) : boutons ◀ ▶ avec nom/icône
- `smpN` state : noms des samples chargés par piste
- `engine.buf[id]` : AudioBuffers chargés
- `engine.load(id, file)` / `engine.loadUrl(id, url)` / `engine.loadBuffer(id, buf)` : 3 méthodes de chargement
- `useAppState` hook : persistance localStorage avec `ks_state`

### Ce qui manque
- Pas de sauvegarde de kit personnalisé
- Pas de renommage
- Pas de composition de kit depuis des samples individuels
- Pas de banque de samples catégorisée
- Le sélecteur est trop petit et basique (juste ◀ ▶)

---

## OBJECTIF

6 fonctionnalités de kit management :

1. **Kit Browser** — panneau plein page (remplace le mini sélecteur) avec grille visuelle des kits
2. **Save Kit** — sauvegarder les samples actuels des pads comme nouveau kit personnalisé
3. **Rename Kit** — renommer un kit personnalisé
4. **Load Kit** — charger un kit depuis la bibliothèque (factory + user)
5. **Compose Kit** — assembler un kit en choisissant des samples individuels par catégorie
6. **Sample Bank** — banque de données de samples organisée par catégorie (kick, snare, hihat, etc.)

---

## RÈGLES ABSOLUES

- **Ne JAMAIS modifier** la classe `Eng` (sauf pour ajouter `getBufferAsBlob(id)` si nécessaire)
- **Ne JAMAIS modifier** le scheduler, le FXRack, les composants existants
- Les kits factory (`DRUM_KITS`) restent en lecture seule — jamais modifiés
- Les kits user sont sauvegardés dans localStorage (clé `ks_user_kits`) et/ou IndexedDB pour les gros AudioBuffers
- Compatible mobile + desktop
- Build TypeScript sans erreur

---

## ARCHITECTURE DE DONNÉES

### Type UserKit

```typescript
interface UserKit {
  id: string;           // uuid unique
  name: string;         // nom affiché
  icon: string;         // emoji choisi par l'utilisateur
  createdAt: number;    // timestamp
  // Pour chaque piste : soit une URL (factory sample), soit un blob base64, soit null (synth)
  samples: Record<string, {
    type: 'url' | 'blob' | 'synth';
    url?: string;           // si type='url'
    blob?: string;          // si type='blob' (base64 encoded WAV)
    originalName?: string;  // nom du fichier original
  }>;
  shape: Record<string, number>;  // paramètres de synthèse (sDec, sTune, etc.)
}
```

### Type SampleBankEntry

```typescript
interface SampleBankEntry {
  id: string;
  name: string;
  category: 'kick' | 'snare' | 'hihat' | 'clap' | 'tom' | 'ride' | 'crash' | 'perc';
  source: 'factory' | 'user' | 'recorded';
  url?: string;         // factory samples
  blob?: string;        // user/recorded samples (base64)
}
```

### Persistance

```typescript
// Kits user — localStorage (les shapes sont petits, les blobs peuvent être gros)
const USER_KITS_KEY = 'ks_user_kits';

// Pour les gros AudioBuffers : utiliser IndexedDB via un helper simple
// car localStorage a une limite de ~5-10MB par domaine
// Mais pour un MVP, base64 dans localStorage suffit si on limite à 8 kits
// (8 kits × 8 pistes × ~100KB par sample = ~6.4MB max)

function saveUserKits(kits: UserKit[]) {
  try { localStorage.setItem(USER_KITS_KEY, JSON.stringify(kits)); } catch (e) {
    console.warn('Kit save failed (storage full?)', e);
  }
}
function loadUserKits(): UserKit[] {
  try { return JSON.parse(localStorage.getItem(USER_KITS_KEY) || '[]'); } catch { return []; }
}
```

### Convertir un AudioBuffer en base64 WAV (réutiliser `encodeWAV` existant ligne 144)

```typescript
// encodeWAV existe déjà dans le code (ligne 144) — il retourne un ArrayBuffer
// On ajoute juste une conversion en base64 :
function bufferToBase64WAV(buffer: AudioBuffer): string {
  const wavAB = encodeWAV(buffer);
  const bytes = new Uint8Array(wavAB);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
```

---

## FEATURE 1 — Kit Browser (panneau fullscreen)

### Nouveau composant `KitBrowser.tsx`

```
[PANNEAU FULLSCREEN — slide up depuis le bas, z-index 200]
│
├── Header : "KIT LIBRARY" + bouton fermer ✕
│
├── Section "FACTORY KITS" — grille 2×4 de cartes
│   Chaque carte : [icon] [name] [tag count: "3 samples"]
│   Clic = charge le kit + ferme le panneau
│   Kit actif = bordure colorée
│
├── Section "MY KITS" — même grille
│   Chaque carte : [icon] [name] [date]
│   Long-press ou menu ⋮ = Rename / Delete / Duplicate
│   Clic = charge le kit
│
├── Bouton "＋ SAVE CURRENT AS KIT" (sticky en bas)
│   Ouvre un dialog : nom + icône → sauvegarde
│
└── Bouton "🎛 COMPOSE KIT" 
    Ouvre le compositeur de kit (Feature 5)
```

### Intégration dans KickAndSnare.tsx

Le kit selector actuel (◀ ▶) devient un bouton cliquable qui ouvre le KitBrowser :

```tsx
// Remplacer le sélecteur ◀ [icon·NAME] ▶ par :
<button onClick={() => setShowKitBrowser(true)} style={{
  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
  borderRadius: 8, border: '1px solid rgba(255,149,0,0.3)',
  background: 'rgba(255,149,0,0.08)', cursor: 'pointer', fontFamily: 'inherit',
}}>
  <span style={{ fontSize: 16 }}>{curKit.icon}</span>
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
    <span style={{ fontSize: 8, fontWeight: 800, color: '#FF9500', letterSpacing: '0.08em' }}>
      {curKit.name}
    </span>
    <span style={{ fontSize: 6, color: th.dim }}>TAP TO BROWSE</span>
  </div>
  <span style={{ fontSize: 10, color: th.dim, marginLeft: 4 }}>▼</span>
</button>
```

### State nouveau

```typescript
const [showKitBrowser, setShowKitBrowser] = useState(false);
const [userKits, setUserKits] = useState<UserKit[]>(() => loadUserKits());
```

---

## FEATURE 2 — Save Kit

Quand l'utilisateur clique "SAVE CURRENT AS KIT" :

1. Dialog demande : **nom** (input texte) + **icône** (grille d'emoji prédéfinis)
2. Pour chaque piste active, on capture l'état actuel :
   - Si `engine.buf[trackId]` existe → convertir en base64 WAV via `bufferToBase64WAV`
   - Si pas de buffer → marquer comme `synth` (le kit utilisera la synthèse avec les shapes actuels)
3. On sauvegarde le shape actuel depuis `fx[trackId]` (les paramètres sDec, sTune, etc.)
4. On push dans `userKits` + `saveUserKits()`

```typescript
const saveCurrentAsKit = (name: string, icon: string) => {
  const samples: UserKit['samples'] = {};
  act.forEach(tid => {
    if (engine.buf[tid]) {
      samples[tid] = {
        type: 'blob',
        blob: bufferToBase64WAV(engine.buf[tid]),
        originalName: smpN[tid] || tid,
      };
    } else {
      samples[tid] = { type: 'synth' };
    }
  });
  // Capture current shape params
  const shape: Record<string, number> = {};
  const firstFx = fx[act[0]] || DEFAULT_FX;
  ['sDec','sTune','sPunch','sSnap','sBody','sTone'].forEach(k => {
    shape[k] = firstFx[k] ?? DEFAULT_FX[k];
  });
  const kit: UserKit = {
    id: `user_${Date.now()}`,
    name,
    icon,
    createdAt: Date.now(),
    samples,
    shape,
  };
  const updated = [...userKits, kit];
  setUserKits(updated);
  saveUserKits(updated);
};
```

---

## FEATURE 3 — Rename Kit

Dans le menu ⋮ d'un kit user :

```typescript
const renameKit = (kitId: string, newName: string) => {
  const updated = userKits.map(k => k.id === kitId ? { ...k, name: newName } : k);
  setUserKits(updated);
  saveUserKits(updated);
};
```

---

## FEATURE 4 — Load Kit (user)

```typescript
const loadUserKit = async (kit: UserKit) => {
  // Load each sample
  for (const [tid, info] of Object.entries(kit.samples)) {
    if (info.type === 'blob' && info.blob) {
      // Decode base64 → ArrayBuffer → AudioBuffer
      const binary = atob(info.blob);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ab = bytes.buffer;
      try {
        const audioBuf = await engine.ctx!.decodeAudioData(ab.slice(0));
        engine.loadBuffer(tid, audioBuf);
        setSmpN(prev => ({ ...prev, [tid]: info.originalName || 'User sample' }));
      } catch (e) { console.warn('Failed to load sample', tid, e); }
    } else if (info.type === 'url' && info.url) {
      await engine.loadUrl(tid, info.url);
      setSmpN(prev => ({ ...prev, [tid]: info.originalName || tid }));
    } else {
      // Synth — clear buffer so synthesis plays
      delete engine.buf[tid];
      setSmpN(prev => { const n = { ...prev }; delete n[tid]; return n; });
    }
  }
  // Apply shape
  const nextFx = { ...fx };
  Object.keys(nextFx).forEach(tid => {
    nextFx[tid] = { ...nextFx[tid], ...kit.shape };
    engine.uFx(tid, nextFx[tid]);
  });
  setFx(nextFx);
  setShowKitBrowser(false);
};
```

---

## FEATURE 5 — Compose Kit (Sample Bank Browser)

### UI

```
[PANNEAU COMPOSE KIT]
│
├── En haut : 8 slots = les 8 pistes possibles (kick, snare, hihat, clap, tom, ride, crash, perc)
│   Chaque slot montre : [icône piste] [nom du sample choisi ou "vide"]
│   Clic sur un slot = sélectionne cette piste pour navigation
│
├── Au milieu : Sample Browser par catégorie
│   Onglets : KICK | SNARE | HIHAT | CLAP | TOM | RIDE | CRASH | PERC
│   (l'onglet actif correspond à la piste sélectionnée)
│   
│   Liste scrollable de samples :
│   ├── Factory samples (depuis les kits prédéfinis)
│   ├── User samples (enregistrés ou importés)
│   └── Chaque sample : [▶ preview] [nom] [source tag]
│       Clic sur ▶ = joue le sample sans l'assigner
│       Clic sur le nom = assigne au slot sélectionné
│
└── Bouton "✓ SAVE AS KIT" (quand au moins 2 slots sont remplis)
```

### Sample Bank Construction

La banque se construit automatiquement à partir de :

1. **Factory samples** — extraits des `DRUM_KITS` :
```typescript
const buildSampleBank = (): SampleBankEntry[] => {
  const bank: SampleBankEntry[] = [];
  DRUM_KITS.forEach(kit => {
    Object.entries(kit.samples).forEach(([tid, url]) => {
      if (url) {
        bank.push({
          id: `factory_${kit.id}_${tid}`,
          name: `${kit.name} — ${tid}`,
          category: tid as SampleBankEntry['category'],
          source: 'factory',
          url: url as string,
        });
      }
    });
  });
  return bank;
};
```

2. **User samples** — extraits des kits sauvegardés + samples enregistrés :
```typescript
// Ajouter les samples des kits user
userKits.forEach(kit => {
  Object.entries(kit.samples).forEach(([tid, info]) => {
    if (info.type === 'blob' && info.blob) {
      bank.push({
        id: `user_${kit.id}_${tid}`,
        name: `${kit.name} — ${info.originalName || tid}`,
        category: tid as SampleBankEntry['category'],
        source: 'user',
        blob: info.blob,
      });
    }
  });
});
```

3. **Recorded samples** — sauvegardés via le SampleLoaderModal :
```typescript
// Nouveau state pour la banque de samples enregistrés
const [recordedSamples, setRecordedSamples] = useState<SampleBankEntry[]>(() => {
  try { return JSON.parse(localStorage.getItem('ks_recorded_samples') || '[]'); } catch { return []; }
});
```

### Preview dans le browser

```typescript
const previewSample = async (entry: SampleBankEntry) => {
  engine.init();
  if (entry.url) {
    // Factory — fetch et play
    const resp = await fetch(entry.url);
    const ab = await resp.arrayBuffer();
    const buf = await engine.ctx!.decodeAudioData(ab);
    const src = engine.ctx!.createBufferSource();
    src.buffer = buf;
    src.connect(engine.mg);
    src.start();
  } else if (entry.blob) {
    // User — decode base64 et play
    const binary = atob(entry.blob);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const buf = await engine.ctx!.decodeAudioData(bytes.buffer.slice(0));
    const src = engine.ctx!.createBufferSource();
    src.buffer = buf;
    src.connect(engine.mg);
    src.start();
  }
};
```

---

## FEATURE 6 — UI améliorée (style Flip/Koala)

### Kit Browser — grille de cartes visuelles

Chaque carte de kit :
```tsx
<div style={{
  padding: 12, borderRadius: 12,
  border: `2px solid ${isActive ? '#FF9500' : th.sBorder}`,
  background: isActive ? 'rgba(255,149,0,0.08)' : th.surface,
  cursor: 'pointer', textAlign: 'center',
  transition: 'all 0.15s',
}}>
  <div style={{ fontSize: 28, marginBottom: 4 }}>{kit.icon}</div>
  <div style={{ fontSize: 10, fontWeight: 700, color: isActive ? '#FF9500' : th.text }}>{kit.name}</div>
  <div style={{ fontSize: 7, color: th.dim, marginTop: 2 }}>
    {Object.values(kit.samples).filter(s => s).length} samples
  </div>
  {kit.type === 'user' && (
    <div style={{ fontSize: 7, color: th.faint, marginTop: 2 }}>
      {new Date(kit.createdAt).toLocaleDateString()}
    </div>
  )}
</div>
```

### Emoji picker pour l'icône du kit

Grille simple d'émojis percussion/musique :
```typescript
const KIT_EMOJIS = ['🥁', '🔴', '🎷', '📼', '⚡', '🌍', '🔥', '🎹', '🎸', '🎺', '🎵', '🎶', '💥', '🔊', '🎤', '⭐'];
```

### Sample category tabs

Onglets colorés correspondant aux couleurs des pistes :
```typescript
const CATEGORY_COLORS: Record<string, string> = {
  kick: '#FF2D55', snare: '#FF9500', hihat: '#30D158', clap: '#5E5CE6',
  tom: '#FF375F', ride: '#64D2FF', crash: '#FFD60A', perc: '#BF5AF2',
};
```

---

## RÉSUMÉ DES FICHIERS

| Fichier | Action | Risque |
|---------|--------|--------|
| `src/components/KitBrowser.tsx` | **NOUVEAU** | Aucun |
| `src/components/KitComposer.tsx` | **NOUVEAU** | Aucun |
| `src/KickAndSnare.tsx` header | Remplacer sélecteur ◀▶ par bouton ouvrant KitBrowser | Moyen |
| `src/KickAndSnare.tsx` states | Ajouter ~4 states | Faible |
| `src/KickAndSnare.tsx` fonctions | Ajouter saveCurrentAsKit, loadUserKit, renameKit, deleteKit | Faible |
| `src/hooks/useAppState.ts` | Optionnel : ajouter `lastKitId` pour persistance | Faible |

---

## PIÈGES À ÉVITER

1. **localStorage quota** — les AudioBuffers en base64 sont GROS (~100KB-500KB par sample). 8 kits × 8 pistes = potentiellement 32MB. `localStorage` a une limite de ~5-10MB. Solution : limiter à 4-6 kits user, ou utiliser IndexedDB pour les blobs (plus complexe mais illimité)
2. **`decodeAudioData` consume le buffer** — toujours faire `.slice(0)` avant de décoder un ArrayBuffer depuis base64
3. **Le sélecteur ◀▶ actuel** est utilisé par les templates (`applyKit` dans `loadTpl`). Le KitBrowser doit aussi exposer `applyKit` pour que les templates fonctionnent toujours
4. **Preview audio leak** — si l'utilisateur clique rapidement sur plusieurs previews, les sons se superposent. Garder une ref au dernier `BufferSourceNode` et l'arrêter avant d'en lancer un nouveau
5. **Race condition au chargement** — `loadUrl` est async. Si l'utilisateur change de kit pendant le chargement, les samples du kit précédent peuvent arriver après. Utiliser un `loadId` incrémental et ignorer les résultats périmés
6. **Factory kits = read-only** — ne jamais modifier `DRUM_KITS`. Les user kits sont une liste séparée

---

## TEST CHECKLIST

- [ ] Le bouton kit dans le header ouvre le KitBrowser
- [ ] Les 8 kits factory s'affichent en grille
- [ ] Cliquer un kit factory le charge (samples + shape)
- [ ] "SAVE CURRENT AS KIT" ouvre le dialog nom + icône
- [ ] Le kit sauvegardé apparaît dans "MY KITS"
- [ ] Le kit sauvegardé persiste après refresh (localStorage)
- [ ] Renommer un kit user fonctionne
- [ ] Supprimer un kit user fonctionne
- [ ] Charger un kit user restaure les samples et shapes
- [ ] "COMPOSE KIT" ouvre le compositeur
- [ ] Les onglets catégorie montrent les bons samples
- [ ] Preview joue le sample sans l'assigner
- [ ] Assigner un sample au slot fonctionne
- [ ] "SAVE AS KIT" depuis le compositeur crée un nouveau kit
- [ ] Templates continuent de fonctionner (applyKit intact)
- [ ] Mobile : tout accessible au touch
- [ ] Build TypeScript : sans erreur

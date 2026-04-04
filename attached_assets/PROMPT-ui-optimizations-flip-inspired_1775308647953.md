# PROMPT REPLIT — Optimisations UI inspirées de Flip Sampler

## CONTEXTE PRÉALABLE

Voici une proposition de prompt pour implémenter 3 améliorations UI/UX inspirées de l'analyse de Flip Sampler, Koala et des meilleures apps de beat-making mobile. Analyse le et vérifie que cela est cohérent avec notre projet. Vérifie les faiblesses éventuelles et propose des actions correctives avant d'exécuter.

---

## OBJECTIF

Implémenter 3 améliorations UI/UX dans Kick & Snare :

1. **Bottom navigation bar** — déplacer les onglets de vue (LIVE PADS, SEQUENCER, EUCLIDIAN) en barre fixe en bas de l'écran
2. **Performance FX mode** — fills + filter sweep + stutter en live sur les pads
3. **Mini waveform** — aperçu visuel du sample chargé dans le bouton ♪

## RÈGLES ABSOLUES

- **Ne JAMAIS modifier** la classe `Eng` (Audio Engine) sauf pour ajouter des méthodes utilitaires
- **Ne JAMAIS modifier** le scheduler `schLoop`
- **Ne JAMAIS supprimer** de fonctionnalité existante
- Tester en mobile et desktop
- Compatibilité touch events
- Build TypeScript sans erreur

---

# FEATURE 1 — Bottom Navigation Bar

## Contexte

Actuellement les onglets LIVE PADS / SEQUENCER / EUCLIDIAN sont dans le header (lignes ~3199-3207). Sur mobile, c'est difficile d'accès avec le pouce. Flip et Koala mettent la navigation en bas.

## Spécification

### Ce qui bouge en bas
- Les 3 boutons de vue : LIVE PADS, SEQUENCER, EUCLIDIAN
- Style : barre fixe en bas, pleine largeur, fond solide avec border-top subtile

### Ce qui reste en haut
- Logo "Kick & Snare" + batteur animé
- TransportBar (play/stop, BPM, swing, metro)
- Boutons tutorial/info

### Implémentation

1. **Supprimer** les boutons de vue de leur position actuelle (lignes ~3199-3207)

2. **Ajouter** une barre fixe en bas, APRÈS la fermeture du dernier `</div>` du contenu scrollable mais AVANT le `</div>` racine :

```tsx
{/* ── Bottom Navigation ── */}
<div style={{
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 100,
  display: 'flex',
  justifyContent: 'center',
  gap: 0,
  padding: '0',
  background: th.bg.includes('gradient') ? '#0F0F0F' : th.bg, // solid color, not gradient
  borderTop: `1px solid ${th.sBorder}`,
  // Safe area for iPhone notch
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
}}>
  {[
    { id: 'pads', label: 'PADS', icon: '⊞', color: '#5E5CE6' },
    { id: 'sequencer', label: 'SEQUENCER', icon: '▦', color: '#FF2D55' },
    { id: 'euclid', label: 'EUCLID', icon: '⬡', color: '#FFD60A' },
  ].map(tab => (
    <button
      key={tab.id}
      onClick={() => {
        if (tab.id === 'pads') { switchView('pads'); setShowLooper(false); clearFreeCapture(); }
        else if (view !== tab.id) switchView(tab.id);
      }}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '10px 4px 8px',
        border: 'none',
        background: view === tab.id ? `${tab.color}15` : 'transparent',
        color: view === tab.id ? tab.color : th.dim,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: '0.06em',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textTransform: 'uppercase',
        transition: 'all 0.15s',
        borderTop: view === tab.id ? `2px solid ${tab.color}` : '2px solid transparent',
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{tab.icon}</span>
      <span>{tab.label}</span>
    </button>
  ))}
</div>
```

3. **Ajouter du padding-bottom** au contenu scrollable pour éviter que la barre cache le bas :

```tsx
// Sur le div principal de contenu (celui avec maxWidth:960)
style={{ ..., paddingBottom: 70 }}  // hauteur de la bottom bar + marge
```

4. **Préserver les data-hint** des boutons existants — copier les tooltips.

### Points d'attention
- La barre doit être au-dessus du contenu (z-index:100)
- `env(safe-area-inset-bottom)` est crucial pour les iPhone avec barre virtuelle
- Le fond doit être SOLIDE (pas le gradient du thème) sinon le contenu scrollé est visible derrière
- Sur desktop large, la barre peut être limitée en largeur (max-width:960, centré)

---

# FEATURE 2 — Performance FX Mode (Live Pads)

## Contexte

Flip offre des features de performance en live : fills instantanés, filter sweep, stutter. Notre app a déjà un filtre global (`engine.gFlt`, `engine.gFlt2`) avec LFO (`engine.gFltLfo`, `engine.gFltLfoDepth`) dans le moteur audio. On va les exploiter.

## Spécification

### Nouveaux contrôles dans la vue LIVE PADS

Ajouter une barre "PERFORM" entre les pads et le looper. 3 effets tactiles :

#### A. Filter Sweep (XY Pad)
- Un rectangle touch de ~200×80px 
- Axe X = cutoff (20Hz à gauche → 20000Hz à droite)
- Axe Y = resonance (0 en bas → 25 en haut)
- Quand le doigt est posé, le filtre global s'active
- Quand le doigt est relevé, le filtre revient à 20000Hz (ouvert) en 200ms
- Utilise `engine.gFlt.frequency.setTargetAtTime()` et `engine.gFlt.Q.setTargetAtTime()`
- Affiche un point/crosshair à la position du doigt
- Colorer le fond selon la position (bleu→rouge de gauche à droite)

#### B. Stutter / Repeat
- Un bouton "STUTTER" maintenu = repeat le dernier son joué en boucle rapide
- Divisions configurables : 1/4, 1/8, 1/16, 1/32
- Implémentation : quand maintenu, lancer un `setInterval` qui appelle `engine.play(lastTriggeredTrack, ...)` à la division choisie
- Relâcher = stop le repeat immédiatement
- Afficher la division active à côté du bouton

#### C. Fill (note repeat sur tous les tracks actifs)
- Un bouton "FILL" qui, maintenu, joue un roulement accéléré
- Commence à 1/8 et accélère vers 1/32 sur 2 beats
- Joue le kick + snare en alternance (ou le dernier pad touché)
- Relâcher = retour au pattern normal

### Implémentation

1. **Nouveau state** :
```typescript
const [showPerform, setShowPerform] = useState(false);
const [perfFilterPos, setPerfFilterPos] = useState<{x:number,y:number}|null>(null);
const [stutterDiv, setStutterDiv] = useState<string>('1/8');
const stutterRef = useRef<any>(null);
const lastTrigRef = useRef<string>('kick');
```

2. **Composant PerformBar** (inline, pas un fichier séparé, pour simplifier) :
- Toggle via un bouton "🎛 PERFORM" dans la barre Live Pads
- Quand ouvert, affiche les 3 contrôles horizontalement
- Quand fermé, rien ne change

3. **Filter XY Pad** — event handlers :
```typescript
const onFilterTouch = (e: React.TouchEvent | React.PointerEvent) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const update = (clientX: number, clientY: number) => {
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    const freq = 20 * Math.pow(1000, x); // log scale 20-20000
    const q = y * 25;
    const t = engine.ctx.currentTime;
    engine.gFlt.frequency.setTargetAtTime(freq, t, 0.01);
    engine.gFlt.Q.setTargetAtTime(q, t, 0.01);
    engine.gFlt2.frequency.setTargetAtTime(freq, t, 0.01);
    engine.gFlt2.Q.setTargetAtTime(q, t, 0.01);
    setPerfFilterPos({ x, y });
  };
  // ... pointer capture + move + release (release → reset filter to 20000Hz)
};
```

4. **Stutter** — maintenu :
```typescript
const startStutter = () => {
  const divMs = divToMs(stutterDiv, bpm);
  const tid = lastTrigRef.current;
  stutterRef.current = setInterval(() => {
    engine.play(tid, 0.8, 0, R.fx[tid] || DEFAULT_FX);
  }, divMs);
};
const stopStutter = () => {
  if (stutterRef.current) { clearInterval(stutterRef.current); stutterRef.current = null; }
};
const divToMs = (div: string, bpm: number) => {
  const beat = 60000 / bpm;
  const map: Record<string,number> = { '1/4': beat, '1/8': beat/2, '1/16': beat/4, '1/32': beat/8 };
  return map[div] || beat/2;
};
```

5. **Mettre à jour `lastTrigRef`** dans `trigPad` :
```typescript
// Dans trigPad, après engine.play :
lastTrigRef.current = tid;
```

### Points d'attention
- Le filter sweep utilise les nœuds GLOBAUX `gFlt`/`gFlt2` qui existent déjà — pas besoin de créer de nouveaux nœuds
- Au release du filter, TOUJOURS ramener à 20000Hz avec un `setTargetAtTime` progressif (0.2s) pour éviter les clicks
- Le stutter utilise `setInterval` (pas le scheduler) car c'est un effet de performance, pas du séquençage
- Le fill doit s'arrêter immédiatement au release — pas de traînée
- Touch events : utiliser `onPointerDown` + `setPointerCapture` pour le filter pad (fonctionne mobile+desktop)

---

# FEATURE 3 — Mini Waveform dans le bouton ♪

## Contexte

Quand un sample est chargé, le bouton ♪ passe en orange mais ne montre rien visuellement. Flip affiche la waveform. On va dessiner un mini aperçu.

## Spécification

### Rendu
- Le bouton ♪ (20×20px actuellement) est remplacé par un bouton légèrement plus large (32×20px)
- Si un sample est chargé (`engine.buf[track.id]` existe), dessiner la waveform miniature en fond
- La waveform est un simple path SVG de la forme d'onde, dessiné dans un mini SVG inline
- Couleur de la waveform = couleur de la piste, opacité 0.5
- Le texte "♪" reste superposé au centre

### Implémentation

1. **Fonction utilitaire** pour générer un path SVG à partir d'un AudioBuffer :

```typescript
function miniWaveformPath(buffer: AudioBuffer, width: number, height: number): string {
  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  let path = '';
  for (let x = 0; x < width; x++) {
    let min = 1, max = -1;
    const start = Math.floor(x * step);
    for (let j = 0; j < step && start + j < data.length; j++) {
      const v = data[start + j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const yMin = ((1 + min) / 2) * height;
    const yMax = ((1 + max) / 2) * height;
    path += `M${x},${yMin}L${x},${yMax}`;
  }
  return path;
}
```

2. **Cache des waveforms** pour éviter de recalculer à chaque render :

```typescript
const [waveformCache, setWaveformCache] = useState<Record<string, string>>({});

// Mettre à jour le cache quand un sample est chargé
// Dans onSampleFile / onSampleBuffer / onFile / loadUrl callbacks :
if (engine.buf[tid]) {
  const path = miniWaveformPath(engine.buf[tid], 28, 16);
  setWaveformCache(prev => ({ ...prev, [tid]: path }));
}
```

3. **Rendu dans le bouton ♪** (modifier TrackRow.jsx et la section Euclidean) :

```tsx
<button onClick={onLoadSample} style={{ ...btnSt, width: 32, position: 'relative', overflow: 'hidden' }}>
  {waveformPath && (
    <svg viewBox="0 0 28 16" width="28" height="16" 
      style={{ position: 'absolute', inset: 0, margin: 'auto', opacity: 0.4, pointerEvents: 'none' }}>
      <path d={waveformPath} stroke={trackColor} strokeWidth="1" fill="none" />
    </svg>
  )}
  <span style={{ position: 'relative', zIndex: 1 }}>♪</span>
</button>
```

4. **Passer le waveformPath comme prop** aux composants qui affichent le bouton ♪ :
- `TrackRow.jsx` — ajouter prop `waveformPath?: string`
- Section euclidienne inline — accéder à `waveformCache[tr.id]`
- Live Pads — optionnel (les pads n'ont pas de ♪ direct)

### Points d'attention
- `miniWaveformPath` est appelée UNIQUEMENT quand un sample change, pas à chaque render
- Le path SVG est une string stockée dans le state — léger et rapide à render
- Ne pas accéder à `engine.buf[id]` dans le render — c'est un objet mutable hors React. Calculer le path dans le callback de chargement et le stocker dans le state
- Le SVG viewBox 28×16 = le contenu du bouton 32×20 moins les paddings
- Sur les pistes sans sample chargé, le bouton reste identique (juste "♪")

---

# RÉSUMÉ DES MODIFICATIONS

| Fichier | Modification | Risque |
|---------|-------------|--------|
| `KickAndSnare.tsx` ~3199-3207 | Supprimer nav buttons de leur position actuelle | Moyen — bien vérifier que switchView fonctionne |
| `KickAndSnare.tsx` fin du JSX | Ajouter bottom nav bar | Faible |
| `KickAndSnare.tsx` div contenu | Ajouter paddingBottom:70 | Faible |
| `KickAndSnare.tsx` vue pads | Ajouter PerformBar inline | Moyen — toucher aux nœuds gFlt |
| `KickAndSnare.tsx` states | Ajouter ~6 states + refs | Faible |
| `KickAndSnare.tsx` trigPad | Ajouter lastTrigRef.current = tid | Aucun |
| `TrackRow.jsx` | Ajouter prop waveformPath + SVG | Faible |
| `KickAndSnare.tsx` onFile/etc | Calculer et stocker waveform path | Faible |

---

# PIÈGES À ÉVITER

1. **Bottom bar + clavier mobile** : sur iOS, la barre fixe en bas peut monter avec le clavier virtuel. Ajouter une détection : si un input est focused, cacher la barre bottom
2. **Filter sweep release** : TOUJOURS ramener progressivement le filtre à 20kHz (pas un saut brutal). Utiliser `setTargetAtTime(20000, t, 0.2)` — le 0.2 = time constant de 200ms
3. **Stutter setInterval** : `clearInterval` dans un `useEffect cleanup` pour éviter les fuites mémoire si le composant se démonte pendant un stutter
4. **Waveform cache stale** : si on recharge un sample sur la même piste, bien écraser l'entrée dans le cache
5. **Performance** : le miniWaveformPath fait une boucle sur tout l'AudioBuffer (potentiellement 1M+ samples). C'est OK car c'est appelé une seule fois par chargement, mais si ça lag sur mobile, réduire la précision en augmentant le `step`
6. **z-index bottom bar** : vérifier qu'elle ne cache pas les modales (SampleLoaderModal est à z-index:9999, c'est bon)
7. **Safe area iOS** : `env(safe-area-inset-bottom)` nécessite `<meta name="viewport" content="viewport-fit=cover">` dans le HTML

---

# TEST CHECKLIST

- [ ] Bottom nav : les 3 onglets sont en bas, fixés pendant le scroll
- [ ] Bottom nav : l'onglet actif est visuellement distinct (couleur + trait supérieur)
- [ ] Bottom nav : cliquer change de vue correctement
- [ ] Bottom nav : le contenu ne passe pas sous la barre
- [ ] Bottom nav : sur iPhone avec barre home virtuelle, la nav ne chevauche pas
- [ ] Header simplifié : plus de boutons de vue en haut
- [ ] PERFORM : le bouton toggle apparaît dans Live Pads
- [ ] Filter XY : le doigt posé applique le filtre en temps réel
- [ ] Filter XY : relâcher ramène progressivement le son normal
- [ ] Stutter : maintenir joue le repeat, relâcher stop immédiat
- [ ] Stutter : la division change avec les boutons 1/4, 1/8, 1/16, 1/32
- [ ] Fill : maintenir joue un roulement accéléré
- [ ] Waveform : le bouton ♪ montre la forme d'onde quand un sample est chargé
- [ ] Waveform : charger un nouveau sample met à jour la waveform
- [ ] Waveform : pas de lag au rendu
- [ ] Mobile : tout fonctionne au touch
- [ ] Build : `npx tsc --noEmit` passe sans erreur

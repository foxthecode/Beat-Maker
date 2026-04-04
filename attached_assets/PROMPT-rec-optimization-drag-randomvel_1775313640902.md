# PROMPT REPLIT — Désactiver Looper + Optimiser REC + Drag Fill + Random Velocity + REC en Live Pads

## MESSAGE PRÉALABLE

Ce prompt contient 5 modifications ciblées autour du workflow d'enregistrement et d'édition des steps. Avant d'exécuter :

1. **Analyse le code actuel** — les lignes référencées sont indicatives
2. **Vérifie que la désactivation du looper ne casse rien** — grepper toutes les refs à loopRec, loopRef, showLooper, LooperPanel, freeCapture dans le code
3. **Propose des corrections** si tu trouves des dépendances oubliées
4. **Exécute dans l'ordre** : A → E → B → C → D
5. **Teste après chaque étape**

---

# A — Désactiver le Looper (garder le code en commentaire)

## Objectif
Masquer complètement le looper de l'UI et désactiver sa logique, SANS supprimer le code. On le met en sommeil pour un développement futur.

## Étapes

### A1. Masquer l'UI du Looper dans la vue PADS

Rechercher le bloc `{/* ── Looper banner (foldable) ── */}` dans la vue pads (vers ligne ~3444). Envelopper TOUT le bloc looper (du commentaire jusqu'à la fermeture de son `</div>`) dans une condition `false &&` :

```tsx
{/* LOOPER DISABLED — conservé pour développement futur */}
{false && (
  // ... tout le bloc looper existant reste ici, intact mais jamais rendu ...
)}
```

### A2. Désactiver la logique looper dans trigPad

Rechercher dans `trigPad` le bloc `if(R.loopRec && loopRef.current.audioStart !== null && engine.ctx)` (vers ligne ~1851). Commenter le bloc entier :

```typescript
// LOOPER DISABLED — conservé pour développement futur
// if(R.loopRec && loopRef.current.audioStart !== null && engine.ctx) {
//   ... tout le bloc ...
// }
```

### A3. Désactiver le free-capture BPM

Rechercher le bloc `if(R.uiView==='pads' && !R.loopRec && engine.ctx)` (vers ligne ~1875). Commenter :

```typescript
// FREE-CAPTURE BPM DISABLED — conservé pour développement futur
// if(R.uiView==='pads' && !R.loopRec && engine.ctx) {
//   ... tout le bloc ...
// }
```

### A4. Garder les imports et states

NE PAS supprimer :
- `import LooperPanel` (juste inutilisé — pas d'erreur TypeScript, juste un warning)
- Les states `showLooper`, `loopRec`, `loopPlaying`, etc. (inutilisés mais pas de crash)
- `loopRef` et les fonctions looper (mortes mais disponibles)

Si TypeScript se plaint de variables inutilisées, ajouter `// @ts-ignore` ou `// eslint-disable-next-line` au-dessus des imports inutilisés.

### A5. Nettoyer les refs dans R

Dans le bloc qui assigne les refs mutables à `R` (vers ligne ~1694-1699), commenter les lignes looper :

```typescript
// R.loopRec = loopRec;      // LOOPER DISABLED
// R.loopBars = loopBars;    // LOOPER DISABLED
```

**Vérifier** que le scheduler ne lit pas `R.loopRec` pour une condition critique. Si oui, assigner `R.loopRec = false;` au lieu de commenter.

---

# E — Bouton REC visible en vue Live Pads (contrôle le dernier séquenceur)

## Problème actuel
Le bouton REC dans TransportBar est masqué quand `view === "euclid"` (ligne ~138 de TransportBar.jsx). En vue PADS, il est visible mais le looper avait son propre système REC. Maintenant que le looper est désactivé, le bouton REC du transport doit fonctionner dans TOUTES les vues et TOUJOURS contrôler le séquenceur (pas le looper).

## Modification

### E1. TransportBar : rendre le REC visible dans toutes les vues

Dans `TransportBar.jsx`, rechercher :
```typescript
const RecBtn = view !== "euclid" && (
```

Remplacer par :
```typescript
const RecBtn = (
```

Le REC est maintenant visible partout (sequencer, euclid, pads).

### E2. Le REC enregistre dans le dernier séquenceur sélectionné

Ajouter un state pour mémoriser quel mode séquenceur était actif en dernier :

```typescript
const [lastSeqView, setLastSeqView] = useState<'sequencer' | 'euclid'>('sequencer');
```

Mettre à jour quand l'utilisateur change de vue :
```typescript
// Dans switchView ou là où view change :
if (newView === 'sequencer' || newView === 'euclid') {
  setLastSeqView(newView as 'sequencer' | 'euclid');
}
```

### E3. trigPad utilise `lastSeqView` pour savoir où écrire

Le bloc dans trigPad qui écrit dans le pattern (ligne ~1904) utilise `R.view` pour décider entre séquenceur et euclidien. Modifier pour utiliser `lastSeqView` quand on est en vue pads :

```typescript
// Dans trigPad, remplacer R.view par R.lastSeqView quand en pads
const effectiveView = R.uiView === 'pads' ? R.lastSeqView : R.uiView;
```

Assigner dans le bloc R :
```typescript
R.lastSeqView = lastSeqView;
```

### E4. Feedback visuel en vue pads

Quand REC est actif en vue pads, afficher un indicateur subtil qui montre dans quel séquenceur on enregistre :

```tsx
{/* En vue pads, si REC actif, montrer où ça enregistre */}
{view === 'pads' && rec && (
  <div style={{
    padding: '3px 10px', borderRadius: 6, marginBottom: 6,
    background: 'rgba(255,45,85,0.06)', border: '1px solid rgba(255,45,85,0.2)',
    fontSize: 8, fontWeight: 700, color: '#FF2D55', textAlign: 'center',
    letterSpacing: '0.06em', animation: 'rb 0.8s infinite',
  }}>
    ● REC → {lastSeqView === 'euclid' ? 'EUCLIDIAN' : 'SEQUENCER'} (P{cPat + 1})
  </div>
)}
```

---

# B — REC Pads toujours accessibles dans le séquenceur

## Problème actuel
Les mini REC pads n'apparaissent que quand `rec && playing` sont true. L'utilisateur doit activer REC, puis Play, puis les pads pop. C'est 2 clics de trop et c'est déroutant.

## Proposition
Les REC pads sont **toujours visibles** au-dessus du step grid quand on est en vue séquenceur. Ils ne déclenchent l'écriture dans le pattern QUE si `rec && playing`, mais ils jouent toujours le son (comme les Live Pads).

### B1. Modifier la condition d'affichage

Rechercher `{recPadsVisible && (` (vers ligne ~3347).

Remplacer :
```tsx
{recPadsVisible && (
  <div style={{...opacity:rec&&playing?1:0,transition:"opacity 0.15s",pointerEvents:rec&&playing?"auto":"none"}}>
```

Par :
```tsx
{/* REC Pads — toujours visibles en vue séquenceur */}
{view === "sequencer" && (
  <div style={{
    marginBottom: 6, padding: "5px 8px", borderRadius: 8,
    background: rec && playing ? "rgba(255,45,85,0.06)" : th.surface,
    border: `1px solid ${rec && playing ? "rgba(255,45,85,0.25)" : th.sBorder}`,
    display: "flex", alignItems: "center", gap: 5,
    transition: "all 0.2s",
  }}>
    {/* REC indicator — visible seulement en mode REC */}
    {rec && playing ? (
      <span style={{ fontSize: 7, fontWeight: 800, color: "#FF2D55", letterSpacing: "0.1em", animation: "rb 0.8s infinite", flexShrink: 0 }}>● REC</span>
    ) : (
      <span style={{ fontSize: 7, fontWeight: 800, color: th.dim, letterSpacing: "0.1em", flexShrink: 0 }}>♫ TAP</span>
    )}
    <div style={{ display: "flex", gap: 4, flex: 1 }}>
      {atO.map(tr => (
        <button key={tr.id}
          onTouchStart={e => { e.preventDefault(); trigPad(tr.id, 110/127); }}
          onPointerDown={e => { if (e.pointerType === "touch") return; e.preventDefault(); trigPad(tr.id, 1); }}
          style={{
            flex: 1, height: 40, borderRadius: 6,
            background: flashing.has(tr.id) ? tr.color + "44" : tr.color + "0d",
            border: `1.5px solid ${flashing.has(tr.id) ? tr.color : tr.color + "2a"}`,
            color: tr.color, cursor: "pointer", fontFamily: "inherit",
            fontSize: 7, fontWeight: 800, letterSpacing: "0.05em",
            touchAction: "none", userSelect: "none", WebkitTapHighlightColor: "transparent",
            boxShadow: flashing.has(tr.id) ? `0 0 12px ${tr.color}44` : "none",
            transition: "all 0.06s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
          }}
        >
          <DrumSVG id={tr.id} color={tr.color} hit={flashing.has(tr.id)} sz={10}/>
          <span>{tr.label}</span>
        </button>
      ))}
    </div>
  </div>
)}
```

### B2. Supprimer l'ancienne logique `recPadsVisible`

Le state `recPadsVisible` et son `useEffect` (lignes ~1431, ~1562-1566) ne sont plus nécessaires. Les commenter :

```typescript
// const [recPadsVisible, setRecPadsVisible] = useState(false);
// useEffect(() => { ... }, [rec, playing]);  // DISABLED — pads always visible
```

### Comportement résultat

| État | Pads visibles | Son | Écriture pattern |
|------|--------------|-----|-----------------|
| Ni REC ni Play | ✅ (fond neutre, label "♫ TAP") | ✅ (preview son) | ❌ |
| Play sans REC | ✅ (fond neutre) | ✅ | ❌ |
| REC + Play | ✅ (fond rouge, "● REC") | ✅ | ✅ (écrit dans le pattern) |

---

# C — Drag horizontal pour remplir des steps

## Problème actuel
Le drag horizontal sur un step ACTIF modifie le nudge. Sur un step INACTIF, le pointeur est capturé par le premier step mais les steps voisins ne sont pas activés. Il faut cliquer un par un pour remplir une série de hi-hats.

## Proposition
Quand le drag commence sur un step INACTIF et se déplace horizontalement, chaque step traversé est activé (peint). C'est le mode "paint" classique des DAWs (FL Studio, Ableton).

### C1. Modifier `startDrag` pour détecter le mode paint

Dans la fonction `startDrag` (vers ligne ~2855), ajouter un mode paint quand le step initial est inactif ET que le drag est horizontal :

Ajouter au début de `startDrag`, après `const ac = !!pat[tid]?.[step];` :

```typescript
// PAINT MODE: drag horizontal on inactive step → fill consecutive steps
if (!ac) {
  // Step was already toggled ON at pointer-down (toggledEarly)
  // Now track horizontal movement to paint neighboring steps
  let lastPaintedStep = step;
  const paintMv = (ev: PointerEvent) => {
    // Calculate which step the pointer is over
    const stepEls = el.parentElement?.querySelectorAll('[data-step]');
    if (!stepEls) return;
    for (const stepEl of stepEls) {
      const r = stepEl.getBoundingClientRect();
      if (ev.clientX >= r.left && ev.clientX <= r.right) {
        const s = parseInt(stepEl.getAttribute('data-step') || '-1');
        if (s >= 0 && s !== lastPaintedStep && !pat[tid]?.[s]) {
          // Paint this step ON
          setPat(p => { const r = [...(p[tid] || [])]; r[s] = 1; return { ...p, [tid]: r }; });
          setStVel(p => { const n = { ...p }; const a = Array.isArray(n[tid]) ? [...n[tid]] : Array(STEPS).fill(100); a[s] = 100; n[tid] = a; return n; });
          lastPaintedStep = s;
          didDragRef.current = true;
        }
        break;
      }
    }
  };
  const paintUp = () => {
    el.removeEventListener('pointermove', paintMv);
    el.removeEventListener('pointerup', paintUp);
    el.removeEventListener('pointercancel', paintUp);
  };
  el.addEventListener('pointermove', paintMv);
  el.addEventListener('pointerup', paintUp, { once: true });
  el.addEventListener('pointercancel', paintUp, { once: true });
  return; // Skip the normal drag logic (nudge/velocity)
}
```

### C2. S'assurer que les step elements ont `data-step`

Vérifier dans `TrackRow.jsx` que chaque cellule de step a un attribut `data-step={stepIndex}`. C'est nécessaire pour que le paint mode puisse identifier quel step est sous le pointeur.

Rechercher le rendu des steps dans TrackRow. Si l'attribut n'existe pas, l'ajouter :
```tsx
<div data-step={stepIndex} ... >
```

### C3. Effacement par paint aussi

Si le drag commence sur un step ACTIF et qu'aucun axis (nudge/velocity) n'est détecté après le threshold, passer en mode "erase paint" — chaque step traversé est désactivé. Pour ça, modifier la logique existante : dans le `up` handler, si `!moved && !longPressed && !toggledEarly`, au lieu de juste `handleClick(tid, step)`, vérifier si le drag a traversé d'autres steps.

**ATTENTION** : ne pas casser le nudge/velocity existant. Le mode paint ne s'active QUE si le step initial est inactif. Si le step initial est actif, le comportement reste identique (nudge/velocity/double-tap/long-press).

---

# D — Random velocity par track

## Proposition

Un bouton "🎲" par track dans la barre d'outils (à côté de mute/solo) qui randomise les vélocités des steps actifs dans une plage configurable.

### D1. Nouveau state

```typescript
const [velRange, setVelRange] = useState<{ min: number; max: number }>({ min: 40, max: 100 });
```

### D2. Fonction randomizeVelocity

```typescript
const randomizeVelocity = (tid: string) => {
  pushHistory(); // undo support
  setStVel(prev => {
    const n = { ...prev };
    const steps = pat[tid] || [];
    const a = Array.isArray(n[tid]) ? [...n[tid]] : Array(STEPS).fill(100);
    for (let i = 0; i < steps.length; i++) {
      if (steps[i]) {
        // Random entre velRange.min et velRange.max
        a[i] = Math.round(velRange.min + Math.random() * (velRange.max - velRange.min));
      }
    }
    n[tid] = a;
    return n;
  });
};
```

### D3. Bouton dans TrackRow

Ajouter un bouton 🎲 dans la barre de contrôle de chaque track (à côté du bouton MUTE, SOLO, ♪). Dans TrackRow.jsx, ajouter une prop `onRandomVel` et le bouton :

```tsx
{/* Random velocity button */}
<button
  onClick={() => onRandomVel(track.id)}
  title="Randomize velocity of active steps"
  style={{
    width: 24, height: 24, borderRadius: 6,
    border: `1px solid rgba(255,149,0,0.25)`,
    background: 'rgba(255,149,0,0.06)',
    color: '#FF9500', fontSize: 11,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}
>🎲</button>
```

### D4. Plage de vélocité configurable

Optionnel mais recommandé : un petit panneau (inline ou popover) qui permet de régler `velRange.min` et `velRange.max` avec deux sliders. Accessible via long-press sur le bouton 🎲.

```tsx
{/* Velocity range popover */}
{showVelRange && (
  <div style={{
    position: 'absolute', top: -60, right: 0, zIndex: 50,
    padding: '8px 12px', borderRadius: 8,
    background: th.bg, border: `1px solid ${th.sBorder}`,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    display: 'flex', gap: 8, alignItems: 'center', fontSize: 8, color: th.dim,
  }}>
    <label>Min {velRange.min}%
      <input type="range" min={5} max={95} value={velRange.min}
        onChange={e => setVelRange(p => ({ ...p, min: Math.min(+e.target.value, p.max - 5) }))}
        style={{ width: 60, height: 3, accentColor: '#FF9500' }} />
    </label>
    <label>Max {velRange.max}%
      <input type="range" min={10} max={100} value={velRange.max}
        onChange={e => setVelRange(p => ({ ...p, max: Math.max(+e.target.value, p.min + 5) }))}
        style={{ width: 60, height: 3, accentColor: '#FF9500' }} />
    </label>
  </div>
)}
```

### D5. Modes de randomisation supplémentaires (bonus)

En plus du full random, on peut ajouter des presets accessibles via double-tap sur 🎲 ou un menu :

```typescript
const VEL_PRESETS = {
  humanize: (base: number) => Math.round(base + (Math.random() - 0.5) * 20), // ±10 autour de la valeur actuelle
  accent4: (i: number) => i % 4 === 0 ? 100 : 60 + Math.round(Math.random() * 20), // accent every 4
  crescendo: (i: number, total: number) => Math.round(40 + (i / total) * 60), // 40→100 progressif
  decrescendo: (i: number, total: number) => Math.round(100 - (i / total) * 60), // 100→40 progressif
};
```

Implémentation :
- Tap = random dans la plage
- Double-tap = cycle les presets (humanize → accent4 → crescendo → decrescendo → random)

---

# PIÈGES À ÉVITER

1. **Looper désactivé — vérifier `R.loopRec`** : le scheduler peut lire `R.loopRec` quelque part. Si oui, mettre `R.loopRec = false;` explicitement plutôt que de commenter l'assignation
2. **Paint mode — ne pas casser nudge/velocity** : le paint ne s'active QUE sur les steps inactifs. Si le step est actif, le drag classique (nudge/velocity) reste intact
3. **Paint mode — `data-step` attribut** : vérifier que chaque cellule step a cet attribut. Sans lui, `stepEl.getAttribute('data-step')` retourne null et le paint ne fonctionne pas
4. **Random velocity — pushHistory** : appeler `pushHistory()` AVANT la randomisation pour que l'undo fonctionne
5. **Random velocity — pas sur les steps inactifs** : ne randomiser QUE les steps où `pat[tid][i]` est truthy
6. **REC pads toujours visibles — espace vertical** : avec 8 tracks + pads permanents, le séquenceur prend plus de place verticalement. Vérifier que ça ne déborde pas sur mobile

---

# TEST CHECKLIST

## A — Looper désactivé
- [ ] Aucun élément looper visible dans la vue PADS
- [ ] Pas de crash console lié au looper
- [ ] Le scheduler tourne normalement
- [ ] trigPad joue toujours les sons
- [ ] Le REC séquenceur fonctionne toujours

## B — REC pads permanents
- [ ] Les pads sont visibles au-dessus du séquenceur (même sans REC)
- [ ] Label "♫ TAP" quand pas en REC
- [ ] Label "● REC" + fond rouge quand REC + Play
- [ ] Tap pad = joue le son dans tous les cas
- [ ] Tap pad en REC + Play = écrit dans le pattern
- [ ] Pas de double-fire (touch + pointer)

## C — Drag paint
- [ ] Drag horizontal depuis un step vide → peint les steps traversés
- [ ] Les steps peints sont à velocity 100
- [ ] Relâcher termine le paint
- [ ] Drag sur un step actif = nudge/velocity comme avant (pas de régression)
- [ ] Mobile : le paint fonctionne au touch
- [ ] `data-step` présent sur chaque cellule

## D — Random velocity
- [ ] Bouton 🎲 visible par track
- [ ] Clic = randomise les vélocités des steps actifs
- [ ] Les steps inactifs ne sont pas affectés
- [ ] Undo ramène les vélocités précédentes
- [ ] Plage min/max respectée
- [ ] Long-press ouvre le popover de plage
- [ ] Mobile : tout accessible au touch
- [ ] Build TypeScript sans erreur

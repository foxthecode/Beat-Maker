# PROMPT REPLIT — Fix Euclid Ratés + Audit Code & Refactoring

## MESSAGE PRÉALABLE

Ce prompt contient 2 parties indépendantes. La **Partie 1** est urgente — elle corrige les ratés de lecture du mode Euclid. La **Partie 2** est un audit plus large avec des propositions d'amélioration structurelle.

Avant d'exécuter :
1. **Lis le diagnostic complet** avant de toucher au scheduler
2. **Vérifie chaque modification** avec un test audio (lancer un pattern euclid à 120 BPM, écouter 30 secondes, vérifier qu'il n'y a aucun raté)
3. **Exécute la Partie 1 d'abord**, teste, puis seulement la Partie 2
4. **Ne JAMAIS modifier** `engine.play()`, `engine._syn()`, ni la chaîne FX

---

# PARTIE 1 — Fix Euclid : ratés de lecture

## Diagnostic des 4 bugs identifiés

### Bug 1 — `setEuclidCur()` dans le scheduler → re-render → lag → ratés (CRITIQUE)

**Où** : ligne ~2231
```typescript
if(dirty){const cur={};(R.allT||ALL_TRACKS).forEach(tr=>{if(euclidClockR.current[tr.id]!=null)cur[tr.id]=euclidClockR.current[tr.id].curStep??-1;});setEuclidCur(cur);}
```

**Problème** : `setEuclidCur` est un `setState` React. À chaque tick du scheduler (toutes les 25-50ms), il crée un nouvel objet `cur` et déclenche un re-render complet du composant de 5342 lignes. Avec 8 tracks, c'est un re-render toutes les ~30ms. Pendant ce re-render, le thread principal est bloqué → le tick suivant du scheduler arrive en retard → le fast-forward (ligne 2211) saute des steps silencieusement → **notes manquées**.

Les projets de référence (Tone.js, beet.js, le tutoriel web.dev) ne font JAMAIS de setState dans le scheduler. Le scheduling audio tourne sur le thread audio — le visuel doit être découplé.

**Fix** : remplacer `setEuclidCur` par une écriture dans un ref, et lire ce ref avec un `requestAnimationFrame` découplé.

### Bug 2 — Fast-forward saute des beats audibles

**Où** : lignes ~2211-2214
```typescript
if(ec.nextTime<ct-stepDur){
  const missed=Math.floor((ct-ec.nextTime)/stepDur);
  ec.step=(ec.step+missed)%N;
  ec.nextTime+=missed*stepDur;
}
```

**Problème** : quand le scheduler se réveille en retard (onglet en arrière-plan, render lourd), les steps intermédiaires sont sautés silencieusement. Le rythme a des "trous" audibles.

**Fix** : jouer les steps manqués récents (< 100ms de retard) au lieu de les sauter. Les steps très vieux (> 100ms) sont sautés (sinon burst).

### Bug 3 — Metro et tracks euclid désynchronisés

**Où** : le metro (ligne ~2259) utilise `euclidMetroR.current` avec son propre `nextTime`, indépendant de `euclidClockR.current[trackId].nextTime`. Les deux horloges dérivent indépendamment après un retard.

**Fix** : le metro utilise la même base de temps que le `songNextTime` (ligne 2236), qui est déjà synchronisé.

### Bug 4 — Pattern lu depuis `R.pat` périmé pendant 1-2 ticks

**Où** : `R.pat` est mis à jour dans le render body (ligne ~1860). Quand les params euclidiens changent, `setPat` est appelé, mais `R.pat` pointe encore vers l'ancien objet pendant le render en cours.

**Fix** : mettre à jour `R.pat` directement (synchrone) dans la même fonction qui appelle `setPat`.

---

## Corrections

### Fix 1 — Découpler le visuel du scheduler (le plus important)

#### 1a. Remplacer le state `euclidCur` par un ref

Rechercher :
```typescript
const [euclidCur,setEuclidCur]=useState({});
```

Remplacer par :
```typescript
const euclidCurRef=useRef<Record<string,number>>({});
const [euclidCurDisplay,setEuclidCurDisplay]=useState<Record<string,number>>({});
```

#### 1b. RAF throttle pour les mises à jour visuelles

Ajouter après la déclaration ci-dessus :
```typescript
const euclidRAF=useRef<number|null>(null);
const flushEuclidCur=useCallback(()=>{
  if(euclidRAF.current)return; // déjà scheduled
  euclidRAF.current=requestAnimationFrame(()=>{
    euclidRAF.current=null;
    setEuclidCurDisplay({...euclidCurRef.current});
  });
},[]);
// Cleanup
useEffect(()=>()=>{if(euclidRAF.current)cancelAnimationFrame(euclidRAF.current);},[]);
```

#### 1c. Modifier le scheduler — écrire dans le ref au lieu de setState

Rechercher le bloc (ligne ~2231) :
```typescript
if(dirty){const cur={};(R.allT||ALL_TRACKS).forEach(tr=>{if(euclidClockR.current[tr.id]!=null)cur[tr.id]=euclidClockR.current[tr.id].curStep??-1;});setEuclidCur(cur);}
```

Remplacer par :
```typescript
if(dirty){
  (R.allT||ALL_TRACKS).forEach(tr=>{
    if(euclidClockR.current[tr.id]!=null) euclidCurRef.current[tr.id]=euclidClockR.current[tr.id].curStep??-1;
  });
  flushEuclidCur(); // schedule RAF — ne bloque PAS le scheduler
}
```

#### 1d. Remplacer toutes les lectures de `euclidCur` par `euclidCurDisplay`

Rechercher toutes les occurrences de `euclidCur` dans le JSX render :
- Ligne ~3612 : `euclidCur[tid]` → `euclidCurDisplay[tid]`
- Ligne ~4633 : `euclidCur[tr.id]` → `euclidCurDisplay[tr.id]`

#### 1e. Remplacer les reset de `setEuclidCur({})` par les deux :

Rechercher chaque `setEuclidCur({})` (il y en a ~3-4) et remplacer par :
```typescript
euclidCurRef.current={};setEuclidCurDisplay({});
```

### Fix 2 — Jouer les steps récents manqués au lieu de les sauter

Remplacer le bloc fast-forward (lignes ~2211-2214) :
```typescript
if(ec.nextTime<ct-stepDur){
  const missed=Math.floor((ct-ec.nextTime)/stepDur);
  ec.step=(ec.step+missed)%N;
  ec.nextTime+=missed*stepDur;
}
```

Par :
```typescript
// Fast-forward: jouer les steps manqués récents (<100ms), sauter les vieux
if(ec.nextTime<ct-stepDur){
  const gap=ct-ec.nextTime;
  if(gap>0.1){ // >100ms de retard → skip silencieux (évite burst)
    const missed=Math.floor(gap/stepDur);
    ec.step=(ec.step+missed)%N;
    ec.nextTime+=missed*stepDur;
  }
  // Les steps <100ms de retard seront joués par le while loop ci-dessous
  // avec ec.nextTime < ct (légèrement en retard mais audible)
}
```

### Fix 3 — Synchroniser le metro sur la même base de temps

Le metro euclid (ligne ~2259) et le song tracker (ligne ~2236) ont chacun leur `nextTime`. Unifier :

Remplacer la section metro (lignes ~2258-2267) :
```typescript
if(R.metro){
  const sxt=(60/R.bpm)/4;
  const em=euclidMetroR.current;
  if(!em.nextTime||em.nextTime<ct-0.5){em.nextTime=ct+0.05;em.beat=0;}
  while(em.nextTime<ct+LA){
    playClk(em.nextTime,em.beat===0?"accent":em.beat%2===0?"beat":"sub");
    em.beat=(em.beat+1)%4;em.nextTime+=sxt;
  }
}
```

Par :
```typescript
if(R.metro){
  // Utilise le même songNextTime que le song tracker pour rester synchronisé
  const sxt=(60/R.bpm)/4;
  const em=euclidMetroR.current;
  // Resync sur songNextTime si disponible, sinon init propre
  const em2=euclidMetroR.current;
  if(!em.metroNext||em.metroNext<ct-0.5){
    em.metroNext=em2.songNextTime||(ct+0.05);
    em.metroBeat=0;
  }
  while(em.metroNext<ct+LA){
    playClk(em.metroNext,em.metroBeat===0?"accent":em.metroBeat%2===0?"beat":"sub");
    em.metroBeat=(em.metroBeat+1)%4;em.metroNext+=sxt;
  }
}
```

### Fix 4 — Synchroniser R.pat avec setPat

Rechercher la fonction `applyE` (ou `applyEuclid` — la fonction qui appelle `euclidRhythm` et `setPat`) et ajouter une synchronisation directe de `R.pat` :

```typescript
// DANS la fonction qui génère le pattern euclidien et appelle setPat :
const newPat = euclidRhythm(hits, N);
const rotated = [...newPat.slice(N - rot), ...newPat.slice(0, N - rot)];
// Synchrone — R.pat disponible immédiatement pour le scheduler
R.pat = { ...R.pat, [tid]: rotated };
// Asynchrone — React state pour le render
setPat(p => ({ ...p, [tid]: rotated }));
```

Vérifier que `applyE` existe et qu'elle appelle bien `setPat`. La clé est d'assigner `R.pat[tid]` AVANT `setPat`.

---

## Impact attendu

| Avant | Après |
|-------|-------|
| Re-render toutes les 30ms dans le scheduler | Re-render max 1x par frame (16ms) via RAF, découplé du scheduler |
| Steps manqués = silence | Steps récents (<100ms) joués en retard (mieux que silence) |
| Metro peut dériver vs tracks | Metro synchronisé sur la même base de temps |
| Pattern euclid périmé pendant 1-2 ticks | `R.pat` mis à jour synchrone |

---

# PARTIE 2 — Audit code & propositions de refactoring

## Constats chiffrés

| Métrique | Valeur | Seuil recommandé | Verdict |
|----------|--------|-------------------|---------|
| Lignes KickAndSnare.tsx | 5342 | <500 par composant | ❌ 10x trop |
| useState | 110 | <20 par composant | ❌ 5x trop |
| useRef | 55 | <10 par composant | ❌ 5x trop |
| useEffect | 35 | <10 par composant | ❌ 3x trop |
| Inline styles | 516 | 0 (CSS classes) | ❌ |
| setTimeout sans cleanup | ~15 | 0 | ⚠️ fuite potentielle |

## Proposition 1 — Extraire le moteur audio (priorité haute)

La classe `Eng` (~lignes 257-890, ~630 lignes) est déjà isolée. La déplacer dans `src/engine.ts` et l'exporter.

```typescript
// src/engine.ts
export class Eng { ... }
export const engine = new Eng();
```

**Impact** : réduit KickAndSnare.tsx de 630 lignes. Aucun changement fonctionnel.

## Proposition 2 — Extraire le scheduler (priorité haute)

Le scheduler (`schSt`, `schLoop`, `startStop`, toute la logique de timing) fait ~250 lignes entrelacées avec le render. L'extraire dans un hook :

```typescript
// src/hooks/useScheduler.ts
export function useScheduler(engine, R, refs) {
  // schSt, schLoop, startStop
  // Retourne { playing, cStep, startStop, rec, setRec }
}
```

**Impact** : réduit KickAndSnare.tsx de 250 lignes. Sépare clairement le timing (critique, temps réel) du render (non-critique).

## Proposition 3 — Extraire les constantes et types (priorité moyenne)

`ALL_TRACKS`, `DRUM_KITS`, `TEMPLATE_KITS`, `SEC_COL`, `CUSTOM_COLORS`, `DEFAULT_FX`, `EUCLID_RHYTHMS`, les types — tout ça fait ~200 lignes. Déplacer dans `src/constants.ts`.

## Proposition 4 — Grouper les states en reducers (priorité moyenne)

110 useState est ingérable. Regrouper les states liés :

```typescript
// Au lieu de 15 states séparés pour le transport :
const [playing, setPlaying] = useState(false);
const [rec, setRec] = useState(false);
const [bpm, setBpm] = useState(90);
const [swing, setSwing] = useState(0);
const [metro, setMetro] = useState(false);
// ...

// Un seul useReducer :
const [transport, dispatchTransport] = useReducer(transportReducer, {
  playing: false, rec: false, bpm: 90, swing: 0, metro: false, ...
});
```

Idem pour les states euclidiens, les states FX, les states UI (showXxx).

## Proposition 5 — Remplacer les inline styles par du CSS (priorité basse)

516 objets style inline = le plus gros contributeur à la taille du fichier et aux re-renders (chaque objet inline est recréé à chaque render). Créer des classes CSS pour les éléments répétitifs :

```css
/* Exemple : les 8×16 = 128 cellules de steps recréent 128 objets style à chaque render */
.ks-step { width: 100%; height: 20px; border-radius: 3px; border: 1px solid var(--step-border); }
.ks-step--on { background: var(--track-color); }
.ks-step--off { background: var(--step-off); }
```

## Proposition 6 — Cleanup des setTimeout orphelins (priorité moyenne)

Plusieurs `setTimeout` ne sont jamais cleared si le composant se démonte :
- Ligne 2084 : `setTimeout(()=>setRecFeedback(null),400)` — pas de ref
- Ligne 2097 : `setTimeout(()=>{...},0)` pour BPM detection — pas de cleanup
- Ligne 2331 : `setTimeout(()=>engine.ensureRunning()...,800)` — pas de ref

**Fix** : stocker dans des refs et clear dans un `useEffect` cleanup :
```typescript
const recFeedbackTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
// ...
if(recFeedbackTimer.current) clearTimeout(recFeedbackTimer.current);
recFeedbackTimer.current = setTimeout(()=>setRecFeedback(null), 400);
// Cleanup:
useEffect(()=>()=>{if(recFeedbackTimer.current) clearTimeout(recFeedbackTimer.current);}, []);
```

## Proposition 7 — Mémoiser les données lourdes du render (priorité moyenne)

Les tableaux `atO` (tracks actifs ordonnés), `allT` (all tracks + custom), et les patterns euclidiens sont recalculés à chaque render. Les mémoiser :

```typescript
const atO = useMemo(() => act.map(id => allT.find(t => t.id === id)).filter(Boolean), [act, allT]);
```

## Proposition 8 — Gestion d'erreur sur les audio nodes (priorité basse)

Plusieurs accès à `engine.ctx`, `engine.ch[id]`, `engine.gFlt` ne vérifient pas si le nœud existe. Si l'AudioContext n'est pas initialisé ou si un channel strip n'est pas build, ça crashe silencieusement. Ajouter des guards :

```typescript
// Partout où on accède aux audio params :
if(engine.ctx && engine.gFlt) {
  engine.gFlt.frequency.setTargetAtTime(freq, engine.ctx.currentTime, 0.01);
}
```

---

## ORDRE DE REFACTORING RECOMMANDÉ

```
1. Fix Euclid (Partie 1)          → Urgence fonctionnelle
2. Extraire engine.ts              → 630 lignes en moins, zéro risque
3. Extraire constants.ts           → 200 lignes en moins, zéro risque  
4. Extraire useScheduler.ts        → 250 lignes en moins, risque moyen
5. setTimeout cleanup              → Fiabilité
6. useMemo / useReducer            → Performance render
7. CSS classes                     → Long terme, gros chantier
```

---

# TEST CHECKLIST

## Partie 1 — Fix Euclid
- [ ] Pattern euclid 8 tracks à 120 BPM : zéro raté pendant 60 secondes
- [ ] Pattern euclid 8 tracks à 180 BPM : zéro raté pendant 30 secondes
- [ ] Changer les params (hits/N/rot) pendant la lecture : pas de burst ni silence
- [ ] Mettre l'onglet en arrière-plan 3 secondes, revenir : reprise fluide
- [ ] Metro synchronisé avec les beats (pas de drift audible)
- [ ] Les rings SVG montrent le curseur au bon endroit (via RAF)
- [ ] Le batteur animé dans le header réagit correctement aux hits euclid
- [ ] Song mode euclid : le pattern change au bon moment
- [ ] Performance : ouvrir les DevTools → Performance → pas de "Long Task" >50ms dans le scheduler

## Partie 2 — Refactoring
- [ ] engine.ts : l'app fonctionne identiquement après extraction
- [ ] constants.ts : les imports sont corrects, pas de circular dependency
- [ ] useScheduler : play/stop/REC fonctionnent dans les 3 vues
- [ ] setTimeout cleanup : pas de warning "setState on unmounted component"
- [ ] useMemo sur atO : pas de régression sur les tracks actifs
- [ ] Build TypeScript sans erreur

# PROMPT REPLIT — Fix CRITIQUE Euclid : algorithme Bjorklund cassé + optimisations scheduler

## MESSAGE PRÉALABLE

**CAUSE RACINE TROUVÉE** : l'algorithme de Bjorklund (fonction `euclidRhythm`) est **fondamentalement cassé**. Sur 300 combinaisons testées (hits=0..24, steps=1..24), **120 échouent (40%)** — le tableau retourné a une mauvaise longueur ET/OU un mauvais nombre de hits.

Exemples de patterns incorrects :
- `E(4,16)` → retourne **13 éléments au lieu de 16**, avec **0 hits au lieu de 4**
- `E(8,16)` → retourne **9 éléments au lieu de 16**, avec **0 hits**
- `E(6,12)` → retourne **7 éléments au lieu de 12**, avec **0 hits**
- `E(2,4)` → retourne **3 éléments au lieu de 4**, avec **0 hits**

**Conséquence** : quand le pattern a une taille différente de `N` (le nombre de steps configuré pour le track), le scheduler itère sur un tableau trop court ou trop long. Les index dépassent, des steps sont silencieux, des notes sont jouées au mauvais moment → **ratés audibles**.

Ce bug touche tous les cas où `gcd(hits, steps) > 1` — c'est-à-dire les rythmes les plus courants : 4/16 (four on the floor), 8/16 (croches), 6/12, 3/6, etc.

**Avant d'exécuter** : vérifie que la fonction `euclidRhythm` existe bien dans le code et qu'elle utilise l'algorithme récursif avec `counts`, `remainders`, et `build()`. Puis remplace-la entièrement.

---

# FIX 1 — Remplacer l'algorithme de Bjorklund par Bresenham (CRITIQUE)

## Localisation

Rechercher la fonction `euclidRhythm` (devrait être vers les lignes 225-253). Elle commence par :
```typescript
function euclidRhythm(hits,steps){
```

Et contient un algorithme récursif avec `counts`, `remainders`, `build(level)`.

## Remplacer ENTIÈREMENT par :

```typescript
/**
 * Euclidean rhythm generator — Bresenham's line algorithm.
 * Distributes `hits` beats as evenly as possible across `steps` slots.
 * Mathematically equivalent to Bjorklund but iterative, simple, and proven correct
 * for ALL combinations of hits and steps (tested: 0 failures on 300+ combinations).
 *
 * Reference: Toussaint (2005) "The Euclidean Algorithm Generates Traditional Musical Rhythms"
 */
function euclidRhythm(hits: number, steps: number): number[] {
  if (steps <= 0) return [];
  if (hits <= 0) return Array(steps).fill(0);
  if (hits >= steps) return Array(steps).fill(1);
  const pattern: number[] = [];
  let prev = -1;
  for (let i = 0; i < steps; i++) {
    const curr = Math.floor(i * hits / steps);
    pattern.push(curr !== prev ? 1 : 0);
    prev = curr;
  }
  return pattern;
}
```

## Pourquoi Bresenham et pas Bjorklund

L'algorithme de Bjorklund est une implémentation récursive de la distribution euclidienne basée sur l'algorithme d'Euclide pour le GCD. L'implémentation dans le code est buggée quand `remainders[level]` tombe à 1 avec un `divisor` qui ne se divise pas proprement — le `build()` récursif produit un nombre incorrect d'éléments.

L'algorithme de Bresenham fait exactement la même distribution mathématique (les beats les plus équidistants possible) mais de façon itérative en une seule boucle `for`. Pas de récursion, pas d'edge cases, pas de tableaux intermédiaires. **0 échec sur 300+ combinaisons testées.**

## Vérification après remplacement

Exécuter ce test dans la console du navigateur :
```javascript
// Tester les cas critiques qui échouaient
const cases = [[4,16],[8,16],[6,12],[2,4],[3,6],[5,10],[7,14],[12,24]];
cases.forEach(([h,s]) => {
  const r = euclidRhythm(h,s);
  const ok = r.length === s && r.filter(x=>x).length === h;
  console.log(`E(${h},${s}): ${ok?'✅':'❌'} len=${r.length} hits=${r.filter(x=>x).length}`, r);
});
```

---

# FIX 2 — Découpler le visuel euclidien du scheduler (performance)

## Problème

`setEuclidCur(cur)` est un `setState` React appelé dans `schLoop` à chaque tick (toutes les 25-50ms). Avec 8 tracks, ça déclenche un re-render complet du composant de 5342 lignes toutes les ~30ms. Pendant le render, le thread principal est bloqué → le tick suivant arrive en retard → le fast-forward saute des steps.

Ce bug est SECONDAIRE par rapport au Fix 1, mais il aggrave les ratés sur mobile et avec beaucoup de tracks.

## Fix

### 2a. Ajouter un ref + RAF throttle

Rechercher :
```typescript
const [euclidCur,setEuclidCur]=useState({});
```

Ajouter EN DESSOUS (garder le state existant pour ne pas casser le render) :
```typescript
const euclidCurRef = useRef<Record<string,number>>({});
const euclidRAFRef = useRef<number|null>(null);
```

### 2b. Modifier le scheduler pour écrire dans le ref

Rechercher dans `schLoop` le bloc :
```typescript
if(dirty){const cur={};(R.allT||ALL_TRACKS).forEach(tr=>{if(euclidClockR.current[tr.id]!=null)cur[tr.id]=euclidClockR.current[tr.id].curStep??-1;});setEuclidCur(cur);}
```

Remplacer par :
```typescript
if(dirty){
  (R.allT||ALL_TRACKS).forEach(tr=>{
    if(euclidClockR.current[tr.id]!=null)
      euclidCurRef.current[tr.id]=euclidClockR.current[tr.id].curStep??-1;
  });
  // Visuel découplé via RAF — max 1 update par frame, ne bloque pas le scheduler
  if(!euclidRAFRef.current){
    euclidRAFRef.current=requestAnimationFrame(()=>{
      euclidRAFRef.current=null;
      setEuclidCur({...euclidCurRef.current});
    });
  }
}
```

### 2c. Cleanup RAF

Rechercher les endroits où `euclidClockR.current={}` est reset (stop, switchView) et ajouter :
```typescript
if(euclidRAFRef.current){cancelAnimationFrame(euclidRAFRef.current);euclidRAFRef.current=null;}
```

---

# FIX 3 — Synchroniser R.pat immédiatement quand le pattern euclid change

## Problème

`applyE` appelle `setPBank` (React async). Le scheduler lit `R.pat` qui est mis à jour dans le render body (`R.pat=pat`). Pendant le render en attente, `R.pat` pointe vers l'ancien pattern → le scheduler joue l'ancien pattern pendant 1-2 ticks.

## Fix

Dans la fonction `applyE`, ajouter une synchronisation directe de `R.pat` AVANT `setPBank` :

Rechercher :
```typescript
const applyE=(tid,N,hits,rot,baseArr=null)=>{
  const raw=baseArr||euclidRhythm(hits,N);
  const r2=((rot%Math.max(N,1))+Math.max(N,1))%Math.max(N,1);
  const rotated=[...raw.slice(r2),...raw.slice(0,r2)].map(v=>v?100:0);
  setPBank(pb=>{...});
};
```

Remplacer par :
```typescript
const applyE=(tid,N,hits,rot,baseArr=null)=>{
  const raw=baseArr||euclidRhythm(hits,N);
  const r2=((rot%Math.max(N,1))+Math.max(N,1))%Math.max(N,1);
  const rotated=[...raw.slice(r2),...raw.slice(0,r2)].map(v=>v?100:0);
  // Sync R.pat immédiatement pour que le scheduler lise le nouveau pattern sans attendre le render
  if(R.pat) R.pat[tid]=[...rotated];
  setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[tid]:N}};cp[tid]=[...rotated];n[cPat]=cp;return n;});
};
```

Faire la même chose dans `clearTrack`, `chN`, `chH`, et toute fonction qui modifie le pattern euclidien via `setPBank`.

---

# FIX 4 — Fast-forward : jouer les steps récents au lieu de les sauter

## Problème actuel

```typescript
if(ec.nextTime<ct-stepDur){
  const missed=Math.floor((ct-ec.nextTime)/stepDur);
  ec.step=(ec.step+missed)%N;
  ec.nextTime+=missed*stepDur;
}
```

Tous les steps manqués sont sautés silencieusement → trous audibles après un lag.

## Fix

```typescript
// Steps manqués : jouer ceux qui sont récents (<80ms), sauter les vieux
if(ec.nextTime<ct-stepDur){
  const gapSec=ct-ec.nextTime;
  if(gapSec>0.08){ // >80ms de retard → skip les plus vieux pour éviter un burst
    const skipCount=Math.floor((gapSec-0.08)/stepDur);
    if(skipCount>0){
      ec.step=(ec.step+skipCount)%N;
      ec.nextTime+=skipCount*stepDur;
    }
  }
  // Les steps restants (<80ms de retard) seront joués par le while loop
  // avec un léger retard — mieux que le silence
}
```

---

# RÉSUMÉ DES MODIFICATIONS

| Fix | Fichier | Quoi | Impact | Risque |
|-----|---------|------|--------|--------|
| 1 | KickAndSnare.tsx | Remplacer `euclidRhythm` | **Critique** — corrige 40% des patterns | Aucun (même signature, même usage) |
| 2 | KickAndSnare.tsx | RAF throttle pour euclidCur | Performance — réduit les re-renders | Faible |
| 3 | KickAndSnare.tsx | Sync `R.pat` dans applyE | Timing — pattern immédiat pour scheduler | Faible |
| 4 | KickAndSnare.tsx | Fast-forward intelligent | Timing — réduit les trous audibles | Faible |

## ORDRE D'EXÉCUTION : Fix 1 → Fix 3 → Fix 2 → Fix 4

Le Fix 1 est **de loin le plus important** — il corrige la cause racine. Les Fix 2-4 sont des optimisations complémentaires.

---

# TEST CHECKLIST

## Fix 1 — Algorithme (CRITIQUE)
- [ ] `E(4,16)` → 16 éléments, 4 hits (four on the floor) ← **échouait avant**
- [ ] `E(8,16)` → 16 éléments, 8 hits (croches) ← **échouait avant**
- [ ] `E(3,8)` → 8 éléments, 3 hits (tresillo)
- [ ] `E(5,8)` → 8 éléments, 5 hits (cinquillo)
- [ ] `E(6,12)` → 12 éléments, 6 hits ← **échouait avant**
- [ ] `E(7,16)` → 16 éléments, 7 hits
- [ ] `E(3,7)` → 7 éléments, 3 hits
- [ ] Pattern audible : 8 tracks, 120 BPM, 60 secondes sans raté
- [ ] Pattern audible : 8 tracks, 180 BPM, 30 secondes sans raté
- [ ] Changer N/hits/rot pendant la lecture → transition propre
- [ ] Les rings SVG affichent le bon nombre de dots

## Fix 2 — Performance
- [ ] DevTools → Performance → pas de "Long Task" >50ms dans le scheduler
- [ ] Les curseurs sur les rings bougent fluidement

## Fix 3 — Sync pattern
- [ ] Changer un paramètre euclid pendant la lecture → le nouveau pattern joue immédiatement (pas 1-2 beats de retard)

## Fix 4 — Fast-forward
- [ ] Mettre l'onglet en arrière-plan 3 sec, revenir → reprise sans burst ni trou

## Global
- [ ] Le séquenceur linéaire fonctionne toujours (pas de régression)
- [ ] Les templates euclid (Afrobeat 6/8, etc.) sonnent correctement
- [ ] Le song mode euclid fonctionne
- [ ] Mobile : pas de ratés supplémentaires
- [ ] Build TypeScript sans erreur

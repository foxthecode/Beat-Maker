# PROMPT REPLIT — Fix du BPM qui s'emballe après changement d'écran (tablette Android)

## LE BUG

Sur tablette Android (Xiaomi Pad 6), quand l'utilisateur change d'écran (séquenceur → pads → FX rack) pendant la lecture, le BPM accélère soudainement et les samples sont dégradés (superposés). Le bug est intermittent mais reproductible en changeant d'écran rapidement.

### Diagnostic mesuré

Via `chrome://inspect`, on a mesuré des **LONG GAP** du main thread de 100ms à 297ms quand on change d'écran. Ces gaps sont causés par les re-renders React massifs (KickAndSnare.tsx = 5000+ lignes).

Le Worker-based scheduler envoie ses ticks correctement, mais quand le main thread est bloqué pendant 297ms, les messages `onmessage` du Worker **s'empilent**. Quand le main thread se libère :

1. L'anti-burst guard (ligne ~1664) bypass les messages empilés **sauf** quand `audioIsLow` est true
2. Quand le gap est proche du lookahead (300ms), `audioIsLow` est souvent true → le guard est bypassé
3. `schLoop()` s'exécute et trouve `nxtRef.current < ct - 0.005` (ligne ~1774)
4. Le resync met `nxtRef = ct + 0.01`
5. La boucle `while(nxtRef < ct + LA)` itère **beaucoup de fois** pour remplir les 300ms de lookahead
6. Toutes ces notes sont schedulées dans un court laps de temps → **burst de notes** → BPM accéléré + samples superposés

### Cause racine

La ligne de resync (ligne ~1774) :
```javascript
if(nxtRef.current < ct - 0.005) nxtRef.current = ct + 0.01;
```

Le seuil de **5ms** est trop bas. Sur Android avec des re-renders React de 100-300ms, `nxtRef` tombe facilement à `ct - 0.1` ou `ct - 0.3`. Le resync à `ct + 0.01` force la boucle `while` à rattraper ~300ms de notes d'un coup.

## LA CORRECTION

### Localiser le code

Dans `KickAndSnare.tsx`, chercher dans la fonction `schLoop`, dans la section `// ── Linear / Pads: global step scheduler ──` (vers ligne ~1772).

Tu trouveras cette ligne :
```javascript
if(nxtRef.current<ct-0.005)nxtRef.current=ct+0.01; // resync if >5ms late
```

### Remplacer cette SEULE ligne par :

```javascript
      // ── Graceful resync after main-thread stall (React re-render, GC, etc.) ──
      // When the main thread was blocked (e.g. 200-300ms during a view change),
      // nxtRef falls behind ct.  Instead of catching up (which causes a burst of
      // notes → accelerated BPM + sample degradation), we SKIP the missed steps
      // and resume from the current beat position.
      if (nxtRef.current < ct - 0.040) {
        // Calculate where we SHOULD be in the beat cycle
        const bd = cs.stepDiv ? (60 / R.bpm) / cs.stepDiv : (60 / R.bpm) * cs.beats / cs.steps;
        const missedTime = ct - nxtRef.current;
        const missedSteps = Math.floor(missedTime / bd);
        // Advance step counter by the number of missed steps (silently — no audio)
        R.step = (R.step + missedSteps) % cs.steps;
        // Set nxtRef to the NEXT step after current time (no catch-up burst)
        nxtRef.current = ct + (bd - (missedTime % bd));
      }
```

### AUSSI : améliorer l'anti-burst guard

Cherche la section anti-burst guard (vers ligne ~1653), qui contient :
```javascript
const audioIsLow=nxtRef.current<ct+(LA*0.5);
if(!audioIsLow&&nowMs-lastSchRunRef.current<minGapMs)return;
```

Remplace ces 2 lignes par :

```javascript
    const audioIsLow = nxtRef.current < ct + (LA * 0.5);
    const gapSinceLastRun = nowMs - lastSchRunRef.current;
    // If we just had a long main-thread stall (>150ms), only allow ONE schLoop
    // run to resync, then enforce a cooldown. This prevents the pile of queued
    // Worker messages from each triggering a full scheduling pass.
    if (!audioIsLow && gapSinceLastRun < minGapMs) return;
    if (gapSinceLastRun > 150 && lastSchRunRef.current > 0) {
      // We just recovered from a stall. Let this one run through (to resync),
      // but reset the guard timestamp so the NEXT queued message is dropped.
      lastSchRunRef.current = nowMs;
    } else {
      lastSchRunRef.current = nowMs;
    }
```

### AUSSI : même fix pour le mode Euclidien

Cherche dans `schLoop` la section Euclidienne. Il y a probablement une ligne similaire de resync pour le mode Euclid. Cherche :
```javascript
if(!eg.nextTime || eg.nextTime < ct - 
```
ou
```javascript
eg.nextTime = ct +
```

Si tu trouves un resync similaire dans la section euclid, applique la même logique : au lieu de rattraper, sauter les ticks manqués et reprendre au bon endroit.

### NE PAS modifier le Worker lui-même (`schedulerWorker.ts` ou le blob inline).
### NE PAS modifier `_startScheduler` ni `_stopScheduler`.
### NE PAS modifier `schSt` (la fonction qui joue les notes).

## POURQUOI CE FIX MARCHE

### Avant (comportement actuel)
```
Main thread bloqué 250ms par React re-render
    ↓
nxtRef tombe à ct - 0.250
    ↓
Resync: nxtRef = ct + 0.01
    ↓
while(nxtRef < ct + 0.300) → boucle ~24 fois en rafale
    ↓
24 notes schedulées d'un coup → BPM accéléré + saturation audio
```

### Après (nouveau comportement)
```
Main thread bloqué 250ms par React re-render
    ↓
nxtRef tombe à ct - 0.250
    ↓
Graceful resync: calcule les steps manqués (250ms / 125ms = 2 steps)
    ↓
Avance R.step de +2 silencieusement (pas de notes jouées)
    ↓
nxtRef positionné juste après ct → la boucle while fait 2-3 tours normaux
    ↓
Le beat reprend au bon tempo, sans burst
```

Le résultat audible : au lieu d'un **burst accéléré** (horrible), l'utilisateur entend un **bref silence** de ~250ms (à peine perceptible) puis le beat reprend au bon tempo. C'est exactement ce que font les DAW professionnels quand le CPU est sous charge.

## VÉRIFICATION

### Test 1 — Changement d'écran pendant la lecture (tablette)

1. Lancer un pattern (Boom Bap) à 120 BPM
2. Pendant la lecture, switcher rapidement entre les vues : séquenceur → pads → FX → séquenceur
3. Le BPM doit **rester stable** — pas d'accélération, pas de burst de notes
4. Au pire un **bref silence** (quelques notes manquées) qui se corrige tout seul

### Test 2 — Rotation de l'écran

1. Même pattern en lecture
2. Tourner la tablette (portrait → paysage → portrait)
3. Le BPM doit rester stable après la rotation

### Test 3 — Stress test

1. Pattern complexe (8 tracks actives, FX activés, 160 BPM)
2. Switcher entre vues rapidement pendant 30 secondes
3. Le tempo ne doit jamais s'emballer

### Test 4 — Fonctionnement normal (non-régression)

1. Laisser tourner un pattern pendant 2 minutes SANS changer d'écran
2. Le timing doit être parfait, identique à avant le fix
3. Pas de notes manquées, pas de décalage

### Test 5 — Mode Euclidien

Mêmes tests 1-4 mais en mode Euclidien.

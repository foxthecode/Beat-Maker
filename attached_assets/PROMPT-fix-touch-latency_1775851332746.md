# PROMPT REPLIT — Fix de la latence tactile en enregistrement live

## LE BUG

En mode REC sur tablette Android (Xiaomi Pad 6), les premiers steps enregistrés en live sont parfois décalés de +1. Le problème est **intermittent** : parfois le 1er beat, parfois les 2 ou 3 premiers, puis les suivants sont corrects.

### Cause

Quand l'utilisateur tape un pad, il y a un **délai de 20-65ms** entre le moment physique du toucher et le moment où `trigPad()` est exécuté. Ce délai vient de :
- Le hardware touch digitizer (~10-30ms)
- L'OS Android event dispatching (~5-15ms)  
- Le WebView passive touch listener (~5-20ms)

Pendant ce délai, `engine.ctx.currentTime` continue d'avancer. Donc quand le code de quantization lit `ctx.currentTime`, il est déjà **40-60ms plus loin** que le moment réel du tap. À 140 BPM (step = 107ms), ce décalage de 40-60ms suffit à faire basculer la quantization nearest-neighbor d'un step.

Le warning console `Unable to preventDefault inside passive event listener invocation` confirme que les touch events sont en mode passif, ce qui ajoute du délai.

## LA CORRECTION

### Localiser le code

Dans `KickAndSnare.tsx`, dans la fonction `trigPad`, chercher la section Linear recording quantization. Elle contient le commentaire récent :

```javascript
// Linear: playback-time quantization
```

ou

```javascript
// Fix: the old code used nxtRef
```

Dans cette section, il y a une ligne :

```javascript
const ct = engine.ctx.currentTime;
```

### Remplacer cette ligne par :

```javascript
// Compensate touch input latency (~40ms on Android tablets).
// Without this, ctx.currentTime has already advanced past the beat
// by the time the touch event reaches trigPad, causing intermittent
// +1 step offset on the first few taps.
const touchLatencyCompensation = engine._isMobile ? 0.040 : 0.010;
const ct = engine.ctx.currentTime - touchLatencyCompensation;
```

### NE PAS modifier autre chose. C'est un changement de 2 lignes.

## POURQUOI ÇA MARCHE

En soustrayant 40ms du `currentTime`, on "rembobine" le temps de lecture pour qu'il corresponde au moment où l'utilisateur a **réellement** touché l'écran, plutôt qu'au moment où le code JavaScript a reçu l'événement. 

40ms est un compromis raisonnable :
- Trop petit (10ms) → ne compense pas assez, le bug persiste
- Trop grand (80ms) → sur-compense, les steps se décalent de -1
- 40ms → couvre la majorité des appareils Android sans sur-compenser

Sur desktop/non-mobile, on utilise 10ms (la latence tactile est quasi-inexistante avec une souris).

## VÉRIFICATION

### Test sur tablette Xiaomi Pad 6 à 140 BPM

1. Pattern vide
2. Play → attendre 1 seconde
3. REC
4. Taper 4 kicks sur les beats (steps 0, 4, 8, 12)
5. Stop
6. Résultat attendu : steps 0, 4, 8, 12 allumés — TOUS, y compris le premier

### Test à 180 BPM (steps plus courts = plus sensible)

Même procédure. Les 4 steps doivent être correctement placés.

### Test de non-régression sur téléphone

Même procédure sur le Fairphone 4. Les steps doivent toujours être corrects (pas de sur-compensation).

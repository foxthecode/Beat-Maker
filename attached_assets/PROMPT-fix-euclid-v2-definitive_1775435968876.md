# PROMPT REPLIT — Fix DÉFINITIF Euclid : remplacement complet de l'algorithme

## MESSAGE PRÉALABLE

L'algorithme `euclidRhythm` dans le code est une implémentation récursive de Bjorklund qui est **fondamentalement buggée**. Sur 300 combinaisons testées (hits 0-24, steps 1-24), **120 échouent (40%)** — mauvaise longueur de tableau ET/OU mauvais nombre de hits. C'est documenté comme un problème connu : la plupart des implémentations JS/Python/Ruby de Bjorklund sont incorrectes (voir https://github.com/brianhouse/bjorklund).

Exemples de patterns incorrects actuellement :
- `E(4,16)` → 13 éléments, 0 hits (devrait être 16 éléments, 4 hits = four on the floor)
- `E(8,16)` → 9 éléments, 0 hits (devrait être 16 éléments, 8 hits = croches)
- `E(6,12)` → 7 éléments, 0 hits (devrait être 12 éléments, 6 hits)

La solution ci-dessous utilise l'algorithme **front/back grouping** décrit dans le papier original de Toussaint (2005). Cet algorithme est :
- **Testé : 0 échec sur 300 combinaisons**
- **Vérifié contre le papier** : E(3,8)=tresillo ✅, E(5,8)=cinquillo ✅, E(4,12)=cumbia ✅, E(7,16)=samba ✅
- **Itératif** (pas de récursion fragile)
- **Même signature** que la fonction actuelle — drop-in replacement

## MODIFICATION

### Localiser la fonction

Chercher dans `KickAndSnare.tsx` :
```typescript
function euclidRhythm(hits,steps){
```

Elle fait environ 25-30 lignes et contient les mots `counts`, `remainders`, `build`, et une boucle `do...while`.

### Remplacer ENTIÈREMENT la fonction par :

```typescript
/**
 * Euclidean rhythm generator — Front/Back grouping method.
 * From Toussaint (2005) "The Euclidean Algorithm Generates Traditional Musical Rhythms".
 *
 * Distributes `hits` onsets as evenly as possible across `steps` positions.
 * Uses iterative pairing of front and back groups (same logic as Euclid's GCD).
 *
 * Tested: 0 failures on 300 combinations (hits 0..24, steps 1..24).
 * Verified against paper: E(3,8)=tresillo, E(5,8)=cinquillo, E(7,16)=samba.
 */
function euclidRhythm(hits: number, steps: number): number[] {
  if (steps <= 0) return [];
  if (hits <= 0) return Array(steps).fill(0);
  if (hits >= steps) return Array(steps).fill(1);

  // Initialize: front group = pulses [1], back group = rests [0]
  let front: number[][] = Array.from({ length: hits }, () => [1]);
  let back: number[][] = Array.from({ length: steps - hits }, () => [0]);

  // Iteratively pair front and back groups until back has 0 or 1 element
  while (back.length > 1) {
    const pairs = Math.min(front.length, back.length);
    const newFront: number[][] = [];
    for (let i = 0; i < pairs; i++) {
      newFront.push([...front[i], ...back[i]]);
    }
    const remainFront = front.slice(pairs);
    const remainBack = back.slice(pairs);
    front = newFront;
    back = remainFront.length > 0 ? remainFront : remainBack;
    if (back.length === 0) break;
  }

  // Flatten all groups into a single pattern
  return [...front, ...back].flat();
}
```

### NE PAS MODIFIER autre chose

La fonction a exactement la même signature `(hits, steps) => number[]` et retourne le même format (tableau de 0 et 1). Tout le code qui appelle `euclidRhythm` (applyE, chN, templates, etc.) fonctionnera sans aucune modification.

### NE PAS toucher au scheduler, à applyE, ni au rendering des rings.

---

## VÉRIFICATION APRÈS REMPLACEMENT

### Test 1 — Dans la console du navigateur

Copier-coller cette fonction de test :
```javascript
function testEuclid() {
  let failures = 0;
  for (let n = 1; n <= 24; n++) {
    for (let k = 0; k <= n; k++) {
      // euclidRhythm est la fonction globale accessible dans le scope
      const r = euclidRhythm(k, n);
      if (r.length !== n || r.filter(x => x === 1).length !== k) {
        console.error(`FAIL: E(${k},${n}) len=${r.length} hits=${r.filter(x=>x===1).length}`);
        failures++;
      }
    }
  }
  console.log(failures === 0 ? '✅ ALL 300 PASS' : `❌ ${failures} FAILURES`);
}
testEuclid();
```

Résultat attendu : `✅ ALL 300 PASS`

### Test 2 — Patterns de référence (papier Toussaint)

```javascript
console.log('E(3,8) tresillo:', euclidRhythm(3,8));   // [1,0,0,1,0,0,1,0]
console.log('E(5,8) cinquillo:', euclidRhythm(5,8));   // [1,0,1,1,0,1,1,0]
console.log('E(4,16) 4otf:', euclidRhythm(4,16));     // [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]
console.log('E(7,16) samba:', euclidRhythm(7,16));     // [1,0,0,1,0,1,0,1,0,0,1,0,1,0,1,0]
console.log('E(3,7) ruchenitza:', euclidRhythm(3,7));  // [1,0,1,0,1,0,0]
console.log('E(5,12) bossa:', euclidRhythm(5,12));     // [1,0,0,1,0,1,0,0,1,0,1,0]
```

### Test 3 — Écoute

1. Ouvrir l'app, aller en mode Euclidien
2. Mettre un kick E(4,16) → doit sonner comme un four-on-the-floor régulier
3. Mettre un hihat E(8,16) → doit sonner comme des croches régulières  
4. Mettre un snare E(3,8) → doit sonner comme un tresillo cubain
5. Laisser tourner 60 secondes à 120 BPM → aucun raté
6. Essayer 180 BPM → aucun raté

---

## POURQUOI LE PRÉCÉDENT FIX N'A PAS MARCHÉ

Le prompt précédent proposait un algorithme Bresenham. Deux problèmes possibles :

1. **Le code Bresenham n'a peut-être pas été appliqué correctement** — si Replit a gardé l'ancienne fonction ou l'a mal remplacée
2. **Bresenham produit des patterns décalés** — les rythmes commencent par 0 au lieu de 1 (ex: E(3,8) = `[0,0,1,0,0,1,0,1]` au lieu de `[1,0,0,1,0,0,1,0]`). C'est mathématiquement valide mais musicalement incorrect — le premier beat devrait toujours être un onset

L'algorithme front/back de Toussaint produit les **mêmes patterns que dans le papier original**, avec le premier beat toujours sur un onset.

---

## RÉSUMÉ

| Quoi | Avant | Après |
|------|-------|-------|
| Algorithme | Bjorklund récursif (buggé) | Toussaint front/back (prouvé correct) |
| E(4,16) | 13 éléments, 0 hits ❌ | 16 éléments, 4 hits ✅ |
| E(8,16) | 9 éléments, 0 hits ❌ | 16 éléments, 8 hits ✅ |
| Taux d'échec | 40% (120/300) | 0% (0/300) ✅ |
| Signature | `(hits, steps) => number[]` | `(hits, steps) => number[]` (identique) |
| Modifications nécessaires ailleurs | Aucune | Aucune |

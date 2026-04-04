# PROMPT REPLIT — Mise à jour complète v10 : 8 modifications en un seul prompt

## MESSAGE PRÉALABLE

Ce prompt contient 8 modifications interdépendantes. C'est un document **autonome** — tout le code nécessaire est inclus, aucune référence externe.

Avant d'exécuter :

1. **Lis le prompt EN ENTIER** avant de toucher au code
2. **Analyse le code actuel** — les numéros de lignes sont indicatifs (le code a pu évoluer). Utilise des recherches textuelles plutôt que des numéros de lignes.
3. **Vérifie la cohérence** de chaque modification avec le reste du projet — en particulier les interactions avec le scheduler (schLoop), les audio nodes du moteur (Eng), le pattern bank, et le FXRack
4. **Identifie les effets de bord** et propose des actions correctives si nécessaire
5. **Exécute dans cet ordre strict** : 1 → 3 → 2 → 6 → 7 → 8 → 4 → 5
6. **Teste après chaque étape** — build TypeScript + test fonctionnel

---

## ORDRE D'EXÉCUTION

```
Mod 1 (8 tracks)              → Aucune dépendance. Change le contexte de base.
Mod 3 (transitions CSS+hook)  → Aucune dépendance. Pose la fondation visuelle.
Mod 2 (nav bigger + pill)     → Dépend de Mod 3 (même courbe cubic-bezier).
Mod 6 (custom track + color)  → Dépend de Mod 1 (8 tracks = 8 couleurs SEC_COL prises).
Mod 7 (bottom nav bar)        → Dépend de Mod 2 (supprime les boutons nav du header).
Mod 8 (mini waveform ♪)       → Indépendant. Touche TrackRow + euclidien.
Mod 4 (PatternBank + Arranger)→ Dépend de Mod 1, 3.
Mod 5 (Performance FX)        → Dépend de Mod 1, 3, 4. En dernier.
```

## RÈGLES ABSOLUES
- Ne JAMAIS modifier la classe Eng (Audio Engine) sauf ajout de méthodes utilitaires
- Ne JAMAIS modifier le scheduler schLoop
- Ne JAMAIS supprimer de code fonctionnel
- Build TypeScript sans erreur après chaque modification
- Compatible mobile (touch, min 44px tap) + desktop

---

# MODIFICATION 1 — 8 tracks actives par défaut

Rechercher `const DEFAULT_ACTIVE` et remplacer :

```typescript
const DEFAULT_ACTIVE=["kick","snare","hihat","clap","tom","ride","crash","perc"];
```

Vérifications :
- ALL_TRACKS contient ces 8 ids
- mkE(steps) itère sur ALL_TRACKS → ok
- Template Boom Bap au premier lancement ne fait pas de setAct() qui écraserait
- Live Pads grid repeat(min(4,atO.length),1fr) → 4×2 correct

---

# MODIFICATION 2 — Boutons de navigation plus grands

### A. Modifier la fonction pill

Rechercher `const pill=(on,c)=>` et remplacer :

```typescript
const pill=(on,c)=>({
  padding:"8px 16px",
  border:`1.5px solid ${on?c+"66":th.sBorder}`,
  borderRadius:8,
  background:on?c+"22":"rgba(255,255,255,0.03)",
  color:on?c:c+'77',
  fontSize:11,
  fontWeight:800,
  cursor:"pointer",
  letterSpacing:"0.06em",
  textTransform:"uppercase",
  fontFamily:"inherit",
  transition:"all 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
  boxShadow:on?`0 0 12px ${c}22`:"none",
});
```

### B. Boutons inline SEQUENCER et EUCLIDIAN

Rechercher `>SEQUENCER</button>` et `>⬡ EUCLIDIAN</button>`. Pour chacun :
- padding:"5px 11px" → "8px 16px"
- fontSize:9 → 11
- fontWeight:700 → 800
- th.dim → couleur propre atténuée `c+'77'` (couleur inactive = même teinte que actif mais à ~47% d'opacité)
- Ajouter: transition:"all 0.2s cubic-bezier(0.32, 0.72, 0, 1)"

---

# MODIFICATION 3 — Système de transitions visuelles

### A. Ajouter dans src/index.css

```css
.ks-panel-enter {
  transform: translateY(16px);
  opacity: 0;
  max-height: 0;
  overflow: hidden;
  transition: transform 0.28s cubic-bezier(0.32,0.72,0,1),
              opacity 0.28s cubic-bezier(0.32,0.72,0,1),
              max-height 0.28s cubic-bezier(0.32,0.72,0,1);
}
.ks-panel-active {
  transform: translateY(0);
  opacity: 1;
  max-height: 2000px;
  overflow: visible;
  transition: transform 0.28s cubic-bezier(0.32,0.72,0,1),
              opacity 0.28s cubic-bezier(0.32,0.72,0,1),
              max-height 0.28s cubic-bezier(0.32,0.72,0,1);
}
.ks-panel-exit {
  transform: translateY(10px);
  opacity: 0;
  max-height: 0;
  overflow: hidden;
  transition: transform 0.2s cubic-bezier(0.32,0.72,0,1),
              opacity 0.2s cubic-bezier(0.32,0.72,0,1),
              max-height 0.2s cubic-bezier(0.32,0.72,0,1);
}
.ks-modal-bg-enter  { opacity: 0; transition: opacity 0.25s ease; }
.ks-modal-bg-active { opacity: 1; transition: opacity 0.25s ease; }
.ks-modal-enter     { opacity: 0; transform: scale(0.95); transition: all 0.25s cubic-bezier(0.32,0.72,0,1); }
.ks-modal-active    { opacity: 1; transform: scale(1);    transition: all 0.25s cubic-bezier(0.32,0.72,0,1); }
```

### B. Créer src/hooks/usePanelTransition.ts

```typescript
import { useState, useRef, useCallback } from 'react';

type PanelState = 'hidden' | 'entering' | 'active' | 'exiting';

export function usePanelTransition(initialOpen = false) {
  const [state, setState] = useState<PanelState>(initialOpen ? 'active' : 'hidden');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('entering');
    requestAnimationFrame(() => requestAnimationFrame(() => setState('active')));
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('exiting');
    timerRef.current = setTimeout(() => setState('hidden'), 300);
  }, []);

  const toggle = useCallback(() => {
    if (state === 'hidden' || state === 'exiting') show();
    else hide();
  }, [state, show, hide]);

  const set = useCallback((open: boolean) => { open ? show() : hide(); }, [show, hide]);

  return {
    visible: state !== 'hidden',
    isOpen: state === 'active' || state === 'entering',
    className: state === 'entering' ? 'ks-panel-enter'
      : state === 'active' ? 'ks-panel-active'
      : state === 'exiting' ? 'ks-panel-exit'
      : 'ks-panel-enter',
    show, hide, toggle, set,
  };
}
```

### C. Application progressive

Migrer showTS, showFxRack, showLooper vers usePanelTransition :

```typescript
// AVANT : const [showTS, setShowTS] = useState(false);
// APRÈS : const tsPanel = usePanelTransition(false);
// JSX :   {tsPanel.visible && (<div className={tsPanel.className}>...</div>)}
// Toggle: onClick={() => tsPanel.toggle()}
```

### D. Bottom sheet overlay pour SampleLoaderModal et QuickSampleFx

Le `SampleLoaderModal` (enregistrement micro + chargement fichier) et le `QuickSampleFx` (pitch/filter/drive rapide) doivent utiliser le **style bottom sheet overlay** — pas un panneau inline. Ils flottent par-dessus le contenu :

```tsx
{/* Bottom sheet overlay — à utiliser pour SampleLoaderModal et QuickSampleFx */}
{panelTransition.visible && (
  <>
    {/* Overlay sombre — clic = ferme */}
    <div
      onClick={() => panelTransition.hide()}
      className={panelTransition.isOpen ? 'modal-overlay-active' : 'modal-overlay-enter'}
      style={{ position:'fixed', inset:0, zIndex:150, background:'rgba(0,0,0,0.4)' }}
    />
    {/* Bottom sheet qui remonte depuis le bas */}
    <div
      className={panelTransition.className}
      style={{
        position:'fixed', bottom:70, left:0, right:0, zIndex:151,
        maxWidth:960, margin:'0 auto',
        background:th.bg, borderRadius:'16px 16px 0 0',
        border:`1px solid ${th.sBorder}`, borderBottom:'none',
        padding:'16px 14px 20px',
        boxShadow:'0 -4px 24px rgba(0,0,0,0.15)',
        maxHeight:'70vh', overflowY:'auto',
      }}
    >
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <span style={{ fontSize:10, fontWeight:800, color:'#FF9500', letterSpacing:'0.1em' }}>
          {/* LOAD SAMPLE ou SAMPLE FX selon le panneau */}
        </span>
        <button onClick={() => panelTransition.hide()}
          style={{ width:24, height:24, borderRadius:6, border:'none', background:'rgba(255,55,95,0.1)', color:'#FF375F', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
      </div>
      {/* Contenu du panneau ici */}
    </div>
  </>
)}
```

**Appliquer ce pattern à :**
- **SampleLoaderModal** : le panneau de chargement de sample (fichier local + enregistrement micro + trim waveform). `bottom:70` pour être au-dessus de la bottom nav. `maxHeight:70vh` pour ne pas cacher toute la page.
- **QuickSampleFx** : le panneau FX rapide (pitch/filter/drive/volume par track). Plus petit, même structure.

**Points clés :**
- `bottom:70` = juste au-dessus de la bottom nav bar (Mod 7)
- `borderRadius:'16px 16px 0 0'` = coins arrondis en haut seulement
- `maxHeight:'70vh'` + `overflowY:'auto'` = scroll interne si le contenu est long (ex: trim waveform)
- L'overlay sombre capte les clics pour fermer
- Le slide-up utilise les mêmes classes CSS `ks-panel-enter/active/exit` que les panneaux inline

---

# MODIFICATION 4 — PatternBank : Clip Launcher + Song Timeline

### Clip Launcher (cartes plus grandes)

Dans PatternBank.jsx, remplacer les mini-boutons par des cartes 60×50px :

```tsx
<div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 0', WebkitOverflowScrolling: 'touch' }}>
  {pBank.map((pat, i) => {
    const isActive = cPat === i;
    const isPlaying = playing && songMode && songChain[songPosRef.current] === i;
    const col = SEC_COL[i % SEC_COL.length];
    return (
      <div key={i}
        onClick={() => setCPat(i)}
        onDoubleClick={() => {
          setCPat(i);
          if (playing && songMode) {
            const idx = songChain.indexOf(i);
            if (idx >= 0) songPosRef.current = idx;
          }
        }}
        style={{
          minWidth: 60, padding: '6px 8px', borderRadius: 10, flexShrink: 0,
          border: `2px solid ${isActive ? col : 'transparent'}`,
          background: isActive ? col + '18' : th.surface,
          cursor: 'pointer', textAlign: 'center',
          transition: 'all 0.2s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: isPlaying ? `0 0 16px ${col}44` : 'none',
        }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: col }}>{patNames?.[i] || `P${i+1}`}</div>
        <MiniGrid steps={pat?.kick || []} color={col} n={STEPS} />
        {isPlaying && <div style={{ height: 2, background: col, borderRadius: 1, marginTop: 3, animation: 'rb 0.8s infinite' }} />}
      </div>
    );
  })}
  {pBank.length < MAX_PAT && (
    <button onClick={() => setPBank(p => [...p, mkE(STEPS)])}
      style={{ minWidth: 40, height: 50, borderRadius: 10, border: `1px dashed ${th.sBorder}`, background: 'transparent', color: th.dim, fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>+</button>
  )}
</div>
```

### Song Timeline (panneau inline slide-up)

Importer le hook dans PatternBank.jsx :
```typescript
import { usePanelTransition } from '../hooks/usePanelTransition';
```

```tsx
const songTimeline = usePanelTransition(false);

{/* Toggle */}
<div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
  <button onClick={() => songTimeline.toggle()}
    style={{ ...pill(songTimeline.isOpen, '#BF5AF2'), fontSize: 9 }}>
    {songTimeline.isOpen ? '▼' : '▶'} SONG
  </button>
  {songMode && <span style={{ fontSize: 8, fontWeight: 800, color: '#30D158' }}>● SONG MODE</span>}
</div>

{/* Timeline — inline slide-up */}
{songTimeline.visible && (
  <div className={songTimeline.className}>
    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '8px 4px', WebkitOverflowScrolling: 'touch' }}>
      {songChain.map((patIdx, si) => {
        const col = SEC_COL[patIdx % SEC_COL.length];
        const isCurrent = songPosRef.current === si && playing && songMode;
        return (
          <div key={si}
            onClick={() => { songPosRef.current = si; }}
            onContextMenu={e => { e.preventDefault(); setSongChain(p => p.filter((_, j) => j !== si)); }}
            style={{
              minWidth: 34, height: 34, borderRadius: 7, flexShrink: 0,
              background: col + (isCurrent ? '55' : '22'),
              border: `1.5px solid ${col}${isCurrent ? 'aa' : '44'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: col, cursor: 'pointer',
              transition: 'all 0.15s',
              boxShadow: isCurrent ? `0 0 10px ${col}44` : 'none',
            }}>
            {patIdx + 1}
          </div>
        );
      })}
      <button onClick={() => setSongChain(p => [...p, cPat])}
        style={{ minWidth: 34, height: 34, borderRadius: 7, border: `1px dashed ${th.sBorder}`, background: 'transparent', color: th.dim, fontSize: 14, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
    </div>
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      <button onClick={() => setSongMode(p => !p)}
        style={{ ...pill(songMode, '#30D158'), fontSize: 9 }}>
        {songMode ? '■ STOP' : '▶'} SONG
      </button>
      <button onClick={() => { setSongChain([]); songPosRef.current = 0; }}
        style={{ ...pill(false, '#FF2D55'), fontSize: 9 }}>CLEAR</button>
    </div>
  </div>
)}
```

Note: le scheduler lit R.songChain et R.songMode — aucune modification du scheduler nécessaire.

---

# MODIFICATION 5 — Performance FX : swipe track + reverb/delay hold

### Nouveaux states dans KickAndSnare.tsx

```typescript
const [showPerform, setShowPerform] = useState(false);
const [perfTrack, setPerfTrack] = useState<string>('__master__');
const perfTrackRef = useRef('__master__');
useEffect(() => { perfTrackRef.current = perfTrack; }, [perfTrack]);
const perfTrackList = useMemo(() => [...act, '__master__'], [act]);

const [perfFilterPos, setPerfFilterPos] = useState<{x:number,y:number}|null>(null);
const [perfRvHold, setPerfRvHold] = useState(false);
const [perfRvMix, setPerfRvMix] = useState(60);
const [perfRvDecay, setPerfRvDecay] = useState(1.5);
const perfRvPrevRef = useRef<{mix:number}|null>(null);

const [perfDlHold, setPerfDlHold] = useState(false);
const [perfDlMix, setPerfDlMix] = useState(50);
const [perfDlTime, setPerfDlTime] = useState(0.25);
const [perfDlFb, setPerfDlFb] = useState(40);
const perfDlPrevRef = useRef<{mix:number}|null>(null);

const [stutterDiv, setStutterDiv] = useState('1/8');
const stutterRef = useRef<ReturnType<typeof setInterval>|null>(null);
const lastTrigRef = useRef<string>('kick');
```

### Track selector swipe

```typescript
const perfSwipeRef = useRef<{startX:number}|null>(null);

const onPerfSwipeStart = (e: React.TouchEvent|React.PointerEvent) => {
  const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
  perfSwipeRef.current = { startX: x };
};
const onPerfSwipeEnd = (e: React.TouchEvent|React.PointerEvent) => {
  if (!perfSwipeRef.current) return;
  const x = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
  const dx = x - perfSwipeRef.current.startX;
  if (Math.abs(dx) > 40) {
    const curIdx = perfTrackList.indexOf(perfTrack);
    const nextIdx = dx < 0
      ? Math.min(curIdx + 1, perfTrackList.length - 1)
      : Math.max(curIdx - 1, 0);
    setPerfTrack(perfTrackList[nextIdx]);
  }
  perfSwipeRef.current = null;
};
```

### Filter XY ciblé par track

```typescript
const applyFilter = (freq: number, q: number) => {
  const t = engine.ctx.currentTime;
  const target = perfTrackRef.current;
  if (target === '__master__') {
    engine.gFlt.frequency.setTargetAtTime(freq, t, 0.01);
    engine.gFlt.Q.setTargetAtTime(q, t, 0.01);
    if (engine.gFlt2) { engine.gFlt2.frequency.setTargetAtTime(freq, t, 0.01); engine.gFlt2.Q.setTargetAtTime(q, t, 0.01); }
  } else {
    const ch = engine.ch[target];
    if (ch?.flt) { ch.flt.frequency.setTargetAtTime(freq, t, 0.01); ch.flt.Q.setTargetAtTime(q, t, 0.01); }
  }
};
const resetFilter = () => {
  const t = engine.ctx.currentTime;
  const target = perfTrackRef.current;
  if (target === '__master__') {
    engine.gFlt.frequency.setTargetAtTime(20000, t, 0.2); engine.gFlt.Q.setTargetAtTime(0, t, 0.2);
    if (engine.gFlt2) { engine.gFlt2.frequency.setTargetAtTime(20000, t, 0.2); engine.gFlt2.Q.setTargetAtTime(0, t, 0.2); }
  } else {
    const ch = engine.ch[target];
    const trackFx = fx[target] || DEFAULT_FX;
    if (ch?.flt) { ch.flt.frequency.setTargetAtTime(trackFx.cut||20000, t, 0.2); ch.flt.Q.setTargetAtTime(trackFx.res||0, t, 0.2); }
  }
};
```

### Reverb HOLD

```typescript
const startRvHold = () => {
  setPerfRvHold(true); engine.init();
  const t = engine.ctx.currentTime;
  const target = perfTrackRef.current;
  if (target === '__master__') {
    perfRvPrevRef.current = { mix: engine.gRvBus.gain.value };
    engine.gRvBus.gain.setTargetAtTime(perfRvMix / 100, t, 0.02);
  } else {
    const ch = engine.ch[target];
    if (ch?.rvSend) { perfRvPrevRef.current = { mix: ch.rvSend.gain.value }; ch.rvSend.gain.setTargetAtTime(perfRvMix / 100, t, 0.02); }
  }
  engine.updateReverb(perfRvDecay);
};
const stopRvHold = () => {
  setPerfRvHold(false); if (!engine.ctx) return;
  const t = engine.ctx.currentTime; const prev = perfRvPrevRef.current; const target = perfTrackRef.current;
  if (target === '__master__' && prev) { engine.gRvBus.gain.setTargetAtTime(prev.mix, t, 0.5); }
  else if (prev) { const ch = engine.ch[target]; if (ch?.rvSend) ch.rvSend.gain.setTargetAtTime(prev.mix, t, 0.5); }
  perfRvPrevRef.current = null;
};
```

### Delay HOLD

```typescript
const startDlHold = () => {
  setPerfDlHold(true); engine.init();
  const t = engine.ctx.currentTime; const target = perfTrackRef.current;
  if (target === '__master__') {
    perfDlPrevRef.current = { mix: engine.gDlBus.gain.value };
    engine.gDlBus.gain.setTargetAtTime(perfDlMix / 100, t, 0.02);
    engine.gDl.delayTime.setTargetAtTime(Math.min(1.9, perfDlTime), t, 0.02);
    engine.gDlFb.gain.setTargetAtTime(perfDlFb / 100, t, 0.02);
  } else {
    const ch = engine.ch[target]; if (ch?.dlSend) { perfDlPrevRef.current = { mix: ch.dlSend.gain.value }; ch.dlSend.gain.setTargetAtTime(perfDlMix / 100, t, 0.02); }
  }
};
const stopDlHold = () => {
  setPerfDlHold(false); if (!engine.ctx) return;
  const t = engine.ctx.currentTime; const prev = perfDlPrevRef.current; const target = perfTrackRef.current;
  if (target === '__master__' && prev) {
    engine.gDlBus.gain.setTargetAtTime(prev.mix, t, 0.3);
    engine.gDlFb.gain.setTargetAtTime(0, t, 0.8); // feedback decay naturel
  } else if (prev) { const ch = engine.ch[target]; if (ch?.dlSend) ch.dlSend.gain.setTargetAtTime(prev.mix, t, 0.3); }
  perfDlPrevRef.current = null;
};
```

### Stutter

```typescript
const divToMs = (div: string, bpm: number) => {
  const beat = 60000/bpm;
  return {'1/4':beat,'1/8':beat/2,'1/16':beat/4,'1/32':beat/8}[div] || beat/2;
};
const startStutter = () => {
  const ms = divToMs(stutterDiv, bpm); const tid = lastTrigRef.current;
  stutterRef.current = setInterval(() => { engine.play(tid, 0.8, 0, R.fx[tid]||DEFAULT_FX); }, ms);
};
const stopStutter = () => { if (stutterRef.current) { clearInterval(stutterRef.current); stutterRef.current = null; } };
useEffect(() => { return () => { if (stutterRef.current) clearInterval(stutterRef.current); }; }, []);
```

### Mettre à jour lastTrigRef dans trigPad

Rechercher trigPad, ajouter après engine.play(...) :
```typescript
lastTrigRef.current = tid;
```

### Rendu du panneau PERFORM dans la vue LIVE PADS

Créer `const perfPanel = usePanelTransition(false);` puis ajouter dans {view==="pads"&&(…)} avant le looper :

```tsx
<button onClick={() => perfPanel.isOpen ? perfPanel.hide() : perfPanel.show()}
  style={{ ...pill(perfPanel.isOpen, '#BF5AF2'), marginBottom: 8, width: '100%' }}>
  🎛 PERFORM {perfPanel.isOpen ? '▼' : '▶'}
</button>

{perfPanel.visible && (
  <div className={perfPanel.className} style={{ marginBottom: 10, padding: 10, borderRadius: 12, border: '1px solid rgba(191,90,242,0.2)', background: th.surface }}>
    
    {/* Track selector swipe */}
    <div onTouchStart={onPerfSwipeStart} onTouchEnd={onPerfSwipeEnd}
      onPointerDown={e=>{if(e.pointerType!=='touch')onPerfSwipeStart(e);}} onPointerUp={e=>{if(e.pointerType!=='touch')onPerfSwipeEnd(e);}}
      style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'6px 0', touchAction:'pan-y', userSelect:'none' }}>
      <span style={{fontSize:16,color:th.dim,cursor:'pointer'}} onClick={()=>{const i=perfTrackList.indexOf(perfTrack);if(i>0)setPerfTrack(perfTrackList[i-1]);}}>‹</span>
      <div style={{ padding:'5px 18px', borderRadius:8, minWidth:90, textAlign:'center',
        background: perfTrack==='__master__' ? 'rgba(255,214,10,0.08)' : `${allT.find(t=>t.id===perfTrack)?.color||'#888'}18`,
        border: `1.5px solid ${perfTrack==='__master__' ? '#FFD60A44' : (allT.find(t=>t.id===perfTrack)?.color||'#888')+'55'}`,
        transition:'all 0.15s cubic-bezier(0.32,0.72,0,1)' }}>
        <span style={{ fontSize:11, fontWeight:800, letterSpacing:'0.08em',
          color: perfTrack==='__master__' ? '#FFD60A' : allT.find(t=>t.id===perfTrack)?.color||'#888' }}>
          {perfTrack==='__master__' ? '★ MASTER' : allT.find(t=>t.id===perfTrack)?.label||perfTrack}
        </span>
      </div>
      <span style={{fontSize:16,color:th.dim,cursor:'pointer'}} onClick={()=>{const i=perfTrackList.indexOf(perfTrack);if(i<perfTrackList.length-1)setPerfTrack(perfTrackList[i+1]);}}>›</span>
    </div>

    {/* Filter XY + Stutter row */}
    <div style={{ display:'flex', gap:8, marginTop:8 }}>
      <div style={{ flex:2, height:80, borderRadius:8, background:'rgba(0,0,0,0.08)', position:'relative', touchAction:'none', cursor:'crosshair' }}
        onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
          const rect=e.currentTarget.getBoundingClientRect();
          const x=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
          const y=Math.max(0,Math.min(1,1-(e.clientY-rect.top)/rect.height));
          applyFilter(20*Math.pow(1000,x), y*25); setPerfFilterPos({x,y});
        }}
        onPointerMove={e=>{if(!perfFilterPos)return;
          const rect=e.currentTarget.getBoundingClientRect();
          const x=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
          const y=Math.max(0,Math.min(1,1-(e.clientY-rect.top)/rect.height));
          applyFilter(20*Math.pow(1000,x), y*25); setPerfFilterPos({x,y});
        }}
        onPointerUp={()=>{setPerfFilterPos(null);resetFilter();}}
        onPointerLeave={()=>{if(perfFilterPos){setPerfFilterPos(null);resetFilter();}}}
      >
        <span style={{position:'absolute',top:4,left:6,fontSize:7,fontWeight:700,color:th.dim}}>FILTER XY</span>
        {perfFilterPos&&<div style={{position:'absolute',width:12,height:12,borderRadius:6,background:'#FF9500',left:`${perfFilterPos.x*100}%`,top:`${(1-perfFilterPos.y)*100}%`,transform:'translate(-50%,-50%)',boxShadow:'0 0 8px #FF950066',pointerEvents:'none'}}/>}
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',gap:4}}>
        <button onPointerDown={startStutter} onPointerUp={stopStutter} onPointerLeave={stopStutter}
          onTouchStart={e=>{e.preventDefault();startStutter();}} onTouchEnd={stopStutter}
          style={{flex:1,borderRadius:8,border:`1px solid ${th.sBorder}`,background:stutterRef.current?'#FF950022':'transparent',color:'#FF9500',fontSize:9,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>
          STUTTER
        </button>
        <div style={{display:'flex',gap:2}}>
          {['1/4','1/8','1/16','1/32'].map(d=>(
            <button key={d} onClick={()=>setStutterDiv(d)}
              style={{flex:1,padding:'2px 0',borderRadius:4,border:'none',background:stutterDiv===d?'#FF950022':'transparent',color:stutterDiv===d?'#FF9500':th.dim,fontSize:7,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>{d}</button>
          ))}
        </div>
      </div>
    </div>

    {/* Reverb + Delay HOLD row */}
    <div style={{display:'flex',gap:8,marginTop:8}}>
      <div style={{flex:1,padding:8,borderRadius:10,border:`1px solid ${perfRvHold?'#64D2FF55':th.sBorder}`,background:perfRvHold?'#64D2FF08':'transparent',transition:'all 0.15s'}}>
        <button onPointerDown={startRvHold} onPointerUp={stopRvHold} onPointerLeave={stopRvHold}
          onTouchStart={e=>{e.preventDefault();startRvHold();}} onTouchEnd={stopRvHold}
          style={{width:'100%',padding:'8px 0',borderRadius:8,border:'none',background:perfRvHold?'#64D2FF':'#64D2FF18',color:perfRvHold?'#fff':'#64D2FF',fontSize:9,fontWeight:800,cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.06em',transition:'all 0.1s'}}>
          🔔 REVERB {perfRvHold ? '● ON' : '(hold)'}
        </button>
        <div style={{display:'flex',gap:6,marginTop:6,fontSize:7,color:th.dim}}>
          <label style={{flex:1}}>Mix {perfRvMix}%<input type="range" min={0} max={100} value={perfRvMix} onChange={e=>setPerfRvMix(+e.target.value)} style={{width:'100%',height:3,accentColor:'#64D2FF'}}/></label>
          <label style={{flex:1}}>Decay {perfRvDecay.toFixed(1)}s<input type="range" min={1} max={50} value={perfRvDecay*10} onChange={e=>setPerfRvDecay(+e.target.value/10)} style={{width:'100%',height:3,accentColor:'#64D2FF'}}/></label>
        </div>
      </div>
      <div style={{flex:1,padding:8,borderRadius:10,border:`1px solid ${perfDlHold?'#30D15855':th.sBorder}`,background:perfDlHold?'#30D15808':'transparent',transition:'all 0.15s'}}>
        <button onPointerDown={startDlHold} onPointerUp={stopDlHold} onPointerLeave={stopDlHold}
          onTouchStart={e=>{e.preventDefault();startDlHold();}} onTouchEnd={stopDlHold}
          style={{width:'100%',padding:'8px 0',borderRadius:8,border:'none',background:perfDlHold?'#30D158':'#30D15818',color:perfDlHold?'#fff':'#30D158',fontSize:9,fontWeight:800,cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.06em',transition:'all 0.1s'}}>
          ⟳ DELAY {perfDlHold ? '● ON' : '(hold)'}
        </button>
        <div style={{display:'flex',gap:4,marginTop:6,fontSize:7,color:th.dim}}>
          <label style={{flex:1}}>Mix {perfDlMix}%<input type="range" min={0} max={100} value={perfDlMix} onChange={e=>setPerfDlMix(+e.target.value)} style={{width:'100%',height:3,accentColor:'#30D158'}}/></label>
          <label style={{flex:1}}>Time {perfDlTime.toFixed(2)}s<input type="range" min={5} max={190} value={perfDlTime*100} onChange={e=>setPerfDlTime(+e.target.value/100)} style={{width:'100%',height:3,accentColor:'#30D158'}}/></label>
          <label style={{flex:1}}>FB {perfDlFb}%<input type="range" min={0} max={90} value={perfDlFb} onChange={e=>setPerfDlFb(+e.target.value)} style={{width:'100%',height:3,accentColor:'#30D158'}}/></label>
        </div>
      </div>
    </div>
  </div>
)}
```

---

# MODIFICATION 6 — Fix custom track + color picker

### A. Ajouter CUSTOM_COLORS après SEC_COL

```typescript
const CUSTOM_COLORS = [
  '#E91E63','#9C27B0','#00BCD4','#8BC34A','#FF5722','#607D8B',
  '#CDDC39','#00E676','#F50057','#18FFFF','#76FF03','#FF6E40',
  '#B388FF','#1DE9B6','#FFAB40','#8D6E63',
];
```

### B. Ajouter state

```typescript
const [selectedCustomColor, setSelectedCustomColor] = useState<string | null>(null);
```

### C. Réécrire addCustomTrack

```typescript
const addCustomTrack = () => {
  const name = newTrackName.trim(); if (!name) return;
  const id = `ct_${Date.now()}`; const N = STEPS;
  const usedColors = new Set([...ALL_TRACKS.map(t=>t.color),...customTracks.map(t=>t.color)]);
  const autoColor = CUSTOM_COLORS.find(c=>!usedColors.has(c)) || CUSTOM_COLORS[customTracks.length%CUSTOM_COLORS.length];
  const finalColor = selectedCustomColor || autoColor;
  const t = { id, label:name.toUpperCase().slice(0,10), icon:CUST_ICONS[customTracks.length%CUST_ICONS.length], color:finalColor };
  const newCustomTracks = [...customTracks, t];
  R.allT = [...ALL_TRACKS, ...newCustomTracks]; // sync avant setState
  setCustomTracks(p=>[...p,t]);
  setPBank(pb=>pb.map(pat=>({...pat,[id]:Array(N).fill(0),_steps:{...(pat._steps||{}),[id]:N}})));
  setStVel(p=>({...p,[id]:Array(N).fill(100)}));
  setStNudge(p=>({...p,[id]:Array(N).fill(0)}));
  setStProb(p=>({...p,[id]:Array(N).fill(100)}));
  setStRatch(p=>({...p,[id]:Array(N).fill(1)}));
  setFx(p=>({...p,[id]:{...DEFAULT_FX}}));
  setAct(a=>[...a,id]);
  setNewTrackName(""); setShowCustomInput(false); setShowAdd(false); setSelectedCustomColor(null);
  setSmpN(p=>({...p,[id]:"808 Cowbell (synth)"}));
  engine.init(); if(!engine.ch[id])engine._build(id);
  (async()=>{
    try{ const sr=engine.ctx.sampleRate; const oCtx=new OfflineAudioContext(1,Math.ceil(sr*0.65),sr); engine._syn(id,0,1,oCtx.destination,oCtx); engine.buf[id]=await oCtx.startRendering(); }catch(e){console.warn("Custom 808 prerender failed",e);}
    if(engine.buf[id]){engine.play(id,0.7,0,{...DEFAULT_FX});}
  })();
};
```

### D. Réécrire CustomTrackInput avec color picker

```typescript
const CustomTrackInput = () => showCustomInput ? (
  <div style={{display:"flex",flexDirection:"column",gap:6,width:"100%",marginTop:4}}>
    <div style={{display:"flex",gap:4,alignItems:"center"}}>
      <div style={{ width:22,height:22,borderRadius:11,flexShrink:0,
        background:selectedCustomColor||CUSTOM_COLORS.find(c=>!new Set([...ALL_TRACKS.map(t=>t.color),...customTracks.map(t=>t.color)]).has(c))||CUSTOM_COLORS[0],
        border:`2px solid ${th.sBorder}`, boxShadow:`0 0 6px ${(selectedCustomColor||'#888')}44` }}/>
      <input autoFocus value={newTrackName} onChange={e=>setNewTrackName(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter")addCustomTrack();if(e.key==="Escape"){setShowCustomInput(false);setNewTrackName("");setSelectedCustomColor(null);}}}
        placeholder="Track name…" maxLength={10}
        style={{ flex:1,height:28,borderRadius:6,border:`1.5px solid ${selectedCustomColor?selectedCustomColor+'66':th.sBorder}`,
          background:"transparent",color:th.text,fontSize:11,fontWeight:700,padding:"0 8px",fontFamily:"inherit",outline:"none",transition:"border-color 0.15s" }}/>
      <button onClick={addCustomTrack} disabled={!newTrackName.trim()}
        style={{ padding:"5px 14px",borderRadius:6,border:"1px solid rgba(48,209,88,0.4)",
          background:newTrackName.trim()?"rgba(48,209,88,0.15)":"transparent",color:newTrackName.trim()?"#30D158":th.dim,
          fontSize:10,fontWeight:800,cursor:newTrackName.trim()?"pointer":"default",fontFamily:"inherit",transition:"all 0.12s" }}>ADD</button>
      <button onClick={()=>{setShowCustomInput(false);setNewTrackName("");setSelectedCustomColor(null);}}
        style={{width:24,height:28,borderRadius:6,border:"none",background:"transparent",color:th.dim,fontSize:12,cursor:"pointer",lineHeight:1}}>✕</button>
    </div>
    <div style={{display:"flex",gap:5,flexWrap:"wrap",paddingLeft:2,alignItems:"center"}}>
      <span style={{fontSize:8,fontWeight:700,color:th.dim,marginRight:2}}>COLOR</span>
      {(()=>{
        const usedColors=new Set([...ALL_TRACKS.map(t=>t.color),...customTracks.map(t=>t.color)]);
        return CUSTOM_COLORS.filter(c=>!usedColors.has(c)).slice(0,12).map(c=>(
          <button key={c} onClick={()=>setSelectedCustomColor(c)}
            style={{ width:22,height:22,borderRadius:11,padding:0,
              border:selectedCustomColor===c?`2.5px solid ${th.text}`:`1.5px solid ${c}55`,
              background:c,cursor:"pointer",
              transform:selectedCustomColor===c?"scale(1.25)":"scale(1)",
              transition:"all 0.1s",
              boxShadow:selectedCustomColor===c?`0 0 10px ${c}66`:"none" }}/>
        ));
      })()}
    </div>
  </div>
):(
  <button onClick={()=>{setShowCustomInput(true);setSelectedCustomColor(null);}}
    style={{padding:"5px 14px",borderRadius:6,border:`1px dashed ${th.sBorder}`,background:"transparent",color:th.dim,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ CUSTOM</button>
);
```

---

# MODIFICATION 7 — Bottom navigation bar (style Flip/Koala)

## Objectif
Déplacer les onglets de vue (LIVE PADS, SEQUENCER, EUCLIDIAN) depuis le header vers une **barre fixe en bas** de l'écran. Sur mobile, le pouce atteint le bas beaucoup plus facilement que le haut.

## Ce qui bouge en bas
Les 3 boutons de vue : LIVE PADS, SEQUENCER, EUCLIDIAN

## Ce qui reste en haut
Logo, batteur animé, TransportBar, boutons tutorial/info, kit selector

## Implémentation

### A. Supprimer les boutons de vue de leur position actuelle

Rechercher le bloc contenant `LIVE PADS</button>` et le `<div>` parent avec `SEQUENCER` + `EUCLIDIAN`. Supprimer ces boutons de là (conserver le `switchView` et les `data-hint`).

### B. Ajouter la barre fixe en bas

Après la fermeture du dernier `</div>` du contenu scrollable mais AVANT le `</div>` racine, ajouter :

```tsx
{/* ── Bottom Navigation ── */}
<div style={{
  position:'fixed', bottom:0, left:0, right:0, zIndex:100,
  display:'flex', justifyContent:'center', gap:0,
  background: th.bg.includes?.('gradient') ? '#FAFAFA' : th.bg,
  borderTop:`1px solid ${th.sBorder}`,
  paddingBottom:'env(safe-area-inset-bottom, 0px)',
  maxWidth:960, margin:'0 auto',
}}>
  {[
    { id:'pads', label:'PADS', icon:'⊞', color:'#5E5CE6' },
    { id:'sequencer', label:'SEQUENCER', icon:'▦', color:'#FF2D55' },
    { id:'euclid', label:'EUCLID', icon:'⬡', color:'#FFD60A' },
  ].map(tab => (
    <button key={tab.id}
      onClick={() => {
        if (tab.id==='pads') { switchView('pads'); setShowLooper(false); clearFreeCapture?.(); }
        else if (view!==tab.id) switchView(tab.id);
      }}
      style={{
        flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2,
        padding:'10px 4px 8px', border:'none',
        background: view===tab.id ? `${tab.color}15` : 'transparent',
        color: view===tab.id ? tab.color : tab.color+'88',
        fontSize:8, fontWeight:700, letterSpacing:'0.06em', cursor:'pointer',
        fontFamily:'inherit', textTransform:'uppercase', transition:'all 0.15s',
        borderTop: view===tab.id ? `2px solid ${tab.color}` : '2px solid transparent',
      }}>
      <span style={{fontSize:18,lineHeight:1}}>{tab.icon}</span>
      <span>{tab.label}</span>
    </button>
  ))}
</div>
```

### C. Ajouter du padding-bottom au contenu scrollable

Sur le div principal de contenu (celui avec `maxWidth:960`), ajouter :
```typescript
paddingBottom: 70  // hauteur bottom bar + marge
```

### Points d'attention
- `env(safe-area-inset-bottom)` gère les iPhone avec barre virtuelle. Nécessite `<meta name="viewport" content="viewport-fit=cover">` dans le HTML.
- Le fond doit être **solide** (pas le gradient du thème) sinon le contenu scrollé est visible derrière
- z-index 100 (sous les modales à 9999 ou 200)
- Sur desktop large, limiter la largeur (maxWidth:960, centré)

---

# MODIFICATION 8 — Mini waveform dans le bouton ♪

## Objectif
Quand un sample est chargé sur une piste, le bouton ♪ affiche un mini aperçu de la forme d'onde en fond SVG.

## A. Fonction utilitaire

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

## B. Cache des waveforms dans le state

```typescript
const [waveformCache, setWaveformCache] = useState<Record<string, string>>({});
```

Mettre à jour le cache à chaque chargement de sample (dans `onSampleFile`, `onSampleBuffer`, `onFile`, `loadUrl` callbacks, et `applyKit`/`loadUserKit`) :

```typescript
// Après chaque engine.load / engine.loadBuffer / engine.loadUrl réussi :
if (engine.buf[tid]) {
  setWaveformCache(prev => ({ ...prev, [tid]: miniWaveformPath(engine.buf[tid], 28, 16) }));
}
```

## C. Rendu dans le bouton ♪

Modifier le bouton ♪ dans TrackRow (et la section euclidienne) — agrandir de 20px à 32px de large :

```tsx
<button onClick={onLoadSample} style={{ ...btnStyle, width:32, position:'relative', overflow:'hidden' }}>
  {waveformCache[track.id] && (
    <svg viewBox="0 0 28 16" width="28" height="16"
      style={{ position:'absolute', inset:0, margin:'auto', opacity:0.4, pointerEvents:'none' }}>
      <path d={waveformCache[track.id]} stroke={track.color} strokeWidth="1" fill="none" />
    </svg>
  )}
  <span style={{ position:'relative', zIndex:1 }}>♪</span>
</button>
```

## D. Passer le cache comme prop

- `TrackRow` : ajouter prop `waveformPath?: string`
- Section euclidienne inline : accéder à `waveformCache[tr.id]`

## Points d'attention
- `miniWaveformPath` est appelée **une seule fois** par chargement (pas à chaque render)
- Le path SVG est une string légère (~500 chars) stockée dans le state
- Ne PAS accéder à `engine.buf[id]` dans le render — c'est un objet mutable hors React
- Si la piste n'a pas de sample, le bouton reste identique (juste "♪")

---

# MATRICE DE COHÉRENCE

| Mod A | Mod B | Contact | OK |
|-------|-------|---------|----|
| 1 (8 tracks) | 4 (PatternBank) | pBank itère avec 8 pistes | ✅ |
| 1 (8 tracks) | 5 (Perform) | perfTrackList = 8 tracks + master | ✅ |
| 1 (8 tracks) | 6 (custom color) | 8 couleurs SEC_COL prises → CUSTOM_COLORS séparé | ✅ |
| 2 (pill) | 3 (transitions) | Même courbe cubic-bezier | ✅ |
| 2 (pill) | 4 (PatternBank) | pill utilisé par timeline buttons | ✅ |
| 2 (pill) | 7 (bottom nav) | pill N'EST PAS utilisé par la bottom nav (style inline séparé) | ✅ |
| 3 (transitions) | 4 (PatternBank) | songTimeline = usePanelTransition | ✅ |
| 3 (transitions) | 5 (Perform) | perfPanel = usePanelTransition | ✅ |
| 4 (PatternBank) | 5 (Perform) | Vues différentes, pas de conflit | ✅ |
| 5 (Perform) | Engine | gFlt, gRvBus, gDlBus, ch[].flt/rvSend/dlSend existent | ✅ |
| 6 (CUSTOM_COLORS) | SEC_COL | Palettes distinctes | ✅ |
| 6 (R.allT sync) | Scheduler | R.allT sync avant setState | ✅ |
| 7 (bottom nav) | 2 (pill) | Les boutons nav en bas ont leur propre style, pas pill. Supprimer les anciens boutons du header | ✅ |
| 7 (bottom nav) | 4 (PatternBank) | PatternBank est rendu au-dessus de la bottom bar (z-index OK) | ✅ |
| 7 (bottom nav) | 3 (transitions) | Pas d'interaction — la nav n'est pas un panneau animé | ✅ |
| 8 (waveform) | 5 (Perform) | Pas d'interaction — waveform = visuel statique, perform = audio live | ✅ |
| 8 (waveform) | Kit Mgmt | Quand un kit change (applyKit/loadUserKit), recalculer les waveforms | ⚠️ Action : appeler setWaveformCache après chaque chargement dans applyKit et loadUserKit |

---

# PIÈGES À ÉVITER

1. max-height 2000px doit suffire pour tous les panneaux
2. requestAnimationFrame double dans le hook = nécessaire
3. Reverb/Delay hold : restaurer les valeurs AVANT le hold, pas zéro
4. Delay feedback : decay naturel (timeConstant 0.8s)
5. Filter per-track release : restaurer valeurs FX du track
6. Swipe threshold 40px évite faux positifs
7. Song timeline long-press : onContextMenu = fallback. Timer touch si nécessaire
8. CUSTOM_COLORS séparé de SEC_COL
9. Stutter cleanup useEffect
10. engine.init() avant tout hold
11. Bottom nav : `env(safe-area-inset-bottom)` nécessite `viewport-fit=cover` dans le HTML
12. Bottom nav : fond SOLIDE (pas gradient) sinon contenu visible derrière
13. Mini waveform : appeler `miniWaveformPath` uniquement au chargement, PAS dans le render
14. Mini waveform : mettre à jour le cache dans `applyKit` et `loadUserKit` aussi (pas seulement dans `ldFile`)

---

# TEST CHECKLIST

## Mod 1 — 8 tracks
- [ ] 8 lignes séquenceur, 8 pads, 8 rings euclidien
- [ ] Boom Bap template fonctionne

## Mod 2 — Nav visible
- [ ] Boutons >44px, texte 11px, glow actif
- [ ] Transport bar ne déborde pas

## Mod 3 — Transitions
- [ ] Panels slide-up, modals fade+scale
- [ ] Fermeture animée

## Mod 4 — Song Arranger
- [ ] Cartes patterns 60×50px, double-tap switch live
- [ ] Timeline scrollable, ▶ SONG fonctionne

## Mod 5 — Performance FX
- [ ] Swipe track selector, MASTER dans la liste
- [ ] Filter XY ciblé, Reverb/Delay HOLD avec fade
- [ ] Stutter 1/4→1/32, lastTrigRef mis à jour

## Mod 6 — Custom track
- [ ] Pas d'erreur, couleur unique, color picker

## Mod 7 — Bottom nav bar
- [ ] 3 onglets fixés en bas (PADS, SEQUENCER, EUCLID)
- [ ] Onglet actif visuellement distinct (couleur + trait)
- [ ] Clic change de vue correctement
- [ ] Contenu ne passe pas sous la barre (paddingBottom)
- [ ] iPhone safe area respectée
- [ ] Les anciens boutons nav sont supprimés du header

## Mod 8 — Mini waveform
- [ ] Bouton ♪ affiche la waveform quand sample chargé
- [ ] Pas de waveform = juste "♪" comme avant
- [ ] Charger un nouveau sample met à jour la waveform
- [ ] Changer de kit met à jour les waveforms
- [ ] Pas de lag au rendu

## Global
- [ ] Mobile + desktop OK
- [ ] Pas de glitch audio
- [ ] npx tsc --noEmit OK

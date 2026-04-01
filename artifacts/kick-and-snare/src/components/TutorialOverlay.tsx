import { useState, useEffect } from "react";

/* ─── Screenshot-based illustration ───────────────────────────────────── */
const BASE = import.meta.env.BASE_URL as string;

/**
 * Shows a cropped region of a real app screenshot.
 * clipTop / clipBottom are pixel coordinates in the original 1280×800 image.
 */
function IlluImg({
  src,
  clipTop = 0,
  clipBottom = 800,
  displayHeight = 220,
  label,
  labelColor = "#FF9500",
}: {
  src: string;
  clipTop?: number;
  clipBottom?: number;
  displayHeight?: number;
  label?: string;
  labelColor?: string;
}) {
  const origW = 1280;
  const cropH = clipBottom - clipTop;
  const scale = displayHeight / cropH;
  const scaledW = origW * scale;
  const scaledH = 800 * scale;

  return (
    <div style={{ width: "100%", height: displayHeight, overflow: "hidden", position: "relative", background: "#0c0c0f" }}>
      <img
        src={src}
        alt={label ?? "App screenshot"}
        style={{
          position: "absolute",
          width: scaledW,
          height: scaledH,
          top: -clipTop * scale,
          left: "50%",
          transform: "translateX(-50%)",
          imageRendering: "auto",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
      {label && (
        <div style={{
          position: "absolute", bottom: 6, right: 8,
          fontSize: 7, fontWeight: 700, color: labelColor,
          background: "rgba(0,0,0,0.55)", padding: "2px 6px",
          borderRadius: 4, letterSpacing: "0.08em",
        }}>{label}</div>
      )}
    </div>
  );
}

/* ─── Palette ──────────────────────────────────────────────────────────── */
const COLORS = {
  welcome:   "#FF9500",
  transport: "#30D158",
  sequencer: "#FF2D55",
  euclid:    "#FFD60A",
  pads:      "#5E5CE6",
  fxrack:    "#BF5AF2",
  looper:    "#64D2FF",
  shortcuts: "#FF6B35",
};

const BG   = "#0c0c0f";
const SURF = "#161618";

/* ─── Shared SVG atoms ─────────────────────────────────────────────────── */

/** Play triangle (SVG path, no emoji) */
function PlayTriangle({ cx, cy, r, fill }: { cx:number; cy:number; r:number; fill:string }) {
  const h = r * 0.95, w = r * 0.82;
  return <polygon points={`${cx - w*0.45},${cy - h*0.5} ${cx - w*0.45},${cy + h*0.5} ${cx + w*0.55},${cy}`} fill={fill}/>;
}

/** Record dot */
function RecDot({ cx, cy, r, color }: { cx:number; cy:number; r:number; color:string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r+3} fill="none" stroke={color} strokeWidth={1.5}/>
      <circle cx={cx} cy={cy} r={r} fill={color}/>
    </>
  );
}

/** Knob (circle + indicator line) */
function Knob({ cx, cy, r, color, angle="-60" }: { cx:number; cy:number; r:number; color:string; angle?:string }) {
  const a = (Number(angle) * Math.PI) / 180;
  const ix = cx + (r - 3) * Math.sin(a), iy = cy - (r - 3) * Math.cos(a);
  const ox = cx + r * Math.sin(a), oy = cy - r * Math.cos(a);
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={color+"22"} stroke={color+"66"} strokeWidth={1}/>
      <circle cx={cx} cy={cy} r={r-2} fill={color+"10"} stroke={color+"33"} strokeWidth={0.5}/>
      <line x1={ix} y1={iy} x2={ox} y2={oy} stroke={color} strokeWidth={1.8} strokeLinecap="round"/>
    </>
  );
}

/** LED dot */
function LED({ cx, cy, r=3, on, color }: { cx:number; cy:number; r?:number; on:boolean; color:string }) {
  return <circle cx={cx} cy={cy} r={r} fill={on ? color : "#333"} opacity={on ? 1 : 0.5}/>;
}

/** Step cell */
function Step({ x, y, w, h, on, color, active=false }: {
  x:number; y:number; w:number; h:number; on:boolean; color:string; active?:boolean;
}) {
  return (
    <rect x={x} y={y} width={w} height={h} rx={2}
      fill={on ? color+(active?"ee":"88") : color+"18"}
      stroke={on ? color+"cc" : color+"28"}
      strokeWidth={on&&active ? 1 : 0.5}
    />
  );
}

/** Pill button */
function Pill({ x, y, w=36, h=16, label, color, active=false }: {
  x:number; y:number; w?:number; h?:number; label:string; color:string; active?:boolean;
}) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={4}
        fill={active ? color+"33" : color+"12"}
        stroke={active ? color+"88" : color+"33"}
        strokeWidth={0.8}/>
      <text x={x+w/2} y={y+h/2+2.5} fontSize={5.5} fill={active ? color : color+"88"}
        textAnchor="middle" fontWeight={700} letterSpacing={0.3}>{label}</text>
    </>
  );
}

/* ─── Illustrations ────────────────────────────────────────────────────── */

function IlluWelcome() {
  return (
    <IlluImg
      src={`${BASE}tutorial/seq-view.jpg`}
      clipTop={0} clipBottom={540}
      displayHeight={220}
      label="Vue d'ensemble" labelColor="#FF9500"
    />
  );
}

function IlluTransport() {
  return (
    <IlluImg
      src={`${BASE}tutorial/seq-view.jpg`}
      clipTop={84} clipBottom={200}
      displayHeight={160}
      label="Barre de transport" labelColor="#30D158"
    />
  );
}

function IlluSequencer() {
  return (
    <IlluImg
      src={`${BASE}tutorial/seq-view.jpg`}
      clipTop={330} clipBottom={535}
      displayHeight={200}
      label="Séquenceur TR-808" labelColor="#FF2D55"
    />
  );
}

function IlluEuclid() {
  return (
    <IlluImg
      src={`${BASE}tutorial/euclid-view.jpg`}
      clipTop={190} clipBottom={760}
      displayHeight={220}
      label="Séquenceur Euclidien" labelColor="#FFD60A"
    />
  );
}

function IlluPads() {
  return (
    <IlluImg
      src={`${BASE}tutorial/pads-view.jpg`}
      clipTop={295} clipBottom={800}
      displayHeight={220}
      label="Live Pads" labelColor="#5E5CE6"
    />
  );
}

function IlluFxRack() {
  const sends = [
    {l:"REVERB", c:"#64D2FF", on:true,  v:"Room", angle:-40},
    {l:"DELAY",  c:"#30D158", on:true,  v:"1/8",  angle:20},
    {l:"CHORUS", c:"#5E5CE6", on:false, v:"—",    angle:-10},
    {l:"FLANGR", c:"#FF9500", on:false, v:"—",    angle:-30},
    {l:"PING",   c:"#BF5AF2", on:true,  v:"1/4",  angle:40},
  ];
  const chain = [
    {l:"DRIVE", c:"#FF6B35", on:true,  v:"TUBE", angle:-50},
    {l:"COMP",  c:"#BF5AF2", on:true,  v:"-8dB", angle:10},
    {l:"FILTER",c:"#FF9500", on:true,  v:"LP",   angle:-20},
  ];
  const MW = 42, MH = 74;
  return (
    <svg viewBox="0 0 320 150" style={{ width:"100%", maxWidth:320 }}>
      <rect width={320} height={150} rx={10} fill={BG}/>

      {/* Header */}
      <rect x={4} y={4} width={312} height={22} rx={5} fill="#BF5AF214" stroke="#BF5AF228" strokeWidth={0.8}/>
      <text x={12} y={17} fontSize={7.5} fill="#BF5AF2" fontWeight={900} letterSpacing={2}>FX RACK</text>
      <Pill x={222} y={6} w={44} h={16} label="PRESETS" color="#BF5AF2" active/>
      <Pill x={270} y={6} w={40} h={16} label="RESET" color="#FF2D55"/>

      {/* ── Serial chain ── */}
      <text x={8} y={40} fontSize={5} fill="#ffffff33" letterSpacing={1.5}>SERIAL CHAIN  IN →</text>
      {chain.map((fx, i) => (
        <g key={i}>
          <rect x={80+i*74} y={30} width={58} height={18} rx={4} fill={fx.c+"1a"} stroke={fx.c+"44"} strokeWidth={0.8}/>
          <LED cx={88+i*74} cy={39} on={fx.on} color={fx.c}/>
          <text x={108+i*74} y={42} fontSize={6} fill={fx.c} textAnchor="middle" fontWeight={700}>{fx.l}</text>
          {i < 2 && <text x={140+i*74} y={41} fontSize={8} fill="#ffffff22">→</text>}
        </g>
      ))}
      <text x={303} y={40} fontSize={5} fill="#ffffff22">→ OUT</text>

      {/* Separator */}
      <line x1={4} y1={54} x2={316} y2={54} stroke="#ffffff0a" strokeWidth={1}/>
      <text x={8} y={64} fontSize={5} fill="#ffffff22" letterSpacing={1.5}>SEND FX  (parallel)</text>

      {/* Send FX modules */}
      {sends.map((fx, i) => {
        const x = 6 + i * (MW + 5);
        return (
          <g key={i}>
            <rect x={x} y={68} width={MW} height={MH} rx={5}
              fill={fx.on ? fx.c+"12" : "#ffffff05"}
              stroke={fx.on ? fx.c+"44" : "#ffffff10"}
              strokeWidth={0.8}/>
            {/* LED + label */}
            <LED cx={x+7} cy={76} on={fx.on} color={fx.c} r={2.5}/>
            <text x={x+MW/2+2} y={78} fontSize={5} fill={fx.on?fx.c:fx.c+"44"} textAnchor="middle" fontWeight={800}>{fx.l}</text>
            {/* Knob */}
            <Knob cx={x+MW/2} cy={100} r={12} color={fx.on?fx.c:"#444"} angle={String(fx.angle)}/>
            {/* Value */}
            <text x={x+MW/2} y={122} fontSize={5.5} fill={fx.on?fx.c+"bb":"#444"} textAnchor="middle">{fx.v}</text>
            {/* PRE/POST toggle */}
            <rect x={x+4} y={128} width={16} height={9} rx={2} fill="#ffffff08" stroke="#ffffff14" strokeWidth={0.5}/>
            <text x={x+12} y={134.5} fontSize={4} fill="#ffffff44" textAnchor="middle">PRE</text>
            <rect x={x+22} y={128} width={16} height={9} rx={2} fill={fx.c+"18"} stroke={fx.c+"33"} strokeWidth={0.5}/>
            <text x={x+30} y={134.5} fontSize={4} fill={fx.c+"88"} textAnchor="middle">POST</text>
          </g>
        );
      })}
    </svg>
  );
}

function IlluLooper() {
  const hits = [
    {pos:0.06, color:"#FF2D55", h:36},
    {pos:0.14, color:"#FF2D55", h:28},
    {pos:0.25, color:"#FF9500", h:40},
    {pos:0.38, color:"#FF2D55", h:32},
    {pos:0.50, color:"#FF9500", h:36},
    {pos:0.61, color:"#FF2D55", h:30},
    {pos:0.75, color:"#FFD60A", h:38},
    {pos:0.87, color:"#FF9500", h:26},
  ];
  const TLX = 6, TLY = 52, TLW = 308, TLH = 58;
  const playheadX = TLX + 0.28 * TLW;

  return (
    <svg viewBox="0 0 320 150" style={{ width:"100%", maxWidth:320 }}>
      <rect width={320} height={150} rx={10} fill={BG}/>

      {/* ── Controls row ── */}
      {[
        {x:18,  label:"REC",   color:"#FF2D55", shape:"rec"},
        {x:52,  label:"PLAY",  color:"#30D158", shape:"play"},
        {x:86,  label:"STOP",  color:"#64D2FF", shape:"stop"},
        {x:120, label:"UNDO",  color:"#64D2FF", shape:"undo"},
        {x:156, label:"OVERDUB",color:"#FF9500",shape:"ovr"},
        {x:194, label:"BARS",  color:"#BF5AF2", shape:"bars"},
        {x:230, label:"QUANT", color:"#30D158", shape:"q"},
        {x:264, label:"CLR",   color:"#FF2D55", shape:"x"},
        {x:298, label:"WAV",   color:"#64D2FF", shape:"dl"},
      ].map(({x,label,color,shape}) => (
        <g key={label}>
          <rect x={x-14} y={4} width={28} height={38} rx={5} fill={color+"12"} stroke={color+"33"} strokeWidth={0.8}/>
          {/* Shape icons */}
          {shape==="rec"  && <RecDot cx={x} cy={18} r={6} color={color}/>}
          {shape==="play" && <><circle cx={x} cy={18} r={8} fill={color+"22"}/><PlayTriangle cx={x} cy={18} r={7} fill={color}/></>}
          {shape==="stop" && <rect x={x-6} y={12} width={12} height={12} rx={2} fill={color}/>}
          {shape==="undo" && <><path d={`M${x+5},14 A7,7 0 1,0 ${x+6},21`} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round"/><polygon points={`${x-1},10 ${x+5},14 ${x-1},18`} fill={color}/></>}
          {shape==="ovr"  && <><text x={x} y={20} fontSize={6.5} fill={color} textAnchor="middle" fontWeight={800}>OVR</text><RecDot cx={x} cy={27} r={3} color={color}/></>}
          {shape==="bars" && <><text x={x} y={17} fontSize={7.5} fill={color} textAnchor="middle" fontWeight={900}>2</text><text x={x} y={26} fontSize={5} fill={color+"aa"} textAnchor="middle">BARS</text></>}
          {shape==="q"    && <><text x={x} y={21} fontSize={10} fill={color} textAnchor="middle" fontWeight={900}>Q</text></>}
          {shape==="x"    && <><line x1={x-5} y1={13} x2={x+5} y2={23} stroke={color} strokeWidth={2} strokeLinecap="round"/><line x1={x+5} y1={13} x2={x-5} y2={23} stroke={color} strokeWidth={2} strokeLinecap="round"/></>}
          {shape==="dl"   && <><line x1={x} y1={12} x2={x} y2={20} stroke={color} strokeWidth={1.5}/><polygon points={`${x-5},19 ${x+5},19 ${x},24`} fill={color}/><line x1={x-6} y1={25} x2={x+6} y2={25} stroke={color} strokeWidth={1.5}/></>}
          <text x={x} y={38} fontSize={4.5} fill={color+"88"} textAnchor="middle" fontWeight={700}>{label}</text>
        </g>
      ))}

      {/* ── Timeline ── */}
      <rect x={TLX} y={TLY} width={TLW} height={TLH} rx={6} fill={SURF} stroke="#64D2FF1a" strokeWidth={0.8}/>

      {/* Grid quarters */}
      {[0.25, 0.5, 0.75].map(p => (
        <g key={p}>
          <line x1={TLX+p*TLW} y1={TLY} x2={TLX+p*TLW} y2={TLY+TLH} stroke="#ffffff09" strokeWidth={1}/>
          <text x={TLX+p*TLW} y={TLY+TLH+10} fontSize={5} fill="#ffffff28" textAnchor="middle">{p===0.25?"1/4":p===0.5?"1/2":"3/4"}</text>
        </g>
      ))}
      <text x={TLX+2} y={TLY+TLH+10} fontSize={5} fill="#ffffff28">0</text>
      <text x={TLX+TLW-6} y={TLY+TLH+10} fontSize={5} fill="#ffffff28">1</text>

      {/* Hit bars */}
      {hits.map((hit, i) => {
        const hx = TLX + hit.pos * TLW;
        const hy = TLY + TLH - hit.h;
        return (
          <g key={i}>
            <rect x={hx-3} y={hy} width={6} height={hit.h} rx={2} fill={hit.color} opacity={0.85}/>
            <rect x={hx-5} y={hy-2} width={10} height={hit.h+4} rx={3} fill="transparent" stroke={hit.color+"40"} strokeWidth={0.5}/>
            {/* Drag handle */}
            <rect x={hx-5} y={hy-2} width={10} height={5} rx={2} fill={hit.color+"55"}/>
          </g>
        );
      })}

      {/* Playhead */}
      <line x1={playheadX} y1={TLY} x2={playheadX} y2={TLY+TLH} stroke="#fff" strokeWidth={1.5} opacity={0.25}/>
      <polygon points={`${playheadX-5},${TLY-1} ${playheadX+5},${TLY-1} ${playheadX},${TLY+5}`} fill="#ffffff55"/>

      {/* Drag hint */}
      <text x={160} y={130} fontSize={5.5} fill="#64D2FF66" textAnchor="middle">← drag les barres pour repositionner →</text>

      {/* QUANT options */}
      {["1/4","1/8","1/16","1/32"].map((q,i) => (
        <Pill key={q} x={6+i*48} y={137} w={42} h={12} label={q} color={i===2?"#30D158":"#30D158"} active={i===2}/>
      ))}
      <Pill x={200} y={137} w={40} h={12} label="APPLY" color="#30D158" active/>
      <Pill x={246} y={137} w={42} h={12} label="AUTO-Q" color="#FF9500"/>
    </svg>
  );
}

function IlluShortcuts() {
  const keys: { key: string; action: string; color: string; shape?: string }[] = [
    {key:"ESPACE", action:"Play / Stop",      color:"#30D158"},
    {key:"ALT",    action:"Record on/off",    color:"#FF2D55"},
    {key:"← →",   action:"BPM  −1 / +1",    color:"#FF9500"},
    {key:"Ctrl Z", action:"Undo",             color:"#64D2FF"},
    {key:"Ctrl Y", action:"Redo",             color:"#64D2FF"},
    {key:"A … Z",  action:"Jouer une piste",  color:"#FFD60A"},
    {key:"SHARE",  action:"Copier l'URL",     color:"#5E5CE6"},
    {key:"WAV",    action:"Exporter audio",   color:"#64D2FF"},
  ];
  const features = [
    {l:"MIDI LEARN", c:"#BF5AF2", desc:"Affecte note MIDI"},
    {l:"LINK",       c:"#64D2FF", desc:"Sync Ableton BPM"},
    {l:"URL SHARE",  c:"#5E5CE6", desc:"Partage le pattern"},
  ];
  return (
    <svg viewBox="0 0 320 150" style={{ width:"100%", maxWidth:320 }}>
      <rect width={320} height={150} rx={10} fill={BG}/>

      {/* Keyboard shortcut grid */}
      {keys.map(({key, action, color}, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 6 + col * 152, y = 6 + row * 30;
        return (
          <g key={key}>
            <rect x={x} y={y} width={146} height={24} rx={5}
              fill={color+"0e"} stroke={color+"28"} strokeWidth={0.7}/>
            {/* Key cap */}
            <rect x={x+5} y={y+4} width={38} height={16} rx={4}
              fill={color+"22"} stroke={color+"55"} strokeWidth={0.8}/>
            {/* Key cap inner shadow */}
            <rect x={x+5} y={y+4} width={38} height={8} rx={4}
              fill="#ffffff08"/>
            <text x={x+24} y={y+15} fontSize={6} fill={color}
              textAnchor="middle" fontWeight={800} letterSpacing={0.2}>{key}</text>
            <text x={x+50} y={y+15} fontSize={6.5} fill="#ffffffaa">{action}</text>
          </g>
        );
      })}

      {/* Bottom features row */}
      <line x1={6} y1={128} x2={314} y2={128} stroke="#ffffff0a" strokeWidth={1}/>
      {features.map(({l,c,desc}, i) => (
        <g key={l}>
          <rect x={6+i*104} y={132} width={98} height={14} rx={4}
            fill={c+"10"} stroke={c+"28"} strokeWidth={0.7}/>
          <LED cx={14+i*104} cy={139} on r={2.5} color={c}/>
          <text x={20+i*104} y={140} fontSize={5.5} fill={c} fontWeight={800}>{l}</text>
          <text x={58+i*104} y={140} fontSize={5} fill="#ffffff55">{desc}</text>
        </g>
      ))}
    </svg>
  );
}

/* ─── Steps data ──────────────────────────────────────────────────────────
   Tip icons: uniform set — only simple text symbols, no emoji               */
const STEPS = [
  {
    id:"welcome", icon:"K", title:"Bienvenue dans Kick & Snare", subtitle:"Drum Experience",
    color: COLORS.welcome,
    desc:"Une expérience percussive complète. Compose des patterns, performe en live, génère des rythmes euclidiens.",
    tips:[
      {icon:"◆", text:"Séquenceur pas-à-pas TR-808 avec vélocité et probabilité"},
      {icon:"⬡", text:"Rythmes euclidiens algorithmiques pour polymètres complexes"},
      {icon:"▣",  text:"Live Pads — 8 pads jouables en temps réel au clavier"},
      {icon:"⚙", text:"FX Rack global : Reverb, Delay, Chorus, Comp, Drive…"},
    ],
    Illu: IlluWelcome,
  },
  {
    id:"transport", icon:"▶", title:"Transport & BPM", subtitle:"Contrôles de lecture",
    color: COLORS.transport,
    desc:"La barre de transport contrôle tout : tempo, lecture, enregistrement et les outils globaux.",
    tips:[
      {icon:"▶", text:"Espace = Play / Stop  ·  Alt = activer l'enregistrement"},
      {icon:"♩", text:"TAP : frappe 4× en rythme pour détecter le BPM automatiquement"},
      {icon:"↕", text:"VOL MASTER : drag ↕ sur le bouton  ·  double-tap = 80%"},
      {icon:"⌨", text:"KEYB : assigne une touche clavier à chaque piste de la grille"},
      {icon:"M", text:"MIDI LEARN : affecte des notes MIDI aux pistes et aux boutons"},
    ],
    Illu: IlluTransport,
  },
  {
    id:"sequencer", icon:"◆", title:"Séquenceur", subtitle:"Grille TR-808 pas-à-pas",
    color: COLORS.sequencer,
    desc:"Place des sons sur une grille de 16 ou 32 pas. Chaque case propose plusieurs interactions pour affiner le groove.",
    tips:[
      {icon:"●", text:"Clic / tap = activer ou désactiver un son sur le pas"},
      {icon:"↕", text:"Drag vers le haut / bas = régler la vélocité (volume d'impact)"},
      {icon:"↔", text:"Drag horizontal = nudge (décalage fin indépendant par step)"},
      {icon:"◌", text:"Long-press = probabilité 0–100 % (aléatoire contrôlé)"},
      {icon:"↺", text:"Double-clic = réinitialiser le step aux valeurs par défaut"},
      {icon:"M", text:"M = Mute  ·  S = Solo  ·  CLR = effacer la piste entière"},
    ],
    Illu: IlluSequencer,
  },
  {
    id:"euclid", icon:"⬡", title:"Séquenceur Euclidien", subtitle:"Rythmes algorithmiques",
    color: COLORS.euclid,
    desc:"L'algorithme de Björklund distribue N frappes sur M pas avec une régularité mathématique — idéal pour les polymètres et les rythmes world music.",
    tips:[
      {icon:"N", text:"N = longueur du cycle (3–32 pas)  ·  ajuster avec ‹ › ou drag ↕"},
      {icon:"H", text:"HITS = nombre de frappes distribuées sur le cycle"},
      {icon:"R", text:"ROT = rotation du motif (décale le point de départ du cycle)"},
      {icon:"⬡", text:"PRESETS : 12 polyrhythmes prêts (Clave, Bembé, Tresillo, Tango…)"},
      {icon:"✏", text:"EDIT : affichage agrandi pour cliquer précisément sur chaque dot"},
    ],
    Illu: IlluEuclid,
  },
  {
    id:"pads", icon:"▣", title:"Live Pads", subtitle:"Performance en temps réel",
    color: COLORS.pads,
    desc:"8 pads colorés pour jouer en direct au toucher, à la souris ou via les touches clavier assignées.",
    tips:[
      {icon:"●", text:"Toucher / cliquer un pad = déclencher le son immédiatement"},
      {icon:"A", text:"Chaque pad répond à la touche clavier assignée via KEYB"},
      {icon:"◉", text:"Active REC pendant le jeu pour enregistrer dans le Looper"},
      {icon:"M", text:"Compatible MIDI : joue les pads depuis un contrôleur externe"},
      {icon:"↕", text:"La vélocité dépend de la position verticale du toucher sur le pad"},
    ],
    Illu: IlluPads,
  },
  {
    id:"fxrack", icon:"⚙", title:"FX Rack Global", subtitle:"Chaîne d'effets Master Bus",
    color: COLORS.fxrack,
    desc:"Deux groupes : Send FX (parallèle — Reverb, Delay, Chorus…) et Serial Chain configurable (Drive → Comp → Filter).",
    tips:[
      {icon:"⚙", text:"PRESETS : charge une config complète en un clic (Club, Lo-Fi…)"},
      {icon:"→", text:"CHAIN : réordonne Drive → Comp → Filter par glissé horizontal"},
      {icon:"P", text:"PRE / POST : choisit si le send arrive avant ou après la chaîne"},
      {icon:"↕", text:"Knob : drag ↕ pour régler chaque paramètre d'effet"},
      {icon:"L", text:"FILTER : LFO modulateur (sine / triangle / carré) pour effet wah"},
      {icon:"G", text:"COMP : jauge GR affiche la réduction de gain en temps réel"},
    ],
    Illu: IlluFxRack,
  },
  {
    id:"looper", icon:"◉", title:"Looper", subtitle:"Enregistrement et boucles",
    color: COLORS.looper,
    desc:"Enregistre des performances en temps réel sur une timeline visuelle. Les hits peuvent être repositionnés par glissé.",
    tips:[
      {icon:"◉", text:"REC : lance l'enregistrement libre (pad, clavier ou MIDI)"},
      {icon:"O", text:"OVERDUB : ajoute des sons par-dessus sans effacer la boucle"},
      {icon:"Q", text:"QUANT + APPLY : snapper tous les hits à 1/16, 1/8, 1/4…"},
      {icon:"↔", text:"Drag horizontal sur les barres pour repositionner un hit"},
      {icon:"↓", text:"WAV : exporte la boucle × 1 / 2 / 4 répétitions en fichier audio"},
    ],
    Illu: IlluLooper,
  },
  {
    id:"shortcuts", icon:"⌨", title:"Raccourcis & Partage", subtitle:"Aller plus vite",
    color: COLORS.shortcuts,
    desc:"Clavier, MIDI, Ableton LINK et partage d'URL pour accélérer la création et la performance.",
    tips:[
      {icon:"Z", text:"Ctrl+Z / Ctrl+Y = Undo / Redo jusqu'à 50 étapes"},
      {icon:"←", text:"Touches fléchées = BPM −/+ 1 pendant la lecture"},
      {icon:"L", text:"LINK : synchronise le BPM avec Ableton ou d'autres apps réseau"},
      {icon:"↑", text:"SHARE : encode tout le pattern dans l'URL pour partage instantané"},
      {icon:"↓", text:"WAV : rend 1 / 2 / 4 mesures en PCM 16-bit stéréo"},
      {icon:"M", text:"MIDI : assign notes MIDI, seuil vélocité, LEARN sur chaque piste"},
    ],
    Illu: IlluShortcuts,
  },
];

/* ─── Main Component ──────────────────────────────────────────────────── */
export default function TutorialOverlay({
  onClose,
  themeName,
}: {
  onClose: () => void;
  themeName: string;
}) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const isDark = themeName !== "daylight";
  const panelBg  = isDark ? "#18181c" : "#ffffff";
  const sidebarBg = isDark ? "#111114" : "#f2f2f6";
  const textColor = isDark ? "#ffffffdd" : "#1a1a1e";
  const dimColor  = isDark ? "#ffffff66" : "#00000055";
  const borderCol = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)";

  useEffect(() => { setTimeout(() => setVisible(true), 10); }, []);

  const curr = STEPS[step];
  const col  = curr.color;

  const go = (dir: "next" | "prev") => {
    const next = dir === "next" ? step + 1 : step - 1;
    if (next < 0 || next >= STEPS.length) return;
    setStep(next);
  };

  const close = () => {
    setVisible(false);
    setTimeout(onClose, 220);
  };

  return (
    <div
      onClick={close}
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: `rgba(0,0,0,${visible ? 0.86 : 0})`,
        backdropFilter: `blur(${visible ? 8 : 0}px)`,
        transition: "background 0.22s, backdrop-filter 0.22s",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "12px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(900px, 96vw)", maxHeight: "92vh",
          background: panelBg, borderRadius: 18,
          border: `1px solid ${col}44`,
          boxShadow: `0 28px 80px rgba(0,0,0,0.75), 0 0 0 1px ${col}18`,
          display: "flex", flexDirection: "column", overflow: "hidden",
          transform: visible ? "scale(1)" : "scale(0.93)",
          opacity: visible ? 1 : 0,
          transition: "transform 0.24s cubic-bezier(.34,1.5,.64,1), opacity 0.2s",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 18px 10px",
          borderBottom: `1px solid ${borderCol}`,
          background: `linear-gradient(90deg,${col}10,transparent 60%)`,
          flexShrink: 0,
        }}>
          {/* Section icon badge */}
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: `${col}20`, border: `1px solid ${col}50`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 900, color: col,
            fontFamily: "inherit",
          }}>{curr.icon}</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: col, letterSpacing: "0.06em" }}>
              {curr.title}
            </div>
            <div style={{ fontSize: 8, color: dimColor, letterSpacing: "0.08em" }}>
              {curr.subtitle}
            </div>
          </div>

          {/* Progress dots */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {STEPS.map((s, i) => (
              <button
                key={i} onClick={() => setStep(i)}
                style={{
                  width: i === step ? 18 : 6, height: 6, borderRadius: 3,
                  border: "none", cursor: "pointer",
                  background: i === step ? s.color : dimColor + "44",
                  padding: 0, transition: "all 0.2s",
                }}
              />
            ))}
          </div>

          <button
            onClick={close}
            style={{
              width: 28, height: 28, border: `1px solid ${borderCol}`,
              borderRadius: 7, background: "transparent", color: dimColor,
              fontSize: 13, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* ── Body ── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

          {/* Sidebar */}
          <div style={{
            width: 158, flexShrink: 0, overflowY: "auto",
            borderRight: `1px solid ${borderCol}`,
            background: sidebarBg,
            padding: "6px 5px",
            display: "flex", flexDirection: "column", gap: 2,
          }}>
            {STEPS.map((s, i) => (
              <button
                key={i} onClick={() => setStep(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 8px", borderRadius: 7,
                  border: "none", cursor: "pointer", textAlign: "left",
                  background: i === step ? `${s.color}1e` : "transparent",
                  outline: i === step ? `1px solid ${s.color}44` : "none",
                  transition: "background 0.15s",
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  background: `${s.color}${i === step ? "28" : "12"}`,
                  border: `1px solid ${s.color}${i === step ? "55" : "22"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 900, color: i === step ? s.color : s.color + "77",
                  fontFamily: "inherit",
                }}>{s.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 7.5, fontWeight: i === step ? 800 : 500,
                    color: i === step ? s.color : dimColor,
                    letterSpacing: "0.03em", lineHeight: 1.35,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {s.title.replace("Bienvenue dans ", "").replace("Séquenceur Euclidien","Euclidien")}
                  </div>
                  {i === step && (
                    <div style={{ fontSize: 5.5, color: s.color + "77", marginTop: 1 }}>
                      {s.subtitle}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Main content */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "16px 20px",
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            {/* Illustration */}
            <div style={{
              borderRadius: 10, overflow: "hidden",
              border: `1px solid ${col}1e`,
              background: isDark ? "#0c0c0f" : "#f8f8fc",
              flexShrink: 0,
            }}>
              <curr.Illu />
            </div>

            {/* Description */}
            <div style={{
              padding: "10px 14px", borderRadius: 9,
              background: `${col}0c`, border: `1px solid ${col}1e`,
            }}>
              <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.72, color: textColor }}>
                {curr.desc}
              </p>
            </div>

            {/* Tips */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {curr.tips.map((tip, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 9,
                  padding: "7px 11px", borderRadius: 7,
                  background: isDark ? "#ffffff05" : "#00000005",
                  border: `1px solid ${borderCol}`,
                }}>
                  <div style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: 5,
                    background: `${col}1a`, border: `1px solid ${col}38`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 900, color: col, fontFamily: "inherit",
                  }}>{tip.icon}</div>
                  <span style={{ fontSize: 9.5, color: textColor, lineHeight: 1.55, paddingTop: 3 }}>
                    {tip.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 18px",
          borderTop: `1px solid ${borderCol}`,
          flexShrink: 0,
          background: `linear-gradient(90deg,transparent,${col}07)`,
        }}>
          <button
            onClick={() => go("prev")} disabled={step === 0}
            style={{
              padding: "7px 18px", borderRadius: 7,
              border: `1px solid ${step === 0 ? borderCol : col + "44"}`,
              background: step === 0 ? "transparent" : `${col}12`,
              color: step === 0 ? dimColor : col, fontSize: 9.5, fontWeight: 700,
              cursor: step === 0 ? "default" : "pointer",
              letterSpacing: "0.05em", transition: "all 0.15s",
              opacity: step === 0 ? 0.4 : 1,
            }}
          >← Précédent</button>

          {/* Progress bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 7.5, color: dimColor }}>{step + 1}/{STEPS.length}</span>
            <div style={{ width: 70, height: 3, borderRadius: 2, background: `${col}18` }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: `linear-gradient(90deg,${col},${col}99)`,
                width: `${((step + 1) / STEPS.length) * 100}%`,
                transition: "width 0.28s",
              }} />
            </div>
          </div>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => go("next")}
              style={{
                padding: "7px 18px", borderRadius: 7,
                background: `linear-gradient(135deg,${col},${col}bb)`,
                border: "none", color: "#fff", fontSize: 9.5, fontWeight: 800,
                cursor: "pointer", letterSpacing: "0.05em",
                boxShadow: `0 4px 14px ${col}44`, transition: "opacity 0.15s",
              }}
            >Suivant →</button>
          ) : (
            <button
              onClick={close}
              style={{
                padding: "7px 18px", borderRadius: 7,
                background: `linear-gradient(135deg,${col},${col}bb)`,
                border: "none", color: "#fff", fontSize: 9.5, fontWeight: 800,
                cursor: "pointer", letterSpacing: "0.05em",
                boxShadow: `0 4px 14px ${col}44`,
              }}
            >C'est parti !</button>
          )}
        </div>
      </div>
    </div>
  );
}

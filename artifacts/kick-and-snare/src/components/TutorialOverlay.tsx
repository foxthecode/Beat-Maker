import { useState, useEffect } from "react";

/* ─── Palette ──────────────────────────────────────────────────── */
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

/* ─── SVG Illustrations ─────────────────────────────────────────── */

function IlluWelcome() {
  return (
    <svg viewBox="0 0 280 130" style={{ width: "100%", maxWidth: 280 }}>
      {/* App header bar */}
      <rect x={4} y={4} width={272} height={28} rx={6} fill="#1a1a1e" stroke="#FF950044" strokeWidth={1}/>
      <rect x={12} y={11} width={14} height={14} rx={4} fill="#FF9500"/>
      <text x={30} y={21} fontSize={8} fontWeight={800} fill="#FF9500" letterSpacing={1}>KICK & SNARE</text>
      <text x={30} y={29} fontSize={4.5} fill="#FF950066" letterSpacing={2}>DRUM EXPERIENCE</text>
      {/* Kit selector */}
      <rect x={100} y={9} width={48} height={14} rx={4} fill="#FF950022" stroke="#FF950044" strokeWidth={0.8}/>
      <text x={124} y={19} fontSize={6.5} fill="#FF9500" textAnchor="middle">◀ KIT ▶</text>
      {/* Mascot */}
      <circle cx={200} cy={18} r={10} fill="none" stroke="#FF950033" strokeWidth={1}/>
      <text x={200} y={22} fontSize={12} textAnchor="middle">🥁</text>
      {/* Transport preview */}
      <rect x={4} y={40} width={272} height={40} rx={6} fill="#1a1a1e" stroke="#30D15830" strokeWidth={1}/>
      <circle cx={24} cy={60} r={10} fill="#30D158"/>
      <text x={24} y={64} fontSize={10} textAnchor="middle" fill="#fff">▶</text>
      <text x={44} y={56} fontSize={6} fill="#FF9500" letterSpacing={1}>BPM</text>
      <text x={44} y={66} fontSize={14} fontWeight={900} fill="#FF9500">120</text>
      <rect x={70} y={54} width={40} height={4} rx={2} fill="#FF950022"/>
      <rect x={70} y={54} width={22} height={4} rx={2} fill="#FF9500"/>
      <text x={120} y={59} fontSize={6} fill="#30D158aa">TAP</text>
      <text x={140} y={59} fontSize={6} fill="#5E5CE6aa">SWING</text>
      <text x={165} y={59} fontSize={6} fill="#FF9500aa">METRO</text>
      <text x={193} y={59} fontSize={6} fill="#64D2FFaa">VOL</text>
      <text x={210} y={59} fontSize={6} fill="#FF2D55aa">CLEAR</text>
      {/* Pattern bank */}
      <rect x={4} y={88} width={272} height={36} rx={6} fill="#1a1a1e" stroke="#64D2FF22" strokeWidth={1}/>
      {["#FF2D55","#FF9500","#FFD60A","#30D158","#64D2FF","#5E5CE6","#BF5AF2","#FF6B35"].map((c, i) => (
        <rect key={i} x={12 + i*32} y={97} width={28} height={18} rx={4} fill={i===0?c+"33":"transparent"} stroke={c+"66"} strokeWidth={0.8}/>
      ))}
      {["1","2","3","4","5","6","7","8"].map((n, i) => (
        <text key={i} x={12+i*32+14} y={109} fontSize={7} fill={i===0?COLORS.welcome:"#ffffff55"} textAnchor="middle" fontWeight={i===0?800:400}>{n}</text>
      ))}
    </svg>
  );
}

function IlluTransport() {
  return (
    <svg viewBox="0 0 280 130" style={{ width: "100%", maxWidth: 280 }}>
      <rect x={4} y={4} width={272} height={122} rx={8} fill="#0d1117" stroke="#30D15830" strokeWidth={1}/>
      {/* Play button */}
      <circle cx={30} cy={38} r={18} fill="#30D158" opacity={0.9}/>
      <text x={30} y={43} fontSize={16} textAnchor="middle" fill="#fff">▶</text>
      <text x={30} y={62} fontSize={6} fill="#30D158" textAnchor="middle" letterSpacing={0.5}>ESPACE</text>
      {/* REC */}
      <circle cx={66} cy={38} r={12} fill="none" stroke="#FF2D55" strokeWidth={1.5}/>
      <circle cx={66} cy={38} r={5} fill="#FF2D55"/>
      <text x={66} y={62} fontSize={6} fill="#FF2D55" textAnchor="middle">ALT</text>
      {/* BPM */}
      <rect x={88} y={20} width={60} height={36} rx={5} fill="#FF950015" stroke="#FF950033" strokeWidth={0.8}/>
      <text x={118} y={34} fontSize={8} fill="#FF9500aa" textAnchor="middle" letterSpacing={1}>BPM</text>
      <text x={118} y={48} fontSize={18} fontWeight={900} fill="#FF9500" textAnchor="middle">120</text>
      {/* TAP */}
      <rect x={158} y={28} width={28} height={18} rx={4} fill="#FF950022" stroke="#FF950044" strokeWidth={0.8}/>
      <text x={172} y={40} fontSize={7} fill="#FF9500" textAnchor="middle" fontWeight={700}>TAP</text>
      {/* Swing */}
      <text x={200} y={34} fontSize={7} fill="#5E5CE6aa" textAnchor="middle">SWING</text>
      <rect x={186} y={37} width={28} height={3} rx={1.5} fill="#5E5CE622"/>
      <rect x={186} y={37} width={14} height={3} rx={1.5} fill="#5E5CE6"/>
      <text x={200} y={47} fontSize={6} fill="#5E5CE6" textAnchor="middle">50%</text>
      {/* Metro */}
      <rect x={230} y={26} width={36} height={20} rx={4} fill="#FF950015" stroke="#FF950033" strokeWidth={0.8}/>
      <text x={248} y={39} fontSize={6} fill="#FF9500aa" textAnchor="middle" fontWeight={700} letterSpacing={0.5}>METRO 70%</text>
      {/* Separator */}
      <line x1={12} y1={72} x2={268} y2={72} stroke="#ffffff11" strokeWidth={1}/>
      {/* Bottom row */}
      {[
        {x:20,  t:"VOL",  c:"#FFD60A", v:"80"},
        {x:64,  t:"KEYB", c:"#FFD60A", v:"⌨"},
        {x:108, t:"MIDI", c:"#FF9500", v:"🎹"},
        {x:152, t:"LINK", c:"#BF5AF2", v:"🔗"},
        {x:196, t:"WAV",  c:"#64D2FF", v:"⬇"},
        {x:240, t:"CLR",  c:"#FF2D55", v:"✕"},
      ].map(({x,t,c,v}) => (
        <g key={t}>
          <rect x={x-16} y={80} width={36} height={30} rx={5} fill={c+"14"} stroke={c+"44"} strokeWidth={0.8}/>
          <text x={x+2} y={94} fontSize={10} fill={c} textAnchor="middle">{v}</text>
          <text x={x+2} y={106} fontSize={5.5} fill={c+"99"} textAnchor="middle" fontWeight={700} letterSpacing={0.5}>{t}</text>
        </g>
      ))}
    </svg>
  );
}

function IlluSequencer() {
  const rows = [
    { label:"KICK",  color:"#FF2D55", pattern:[1,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0] },
    { label:"SNARE", color:"#FF9500", pattern:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0] },
    { label:"H.HAT", color:"#FFD60A", pattern:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1] },
    { label:"CLAP",  color:"#30D158", pattern:[0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,0] },
  ];
  return (
    <svg viewBox="0 0 280 130" style={{ width: "100%", maxWidth: 280 }}>
      <rect x={0} y={0} width={280} height={130} rx={8} fill="#0d1117"/>
      {rows.map((row, ri) => (
        <g key={ri}>
          {/* label */}
          <rect x={2} y={4+ri*30} width={32} height={24} rx={3} fill={row.color+"15"}/>
          <text x={18} y={19+ri*30} fontSize={5.5} fill={row.color} fontWeight={800} textAnchor="middle" letterSpacing={0.5}>{row.label}</text>
          {/* steps */}
          {row.pattern.map((on, si) => (
            <rect key={si}
              x={38+si*15} y={6+ri*30} width={12} height={20} rx={2}
              fill={on ? row.color : row.color+"18"}
              stroke={on ? row.color+"cc" : row.color+"33"}
              strokeWidth={on ? 0 : 0.5}
              opacity={on ? (si===0&&ri===0?1:0.85) : 0.6}
            />
          ))}
        </g>
      ))}
      {/* playhead */}
      <line x1={50} y1={0} x2={50} y2={130} stroke="#ffffff" strokeWidth={1.5} opacity={0.15} strokeDasharray="3 3"/>
      {/* velocity hint arrow */}
      <text x={50} y={126} fontSize={6} fill="#FF2D5588" textAnchor="middle">↑↓ VÉL</text>
      <text x={125} y={126} fontSize={6} fill="#FF9500aa" textAnchor="middle">⟵⟶ NUDGE</text>
      <text x={200} y={126} fontSize={6} fill="#30D158aa" textAnchor="middle">⌛ PROBA</text>
    </svg>
  );
}

function IlluEuclid() {
  const CX = 90, CY = 65, R = 52;
  const N = 16; const hits = 5; const rot = 0;
  const dots = Array.from({length: N}, (_, i) => {
    const a = (i/N)*2*Math.PI - Math.PI/2;
    const idx = (i - rot + N) % N;
    const on = Math.floor((idx+1)*hits/N) > Math.floor(idx*hits/N);
    return { x: CX + R*Math.cos(a), y: CY + R*Math.sin(a), on };
  });
  return (
    <svg viewBox="0 0 280 130" style={{ width: "100%", maxWidth: 280 }}>
      <rect x={0} y={0} width={280} height={130} rx={8} fill="#0d1117"/>
      {/* Ring */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#FFD60A22" strokeWidth={1} strokeDasharray="3 6"/>
      <circle cx={CX} cy={CY} r={R-14} fill="none" stroke="#FF950022" strokeWidth={1} strokeDasharray="2 5"/>
      {/* Dots */}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.on ? 5 : 3}
          fill={d.on ? "#FFD60A" : "#FFD60A22"}
          stroke={d.on ? "#FFD60A" : "#FFD60A33"}
          strokeWidth={0.5}
          opacity={d.on ? 0.9 : 0.5}/>
      ))}
      {/* Center label */}
      <text x={CX} y={CY-6} fontSize={7} fill="#FFD60Aaa" textAnchor="middle" fontWeight={800}>E(5,16)</text>
      <text x={CX} y={CY+4} fontSize={6} fill="#FFD60A66" textAnchor="middle">EUCLIDEAN</text>
      <text x={CX} y={CY+14} fontSize={5} fill="#FFD60A44" textAnchor="middle">rot +0</text>
      {/* Controls */}
      <rect x={154} y={10} width={120} height={110} rx={6} fill="#FFD60A08" stroke="#FFD60A22" strokeWidth={0.8}/>
      <text x={214} y={26} fontSize={7} fill="#FFD60A" textAnchor="middle" fontWeight={800} letterSpacing={1}>KICK</text>
      {/* N control */}
      {[["N","16","Longueur du cycle",0],["HITS","5","Frappes distribuées",1],["ROT","+0","Décalage départ",2]].map(([lbl,val,desc,idx]) => (
        <g key={String(lbl)}>
          <text x={166} y={44+Number(idx)*28} fontSize={6} fill="#FFD60Aaa" fontWeight={700}>{lbl}</text>
          <text x={220} y={44+Number(idx)*28} fontSize={10} fill="#FFD60A" textAnchor="middle" fontWeight={900}>{val}</text>
          <text x={246} y={44+Number(idx)*28} fontSize={8} fill="#FFD60A88" fontWeight={700}>›</text>
          <text x={162} y={48+Number(idx)*28} fontSize={4.5} fill="#FFD60A55">{String(desc)}</text>
        </g>
      ))}
      <rect x={164} y={95} width={28} height={14} rx={3} fill="#30D15822" stroke="#30D15844" strokeWidth={0.8}/>
      <text x={178} y={105} fontSize={6} fill="#30D158" textAnchor="middle" fontWeight={700}>EDIT</text>
      <rect x={198} y={95} width={34} height={14} rx={3} fill="#FFD60A22" stroke="#FFD60A44" strokeWidth={0.8}/>
      <text x={215} y={105} fontSize={6} fill="#FFD60A" textAnchor="middle" fontWeight={700}>PRESETS</text>
    </svg>
  );
}

function IlluPads() {
  const pads = [
    {c:"#FF2D55",l:"KICK"}, {c:"#FF9500",l:"SNARE"}, {c:"#FFD60A",l:"H.HAT"}, {c:"#30D158",l:"CLAP"},
    {c:"#64D2FF",l:"TOM H"}, {c:"#5E5CE6",l:"TOM M"}, {c:"#BF5AF2",l:"TOM L"}, {c:"#FF6B35",l:"RIDE"},
  ];
  return (
    <svg viewBox="0 0 280 130" style={{ width: "100%", maxWidth: 280 }}>
      <rect x={0} y={0} width={280} height={130} rx={8} fill="#0d1117"/>
      <text x={140} y={16} fontSize={7} fill="#5E5CE6" textAnchor="middle" fontWeight={800} letterSpacing={2}>LIVE PADS</text>
      {pads.map((p, i) => {
        const col = i % 4, row = Math.floor(i / 4);
        const x = 8 + col * 68, y = 22 + row * 52;
        const isActive = i === 0 || i === 2;
        return (
          <g key={i}>
            <rect x={x} y={y} width={60} height={44} rx={6}
              fill={isActive ? p.c+"33" : p.c+"12"}
              stroke={p.c+(isActive?"88":"33")} strokeWidth={isActive?1.5:0.8}/>
            {isActive && <rect x={x} y={y} width={60} height={44} rx={6} fill="none" stroke={p.c} strokeWidth={0.5} opacity={0.4}
              style={{filter:`drop-shadow(0 0 6px ${p.c})`}}/>}
            <text x={x+30} y={y+20} fontSize={16} textAnchor="middle">{isActive?"💥":"○"}</text>
            <text x={x+30} y={y+34} fontSize={6} fill={p.c} textAnchor="middle" fontWeight={700}>{p.l}</text>
            <text x={x+30} y={y+42} fontSize={5} fill={p.c+"66"} textAnchor="middle">{String.fromCharCode(65+i)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function IlluFxRack() {
  const fx = [
    {l:"REVERB", c:"#64D2FF", on:true,  v:"Room"},
    {l:"DELAY",  c:"#30D158", on:true,  v:"1/8"},
    {l:"CHORUS", c:"#5E5CE6", on:false, v:"—"},
    {l:"FILTER", c:"#FF9500", on:true,  v:"LP"},
    {l:"COMP",   c:"#BF5AF2", on:true,  v:"-12dB"},
    {l:"DRIVE",  c:"#FF6B35", on:false, v:"TUBE"},
  ];
  return (
    <svg viewBox="0 0 280 130" style={{ width: "100%", maxWidth: 280 }}>
      <rect x={0} y={0} width={280} height={130} rx={8} fill="#0d1117"/>
      {/* Header */}
      <rect x={4} y={4} width={272} height={20} rx={4} fill="#BF5AF218" stroke="#BF5AF233" strokeWidth={0.8}/>
      <text x={14} y={17} fontSize={7} fill="#BF5AF2" fontWeight={800} letterSpacing={2}>FX RACK</text>
      <rect x={200} y={7} width={36} height={13} rx={3} fill="#BF5AF233" stroke="#BF5AF266" strokeWidth={0.8}/>
      <text x={218} y={16} fontSize={6} fill="#BF5AF2" textAnchor="middle" fontWeight={700}>PRESETS</text>
      {/* Chain */}
      <text x={14} y={36} fontSize={5} fill="#ffffff44" letterSpacing={1}>IN →</text>
      {["DRIVE","COMP","FILTER"].map((n, i) => (
        <g key={n}>
          <rect x={40+i*56} y={29} width={40} height={14} rx={3} fill="#FF950018" stroke="#FF950044" strokeWidth={0.8}/>
          <text x={60+i*56} y={38} fontSize={5.5} fill="#FF9500" textAnchor="middle" fontWeight={700}>{n}</text>
          {i < 2 && <text x={82+i*56} y={38} fontSize={6} fill="#ffffff33">→</text>}
        </g>
      ))}
      <text x={218} y={38} fontSize={5} fill="#ffffff44">→ OUT</text>
      {/* FX panels */}
      <line x1={4} y1={48} x2={276} y2={48} stroke="#ffffff11" strokeWidth={0.8}/>
      {fx.map(({l, c, on, v}, i) => {
        const x = 6 + i * 46;
        return (
          <g key={l}>
            <rect x={x} y={53} width={40} height={70} rx={4} fill={on?c+"14":"#ffffff08"} stroke={on?c+"55":"#ffffff18"} strokeWidth={0.8}/>
            {/* LED */}
            <circle cx={x+8} cy={63} r={3} fill={on?c:"#ffffff22"} opacity={on?0.9:0.5}/>
            <text x={x+20} y={63} fontSize={5} fill={on?c:"#ffffff44"} fontWeight={800}>{l}</text>
            {/* Knob */}
            <circle cx={x+20} cy={86} r={10} fill={on?c+"22":"#ffffff08"} stroke={on?c+"55":"#ffffff22"} strokeWidth={1}/>
            <line x1={x+20} y1={76} x2={x+20} y2={81} stroke={on?c:"#ffffff33"} strokeWidth={1.5} strokeLinecap="round"/>
            <text x={x+20} y={107} fontSize={5} fill={on?c+"99":"#ffffff33"} textAnchor="middle">{v}</text>
            <text x={x+20} y={116} fontSize={4} fill={on?c+"66":"#ffffff22"} textAnchor="middle">{on?"ON":"OFF"}</text>
          </g>
        );
      })}
    </svg>
  );
}

function IlluLooper() {
  const hits = [0.05, 0.13, 0.25, 0.38, 0.50, 0.62, 0.75, 0.87];
  const colors = ["#FF2D55","#FF2D55","#FF9500","#FF2D55","#FF9500","#FF2D55","#FF9500","#FFD60A"];
  return (
    <svg viewBox="0 0 280 130" style={{ width: "100%", maxWidth: 280 }}>
      <rect x={0} y={0} width={280} height={130} rx={8} fill="#0d1117"/>
      {/* Controls */}
      {[
        {x:14,  t:"⏺",   c:"#FF2D55", sub:"REC"},
        {x:46,  t:"▶",   c:"#30D158", sub:"PLAY"},
        {x:78,  t:"■",   c:"#64D2FF", sub:"STOP"},
        {x:110, t:"↺",   c:"#64D2FF", sub:"UNDO"},
        {x:142, t:"OVR", c:"#FF9500", sub:"DUBS"},
        {x:174, t:"2b",  c:"#BF5AF2", sub:"BARS"},
        {x:206, t:"Q",   c:"#30D158", sub:"QUANT"},
        {x:238, t:"✕",   c:"#FF375F", sub:"CLR"},
      ].map(({x,t,c,sub}) => (
        <g key={sub}>
          <rect x={x-10} y={4} width={32} height={26} rx={4} fill={c+"18"} stroke={c+"44"} strokeWidth={0.8}/>
          <text x={x+6} y={19} fontSize={t.length>1?6.5:11} fill={c} textAnchor="middle" fontWeight={700}>{t}</text>
          <text x={x+6} y={28} fontSize={4.5} fill={c+"88"} textAnchor="middle">{sub}</text>
        </g>
      ))}
      {/* Timeline */}
      <rect x={4} y={38} width={272} height={50} rx={5} fill="#1a1a1e" stroke="#64D2FF22" strokeWidth={0.8}/>
      {/* Grid lines */}
      {[0.25,0.5,0.75].map(p => (
        <line key={p} x1={4+p*272} y1={38} x2={4+p*272} y2={88} stroke="#ffffff0a" strokeWidth={1}/>
      ))}
      {/* Hit bars */}
      {hits.map((pos, i) => {
        const x = 4 + pos * 272;
        return (
          <g key={i}>
            <rect x={x-2} y={43} width={4} height={40} rx={1.5} fill={colors[i]} opacity={0.8}/>
            <rect x={x-4} y={43} width={8} height={40} rx={2} fill="transparent" stroke={colors[i]+"44"} strokeWidth={0.5}/>
          </g>
        );
      })}
      {/* Playhead */}
      <line x1={80} y1={38} x2={80} y2={88} stroke="#fff" strokeWidth={1.5} opacity={0.3}/>
      <polygon points="76,36 84,36 80,41" fill="#ffffff44"/>
      {/* Bottom labels */}
      <text x={4+0.25*272} y={102} fontSize={5} fill="#ffffff33" textAnchor="middle">1/4</text>
      <text x={4+0.5*272} y={102} fontSize={5} fill="#ffffff33" textAnchor="middle">1/2</text>
      <text x={4+0.75*272} y={102} fontSize={5} fill="#ffffff33" textAnchor="middle">3/4</text>
      {/* Bottom row */}
      <text x={20} y={115} fontSize={6} fill="#64D2FF88">⬇ WAV</text>
      <text x={80} y={115} fontSize={6} fill="#30D15888">AUTO-Q</text>
      <text x={140} y={115} fontSize={6} fill="#FF950088">APPLY 1/16</text>
      <text x={218} y={115} fontSize={6} fill="#BF5AF288">Drag ⟺ hits</text>
    </svg>
  );
}

function IlluShortcuts() {
  const shortcuts = [
    {key:"Espace",  action:"Play / Stop",       color:"#30D158"},
    {key:"Alt",     action:"Record",            color:"#FF2D55"},
    {key:"← →",    action:"BPM −/+ 1",         color:"#FF9500"},
    {key:"Ctrl+Z",  action:"Undo",              color:"#64D2FF"},
    {key:"Ctrl+Y",  action:"Redo",              color:"#64D2FF"},
    {key:"A…Z",     action:"Jouer une piste",   color:"#FFD60A"},
    {key:"SHARE",   action:"Copier URL",        color:"#BF5AF2"},
    {key:"⬇ WAV",  action:"Exporter l'audio",  color:"#64D2FF"},
  ];
  return (
    <svg viewBox="0 0 280 130" style={{ width: "100%", maxWidth: 280 }}>
      <rect x={0} y={0} width={280} height={130} rx={8} fill="#0d1117"/>
      {shortcuts.map(({key, action, color}, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 6 + col*138, y = 8 + row*30;
        return (
          <g key={key}>
            <rect x={x} y={y} width={126} height={22} rx={4} fill={color+"12"} stroke={color+"33"} strokeWidth={0.7}/>
            <rect x={x+4} y={y+4} width={36} height={14} rx={3} fill={color+"22"} stroke={color+"55"} strokeWidth={0.8}/>
            <text x={x+22} y={y+13.5} fontSize={5.5} fill={color} fontWeight={800} textAnchor="middle">{key}</text>
            <text x={x+46} y={y+13.5} fontSize={6} fill="#ffffffaa">{action}</text>
          </g>
        );
      })}
      {/* MIDI section */}
      <rect x={6} y={128} width={268} height={0} rx={4} fill="none"/>
      <text x={140} y={127} fontSize={6} fill="#FF9500aa" textAnchor="middle">🎹 MIDI · LEARN · LINK Ableton · URL SHARE</text>
    </svg>
  );
}

/* ─── Steps data ─────────────────────────────────────────────────── */
const STEPS = [
  {
    id:"welcome", icon:"🎸", title:"Bienvenue dans Kick & Snare", subtitle:"Drum Experience",
    color: COLORS.welcome,
    desc:"Un séquenceur de batterie TR-808 complet dans le navigateur. Compose des patterns, performe en live, génère des rythmes euclidiens et exporte en WAV.",
    tips:[
      {icon:"◆", text:"Séquenceur pas-à-pas TR-808 avec vélocité et probabilité"},
      {icon:"⬡", text:"Rythmes euclidiens algorithmiques pour polymètres complexes"},
      {icon:"🎯", text:"Live Pads pour jouer et enregistrer en temps réel"},
      {icon:"⚙",  text:"FX Rack global : Reverb, Delay, Chorus, Comp, Drive…"},
    ],
    Illu: IlluWelcome,
  },
  {
    id:"transport", icon:"▶", title:"Transport & BPM", subtitle:"Contrôles de lecture",
    color: COLORS.transport,
    desc:"La barre de transport contrôle tout : tempo, lecture, enregistrement et les outils globaux.",
    tips:[
      {icon:"▶", text:"Espace = Play/Stop · Alt = activer l'enregistrement"},
      {icon:"♩", text:"TAP : frappe 4× en rythme pour détecter le BPM automatiquement"},
      {icon:"↕", text:"VOL MASTER : drag ↕ sur le bouton · double-tap = 80%"},
      {icon:"⌨", text:"KEYB : assigne une touche clavier à chaque piste"},
      {icon:"🎹", text:"MIDI LEARN : affecte des notes MIDI aux pistes et boutons"},
    ],
    Illu: IlluTransport,
  },
  {
    id:"sequencer", icon:"◆", title:"Séquenceur", subtitle:"Grille TR-808 pas-à-pas",
    color: COLORS.sequencer,
    desc:"Place des sons sur une grille de 16 ou 32 pas. Chaque case est interactive avec plusieurs actions possibles.",
    tips:[
      {icon:"🖱", text:"Clic / tap = activer ou désactiver un son"},
      {icon:"↕", text:"Drag vers le haut/bas = régler la vélocité (volume d'impact)"},
      {icon:"↔", text:"Drag horizontal = nudge (décalage fin indépendant par step)"},
      {icon:"⌛", text:"Long-press = probabilité 0–100% (aléatoire contrôlé)"},
      {icon:"↺", text:"Double-clic = réinitialiser le step aux valeurs par défaut"},
      {icon:"M", text:"M = Mute · S = Solo · CLR = effacer la piste"},
    ],
    Illu: IlluSequencer,
  },
  {
    id:"euclid", icon:"⬡", title:"Séquenceur Euclidien", subtitle:"Rythmes algorithmiques",
    color: COLORS.euclid,
    desc:"L'algorithme de Björklund distribue N frappes sur M pas avec une régularité mathématique. Idéal pour les polymètres et les rythmes world music.",
    tips:[
      {icon:"N", text:"N = longueur du cycle (3–32 pas) · ajuster avec ‹ › ou drag ↕"},
      {icon:"H", text:"HITS = nombre de frappes distribuées sur le cycle"},
      {icon:"R", text:"ROT = rotation du motif (décale le point de départ)"},
      {icon:"⬡", text:"PRESETS : 12 polyrhythmes (Clave, Bembé, Tresillo, Tango…)"},
      {icon:"✏", text:"EDIT : double la taille des dots pour cliquer précisément"},
    ],
    Illu: IlluEuclid,
  },
  {
    id:"pads", icon:"🎯", title:"Live Pads", subtitle:"Performance en temps réel",
    color: COLORS.pads,
    desc:"8 pads colorés pour jouer en direct au toucher, à la souris ou via les touches clavier assignées. Idéal pour performer sur scène.",
    tips:[
      {icon:"🎯", text:"Toucher / cliquer un pad = déclencher le son immédiatement"},
      {icon:"A-H", text:"Chaque pad répond à la touche clavier assignée (KEYB)"},
      {icon:"⏺", text:"Active REC pendant le jeu pour enregistrer dans le Looper"},
      {icon:"🎹", text:"Compatible MIDI : joue les pads depuis un clavier externe"},
      {icon:"↕", text:"La vélocité dépend de la position verticale du toucher"},
    ],
    Illu: IlluPads,
  },
  {
    id:"fxrack", icon:"⚙", title:"FX Rack Global", subtitle:"Chaîne d'effets Master Bus",
    color: COLORS.fxrack,
    desc:"Une chaîne d'effets professionnelle appliquée au bus master. Deux groupes : Send FX (parallèle) et Master Bus (série configurable).",
    tips:[
      {icon:"⚙", text:"PRESETS : charge une config complète en un clic (Club, Lo-Fi…)"},
      {icon:"⟶", text:"CHAIN : réordonne Drive → Comp → Filter par glissé"},
      {icon:"PRE", text:"PRE/POST : choisit si le send arrive avant ou après la chaîne"},
      {icon:"SEND", text:"SEND par piste : envoie individuellement vers Reverb, Delay…"},
      {icon:"LFO", text:"FILTER : LFO modulateur (sine/triangle/carré) pour effet wah"},
      {icon:"GR", text:"COMP : jauge de réduction de gain en temps réel"},
    ],
    Illu: IlluFxRack,
  },
  {
    id:"looper", icon:"⊙", title:"Looper", subtitle:"Enregistrement et boucles",
    color: COLORS.looper,
    desc:"Enregistre des performances en temps réel sur une timeline. Les hits sont visualisés et repositionnables par glissé.",
    tips:[
      {icon:"⏺", text:"REC : lance l'enregistrement libre (pad, clavier, MIDI)"},
      {icon:"OVR", text:"OVERDUB : ajoute des sons par-dessus sans effacer"},
      {icon:"Q", text:"QUANT + APPLY : snapper tous les hits à 1/16, 1/8, 1/4…"},
      {icon:"⟺", text:"Drag horizontal sur les barres pour repositionner les hits"},
      {icon:"⬇", text:"⬇ WAV : exporte la boucle × 1/2/4 en fichier audio"},
    ],
    Illu: IlluLooper,
  },
  {
    id:"shortcuts", icon:"⌨", title:"Raccourcis & Partage", subtitle:"Aller plus vite",
    color: COLORS.shortcuts,
    desc:"Clavier, MIDI, Ableton LINK et partage d'URL pour aller encore plus loin dans la création.",
    tips:[
      {icon:"⌨", text:"Ctrl+Z / Ctrl+Y = Undo / Redo (jusqu'à 50 étapes)"},
      {icon:"← →", text:"Touches fléchées = BPM −/+ 1 pendant la lecture"},
      {icon:"🔗", text:"LINK : synchronise le BPM avec Ableton ou d'autres apps en réseau"},
      {icon:"⬆", text:"SHARE : encode tout le pattern dans l'URL — partage instantané"},
      {icon:"⬇", text:"WAV : rend 1/2/4 mesures en PCM 16-bit stéréo"},
      {icon:"🎹", text:"MIDI : assign notes MIDI, seuil vélocité, LEARN sur chaque bouton"},
    ],
    Illu: IlluShortcuts,
  },
];

/* ─── Main Component ─────────────────────────────────────────────── */
export default function TutorialOverlay({ onClose, themeName }: { onClose: () => void; themeName: string }) {
  const [step, setStep] = useState(0);
  const [animDir, setAnimDir] = useState<"next"|"prev">("next");
  const [visible, setVisible] = useState(false);
  const isDark = themeName !== "daylight";
  const bg = isDark ? "#111114" : "#f5f5f7";
  const surf = isDark ? "#1c1c20" : "#ffffff";
  const text = isDark ? "#ffffffdd" : "#1a1a1e";
  const dim  = isDark ? "#ffffff66" : "#00000066";
  const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)";

  useEffect(() => { setTimeout(() => setVisible(true), 10); }, []);

  const curr = STEPS[step];
  const col = curr.color;

  const go = (dir: "next"|"prev") => {
    const next = dir==="next" ? step+1 : step-1;
    if (next < 0 || next >= STEPS.length) return;
    setAnimDir(dir);
    setStep(next);
  };

  const close = () => {
    setVisible(false);
    setTimeout(onClose, 250);
  };

  return (
    <div
      onClick={close}
      style={{
        position:"fixed", inset:0, zIndex:9998,
        background:`rgba(0,0,0,${visible?0.85:0})`,
        backdropFilter:`blur(${visible?8:0}px)`,
        transition:"background 0.25s, backdrop-filter 0.25s",
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:"16px",
      }}>
      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:"min(880px,96vw)", maxHeight:"90vh",
          background:surf, borderRadius:20,
          border:`1px solid ${col}44`,
          boxShadow:`0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px ${col}22`,
          display:"flex", flexDirection:"column", overflow:"hidden",
          transform:visible?"scale(1)":"scale(0.94)",
          opacity:visible?1:0,
          transition:"transform 0.25s cubic-bezier(.34,1.56,.64,1), opacity 0.2s",
        }}>

        {/* ── Header ─────────────────────────────────────── */}
        <div style={{
          display:"flex", alignItems:"center", gap:12,
          padding:"14px 20px 12px",
          borderBottom:`1px solid ${border}`,
          background:`linear-gradient(90deg,${col}12,transparent)`,
          flexShrink:0,
        }}>
          <div style={{
            width:36, height:36, borderRadius:10,
            background:`${col}22`, border:`1px solid ${col}55`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:18,
          }}>{curr.icon}</div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:900, color:col, letterSpacing:"0.06em"}}>{curr.title}</div>
            <div style={{fontSize:9, color:dim, letterSpacing:"0.08em"}}>{curr.subtitle}</div>
          </div>
          {/* Progress dots */}
          <div style={{display:"flex", gap:5, alignItems:"center"}}>
            {STEPS.map((s,i) => (
              <button key={i} onClick={() => setStep(i)} style={{
                width:i===step?20:7, height:7, borderRadius:4,
                border:"none", cursor:"pointer", transition:"all 0.2s",
                background:i===step?s.color:dim+"44",
                padding:0,
              }}/>
            ))}
          </div>
          <button onClick={close} style={{
            width:28, height:28, border:`1px solid ${border}`,
            borderRadius:7, background:"transparent", color:dim,
            fontSize:14, cursor:"pointer", display:"flex",
            alignItems:"center", justifyContent:"center", flexShrink:0,
          }}>✕</button>
        </div>

        {/* ── Body ────────────────────────────────────────── */}
        <div style={{display:"flex", flex:1, minHeight:0, overflow:"hidden"}}>

          {/* Left sidebar: section list */}
          <div style={{
            width:160, flexShrink:0, overflowY:"auto",
            borderRight:`1px solid ${border}`,
            background:isDark?"#0d0d10":"#f0f0f4",
            padding:"8px 6px",
            display:"flex", flexDirection:"column", gap:3,
          }}>
            {STEPS.map((s, i) => (
              <button key={i} onClick={() => setStep(i)} style={{
                display:"flex", alignItems:"center", gap:7,
                padding:"8px 10px", borderRadius:8, border:"none",
                cursor:"pointer", textAlign:"left", transition:"all 0.15s",
                background:i===step?`${s.color}22`:"transparent",
                outline:i===step?`1px solid ${s.color}55`:"none",
              }}>
                <span style={{fontSize:13, flexShrink:0}}>{s.icon}</span>
                <div>
                  <div style={{
                    fontSize:8, fontWeight:i===step?800:500,
                    color:i===step?s.color:dim,
                    letterSpacing:"0.04em",
                    lineHeight:1.3,
                  }}>{s.title.split(" ").slice(0,3).join(" ")}</div>
                  {i===step&&<div style={{fontSize:6, color:s.color+"88", marginTop:1}}>{s.subtitle}</div>}
                </div>
                {i===step&&<div style={{
                  width:3, height:3, borderRadius:"50%",
                  background:s.color, marginLeft:"auto", flexShrink:0,
                }}/>}
              </button>
            ))}
          </div>

          {/* Main content */}
          <div style={{flex:1, overflowY:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:16}}>

            {/* Illustration */}
            <div style={{
              borderRadius:12, overflow:"hidden",
              border:`1px solid ${col}22`,
              background:isDark?"#0d0d12":"#f8f8fc",
              flexShrink:0,
            }}>
              <curr.Illu/>
            </div>

            {/* Description */}
            <div style={{
              padding:"12px 16px", borderRadius:10,
              background:`${col}0e`, border:`1px solid ${col}22`,
            }}>
              <p style={{
                margin:0, fontSize:11, lineHeight:1.7,
                color:text, fontWeight:400,
              }}>{curr.desc}</p>
            </div>

            {/* Tips list */}
            <div style={{display:"flex", flexDirection:"column", gap:6}}>
              {curr.tips.map((tip, i) => (
                <div key={i} style={{
                  display:"flex", alignItems:"flex-start", gap:10,
                  padding:"8px 12px", borderRadius:8,
                  background:isDark?"#ffffff06":"#00000006",
                  border:`1px solid ${border}`,
                }}>
                  <div style={{
                    flexShrink:0, width:24, height:24, borderRadius:6,
                    background:`${col}20`, border:`1px solid ${col}44`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:10, fontWeight:800, color:col,
                  }}>{tip.icon}</div>
                  <span style={{fontSize:10, color:text, lineHeight:1.5, paddingTop:4}}>{tip.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"12px 20px",
          borderTop:`1px solid ${border}`,
          flexShrink:0,
          background:`linear-gradient(90deg,transparent,${col}08)`,
        }}>
          <button onClick={() => go("prev")} disabled={step===0} style={{
            padding:"8px 20px", borderRadius:8,
            border:`1px solid ${step===0?border:col+"55"}`,
            background:step===0?"transparent":`${col}15`,
            color:step===0?dim:col, fontSize:10, fontWeight:700,
            cursor:step===0?"default":"pointer", letterSpacing:"0.06em",
            transition:"all 0.15s", opacity:step===0?0.4:1,
          }}>← Précédent</button>

          <div style={{display:"flex", alignItems:"center", gap:6}}>
            <span style={{fontSize:8, color:dim}}>{step+1} / {STEPS.length}</span>
            <div style={{width:80, height:3, borderRadius:2, background:`${col}22`}}>
              <div style={{
                height:"100%", borderRadius:2,
                background:`linear-gradient(90deg,${col},${col}99)`,
                width:`${((step+1)/STEPS.length)*100}%`,
                transition:"width 0.3s",
              }}/>
            </div>
          </div>

          {step < STEPS.length - 1 ? (
            <button onClick={() => go("next")} style={{
              padding:"8px 20px", borderRadius:8,
              background:`linear-gradient(135deg,${col},${col}bb)`,
              border:"none", color:"#fff", fontSize:10, fontWeight:800,
              cursor:"pointer", letterSpacing:"0.06em",
              boxShadow:`0 4px 16px ${col}44`,
              transition:"all 0.15s",
            }}>Suivant →</button>
          ) : (
            <button onClick={close} style={{
              padding:"8px 20px", borderRadius:8,
              background:`linear-gradient(135deg,${col},${col}bb)`,
              border:"none", color:"#fff", fontSize:10, fontWeight:800,
              cursor:"pointer", letterSpacing:"0.06em",
              boxShadow:`0 4px 16px ${col}44`,
            }}>C'est parti ! 🎸</button>
          )}
        </div>
      </div>
    </div>
  );
}

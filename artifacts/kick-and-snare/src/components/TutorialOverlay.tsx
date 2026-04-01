import { useState, useEffect } from "react";

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
    <svg viewBox="0 0 320 150" style={{ width:"100%", maxWidth:320 }}>
      <rect width={320} height={150} rx={10} fill={BG}/>

      {/* ── App header bar ── */}
      <rect x={6} y={6} width={308} height={30} rx={6} fill={SURF} stroke="#FF950033" strokeWidth={1}/>
      {/* K logo */}
      <rect x={12} y={12} width={18} height={18} rx={5} fill="#FF9500"/>
      <text x={21} y={24} fontSize={9} fontWeight={900} fill="#fff" textAnchor="middle">K</text>
      {/* Title */}
      <text x={35} y={22} fontSize={7.5} fontWeight={900} fill="#FF9500" letterSpacing={1.2}>KICK &amp; SNARE</text>
      <text x={35} y={31} fontSize={4.5} fill="#FF950055" letterSpacing={2.5}>DRUM EXPERIENCE</text>
      {/* Kit nav */}
      <rect x={124} y={12} width={54} height={16} rx={4} fill="#FF950015" stroke="#FF950033" strokeWidth={0.8}/>
      <text x={136} y={22.5} fontSize={6} fill="#FF9500aa">◀</text>
      <text x={151} y={22.5} fontSize={6} fill="#FF9500" textAnchor="middle" fontWeight={700}>KIT</text>
      <text x={168} y={22.5} fontSize={6} fill="#FF9500aa">▶</text>
      {/* Nav buttons */}
      <rect x={190} y={12} width={38} height={16} rx={4} fill="#5E5CE615" stroke="#5E5CE633"/>
      <text x={209} y={22.5} fontSize={5.5} fill="#5E5CE6" textAnchor="middle" fontWeight={700}>LIVE PADS</text>
      <rect x={232} y={12} width={40} height={16} rx={4} fill="#FF2D5515" stroke="#FF2D5533"/>
      <text x={252} y={22.5} fontSize={5.5} fill="#FF2D55" textAnchor="middle" fontWeight={700}>SEQUENCER</text>
      <rect x={276} y={12} width={32} height={16} rx={4} fill="#FFD60A15" stroke="#FFD60A33"/>
      <text x={292} y={22.5} fontSize={5.5} fill="#FFD60A" textAnchor="middle" fontWeight={700}>EUCLID</text>

      {/* ── Transport bar ── */}
      <rect x={6} y={43} width={308} height={34} rx={6} fill={SURF} stroke="#30D15822" strokeWidth={1}/>
      <circle cx={26} cy={60} r={12} fill="#30D158cc"/>
      <PlayTriangle cx={26} cy={60} r={9} fill="#fff"/>
      <RecDot cx={50} cy={60} r={5} color="#FF2D55"/>
      <text x={68} y={56} fontSize={5} fill="#FF9500aa" letterSpacing={1}>BPM</text>
      <text x={68} y={66} fontSize={13} fontWeight={900} fill="#FF9500">120</text>
      <rect x={92} y={56} width={50} height={3.5} rx={1.5} fill="#FF950018"/>
      <rect x={92} y={56} width={26} height={3.5} rx={1.5} fill="#FF9500"/>
      {[
        {x:150, l:"TAP",   c:"#30D158"},
        {x:174, l:"SWING", c:"#5E5CE6"},
        {x:202, l:"METRO", c:"#FF9500"},
        {x:232, l:"VOL",   c:"#FFD60A"},
        {x:256, l:"KEYB",  c:"#FFD60A"},
        {x:280, l:"MIDI",  c:"#BF5AF2"},
      ].map(({x,l,c}) => <Pill key={l} x={x} y={51} w={22} h={17} label={l} color={c}/>)}

      {/* ── Pattern bank ── */}
      <rect x={6} y={84} width={308} height={30} rx={6} fill={SURF} stroke="#64D2FF18" strokeWidth={1}/>
      <text x={14} y={97} fontSize={5} fill="#64D2FFaa" fontWeight={700} letterSpacing={1}>PAT</text>
      {[0,1,2,3,4,5,6,7].map(i => (
        <g key={i}>
          <rect x={34+i*34} y={88} width={28} height={18} rx={4}
            fill={i===0?"#FF2D5530":"transparent"}
            stroke={i===0?"#FF2D5588":"#ffffff18"} strokeWidth={0.8}/>
          <text x={48+i*34} y={99} fontSize={7} fill={i===0?"#FF2D55":"#ffffff33"}
            textAnchor="middle" fontWeight={i===0?800:400}>{i+1}</text>
        </g>
      ))}
      <Pill x={316-58} y={88} w={52} h={18} label="TEMPLATES" color="#64D2FF"/>

      {/* ── Sequencer rows preview ── */}
      <rect x={6} y={121} width={308} height={23} rx={6} fill={SURF} stroke="#FF2D5514" strokeWidth={1}/>
      {[
        {label:"KICK",  color:"#FF2D55", p:[1,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0]},
        {label:"SNARE", color:"#FF9500", p:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0]},
      ].map((row, ri) => (
        <g key={ri}>
          <text x={14} y={130+ri*0} fontSize={5} fill={row.color} fontWeight={700}>{row.label}</text>
          {row.p.map((on, si) => (
            <Step key={si} x={36+si*17} y={122+ri*0} w={14} h={10+ri} on={!!on} color={row.color}/>
          ))}
        </g>
      ))}
      {/* overlay second row */}
      {[
        {label:"SNARE", color:"#FF9500", p:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0]},
      ].map((row) => (
        <g key="snare2">
          <text x={14} y={139} fontSize={5} fill={row.color} fontWeight={700}>{row.label}</text>
          {row.p.map((on, si) => (
            <Step key={si} x={36+si*17} y={131} w={14} h={10} on={!!on} color={row.color}/>
          ))}
        </g>
      ))}
    </svg>
  );
}

function IlluTransport() {
  return (
    <svg viewBox="0 0 320 150" style={{ width:"100%", maxWidth:320 }}>
      <rect width={320} height={150} rx={10} fill={BG}/>

      {/* ── Main controls row ── */}
      {/* Play */}
      <circle cx={28} cy={36} r={20} fill="#30D158dd"/>
      <PlayTriangle cx={28} cy={36} r={14} fill="#fff"/>
      <text x={28} y={65} fontSize={6} fill="#30D158" textAnchor="middle" letterSpacing={0.5}>ESPACE</text>

      {/* REC */}
      <RecDot cx={68} cy={36} r={8} color="#FF2D55"/>
      <text x={68} y={65} fontSize={6} fill="#FF2D55" textAnchor="middle">ALT</text>

      {/* BPM display */}
      <rect x={92} y={14} width={68} height={44} rx={6} fill="#FF950012" stroke="#FF950033" strokeWidth={0.8}/>
      <text x={126} y={30} fontSize={7} fill="#FF9500aa" textAnchor="middle" letterSpacing={1.5}>BPM</text>
      <text x={126} y={50} fontSize={22} fontWeight={900} fill="#FF9500" textAnchor="middle">120</text>
      <text x={105} y={42} fontSize={9} fill="#FF9500aa">‹</text>
      <text x={149} y={42} fontSize={9} fill="#FF9500aa">›</text>

      {/* TAP */}
      <rect x={168} y={22} width={34} height={20} rx={4} fill="#30D15818" stroke="#30D15844" strokeWidth={0.8}/>
      <text x={185} y={35} fontSize={7} fill="#30D158" textAnchor="middle" fontWeight={800}>TAP</text>

      {/* SWING */}
      <text x={216} y={26} fontSize={6} fill="#5E5CE6aa" textAnchor="middle" letterSpacing={0.5}>SWING</text>
      <rect x={200} y={30} width={32} height={4} rx={2} fill="#5E5CE622"/>
      <rect x={200} y={30} width={18} height={4} rx={2} fill="#5E5CE6"/>
      <text x={216} y={43} fontSize={6} fill="#5E5CE6" textAnchor="middle" fontWeight={700}>50%</text>

      {/* Metro + sig */}
      <rect x={240} y={18} width={30} height={24} rx={4} fill="#FF950012" stroke="#FF950033" strokeWidth={0.8}/>
      <text x={255} y={29} fontSize={5.5} fill="#FF9500" textAnchor="middle" fontWeight={700}>METRO</text>
      <text x={255} y={38} fontSize={6} fill="#FF9500aa" textAnchor="middle">70%</text>
      <rect x={276} y={18} width={38} height={24} rx={4} fill="#30D15812" stroke="#30D15833" strokeWidth={0.8}/>
      <text x={295} y={29} fontSize={5} fill="#30D158aa" textAnchor="middle">TIME SIG</text>
      <text x={295} y={38} fontSize={8} fill="#30D158" textAnchor="middle" fontWeight={800}>4/4</text>

      {/* ── Separator ── */}
      <line x1={8} y1={76} x2={312} y2={76} stroke="#ffffff0d" strokeWidth={1}/>

      {/* ── Bottom controls row ── */}
      {[
        {x:20,  label:"VOL",   color:"#FFD60A", shape:"vol"},
        {x:62,  label:"CLEAR", color:"#FF2D55", shape:"x"},
        {x:104, label:"KEYB",  color:"#FFD60A", shape:"kbd"},
        {x:148, label:"MIDI",  color:"#BF5AF2", shape:"midi"},
        {x:192, label:"LINK",  color:"#64D2FF", shape:"link"},
        {x:236, label:"SHARE", color:"#5E5CE6", shape:"share"},
        {x:278, label:"WAV",   color:"#64D2FF", shape:"dl"},
      ].map(({x, label, color, shape}) => (
        <g key={label}>
          <rect x={x-16} y={82} width={36} height={38} rx={5} fill={color+"12"} stroke={color+"33"} strokeWidth={0.8}/>
          {/* Shape icon drawn with SVG, no emoji */}
          {shape==="vol"   && <><rect x={x-6} y={97} width={12} height={3} rx={1} fill={color}/><rect x={x-4} y={93} width={8} height={3} rx={1} fill={color+"aa"}/><rect x={x-2} y={89} width={4} height={3} rx={1} fill={color+"66"}/></>}
          {shape==="x"     && <><line x1={x-5} y1={90} x2={x+5} y2={100} stroke={color} strokeWidth={2} strokeLinecap="round"/><line x1={x+5} y1={90} x2={x-5} y2={100} stroke={color} strokeWidth={2} strokeLinecap="round"/></>}
          {shape==="kbd"   && <><rect x={x-7} y={89} width={14} height={10} rx={2} fill="none" stroke={color} strokeWidth={1}/><rect x={x-5} y={91} width={3} height={3} rx={0.5} fill={color+"66"}/><rect x={x-1} y={91} width={3} height={3} rx={0.5} fill={color+"66"}/><rect x={x+3} y={91} width={3} height={3} rx={0.5} fill={color+"66"}/><rect x={x-3} y={95} width={6} height={2.5} rx={0.5} fill={color+"44"}/></>}
          {shape==="midi"  && <><rect x={x-7} y={89} width={14} height={10} rx={2} fill="none" stroke={color} strokeWidth={1}/><circle cx={x-3} cy={95} r={1.5} fill={color}/><circle cx={x+3} cy={95} r={1.5} fill={color}/><line x1={x-7} y1={97} x2={x-5} y2={99} stroke={color} strokeWidth={0.8}/><line x1={x+7} y1={97} x2={x+5} y2={99} stroke={color} strokeWidth={0.8}/></>}
          {shape==="link"  && <><circle cx={x-2} cy={94} r={3} fill="none" stroke={color} strokeWidth={1.2}/><circle cx={x+2} cy={94} r={3} fill="none" stroke={color} strokeWidth={1.2}/><line x1={x-5} y1={94} x2={x+5} y2={94} stroke={color} strokeWidth={0.8}/></>}
          {shape==="share" && <><circle cx={x+4} cy={90} r={2.5} fill={color}/><circle cx={x-4} cy={94} r={2.5} fill={color}/><circle cx={x+4} cy={98} r={2.5} fill={color}/><line x1={x+4} y1={90} x2={x-4} y2={94} stroke={color} strokeWidth={0.8}/><line x1={x+4} y1={98} x2={x-4} y2={94} stroke={color} strokeWidth={0.8}/></>}
          {shape==="dl"    && <><line x1={x} y1={89} x2={x} y2={97} stroke={color} strokeWidth={1.5}/><polygon points={`${x-5},96 ${x+5},96 ${x},101`} fill={color}/><line x1={x-7} y1={103} x2={x+7} y2={103} stroke={color} strokeWidth={1.5}/></>}
          <text x={x+2} y={116} fontSize={5.5} fill={color+"99"} textAnchor="middle" fontWeight={700} letterSpacing={0.3}>{label}</text>
        </g>
      ))}
    </svg>
  );
}

function IlluSequencer() {
  const rows = [
    {label:"KICK",  color:"#FF2D55", p:[1,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0], vel:[90,0,0,0,0,0,0,0,75,0,0,0,0,0,85,0]},
    {label:"SNARE", color:"#FF9500", p:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], vel:[0,0,0,0,100,0,0,0,0,0,0,0,80,0,0,0]},
    {label:"H.HAT", color:"#FFD60A", p:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1], vel:[70,0,60,0,70,0,65,0,70,0,65,0,70,0,60,90]},
    {label:"CLAP",  color:"#30D158", p:[0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,0], vel:[0,0,0,0,85,0,0,60,0,0,0,0,90,0,0,0]},
  ];
  const SW = 13, SH = 18, SG = 1;
  return (
    <svg viewBox="0 0 320 150" style={{ width:"100%", maxWidth:320 }}>
      <rect width={320} height={150} rx={10} fill={BG}/>

      {/* Track rows */}
      {rows.map((row, ri) => {
        const y0 = 6 + ri * 33;
        return (
          <g key={ri}>
            {/* Track label col */}
            <rect x={2} y={y0} width={36} height={30} rx={3} fill={row.color+"14"}/>
            <text x={20} y={y0+12} fontSize={5} fill={row.color} fontWeight={800} textAnchor="middle" letterSpacing={0.3}>{row.label}</text>
            {/* M S buttons */}
            <rect x={4} y={y0+15} width={8} height={8} rx={2} fill="#ffffff08" stroke="#ffffff18" strokeWidth={0.5}/>
            <text x={8} y={y0+21} fontSize={4.5} fill="#ffffff44" textAnchor="middle">M</text>
            <rect x={14} y={y0+15} width={8} height={8} rx={2} fill="#ffffff08" stroke="#ffffff18" strokeWidth={0.5}/>
            <text x={18} y={y0+21} fontSize={4.5} fill="#ffffff44" textAnchor="middle">S</text>
            {/* Steps */}
            {row.p.map((on, si) => {
              const x = 42 + si * (SW + SG);
              const isActive = si === 0;
              const vH = on ? Math.round((row.vel[si]/100) * (SH-4)) : 0;
              return (
                <g key={si}>
                  <Step x={x} y={y0+4} w={SW} h={SH} on={!!on} color={row.color} active={isActive}/>
                  {/* velocity indicator */}
                  {on && <rect x={x+1} y={y0+4+SH-vH} width={SW-2} height={vH} rx={1} fill={row.color+"55"} opacity={0.6}/>}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Playhead */}
      <line x1={54} y1={0} x2={54} y2={142} stroke="#fff" strokeWidth={1.5} opacity={0.12} strokeDasharray="3 4"/>
      <rect x={48} y={0} width={18} height={5} rx={2} fill="#ffffff22"/>

      {/* Separator */}
      <line x1={2} y1={140} x2={318} y2={140} stroke="#ffffff0a" strokeWidth={1}/>
      {/* Action hints */}
      <text x={60} y={148} fontSize={5.5} fill="#FF2D5566" textAnchor="middle">↕ VÉL</text>
      <text x={140} y={148} fontSize={5.5} fill="#FF9500aa" textAnchor="middle">↔ NUDGE</text>
      <text x={220} y={148} fontSize={5.5} fill="#30D15888" textAnchor="middle">long-press → PROBA</text>
      <text x={296} y={148} fontSize={5.5} fill="#5E5CE688" textAnchor="middle">2× → RESET</text>
    </svg>
  );
}

function IlluEuclid() {
  const CX = 88, CY = 75, R = 58;
  const N = 16, hits = 5;
  const dots = Array.from({length: N}, (_, i) => {
    const a = (i / N) * 2 * Math.PI - Math.PI / 2;
    const idx = i % N;
    const on = Math.floor((idx + 1) * hits / N) > Math.floor(idx * hits / N);
    return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a), on };
  });
  return (
    <svg viewBox="0 0 320 150" style={{ width:"100%", maxWidth:320 }}>
      <rect width={320} height={150} rx={10} fill={BG}/>

      {/* Ring guides */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#FFD60A18" strokeWidth={1} strokeDasharray="4 8"/>
      <circle cx={CX} cy={CY} r={R-16} fill="none" stroke="#FF950012" strokeWidth={1} strokeDasharray="2 6"/>

      {/* Connecting lines between active dots */}
      {dots.map((d, i) => {
        if (!d.on) return null;
        const next = dots.slice(i+1).find(x => x.on);
        if (!next) return null;
        return <line key={i} x1={d.x} y1={d.y} x2={next.x} y2={next.y} stroke="#FFD60A22" strokeWidth={1}/>;
      })}

      {/* Dots */}
      {dots.map((d, i) => (
        <g key={i}>
          {d.on && <circle cx={d.x} cy={d.y} r={8} fill="#FFD60A15"/>}
          <circle cx={d.x} cy={d.y} r={d.on ? 5 : 3}
            fill={d.on ? "#FFD60A" : "#FFD60A20"}
            stroke={d.on ? "#FFD60Acc" : "#FFD60A33"}
            strokeWidth={0.8}/>
        </g>
      ))}

      {/* Center */}
      <circle cx={CX} cy={CY} r={24} fill="#FFD60A08" stroke="#FFD60A22" strokeWidth={0.8}/>
      <text x={CX} y={CY-5} fontSize={8} fill="#FFD60A" textAnchor="middle" fontWeight={900}>E(5,16)</text>
      <text x={CX} y={CY+7} fontSize={5.5} fill="#FFD60A66" textAnchor="middle" letterSpacing={1}>EUCLIDEAN</text>
      <text x={CX} y={CY+17} fontSize={5} fill="#FFD60A44" textAnchor="middle">rot +0</text>

      {/* Controls panel */}
      <rect x={164} y={8} width={150} height={134} rx={8} fill="#FFD60A07" stroke="#FFD60A1a" strokeWidth={0.8}/>

      {/* Track label */}
      <Pill x={172} y={14} w={48} h={16} label="KICK" color="#FFD60A" active/>

      {/* N / HITS / ROT spinners */}
      {[
        {lbl:"N",    val:"16", sub:"longueur du cycle", y:40},
        {lbl:"HITS", val:"5",  sub:"frappes à placer",  y:76},
        {lbl:"ROT",  val:"+0", sub:"décalage de départ",y:112},
      ].map(({lbl,val,sub,y}) => (
        <g key={lbl}>
          <text x={175} y={y} fontSize={6.5} fill="#FFD60Aaa" fontWeight={800} letterSpacing={0.5}>{lbl}</text>
          <text x={175} y={y+11} fontSize={4.5} fill="#FFD60A44">{sub}</text>
          {/* stepper */}
          <rect x={245} y={y-12} width={56} height={20} rx={5} fill="#FFD60A18" stroke="#FFD60A33" strokeWidth={0.8}/>
          <text x={253} y={y-1} fontSize={8} fill="#FFD60Aaa">‹</text>
          <text x={273} y={y} fontSize={14} fontWeight={900} fill="#FFD60A" textAnchor="middle">{val}</text>
          <text x={294} y={y-1} fontSize={8} fill="#FFD60Aaa">›</text>
        </g>
      ))}

      {/* EDIT / PRESETS buttons */}
      <Pill x={172} y={136} w={40} h={14} label="EDIT" color="#30D158"/>
      <Pill x={218} y={136} w={52} h={14} label="PRESETS" color="#FFD60A"/>
      <Pill x={276} y={136} w={32} h={14} label="M  S" color="#FF9500"/>
    </svg>
  );
}

function IlluPads() {
  const pads = [
    {c:"#FF2D55", l:"KICK",  k:"A", active:true},
    {c:"#FF9500", l:"SNARE", k:"B", active:false},
    {c:"#FFD60A", l:"H.HAT",k:"C", active:true},
    {c:"#30D158", l:"CLAP",  k:"D", active:false},
    {c:"#64D2FF", l:"TOM H", k:"E", active:false},
    {c:"#5E5CE6", l:"TOM M", k:"F", active:false},
    {c:"#BF5AF2", l:"TOM L", k:"G", active:false},
    {c:"#FF6B35", l:"RIDE",  k:"H", active:false},
  ];
  const PW = 68, PH = 54, GAP = 6;
  return (
    <svg viewBox="0 0 320 150" style={{ width:"100%", maxWidth:320 }}>
      <rect width={320} height={150} rx={10} fill={BG}/>

      {/* Header */}
      <text x={160} y={16} fontSize={7} fill="#5E5CE6" textAnchor="middle" fontWeight={900} letterSpacing={2.5}>LIVE PADS</text>

      {pads.map((p, i) => {
        const col = i % 4, row = Math.floor(i / 4);
        const x = GAP + col * (PW + GAP), y = 22 + row * (PH + GAP);
        return (
          <g key={i}>
            {/* Pad background */}
            <rect x={x} y={y} width={PW} height={PH} rx={8}
              fill={p.active ? p.c+"2a" : p.c+"0d"}
              stroke={p.c+(p.active ? "bb" : "33")}
              strokeWidth={p.active ? 1.5 : 0.8}/>

            {/* Active pulse ring */}
            {p.active && (
              <rect x={x-2} y={y-2} width={PW+4} height={PH+4} rx={10}
                fill="none" stroke={p.c} strokeWidth={0.6} opacity={0.35}/>
            )}

            {/* Drum circle icon — no emoji, pure SVG */}
            <circle cx={x+PW/2} cy={y+PH/2-8} r={13}
              fill={p.active ? p.c+"40" : p.c+"10"}
              stroke={p.c+(p.active?"99":"33")} strokeWidth={p.active?1.2:0.6}/>
            {/* Inner ring (drum head) */}
            <ellipse cx={x+PW/2} cy={y+PH/2-8} rx={8} ry={4}
              fill="none" stroke={p.c+(p.active?"77":"22")} strokeWidth={0.8}/>
            {/* Strike lines for active */}
            {p.active && <>
              <line x1={x+PW/2-5} y1={y+PH/2-16} x2={x+PW/2-3} y2={y+PH/2-11} stroke={p.c} strokeWidth={1.5} strokeLinecap="round"/>
              <line x1={x+PW/2+5} y1={y+PH/2-16} x2={x+PW/2+3} y2={y+PH/2-11} stroke={p.c} strokeWidth={1.5} strokeLinecap="round"/>
            </>}

            {/* Label */}
            <text x={x+PW/2} y={y+PH-18} fontSize={6} fill={p.c+(p.active?"dd":"88")}
              textAnchor="middle" fontWeight={700}>{p.l}</text>
            {/* Key badge */}
            <rect x={x+PW/2-7} y={y+PH-14} width={14} height={10} rx={3}
              fill={p.c+"22"} stroke={p.c+"44"} strokeWidth={0.6}/>
            <text x={x+PW/2} y={y+PH-7} fontSize={6} fill={p.c+"cc"}
              textAnchor="middle" fontWeight={800}>{p.k}</text>
          </g>
        );
      })}
    </svg>
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
    desc:"Un séquenceur de batterie TR-808 complet dans le navigateur. Compose des patterns, performe en live, génère des rythmes euclidiens et exporte en WAV.",
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

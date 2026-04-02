import { useState, useEffect } from "react";

/* ─── Screenshot-based illustration ───────────────────────────────────── */
const BASE = import.meta.env.BASE_URL as string;

/**
 * Shows a cropped region of a real app screenshot.
 * clipTop / clipBottom are pixel coordinates in the original 1280×800 image.
 * The component fills 100% of the available width and auto-sizes its height
 * to preserve the exact aspect ratio of the crop — no fixed displayHeight needed.
 */
function IlluImg({
  src,
  clipTop = 0,
  clipBottom = 800,
  label,
  labelColor = "#FF9500",
}: {
  src: string;
  clipTop?: number;
  clipBottom?: number;
  label?: string;
  labelColor?: string;
}) {
  const origW = 1280, origH = 800;
  const cropH = clipBottom - clipTop;
  const padPct = (cropH / origW) * 100;

  return (
    <div style={{ width: "100%", paddingTop: `${padPct}%`, position: "relative", overflow: "hidden", background: "#0c0c0f" }}>
      <img
        src={src}
        alt={label ?? "App screenshot"}
        style={{
          position: "absolute",
          width: "100%",
          height: `${(origH / cropH) * 100}%`,
          top: `-${(clipTop / cropH) * 100}%`,
          left: 0,
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

function PlayTriangle({ cx, cy, r, fill }: { cx:number; cy:number; r:number; fill:string }) {
  const h = r * 0.95, w = r * 0.82;
  return <polygon points={`${cx - w*0.45},${cy - h*0.5} ${cx - w*0.45},${cy + h*0.5} ${cx + w*0.55},${cy}`} fill={fill}/>;
}

function RecDot({ cx, cy, r, color }: { cx:number; cy:number; r:number; color:string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r+3} fill="none" stroke={color} strokeWidth={1.5}/>
      <circle cx={cx} cy={cy} r={r} fill={color}/>
    </>
  );
}

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

function LED({ cx, cy, r=3, on, color }: { cx:number; cy:number; r?:number; on:boolean; color:string }) {
  return <circle cx={cx} cy={cy} r={r} fill={on ? color : "#333"} opacity={on ? 1 : 0.5}/>;
}

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
      label="Overview" labelColor="#FF9500"
    />
  );
}

function IlluTransport() {
  return (
    <IlluImg
      src={`${BASE}tutorial/seq-view.jpg`}
      clipTop={84} clipBottom={230}
      label="Transport bar" labelColor="#30D158"
    />
  );
}

function IlluSequencer() {
  return (
    <IlluImg
      src={`${BASE}tutorial/seq-view.jpg`}
      clipTop={330} clipBottom={535}
      label="TR-808 Sequencer" labelColor="#FF2D55"
    />
  );
}

function IlluEuclid() {
  return (
    <IlluImg
      src={`${BASE}tutorial/euclid-view.jpg`}
      clipTop={190} clipBottom={760}
      label="Euclidean Sequencer" labelColor="#FFD60A"
    />
  );
}

function IlluPads() {
  return (
    <IlluImg
      src={`${BASE}tutorial/pads-view.jpg`}
      clipTop={310} clipBottom={800}
      label="Live Pads — 8 pads" labelColor="#5E5CE6"
    />
  );
}

function IlluFxRack() {
  return (
    <IlluImg
      src={`${BASE}tutorial/fx-view.jpg`}
      clipTop={198} clipBottom={500}
      label="FX Rack Global" labelColor="#BF5AF2"
    />
  );
}

function IlluLooper() {
  return (
    <IlluImg
      src={`${BASE}tutorial/looper-view.jpg`}
      clipTop={246} clipBottom={520}
      label="Looper" labelColor="#64D2FF"
    />
  );
}

function IlluShortcuts() {
  const keys: { key: string; action: string; color: string; shape?: string }[] = [
    {key:"SPACE",  action:"Play / Stop",      color:"#30D158"},
    {key:"ALT",    action:"Record on/off",    color:"#FF2D55"},
    {key:"← →",   action:"BPM  −1 / +1",    color:"#FF9500"},
    {key:"Ctrl Z", action:"Undo",             color:"#64D2FF"},
    {key:"Ctrl Y", action:"Redo",             color:"#64D2FF"},
    {key:"A … Z",  action:"Play a track",     color:"#FFD60A"},
    {key:"SHARE",  action:"Copy URL",         color:"#5E5CE6"},
    {key:"WAV",    action:"Export audio",     color:"#64D2FF"},
  ];
  const features = [
    {l:"MIDI LEARN", c:"#BF5AF2", desc:"Assign MIDI note"},
    {l:"LINK",       c:"#64D2FF", desc:"Sync Ableton BPM"},
    {l:"URL SHARE",  c:"#5E5CE6", desc:"Share pattern"},
  ];
  return (
    <svg viewBox="0 0 320 150" style={{ width:"100%", maxWidth:320 }}>
      <rect width={320} height={150} rx={10} fill={BG}/>

      {keys.map(({key, action, color}, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 6 + col * 152, y = 6 + row * 30;
        return (
          <g key={key}>
            <rect x={x} y={y} width={146} height={24} rx={5}
              fill={color+"0e"} stroke={color+"28"} strokeWidth={0.7}/>
            <rect x={x+5} y={y+4} width={38} height={16} rx={4}
              fill={color+"22"} stroke={color+"55"} strokeWidth={0.8}/>
            <rect x={x+5} y={y+4} width={38} height={8} rx={4}
              fill="#ffffff08"/>
            <text x={x+24} y={y+15} fontSize={6} fill={color}
              textAnchor="middle" fontWeight={800} letterSpacing={0.2}>{key}</text>
            <text x={x+50} y={y+15} fontSize={6.5} fill="#ffffffaa">{action}</text>
          </g>
        );
      })}

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

/* ─── Steps data ──────────────────────────────────────────────────────────*/
const STEPS = [
  {
    id:"welcome", icon:"K", title:"Welcome to Kick & Snare", subtitle:"Drum Experience",
    color: COLORS.welcome,
    desc:"A complete percussion experience. Compose patterns, perform live, generate Euclidean rhythms.",
    tips:[
      {icon:"◆", text:"TR-808 step sequencer with velocity and probability"},
      {icon:"⬡", text:"Algorithmic Euclidean rhythms for complex polymeters"},
      {icon:"▣",  text:"Live Pads — 8 pads playable in real time by touch"},
      {icon:"⚙", text:"Global FX Rack: Reverb, Delay, Chorus, Comp, Drive…"},
    ],
    Illu: IlluWelcome,
  },
  {
    id:"transport", icon:"▶", title:"Transport & BPM", subtitle:"Playback controls",
    color: COLORS.transport,
    desc:"The transport bar controls everything: tempo, playback, recording and global tools.",
    tips:[
      {icon:"▶", text:"Tap Play / Stop to start or stop the sequencer"},
      {icon:"◉", text:"REC (●) = live recording mode — tap a pad during playback to inscribe that sound in the grid at the current step"},
      {icon:"♩", text:"TAP: tap 4× in rhythm to auto-detect BPM"},
      {icon:"↕", text:"VOL MASTER: drag ↕ on the button  ·  double-tap = 80%"},
      {icon:"M", text:"MIDI LEARN: assign MIDI notes to tracks and buttons"},
    ],
    Illu: IlluTransport,
  },
  {
    id:"sequencer", icon:"◆", title:"Sequencer", subtitle:"TR-808 step grid",
    color: COLORS.sequencer,
    desc:"Place sounds on a 16 or 32-step grid. Each cell offers several interactions to fine-tune the groove.",
    tips:[
      {icon:"●", text:"Click / tap = toggle a sound on or off at that step"},
      {icon:"↕", text:"Drag up / down = set velocity (hit volume)"},
      {icon:"↔", text:"Drag left / right = nudge (independent micro-timing per step)"},
      {icon:"◌", text:"Long-press = probability 0–100% (controlled randomness)"},
      {icon:"↺", text:"Double-click = reset step to default values"},
      {icon:"M", text:"M = Mute  ·  S = Solo  ·  CLR = clear entire track"},
      {icon:"◉", text:"Live REC — enable ● REC then play: tapping a pad writes that sound into the grid at the current step in real time"},
    ],
    Illu: IlluSequencer,
  },
  {
    id:"euclid", icon:"⬡", title:"Euclidean Sequencer", subtitle:"Algorithmic rhythms",
    color: COLORS.euclid,
    desc:"Björklund's algorithm distributes N hits across M steps with mathematical regularity — ideal for polymeters and world music rhythms.",
    tips:[
      {icon:"N", text:"N = cycle length (3–32 steps)  ·  adjust with ‹ › or drag ↕"},
      {icon:"H", text:"HITS = number of hits distributed across the cycle"},
      {icon:"R", text:"ROT = pattern rotation (shifts the starting point of the cycle)"},
      {icon:"⬡", text:"PRESETS: 12 ready-made polyrhythms (Clave, Bembé, Tresillo, Tango…)"},
      {icon:"✏", text:"EDIT: enlarged view to click precisely on each dot"},
    ],
    Illu: IlluEuclid,
  },
  {
    id:"pads", icon:"▣", title:"Live Pads", subtitle:"Real-time performance",
    color: COLORS.pads,
    desc:"8 pads playable in real time — touch to trigger instantly.",
    tips:[
      {icon:"●", text:"Touch / tap a pad = trigger the sound immediately"},
      {icon:"◉", text:"Enable REC while playing to record into the Looper"},
      {icon:"M", text:"MIDI compatible: play pads from an external controller"},
      {icon:"↕", text:"Velocity depends on the vertical position of the touch on the pad"},
    ],
    Illu: IlluPads,
  },
  {
    id:"fxrack", icon:"⚙", title:"FX Rack Global", subtitle:"Master Bus effects chain",
    color: COLORS.fxrack,
    desc:"Two groups: Send FX (parallel — Reverb, Delay, Chorus…) and a configurable Serial Chain (Drive → Comp → Filter).",
    tips:[
      {icon:"⚙", text:"PRESETS: load a full config in one click (Club, Lo-Fi…)"},
      {icon:"→", text:"CHAIN: reorder Drive → Comp → Filter by horizontal drag"},
      {icon:"P", text:"PRE / POST: choose whether send arrives before or after the chain"},
      {icon:"↕", text:"Knob: drag ↕ to adjust each effect parameter"},
      {icon:"L", text:"FILTER: LFO modulator (sine / triangle / square) for wah effect"},
      {icon:"G", text:"COMP: GR meter shows gain reduction in real time"},
    ],
    Illu: IlluFxRack,
  },
  {
    id:"looper", icon:"◉", title:"Looper", subtitle:"Recording & loops",
    color: COLORS.looper,
    desc:"Record real-time performances on a visual timeline. Hits can be repositioned by dragging.",
    tips:[
      {icon:"◉", text:"REC: start free recording (pad or MIDI)"},
      {icon:"O", text:"OVERDUB: layer sounds on top without erasing the loop"},
      {icon:"Q", text:"QUANT + APPLY: snap all hits to 1/16, 1/8, 1/4…"},
      {icon:"↔", text:"Drag bars horizontally to reposition a hit"},
      {icon:"↓", text:"WAV: export the loop × 1 / 2 / 4 repetitions as an audio file"},
    ],
    Illu: IlluLooper,
  },
  {
    id:"shortcuts", icon:"⚡", title:"MIDI & Sharing", subtitle:"Connect and collaborate",
    color: COLORS.shortcuts,
    desc:"MIDI, Ableton LINK, and URL sharing to speed up creation and performance.",
    tips:[
      {icon:"↺", text:"↺ / ↻ = Undo / Redo up to 50 steps"},
      {icon:"L", text:"LINK: sync BPM with Ableton or other network apps"},
      {icon:"↑", text:"SHARE: encodes the full pattern in a URL for instant sharing"},
      {icon:"↓", text:"WAV: renders 1 / 2 / 4 bars as 16-bit stereo PCM"},
      {icon:"M", text:"MIDI: assign MIDI notes, velocity threshold, LEARN per track"},
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
                    {s.title.replace("Welcome to ", "").replace("Euclidean Sequencer","Euclidean")}
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
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "7px 10px", borderRadius: 8,
                  background: `${col}08`, border: `1px solid ${col}18`,
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                    background: `${col}18`, border: `1px solid ${col}33`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 900, color: col, fontFamily: "monospace",
                  }}>{tip.icon}</div>
                  <div style={{ fontSize: 9.5, color: textColor, lineHeight: 1.5, paddingTop: 1 }}>
                    {tip.text}
                  </div>
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
          background: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.02)",
        }}>
          <button
            onClick={() => go("prev")} disabled={step === 0}
            style={{
              padding: "6px 16px", borderRadius: 8,
              border: `1px solid ${step > 0 ? col+"55" : borderCol}`,
              background: "transparent",
              color: step > 0 ? col : dimColor,
              fontSize: 9, fontWeight: 700, cursor: step > 0 ? "pointer" : "default",
              fontFamily: "inherit", opacity: step > 0 ? 1 : 0.3,
            }}
          >← Previous</button>

          <span style={{ fontSize: 7.5, color: dimColor }}>
            {step + 1} / {STEPS.length}
          </span>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => go("next")}
              style={{
                padding: "6px 16px", borderRadius: 8,
                border: `1px solid ${col}55`,
                background: `${col}18`, color: col,
                fontSize: 9, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >Next →</button>
          ) : (
            <button
              onClick={close}
              style={{
                padding: "6px 16px", borderRadius: 8,
                border: "none",
                background: `linear-gradient(90deg,${col},${col}bb)`,
                color: "#000", fontSize: 9, fontWeight: 900,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >Get started</button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";

const INSTRUMENTS = [
  { id: "kick",  label: "KICK",  color: "#FF2D55", icon: "◆" },
  { id: "snare", label: "SNARE", color: "#FF9500", icon: "◼" },
  { id: "hat",   label: "HAT",   color: "#FFD60A", icon: "●" },
  { id: "clap",  label: "CLAP",  color: "#30D158", icon: "★" },
  { id: "perc",  label: "PERC",  color: "#5E5CE6", icon: "▲" },
];

const DEFAULT_HITS: Record<number, Set<string>> = {
  0:  new Set(["kick"]),
  4:  new Set(["kick", "hat"]),
  6:  new Set(["hat"]),
  8:  new Set(["kick", "snare"]),
  10: new Set(["hat"]),
  12: new Set(["kick"]),
  14: new Set(["hat"]),
  2:  new Set(["hat"]),
};

function vertex(i: number, N: number, cx: number, cy: number, r: number) {
  const a = (2 * Math.PI * i) / N - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function polygonPoints(N: number, cx: number, cy: number, r: number) {
  return Array.from({ length: N }, (_, i) => {
    const v = vertex(i, N, cx, cy, r);
    return `${v.x},${v.y}`;
  }).join(" ");
}

export function EuclideanSeq() {
  const [N, setN] = useState(16);
  const [hits, setHits] = useState<Record<number, Set<string>>>(DEFAULT_HITS);
  const [selected, setSelected] = useState("kick");
  const [playhead, setPlayhead] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [hovered, setHovered] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(-1);

  const CX = 200, CY = 200, R = 155, INNER = 20;

  const toggleHit = useCallback((i: number) => {
    setHits(prev => {
      const next = { ...prev };
      const s = new Set(next[i] || []);
      if (s.has(selected)) s.delete(selected); else s.add(selected);
      if (s.size === 0) delete next[i]; else next[i] = s;
      return next;
    });
  }, [selected]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!playing) { setPlayhead(-1); stepRef.current = -1; return; }
    const ms = (60 / bpm / 4) * 1000;
    timerRef.current = setInterval(() => {
      stepRef.current = (stepRef.current + 1) % N;
      setPlayhead(stepRef.current);
    }, ms);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, bpm, N]);

  const changeN = (newN: number) => {
    setN(newN);
    setHits(prev => {
      const next: Record<number, Set<string>> = {};
      Object.entries(prev).forEach(([k, v]) => {
        if (Number(k) < newN) next[Number(k)] = v;
      });
      return next;
    });
    stepRef.current = -1;
    setPlayhead(-1);
  };

  const activeInstr = (i: number) => hits[i] ? [...hits[i]] : [];
  const isActive = (i: number) => (hits[i]?.size || 0) > 0;
  const isCurrent = (i: number) => i === playhead;

  const headAngle = playhead >= 0
    ? (2 * Math.PI * playhead) / N - Math.PI / 2
    : -Math.PI / 2;

  const instrCount = (id: string) =>
    Object.values(hits).filter(s => s.has(id)).length;

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(170deg,#0F0F0F 0%,#1A1A1A 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "24px", fontFamily: "monospace",
      color: "#F0F0F0", boxSizing: "border-box",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#30D158", marginBottom: 4 }}>
        KICK & SNARE — VUE EUCLIDIENNE
      </div>
      <div style={{ fontSize: 9, color: "#555", marginBottom: 20, letterSpacing: "0.1em" }}>
        CLIQUER UN SOMMET POUR ACTIVER / DÉSACTIVER LE HIT SÉLECTIONNÉ
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* ── Instrument Selector ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 80 }}>
          {INSTRUMENTS.map(ins => (
            <button key={ins.id} onClick={() => setSelected(ins.id)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
              borderRadius: 8, border: `1px solid ${selected === ins.id ? ins.color + "88" : "rgba(255,255,255,0.08)"}`,
              background: selected === ins.id ? ins.color + "18" : "transparent",
              color: selected === ins.id ? ins.color : "#555",
              fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "monospace",
              transition: "all 0.15s", letterSpacing: "0.08em",
            }}>
              <span style={{ fontSize: 14 }}>{ins.icon}</span>
              <span>{ins.label}</span>
              {instrCount(ins.id) > 0 && (
                <span style={{
                  marginLeft: 4, background: ins.color + "33", color: ins.color,
                  borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 700,
                }}>{instrCount(ins.id)}</span>
              )}
            </button>
          ))}
          <div style={{ marginTop: 10, height: 1, background: "rgba(255,255,255,0.06)" }} />
          <div style={{ fontSize: 8, color: "#444", letterSpacing: "0.08em", marginTop: 4 }}>ACTIF SÉL.</div>
        </div>

        {/* ── Polygon ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <svg width={400} height={400} style={{ display: "block" }}>
            {/* Outer glow ring */}
            <circle cx={CX} cy={CY} r={R + 12} fill="none" stroke="rgba(48,209,88,0.04)" strokeWidth={24} />

            {/* Polygon edges */}
            <polygon
              points={polygonPoints(N, CX, CY, R)}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />

            {/* Inner circle */}
            <circle cx={CX} cy={CY} r={INNER} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />

            {/* Beat subdivision rings (subtle) */}
            {[0.5, 0.75].map(f => (
              <circle key={f} cx={CX} cy={CY} r={R * f} fill="none"
                stroke="rgba(255,255,255,0.025)" strokeWidth={1} strokeDasharray="2 4" />
            ))}

            {/* Playhead line */}
            {playhead >= 0 && (
              <line
                x1={CX} y1={CY}
                x2={CX + (R + 16) * Math.cos(headAngle)}
                y2={CY + (R + 16) * Math.sin(headAngle)}
                stroke="#30D158" strokeWidth={2} strokeLinecap="round"
                opacity={0.85}
              />
            )}

            {/* Spoke lines from center */}
            {Array.from({ length: N }, (_, i) => {
              const v = vertex(i, N, CX, CY, R);
              const isOn = isActive(i);
              return (
                <line key={`spoke-${i}`}
                  x1={CX} y1={CY} x2={v.x} y2={v.y}
                  stroke={isOn ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.025)"}
                  strokeWidth={0.5}
                />
              );
            })}

            {/* Vertices */}
            {Array.from({ length: N }, (_, i) => {
              const v = vertex(i, N, CX, CY, R);
              const instrs = activeInstr(i);
              const on = instrs.length > 0;
              const cur = isCurrent(i);
              const hov = hovered === i;
              const r0 = on ? 14 : 8;
              const selInstr = INSTRUMENTS.find(x => x.id === selected)!;

              return (
                <g key={i}
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleHit(i)}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Glow when current & active */}
                  {cur && on && (
                    <circle cx={v.x} cy={v.y} r={r0 + 10}
                      fill={INSTRUMENTS.find(x => x.id === instrs[0])?.color + "22" || "#fff2"}
                    />
                  )}

                  {/* Main vertex circle */}
                  <circle
                    cx={v.x} cy={v.y}
                    r={hov ? r0 + 2 : r0}
                    fill={on
                      ? (cur ? "#fff" : "rgba(255,255,255,0.08)")
                      : (hov ? selInstr.color + "22" : "rgba(255,255,255,0.04)")}
                    stroke={on
                      ? (cur ? "#fff" : INSTRUMENTS.find(x => x.id === instrs[0])?.color || "#fff")
                      : (hov ? selInstr.color + "88" : "rgba(255,255,255,0.12)")}
                    strokeWidth={on ? 1.5 : 1}
                    style={{ transition: "r 0.1s" }}
                  />

                  {/* Instrument color dots (stacked) */}
                  {on && instrs.map((id, di) => {
                    const instr = INSTRUMENTS.find(x => x.id === id)!;
                    const dotR = 3.5;
                    const offsetX = instrs.length > 1 ? (di - (instrs.length - 1) / 2) * 8 : 0;
                    return (
                      <circle key={id}
                        cx={v.x + offsetX} cy={v.y}
                        r={dotR}
                        fill={cur ? "#000" : instr.color}
                        opacity={cur ? 1 : 0.9}
                      />
                    );
                  })}

                  {/* Step number */}
                  <text x={v.x} y={v.y + (on ? r0 + 11 : 18)}
                    textAnchor="middle" fontSize={7}
                    fill={cur ? "#30D158" : on ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)"}
                    fontFamily="monospace" fontWeight={cur ? 700 : 400}
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })}

            {/* Center play indicator */}
            <text x={CX} y={CY + 4} textAnchor="middle" fontSize={10}
              fill={playing ? "#30D158" : "#444"} fontFamily="monospace" fontWeight={700}>
              {playing ? "▶" : "■"}
            </text>
          </svg>

          {/* ── Controls ── */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: 400 }}>

            {/* Play / BPM */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={() => setPlaying(p => !p)} style={{
                padding: "8px 24px", borderRadius: 8, border: "none",
                background: playing ? "rgba(255,45,85,0.2)" : "rgba(48,209,88,0.2)",
                color: playing ? "#FF2D55" : "#30D158",
                fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.1em",
              }}>
                {playing ? "⏹ STOP" : "▶ PLAY"}
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 9, color: "#555", letterSpacing: "0.1em" }}>BPM</span>
                <input type="range" min={60} max={200} value={bpm}
                  onChange={e => setBpm(Number(e.target.value))}
                  style={{ width: 80, accentColor: "#30D158" }} />
                <span style={{ fontSize: 11, color: "#F0F0F0", fontWeight: 700, minWidth: 28 }}>{bpm}</span>
              </div>
            </div>

            {/* N (steps) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 9, color: "#555", letterSpacing: "0.1em", minWidth: 40 }}>STEPS</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
                {[4, 6, 8, 12, 16, 24, 32].map(n => (
                  <button key={n} onClick={() => changeN(n)} style={{
                    padding: "4px 10px", borderRadius: 5,
                    border: `1px solid ${N === n ? "rgba(48,209,88,0.5)" : "rgba(255,255,255,0.08)"}`,
                    background: N === n ? "rgba(48,209,88,0.12)" : "transparent",
                    color: N === n ? "#30D158" : "#555",
                    fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "monospace",
                  }}>{n}</button>
                ))}
              </div>
            </div>

            {/* Hit count summary */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {INSTRUMENTS.filter(ins => instrCount(ins.id) > 0).map(ins => (
                <div key={ins.id} style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: 4,
                  background: ins.color + "15", border: `1px solid ${ins.color}33`,
                  fontSize: 9, color: ins.color, fontWeight: 700, letterSpacing: "0.08em",
                }}>
                  {ins.icon} {ins.label} × {instrCount(ins.id)}
                </div>
              ))}
              {Object.keys(hits).length === 0 && (
                <span style={{ fontSize: 9, color: "#333", letterSpacing: "0.08em" }}>
                  AUCUN HIT — cliquez un sommet
                </span>
              )}
            </div>

            <div style={{ fontSize: 8, color: "#2a2a2a", letterSpacing: "0.1em", marginTop: 4 }}>
              CLIC GAUCHE = TOGGLE HIT · SÉLECTIONNER INSTRUMENT À GAUCHE AVANT
            </div>
          </div>
        </div>

        {/* ── Step list ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingTop: 40, minWidth: 90 }}>
          <div style={{ fontSize: 8, color: "#333", letterSpacing: "0.1em", marginBottom: 6 }}>STEPS ACTIFS</div>
          {Array.from({ length: N }, (_, i) => {
            const instrs = activeInstr(i);
            if (instrs.length === 0) return null;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "3px 6px", borderRadius: 4,
                background: isCurrent(i) ? "rgba(48,209,88,0.1)" : "transparent",
                border: `1px solid ${isCurrent(i) ? "rgba(48,209,88,0.3)" : "transparent"}`,
              }}>
                <span style={{
                  fontSize: 8, color: isCurrent(i) ? "#30D158" : "#444",
                  fontWeight: 700, minWidth: 14, textAlign: "right",
                }}>{i + 1}</span>
                {instrs.map(id => {
                  const ins = INSTRUMENTS.find(x => x.id === id)!;
                  return (
                    <span key={id} style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: ins.color, display: "inline-block", flexShrink: 0,
                    }} title={ins.label} />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

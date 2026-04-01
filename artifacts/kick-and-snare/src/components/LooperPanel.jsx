import { THEMES } from "../theme.js";

export default function LooperPanel({
  loopBars, setLoopBars,
  loopRec, loopPlaying, loopPlayhead,
  loopDisp,
  loopMetro, setLoopMetro,
  onToggleRec, onFreshRec, onTogglePlay, onUndo, onClear,
  themeName, isPortrait,
  bpm, tracks,
}) {
  const th = THEMES[themeName] || THEMES.dark;

  const pill = (on, c) => ({
    padding: isPortrait ? "10px 16px" : "5px 12px",
    minHeight: isPortrait ? 44 : "auto",
    borderRadius: 6,
    border: `1px solid ${on ? c + "55" : "rgba(255,255,255,0.12)"}`,
    background: on ? c + "18" : "transparent",
    color: on ? c : th.dim,
    fontSize: 9,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  });

  const barCount = loopDisp ? new Set(loopDisp.map(e => e.tid)).size : 0;
  const BARS_OPTS = [1, 2, 4];

  const recLabel = loopRec
    ? "■ STOP REC"
    : loopMetro && !loopPlaying
      ? "⏺ REC + DÉCOMPTE"
      : "⏺ REC";

  return (
    <div style={{
      marginBottom: 10,
      padding: "10px 12px",
      borderRadius: 10,
      background: th.surface,
      border: `1px solid ${loopRec ? "rgba(191,90,242,0.45)" : loopPlaying ? "rgba(191,90,242,0.25)" : "rgba(191,90,242,0.18)"}`,
      animation: loopRec ? "pulse 1s infinite" : "none",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: "#BF5AF2", letterSpacing: "0.1em" }}>⊙ LOOPER</span>
        {loopRec && (
          <span style={{ fontSize: 7, fontWeight: 800, color: "#FF2D55", animation: "rb 0.8s infinite", letterSpacing: "0.1em" }}>● REC</span>
        )}
        {loopPlaying && !loopRec && (
          <span style={{ fontSize: 7, fontWeight: 800, color: "#30D158", letterSpacing: "0.1em" }}>▶ PLAY</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 8, color: th.faint }}>{barCount} track{barCount !== 1 ? "s" : ""}</span>
      </div>

      {/* Bar selector */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
        <span style={{ fontSize: 7, color: th.dim, flexShrink: 0 }}>BARS</span>
        {BARS_OPTS.map(b => (
          <button key={b} onClick={() => setLoopBars(b)} style={{
            ...pill(loopBars === b, "#BF5AF2"),
            padding: "4px 10px",
            minHeight: "auto",
          }}>
            {b}
          </button>
        ))}
        {/* Countdown toggle */}
        {!loopPlaying && (
          <button onClick={() => setLoopMetro(p => !p)} style={{
            ...pill(loopMetro, "#FF9500"),
            padding: "4px 10px",
            minHeight: "auto",
            marginLeft: "auto",
          }}>
            {loopMetro ? "🎵 DÉCOMPTE ON" : "🎵 DÉCOMPTE"}
          </button>
        )}
      </div>

      {/* Grid visualisation */}
      {(() => {
        const totalSteps = loopBars * 16;
        const loopDurMs = loopBars * 4 * (60000 / Math.max(30, bpm || 120));
        const hasEvents = loopDisp && loopDisp.length > 0;
        const showGrid = hasEvents || loopRec || loopPlaying;
        if (!showGrid) return null;
        const trackColorMap = {};
        (tracks || []).forEach(t => { trackColorMap[t.id] = t.color; });
        // loopPlayhead is already a ratio 0..1 (set by RAF in KickAndSnare)
        const playPct = (loopPlaying || loopRec) && loopDurMs > 0
          ? Math.min(99.5, (loopPlayhead || 0) * 100)
          : null;
        return (
          <div style={{ position: "relative", height: 32, marginBottom: 10, background: "rgba(255,255,255,0.03)", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Step grid lines */}
            {Array.from({ length: totalSteps + 1 }, (_, i) => {
              const pct = (i / totalSteps) * 100;
              const isBeat = i % 4 === 0;
              const isBar = i % 16 === 0;
              return (
                <div key={`g${i}`} style={{
                  position: "absolute",
                  left: `${pct}%`,
                  top: 0,
                  bottom: 0,
                  width: isBar ? 1 : 1,
                  background: isBar
                    ? "rgba(255,255,255,0.2)"
                    : isBeat
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(255,255,255,0.04)",
                  pointerEvents: "none",
                }} />
              );
            })}
            {/* Beat labels */}
            {Array.from({ length: loopBars * 4 }, (_, i) => {
              const pct = (i / (loopBars * 4)) * 100;
              return (
                <div key={`b${i}`} style={{
                  position: "absolute",
                  left: `${pct + 0.5}%`,
                  top: 2,
                  fontSize: 5,
                  lineHeight: 1,
                  color: i % 4 === 0 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.18)",
                  fontFamily: "monospace",
                  pointerEvents: "none",
                  userSelect: "none",
                }}>
                  {i % 4 === 0 ? `${Math.floor(i / 4) + 1}` : "·"}
                </div>
              );
            })}
            {/* Recorded hits */}
            {hasEvents && loopDisp.map((ev, i) => {
              const pct = Math.min(99.5, (ev.tOff / loopDurMs) * 100);
              const color = trackColorMap[ev.tid] || "#BF5AF2";
              return (
                <div key={i} style={{
                  position: "absolute",
                  left: `${pct}%`,
                  top: "30%",
                  bottom: 0,
                  width: 2,
                  borderRadius: "1px 1px 0 0",
                  background: color,
                  opacity: 0.5 + (ev.vel || 0.8) * 0.5,
                  pointerEvents: "none",
                }} />
              );
            })}
            {/* Playhead */}
            {playPct !== null && (
              <div style={{
                position: "absolute",
                left: `${playPct}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: "#30D158",
                opacity: 0.9,
                borderRadius: 1,
                pointerEvents: "none",
                boxShadow: "0 0 4px #30D158",
              }} />
            )}
          </div>
        );
      })()}

      {/* Controls */}
      <div style={{
        display: "flex",
        gap: 5,
        flexWrap: "wrap",
        flexDirection: isPortrait ? "column" : "row",
      }}>
        {/* REC — fresh record (always visible when not currently recording) */}
        {!loopRec && (
          <button
            onClick={loopPlaying ? onFreshRec : onToggleRec}
            style={pill(false, "#FF2D55")}
          >
            {recLabel}
          </button>
        )}
        {/* STOP REC — when recording is active */}
        {loopRec && (
          <button onClick={onToggleRec} style={pill(true, "#FF2D55")}>
            ■ STOP REC
          </button>
        )}
        {/* OVERDUB — only when playing and not already recording */}
        {loopPlaying && !loopRec && (
          <button onClick={onToggleRec} style={pill(false, "#BF5AF2")}>
            ⊕ OVERDUB
          </button>
        )}
        {/* STOP playback */}
        {loopPlaying && (
          <button onClick={onTogglePlay} style={pill(false, "#FF9500")}>
            ■ STOP
          </button>
        )}
        {/* PLAY — only when stopped but has events */}
        {!loopPlaying && loopDisp && loopDisp.length > 0 && (
          <button onClick={onTogglePlay} style={pill(false, "#30D158")}>
            ▶ PLAY
          </button>
        )}
        {loopDisp && loopDisp.length > 0 && (
          <button onClick={onUndo} style={pill(false, "#5E5CE6")}>
            ↺ UNDO
          </button>
        )}
        {(loopPlaying || (loopDisp && loopDisp.length > 0)) && (
          <button onClick={onClear} style={pill(false, "#636366")}>
            ✕ CLEAR
          </button>
        )}
      </div>
    </div>
  );
}

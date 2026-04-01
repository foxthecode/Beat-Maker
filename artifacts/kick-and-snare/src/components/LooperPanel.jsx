import { THEMES } from "../theme.js";

export default function LooperPanel({
  loopBars, setLoopBars,
  loopRec, loopPlaying, loopPlayhead,
  loopDisp,
  onToggleRec, onTogglePlay, onUndo, onClear,
  themeName, isPortrait,
}) {
  const th = THEMES[themeName] || THEMES.dark;

  const pill = (on, c) => ({
    padding: isPortrait ? "10px 16px" : "5px 12px",
    minHeight: isPortrait ? 44 : "auto",
    borderRadius: 6,
    border: `1px solid ${on ? c + "55" : "rgba(255,255,255,0.12)"}`,
    background: on ? c + "18" : "transparent",
    color: on ? c : "inherit",
    fontSize: 9,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const barCount = loopDisp ? new Set(loopDisp.map(e => e.tid)).size : 0;
  const BARS_OPTS = [1, 2, 4];

  return (
    <div style={{
      marginBottom: 8,
      padding: "10px 12px",
      borderRadius: 10,
      background: th.surface,
      border: `1px solid ${loopRec ? "rgba(191,90,242,0.45)" : loopPlaying ? "rgba(191,90,242,0.25)" : "rgba(191,90,242,0.18)"}`,
      animation: loopRec ? "pulse 1s infinite" : "none",
    }}>
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
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 7, color: th.dim, alignSelf: "center", flexShrink: 0 }}>BARS</span>
        {BARS_OPTS.map(b => (
          <button key={b} onClick={() => setLoopBars(b)} style={{
            ...pill(loopBars === b, "#BF5AF2"),
            padding: "4px 10px",
            minHeight: "auto",
          }}>
            {b}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ position: "relative", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", marginBottom: 10, overflow: "hidden" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${loopPlayhead * 100}%`,
          background: loopRec
            ? "linear-gradient(90deg, #FF2D55, #BF5AF2)"
            : "linear-gradient(90deg, #BF5AF2, #5E5CE6)",
          borderRadius: 3,
          transition: "width 0.025s linear",
        }} />
      </div>

      {/* Dots visualisation */}
      {loopDisp && loopDisp.length > 0 && (
        <div style={{ position: "relative", height: 20, marginBottom: 10, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
          {loopDisp.map((ev, i) => {
            const pct = loopDisp.filter(e => e.tid !== undefined).length > 0
              ? ev.tOff / (loopDisp.reduce((m, e) => Math.max(m, e.tOff), 1) + 200) * 100
              : 0;
            return (
              <div key={i} style={{
                position: "absolute",
                left: `${Math.min(99, pct)}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "#BF5AF2",
                opacity: 0.7 + ev.vel * 0.3,
              }} />
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div style={{
        display: "flex",
        gap: 5,
        flexDirection: isPortrait ? "column" : "row",
      }}>
        <button onClick={onToggleRec} style={pill(loopRec, "#FF2D55")}>
          {loopRec ? "■ STOP REC" : (loopPlaying ? "⊕ OVERDUB" : "⏺ REC")}
        </button>
        {loopPlaying && (
          <button onClick={onTogglePlay} style={pill(false, "#FF9500")}>
            ■ STOP
          </button>
        )}
        {loopDisp && loopDisp.length > 0 && (
          <button onClick={onUndo} style={pill(false, "#5E5CE6")}>
            ↺ UNDO
          </button>
        )}
        {(loopPlaying || (loopDisp && loopDisp.length > 0)) && (
          <button onClick={onClear} style={pill(false, "#FF2D55")}>
            ✕ CLEAR
          </button>
        )}
      </div>
    </div>
  );
}

import { memo } from "react";
import { THEMES } from "../theme.js";
import { DrumSVG } from "../drumSVG.tsx";

function TrackRow({
  track, tSteps, STEPS, pat, cStep,
  stVel, stNudge, stProb, stRatch,
  dragInfo, fx, flash, aud,
  smpN, MidiTag,
  actLength, themeName, gInfo,
  isMuted, isSoloed,
  onStepDown, onContextMenu,
  onMuteToggle, onSoloToggle, onLoadSample, onRemove, onFxChange,
  onStepCountChange, onClear,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const f = fx || { vol: 80, pan: 0 };
  const vol = f.vol ?? 80;
  const pan = f.pan ?? 0;

  const isCustomTs = tSteps !== STEPS;
  const tsOpts = [STEPS, STEPS * 2];
  const tsIdx = tsOpts.indexOf(tSteps);
  const nextTs = tsOpts[(tsIdx + 1) % tsOpts.length];

  const leftW = typeof window !== "undefined" && window.innerWidth < 600 ? 140 : 190;

  const btnSt = {
    height: 28, minWidth: 0, border: "none", borderRadius: 4,
    cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  };
  const r = 9; const circ = 2 * Math.PI * r;

  const volOnPD = e => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let sY = e.clientY, sV = vol;
    const mv = pe => { const dy = sY - pe.clientY; onFxChange("vol", Math.max(0, Math.min(100, Math.round(sV - dy * 1.2)))); };
    const up = () => { el.removeEventListener("pointermove", mv); };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up, { once: true });
    el.addEventListener("pointercancel", up, { once: true });
  };

  const panOnPD = e => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let sY = e.clientY, sV = pan;
    const mv = pe => { const dy = sY - pe.clientY; onFxChange("pan", Math.max(-100, Math.min(100, Math.round(sV - dy * 2.5)))); };
    const up = () => { el.removeEventListener("pointermove", mv); };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up, { once: true });
    el.addEventListener("pointercancel", up, { once: true });
  };

  const panArc = pan === 0 ? null : (() => {
    const toRad = d => d * Math.PI / 180;
    const sa = -90; const ea = sa + (pan / 100) * 180;
    const x1 = 11 + r * Math.cos(toRad(sa)); const y1 = 11 + r * Math.sin(toRad(sa));
    const x2 = 11 + r * Math.cos(toRad(ea)); const y2 = 11 + r * Math.sin(toRad(ea));
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 0 ${pan > 0 ? 1 : 0} ${x2.toFixed(2)},${y2.toFixed(2)}`;
  })();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, opacity: aud ? 1 : 0.3, padding: "4px 0" }}>

        {/* ── Left: Track Label + controls (fixed width, never shrinks) ── */}
        <div style={{ width: leftW, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2 }}>

          {/* Row 1: icon+label · M · S · CLR · ♪ · × */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "nowrap", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 3, width: 68, flexShrink: 0, overflow: "hidden" }}>
              <DrumSVG id={track.id} color={track.color} hit={flash} />
              <span style={{ fontSize: 10, fontWeight: 700, color: track.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{track.label}</span>
            </div>
            <MidiTag id={track.id} />
            <button onClick={onMuteToggle} style={{ ...btnSt, width: 18, background: isMuted ? "rgba(255,55,95,0.25)" : th.btn, color: isMuted ? "#FF375F" : th.faint }}>M</button>
            <button onClick={onSoloToggle} style={{ ...btnSt, width: 18, background: isSoloed ? "rgba(255,214,10,0.25)" : th.btn, color: isSoloed ? "#FFD60A" : th.faint }}>S</button>
            <button onClick={onClear} style={{ ...btnSt, width: 22, background: th.btn, color: th.dim, fontSize: 6 }} title="Clear track">CLR</button>
            <button onClick={onLoadSample} title={smpN ? smpN : "Load sample"} style={{ ...btnSt, width: 20, background: smpN ? "rgba(255,149,0,0.2)" : th.btn, color: smpN ? "#FF9500" : th.dim }}>♪</button>
            {actLength > 1 && <button onClick={onRemove} style={{ ...btnSt, width: 18, background: "rgba(255,55,95,0.08)", color: "#FF375F", fontSize: 9 }}>×</button>}
          </div>

          {/* Row 2: step count · VOL knob · PAN knob */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <button
              title={`${tSteps}st → ${nextTs}st`}
              onClick={() => onStepCountChange(nextTs)}
              style={{ ...btnSt, height: 22, padding: "0 3px", cursor: "pointer", border: `1px solid ${isCustomTs ? track.color + "44" : th.sBorder}`, background: isCustomTs ? track.color + "11" : "transparent", color: isCustomTs ? track.color : th.dim }}
            >{tSteps}st</button>

            {/* VOL knob */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <div onPointerDown={volOnPD} onDoubleClick={() => onFxChange("vol", 80)} title={`VOL: ${vol} — drag ↕`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, cursor: "ns-resize", userSelect: "none", touchAction: "none" }}>
                <div style={{ position: "relative", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="22" height="22" style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }} viewBox="0 0 22 22">
                    <circle cx="11" cy="11" r={r} fill="none" stroke={track.color + "22"} strokeWidth="2.5" />
                    <circle cx="11" cy="11" r={r} fill="none" stroke={track.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${circ * vol / 100} ${circ}`} />
                  </svg>
                  <span style={{ fontSize: 6, fontWeight: 900, color: track.color, zIndex: 1, pointerEvents: "none" }}>VOL</span>
                </div>
                <span style={{ fontSize: 6, color: track.color, fontWeight: 700, fontFamily: "monospace", lineHeight: 1 }}>{vol}</span>
              </div>
              <MidiTag id={`vol_${track.id}`} />
            </div>

            {/* PAN knob */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <div onPointerDown={panOnPD} onDoubleClick={() => onFxChange("pan", 0)} title={`PAN: ${pan === 0 ? "C" : pan < 0 ? `L${Math.abs(pan)}` : `R${pan}`} — drag ↕`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, cursor: "ns-resize", userSelect: "none", touchAction: "none" }}>
                <div style={{ position: "relative", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="22" height="22" style={{ position: "absolute", top: 0, left: 0 }} viewBox="0 0 22 22">
                    <circle cx="11" cy="11" r={r} fill="none" stroke={track.color + "22"} strokeWidth="2.5" />
                    {panArc && <path d={panArc} fill="none" stroke={track.color} strokeWidth="2.5" strokeLinecap="round" />}
                    <circle cx="11" cy="11" r="1.5" fill={track.color} />
                  </svg>
                  <span style={{ fontSize: 6, fontWeight: 900, color: track.color, zIndex: 1, pointerEvents: "none" }}>PAN</span>
                </div>
                <span style={{ fontSize: 6, color: track.color, fontWeight: 700, fontFamily: "monospace", lineHeight: 1 }}>{pan === 0 ? "C" : pan < 0 ? `L${Math.abs(pan)}` : `R${pan}`}</span>
              </div>
              <MidiTag id={`pan_${track.id}`} />
            </div>
          </div>

          {/* Row 3: sample name */}
          {smpN && <span style={{ fontSize: 6, color: th.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{smpN.substring(0, 30)}</span>}
        </div>

        {/* ── Steps grid (grows to fill, never pushes siblings) ── */}
        <div style={{
          flex: "1 1 0", minWidth: 0, overflow: "hidden",
          alignSelf: "flex-start",
          display: "flex", gap: 0,
          overflowX: "auto", scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch", touchAction: "manipulation",
        }}>
          {Array(tSteps).fill(0).map((_, step) => {
            const ac = !!(pat?.[step]);
            const ratio = Math.max(1, Math.round(tSteps / STEPS));
            const isCur = ratio > 1 ? (step >= cStep * ratio && step < (cStep + 1) * ratio) : cStep % tSteps === step;
            const gs = Math.min(STEPS - 1, Math.floor(step * STEPS / tSteps));
            const gi = gInfo(gs);
            const sn = stNudge?.[step] || 0;
            const vel = stVel?.[step] ?? 100;
            const prob = stProb?.[step] ?? 100;
            const ratch = stRatch?.[step] || 1;
            const isDrag = dragInfo?.tid === track.id && dragInfo?.step === step;
            const dragAxis = isDrag ? dragInfo.axis : null;
            return (
              <div key={step}
                onMouseDown={e => onStepDown(step, e)}
                onTouchStart={e => onStepDown(step, e)}
                onContextMenu={e => onContextMenu(step, e)}
                style={{
                  flex: 1, aspectRatio: "1", borderRadius: 3, cursor: ac ? "grab" : "pointer",
                  position: "relative", minWidth: 0, overflow: "hidden",
                  scrollSnapAlign: "start",
                  marginLeft: gi.first && step > 0 ? 6 : 2, touchAction: "none", userSelect: "none",
                  background: isCur && gi.first ? "rgba(255,149,0,0.45)" : isCur ? th.cursor : gi.gi % 2 === 1 ? th.stepAlt : th.stepOff,
                  boxShadow: ac && isCur ? `0 0 10px ${track.color},inset 0 0 5px ${track.color}` : "none",
                  transform: isDrag ? "scale(1.15)" : ac && isCur ? "scale(1.08)" : "scale(1)",
                  transition: isDrag ? "none" : "all 0.08s",
                  border: isDrag ? `1px solid ${dragAxis === "v" ? "#FFD60A" : dragAxis === "h" ? "#64D2FF" : "transparent"}` : ac ? `1px solid ${track.color}` : `1px solid ${th.sBorder}`,
                }}>
                {ac && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${vel}%`, borderRadius: 3, background: track.color, transition: isDrag ? "none" : "height 0.15s" }} />}
                {ac && prob < 100 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `${track.color}33`, zIndex: 3 }}>
                  <div style={{ height: "100%", width: `${prob}%`, background: "#FFD60A", borderRadius: 1 }} />
                </div>}
                {ac && ratch > 1 && <div style={{ position: "absolute", top: 1, right: 1, fontSize: 5, fontWeight: 900, color: "#fff", background: "rgba(0,0,0,0.7)", borderRadius: 2, padding: "0 1px", lineHeight: "8px", zIndex: 4 }}>×{ratch}</div>}
                {ac && sn !== 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${50 + sn * 0.4}%`, width: 2, borderRadius: 1, background: track.color, opacity: 0.6, transform: "translateX(-50%)", pointerEvents: "none" }} />}
                {isDrag && dragAxis === "v" && <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 7, fontWeight: 800, color: "#fff", textShadow: "0 0 3px rgba(0,0,0,0.5)", pointerEvents: "none", zIndex: 5 }}>{vel}%</span>}
                {isDrag && dragAxis === "h" && <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 7, fontWeight: 800, color: "#fff", textShadow: "0 0 3px rgba(0,0,0,0.5)", pointerEvents: "none", zIndex: 5 }}>{sn > 0 ? "+" : ""}{sn}</span>}
                {ac && prob < 100 && !isDrag && <span style={{ position: "absolute", top: 1, left: 1, fontSize: 5, color: "#FFD60A", fontWeight: 700, lineHeight: 1, zIndex: 4 }}>{prob}%</span>}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

export default memo(TrackRow);

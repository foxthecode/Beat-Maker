import { memo, useRef, useEffect } from "react";
import { THEMES } from "../theme.js";
import { DrumSVG } from "../drumSVG.tsx";

function TrackRow({
  track, tSteps, STEPS, pat, cStep,
  stVel, stNudge, stProb, stRatch,
  dragInfo, fx, flash, aud,
  smpN, MidiTag,
  actLength, themeName, gInfo,
  isMuted, isSoloed,
  isPortrait,
  sendCursor, fxSecs, gfxSends,
  onStepDown, onContextMenu,
  onMuteToggle, onSoloToggle, onLoadSample, onRemove, onFxChange,
  onStepCountChange, onClear,
  onSendCursorChange, onSendAmtChange,
  onFxOpen,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const f = fx || { vol: 80, pan: 0 };
  const vol = f.vol ?? 80;
  const pan = f.pan ?? 0;


  const leftW = isPortrait ? 160 : (typeof window !== "undefined" && window.innerWidth < 600 ? 160 : 220);

  const scrollRef = useRef(null);
  // Scroll back to beat 1 when the sequencer loops (cStep resets to 0)
  useEffect(() => {
    if (cStep === 0 && scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [cStep]);

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

  // ── Send knob ──
  const sIdx = sendCursor ?? 0;
  const fxSec = fxSecs?.[sIdx];
  const fxColor = fxSec?.color ?? "#888";
  const fxLabel = fxSec?.label ?? "---";
  const sendAmt = gfxSends?.[sIdx] ?? 0;

  const sendOnPD = e => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let sY = e.clientY, sV = sendAmt;
    const mv = pe => {
      const dy = sY - pe.clientY;
      const nv = Math.max(0, Math.min(100, Math.round(sV - dy * 1.5)));
      onSendAmtChange?.(nv);
    };
    const up = () => { el.removeEventListener("pointermove", mv); };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up, { once: true });
    el.addEventListener("pointercancel", up, { once: true });
  };

  const arrowBtnSt = {
    background: "transparent", border: "none", cursor: "pointer",
    color: "rgba(255,255,255,0.35)", fontSize: 7, fontWeight: 900,
    padding: "0 1px", lineHeight: 1, fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 2, minWidth: 10,
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: isPortrait ? "column" : "row", alignItems: isPortrait ? "stretch" : "flex-start", gap: 6, opacity: aud ? 1 : 0.3, padding: "4px 0" }}>

        {/* ── Left: two sub-columns side by side ── */}
        <div style={{ width: leftW, flexShrink: 0, display: "flex", flexDirection: "row", gap: 3, alignItems: "flex-start" }}>

          {/* Sub-col A: Row1 = icon+label  |  Row2 = VOL+PAN */}
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 2, minWidth: 60 }}>
            {/* Row 1: icon · label */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, overflow: "hidden" }}>
              <DrumSVG id={track.id} color={track.color} hit={flash} />
              <span data-hint={`Track ${track.label} · Drag steps to program · Icon = hit animation · Color = unique identifier`} style={{ fontSize: 10, fontWeight: 700, color: track.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{track.label}</span>
            </div>
            {/* Row 2: VOL · PAN */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              {/* VOL */}
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <div data-hint={`VOL track ${track.label} · Value: ${vol}% · Drag ↕ to adjust · Double-click to reset to 80%`} onPointerDown={volOnPD} onDoubleClick={() => onFxChange("vol", 80)} title={`VOL: ${vol} — drag ↕`} style={{ position: "relative", width: 18, height: 18, cursor: "ns-resize", userSelect: "none", touchAction: "none" }}>
                  <svg width="18" height="18" style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }} viewBox="0 0 22 22">
                    <circle cx="11" cy="11" r={r} fill="none" stroke={track.color + "22"} strokeWidth="2.5" />
                    <circle cx="11" cy="11" r={r} fill="none" stroke={track.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${circ * vol / 100} ${circ}`} />
                  </svg>
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 5, fontWeight: 900, color: track.color, pointerEvents: "none" }}>VOL</span>
                </div>
                <span style={{ fontSize: 6, fontWeight: 700, color: track.color, opacity: 0.75, lineHeight: 1 }}>{vol}</span>
                <MidiTag id={`vol_${track.id}`} />
              </div>
              {/* PAN */}
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <div data-hint={`PAN track ${track.label} · Value: ${pan === 0 ? "Center" : pan < 0 ? `Left ${Math.abs(pan)}%` : `Right ${pan}%`} · Drag ↕ to move in stereo field · Double-click = center`} onPointerDown={panOnPD} onDoubleClick={() => onFxChange("pan", 0)} title={`PAN: ${pan === 0 ? "C" : pan < 0 ? `L${Math.abs(pan)}` : `R${pan}`} — drag ↕`} style={{ position: "relative", width: 18, height: 18, cursor: "ns-resize", userSelect: "none", touchAction: "none" }}>
                  <svg width="18" height="18" style={{ position: "absolute", top: 0, left: 0 }} viewBox="0 0 22 22">
                    <circle cx="11" cy="11" r={r} fill="none" stroke={track.color + "22"} strokeWidth="2.5" />
                    {panArc && <path d={panArc} fill="none" stroke={track.color} strokeWidth="2.5" strokeLinecap="round" />}
                    <circle cx="11" cy="11" r="1.5" fill={track.color} />
                  </svg>
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 5, fontWeight: 900, color: track.color, pointerEvents: "none" }}>PAN</span>
                </div>
                <span style={{ fontSize: 6, fontWeight: 700, color: track.color, opacity: 0.75, lineHeight: 1 }}>{pan === 0 ? "C" : pan < 0 ? `L${Math.abs(pan)}` : `R${pan}`}</span>
                <MidiTag id={`pan_${track.id}`} />
              </div>
            </div>
          </div>

          {/* Sub-col B: [M · S · CLR · ♪ · ×] then [16st + name] */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Row 1: MidiTag · 🎛 · M · S · CLR · ♪ · × */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "nowrap" }}>
              <MidiTag id={track.id} />
              <button
                data-hint={`FX · Open per-track effects for ${track.label} · Pitch, Filter, Drive, Volume, Pan, Reverb & Delay sends`}
                title="Track FX"
                onClick={() => onFxOpen?.()}
                style={{ ...btnSt, width: 22, fontSize: 6, background: "rgba(191,90,242,0.06)", color: "rgba(191,90,242,0.85)", border: "1px solid rgba(191,90,242,0.3)" }}
              >🎛</button>
              <button data-hint={isMuted ? `MUTE active · Track ${track.label} is silent · Click to re-enable` : `MUTE · Silently mute track ${track.label} without clearing steps`} onClick={onMuteToggle} style={{ ...btnSt, width: 18, background: isMuted ? "rgba(255,55,95,0.25)" : th.btn, color: isMuted ? "#FF375F" : th.faint }}>M</button>
              <button data-hint={isSoloed ? `SOLO active · Only track ${track.label} is audible · Click to disable` : `SOLO · Isolate track ${track.label} — all others are muted`} onClick={onSoloToggle} style={{ ...btnSt, width: 18, background: isSoloed ? "rgba(255,214,10,0.25)" : th.btn, color: isSoloed ? "#FFD60A" : th.faint }}>S</button>
              <button data-hint={`CLR · Clear all steps on track ${track.label} only`} onClick={onClear} style={{ ...btnSt, width: 22, background: th.btn, color: th.dim, fontSize: 6 }} title="Clear track">CLR</button>
              <button data-hint={smpN ? `Sample loaded: ${smpN} · Click to change audio file` : `Load a sample · Import an audio file (MP3, WAV, OGG) for this track`} onClick={onLoadSample} title={smpN ? smpN : "Load sample"} style={{ ...btnSt, width: 20, background: smpN ? "rgba(255,149,0,0.2)" : th.btn, color: smpN ? "#FF9500" : th.dim }}>♪</button>
              {actLength > 1 && <button data-hint={`Remove track ${track.label} from the active view (not permanently deleted)`} onClick={onRemove} style={{ ...btnSt, width: 18, background: "rgba(255,55,95,0.08)", color: "#FF375F", fontSize: 9 }}>×</button>}
            </div>
            {smpN && <span style={{ fontSize: 6, color: th.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{smpN.substring(0, 14)}</span>}
          </div>

        </div>

        {/* ── Steps grid (grows to fill, never pushes siblings) ── */}
        <div ref={scrollRef} style={isPortrait ? {
          width: "100%", overflowX: "auto", display: "flex",
          scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch",
          gap: 2, touchAction: "manipulation", paddingBottom: 2,
        } : {
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
            const stepHint = ac
              ? `Step ${step + 1} actif · Vélocité: ${vel}% · Probabilité: ${prob}%${ratch > 1 ? ` · ×${ratch} répétitions` : ""}${sn !== 0 ? ` · Nudge: ${sn > 0 ? "+" : ""}${sn}` : ""} · Drag ↕ = vélocité · Drag ↔ = timing · Long-press = réglages · Clic = désactiver`
              : `Step ${step + 1} vide · Clic pour activer · Drag immédiat ↕ = régler la vélocité dès l'activation`;
            return (
              <div key={step}
                data-hint={stepHint}
                onPointerDown={e => onStepDown(step, e)}
                onContextMenu={e => onContextMenu(step, e)}
                data-step="true"
                className={isCur && ac && !isDrag ? "stepPulse" : ""}
                style={{
                  flex: isPortrait ? "0 0 24px" : 1, minWidth: isPortrait ? 24 : 0,
                  height: isPortrait ? 32 : undefined, aspectRatio: isPortrait ? undefined : "1",
                  borderRadius: 3, cursor: ac ? "grab" : "pointer",
                  position: "relative", overflow: "hidden",
                  scrollSnapAlign: "start",
                  marginLeft: gi.first && step > 0 ? 6 : 2, touchAction: "none", userSelect: "none", WebkitTouchCallout: "none",
                  background: isCur && gi.first ? "rgba(200,169,110,0.42)" : isCur ? th.cursor : gi.gi % 2 === 1 ? th.stepAlt : th.stepOff,
                  boxShadow: ac && isCur ? `0 0 18px ${track.color},0 0 40px ${track.color}66,inset 0 0 8px ${track.color}44` : "none",
                  transform: isDrag ? "scale(1.15)" : "scale(1)",
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

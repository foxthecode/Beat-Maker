import { useState } from "react";
import { THEMES } from "../theme.js";

export default function LooperPanel({
  loopBars, setLoopBars,
  loopRec, loopPlaying, loopPlayhead,
  loopDisp,
  loopMetro, setLoopMetro,
  onToggleRec, onFreshRec, onTogglePlay, onUndo, onRedo, onClear,
  loopCanUndo, loopCanRedo,
  themeName, isPortrait,
  bpm, tracks,
  onBeforeEdit,
  onMoveHit,
  onAddHit,
  onRemoveHit,
  onQuantize,
  autoQ, setAutoQ,
  loopDurMs: loopDurMsProp,
  onVelChange,
  onExportLoop, loopExportState, loopExportReps, setLoopExportReps,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const [quantDiv, setQuantDiv] = useState(16);
  const [dragIdx, setDragIdx] = useState(null);
  const [addTid, setAddTid] = useState(() => (tracks && tracks[0]?.id) || null);

  const validTids = (tracks || []).map(t => t.id);
  const effectiveAddTid = validTids.includes(addTid) ? addTid : (validTids[0] || null);

  const canEdit = !loopRec && !!onAddHit;

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
    touchAction: "manipulation",
  });

  const barCount = loopDisp ? new Set(loopDisp.map(e => e.tid)).size : 0;
  const BARS_OPTS = [1, 2, 4];
  const QUANT_OPTS = [4, 8, 12, 16, 24, 32];
  const QUANT_LABELS = { 4: "1/4", 8: "1/8", 12: "1/8T", 16: "1/16", 24: "1/16T", 32: "1/32" };
  const QUANT_TRIPLET = new Set([12, 24]);

  // Use the passed loopDurMs (frozen to L.lengthMs) — fallback to BPM formula when no events yet
  const loopDurMs = (loopDurMsProp && loopDurMsProp > 0)
    ? loopDurMsProp
    : loopBars * 4 * (60000 / Math.max(30, bpm || 120));

  const totalSteps = loopBars * 16;

  return (
    <div style={{
      marginBottom: 10,
      padding: "10px 12px",
      borderRadius: 10,
      background: th.surface,
      border: `1px solid ${loopRec ? "rgba(255,45,85,0.45)" : loopPlaying ? "rgba(191,90,242,0.25)" : "rgba(191,90,242,0.18)"}`,
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

      {/* Bar selector + metro */}
      <div style={{ display: "flex", gap: 4, marginBottom: 6, alignItems: "center" }}>
        <span style={{ fontSize: 7, color: th.dim, flexShrink: 0 }}>BARS</span>
        {BARS_OPTS.map(b => (
          <button key={b} onClick={() => setLoopBars(b)} style={{
            ...pill(loopBars === b, "#BF5AF2"),
            padding: "3px 9px", minHeight: "auto",
          }}>
            {b}
          </button>
        ))}
      </div>

      {/* ── QUANTIZE toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        marginBottom: 8,
        padding: "5px 7px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <span style={{ fontSize: 7, color: th.dim, letterSpacing: "0.07em", flexShrink: 0 }}>QUANT</span>
        {QUANT_OPTS.map(d => {
          const isTriplet = QUANT_TRIPLET.has(d);
          const accent = isTriplet ? "#64D2FF" : "#FFD60A";
          const active = quantDiv === d;
          return (
            <button
              key={d}
              onClick={() => setQuantDiv(d)}
              title={isTriplet ? `Triolet ${QUANT_LABELS[d]}` : QUANT_LABELS[d]}
              style={{
                padding: "2px 7px", borderRadius: 4, cursor: "pointer",
                fontFamily: "inherit", fontSize: 7, fontWeight: 700,
                border: `1px solid ${active ? accent + "88" : "rgba(255,255,255,0.1)"}`,
                background: active ? accent + "18" : "transparent",
                color: active ? accent : isTriplet ? "#64D2FF88" : th.dim,
                letterSpacing: "0.06em",
                fontStyle: isTriplet ? "italic" : "normal",
              }}
            >{QUANT_LABELS[d]}</button>
          );
        })}
        <button
          onClick={() => onQuantize && onQuantize(quantDiv)}
          disabled={!loopDisp || loopDisp.length === 0}
          title={`Snap tous les hits à ${QUANT_LABELS[quantDiv]}${QUANT_TRIPLET.has(quantDiv) ? " (triolet)" : ""}`}
          style={{
            padding: "2px 9px", borderRadius: 4, cursor: (!loopDisp || !loopDisp.length) ? "not-allowed" : "pointer",
            fontFamily: "inherit", fontSize: 7, fontWeight: 800,
            border: "1px solid #FFD60A55",
            background: "#FFD60A15",
            color: (!loopDisp || !loopDisp.length) ? "rgba(255,214,10,0.3)" : "#FFD60A",
            letterSpacing: "0.07em",
          }}
        >⟨ APPLY</button>
        <div style={{ marginLeft: "auto" }}/>
        {setAutoQ && (
          <button
            onClick={() => setAutoQ(p => !p)}
            title={autoQ ? "Auto-quantize activé au REC" : "Auto-quantize désactivé"}
            style={{
              padding: "2px 8px", borderRadius: 4, cursor: "pointer",
              fontFamily: "inherit", fontSize: 7, fontWeight: 700,
              border: `1px solid ${autoQ ? "#30D15866" : "rgba(255,255,255,0.1)"}`,
              background: autoQ ? "#30D15818" : "transparent",
              color: autoQ ? "#30D158" : th.dim,
              letterSpacing: "0.07em",
              display: "flex", alignItems: "center", gap: 3,
            }}
          >
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: autoQ ? "#30D158" : th.dim,
              flexShrink: 0,
              boxShadow: autoQ ? "0 0 4px #30D158" : "none",
            }}/>
            AUTO-Q
          </button>
        )}
      </div>

      {/* ── Track selector ── */}
      {canEdit && tracks && tracks.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
          <span style={{ fontSize: 6, color: th.dim, letterSpacing: "0.08em", flexShrink: 0 }}>+ TRACK</span>
          {tracks.map(t => (
            <button
              key={t.id}
              title={t.label}
              onClick={() => setAddTid(t.id)}
              style={{
                width: 13, height: 13, borderRadius: "50%", padding: 0,
                background: effectiveAddTid === t.id ? t.color : t.color + "33",
                border: `1.5px solid ${effectiveAddTid === t.id ? t.color + "cc" : t.color + "55"}`,
                cursor: "pointer",
                boxShadow: effectiveAddTid === t.id ? `0 0 5px ${t.color}88` : "none",
                transition: "all 0.1s",
              }}
            />
          ))}
          <span style={{ fontSize: 6, color: th.faint, marginLeft: 2 }}>
            {(tracks.find(t => t.id === effectiveAddTid) || tracks[0])?.label || ""}
          </span>
        </div>
      )}

      {/* ── Timeline grid ── */}
      {(() => {
        const hasEvents = loopDisp && loopDisp.length > 0;
        const showGrid = hasEvents || loopRec || loopPlaying || canEdit;
        if (!showGrid) return null;
        const trackColorMap = {};
        (tracks || []).forEach(t => { trackColorMap[t.id] = t.color; });
        const playPct = (loopPlaying || loopRec) && loopDurMs > 0
          ? Math.min(99.5, (loopPlayhead || 0) * 100)
          : null;

        const handleTimelineClick = e => {
          if (!canEdit || !effectiveAddTid) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const raw = (x / rect.width) * loopDurMs;
          const snapMs = loopDurMs / (loopBars * 32);
          const snapped = Math.max(0, Math.min(loopDurMs - snapMs, Math.round(raw / snapMs) * snapMs));
          onAddHit(effectiveAddTid, snapped);
        };

        return (
          <div
            style={{ position: "relative", height: 52, marginBottom: 10, background: "rgba(255,255,255,0.03)", borderRadius: 6, overflow: "hidden", border: `1px solid ${canEdit ? "rgba(191,90,242,0.18)" : "rgba(255,255,255,0.07)"}`, cursor: canEdit ? "crosshair" : "default" }}
            onClick={handleTimelineClick}
          >
            {/* Alternating measure background bands */}
            {Array.from({ length: loopBars }, (_, bar) => (
              <div key={`mb${bar}`} style={{
                position: "absolute",
                left: `${(bar / loopBars) * 100}%`,
                width: `${(1 / loopBars) * 100}%`,
                top: 0, bottom: 0,
                background: bar % 2 === 0 ? "rgba(255,255,255,0.0)" : "rgba(255,255,255,0.025)",
                pointerEvents: "none",
              }} />
            ))}

            {/* Step grid lines */}
            {Array.from({ length: totalSteps + 1 }, (_, i) => {
              const pct = (i / totalSteps) * 100;
              const isBeat = i % 4 === 0;
              const isBar = i % 16 === 0;
              return (
                <div key={`g${i}`} style={{
                  position: "absolute", left: `${pct}%`, top: 0, bottom: 0,
                  width: 1,
                  background: isBar ? "rgba(255,255,255,0.28)" : isBeat ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
                  pointerEvents: "none",
                }} />
              );
            })}

            {/* Quantize snap lines */}
            {quantDiv !== 16 && Array.from({ length: loopBars * quantDiv + 1 }, (_, i) => {
              const pct = (i / (loopBars * quantDiv)) * 100;
              return (
                <div key={`q${i}`} style={{
                  position: "absolute", left: `${pct}%`, top: 0, bottom: 16,
                  width: 1, background: "rgba(255,214,10,0.15)", pointerEvents: "none",
                }} />
              );
            })}

            {/* Bar number labels — one per measure, enlarged */}
            {Array.from({ length: loopBars }, (_, bar) => (
              <div key={`bn${bar}`} style={{
                position: "absolute",
                left: `${(bar / loopBars) * 100 + 0.5}%`,
                bottom: 3,
                fontSize: 8,
                lineHeight: 1,
                fontWeight: 800,
                color: bar % 2 === 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.35)",
                fontFamily: "monospace",
                pointerEvents: "none",
                userSelect: "none",
                letterSpacing: "0.04em",
              }}>
                {bar + 1}
              </div>
            ))}

            {/* Beat dots within each measure (2 3 4) */}
            {Array.from({ length: loopBars * 4 }, (_, i) => {
              if (i % 4 === 0) return null; // bar number already shown
              return (
                <div key={`bd${i}`} style={{
                  position: "absolute",
                  left: `${(i / (loopBars * 4)) * 100 + 0.4}%`,
                  bottom: 4, fontSize: 5, lineHeight: 1,
                  color: "rgba(255,255,255,0.15)",
                  fontFamily: "monospace", pointerEvents: "none", userSelect: "none",
                }}>·</div>
              );
            })}

            {/* Recorded hits — draggable, velocity-scrollable, removable on dbl-click */}
            {hasEvents && loopDisp.map((ev, i) => {
              const pct = Math.min(99.5, (ev.tOff / loopDurMs) * 100);
              const color = trackColorMap[ev.tid] || "#BF5AF2";
              const canDrag = !!onMoveHit && !loopRec;
              const canRemove = canEdit && !!onRemoveHit;
              const isDragging = dragIdx === i;
              const label = (tracks||[]).find(t=>t.id===ev.tid)?.label || ev.tid;
              const vel = ev.vel ?? 0.8;

              return (
                <div
                  key={`h${i}`}
                  title={canRemove
                    ? `${label} vel:${Math.round(vel*100)}% — drag↕ vel · drag→ move · dbl-click delete`
                    : canDrag ? `${label} — drag → move · drag ↕ vel` : undefined}
                  style={{
                    position: "absolute",
                    left: `${pct}%`,
                    top: 0,
                    bottom: 0,
                    width: (canDrag || canRemove) ? 26 : 5,
                    transform: (canDrag || canRemove) ? "translateX(-13px)" : "none",
                    display: "flex",
                    alignItems: "stretch",
                    justifyContent: "center",
                    cursor: canDrag ? "grab" : canRemove ? "pointer" : "default",
                    pointerEvents: (canDrag || canRemove) ? "auto" : "none",
                    touchAction: "none",
                    zIndex: isDragging ? 10 : 2,
                  }}
                  onClick={e => e.stopPropagation()}
                  onDoubleClick={canRemove ? e => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveHit(i);
                  } : undefined}
                  onWheel={onVelChange ? e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const delta = -e.deltaY / 300;
                    const newVel = Math.max(0.05, Math.min(1, vel + delta));
                    onVelChange(i, newVel);
                  } : undefined}
                  onPointerDown={(canDrag || (canRemove && onVelChange)) ? e => {
                    e.preventDefault(); e.stopPropagation();
                    onBeforeEdit?.();
                    const gridEl = e.currentTarget.parentElement;
                    const rect = gridEl.getBoundingClientRect();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startTOff = ev.tOff;
                    const startVel = vel;
                    const snapMs = loopDurMs / (loopBars * 32);
                    let mode = null; // 'move' | 'vel'
                    const mv = me => {
                      const dx = me.clientX - startX;
                      const dy = startY - me.clientY; // positive = drag up = louder
                      if (!mode) {
                        if (Math.abs(dx) > 6) mode = 'move';
                        else if (Math.abs(dy) > 6) mode = 'vel';
                      }
                      if (mode === 'move' && canDrag) {
                        setDragIdx(i);
                        const dMs = (dx / rect.width) * loopDurMs;
                        const raw = startTOff + dMs;
                        const snapped = Math.max(0, Math.min(loopDurMs - snapMs, Math.round(raw / snapMs) * snapMs));
                        onMoveHit && onMoveHit(i, snapped);
                      } else if (mode === 'vel' && onVelChange) {
                        const newVel = Math.max(0.05, Math.min(1, startVel + dy / 80));
                        onVelChange(i, newVel);
                      }
                    };
                    const up = () => {
                      setDragIdx(null);
                      window.removeEventListener("pointermove", mv);
                      window.removeEventListener("pointerup", up);
                    };
                    window.addEventListener("pointermove", mv);
                    window.addEventListener("pointerup", up);
                  } : undefined}
                >
                  {/* Hit bar — width 4px, height driven by velocity */}
                  <div style={{
                    width: 4,
                    alignSelf: "flex-end",
                    height: `${Math.round(30 + vel * 70)}%`,
                    background: color,
                    opacity: isDragging ? 1 : (0.45 + vel * 0.55),
                    borderRadius: "1px 1px 0 0",
                    flexShrink: 0,
                    boxShadow: isDragging ? `0 0 6px ${color}` : `0 0 3px ${color}55`,
                    transition: "height 0.08s, opacity 0.08s",
                  }} />
                  {/* Drag handle */}
                  {(canDrag || canRemove) && (
                    <div style={{
                      position: "absolute", top: 2,
                      width: 8, height: 6,
                      borderRadius: 2,
                      background: isDragging ? color : color + "77",
                      left: "50%", transform: "translateX(-50%)",
                    }} />
                  )}
                </div>
              );
            })}

            {/* Playhead */}
            {playPct !== null && (
              <div style={{
                position: "absolute", left: `${playPct}%`, top: 0, bottom: 0,
                width: 2, background: "#30D158", opacity: 0.9, borderRadius: 1,
                pointerEvents: "none", boxShadow: "0 0 4px #30D158",
              }} />
            )}
          </div>
        );
      })()}

      {/* Controls */}
      <div style={{
        display: "flex", gap: 5, flexWrap: "wrap",
        flexDirection: isPortrait ? "column" : "row",
      }}>
        {/* PLAY / STOP */}
        {loopPlaying ? (
          <button onClick={onTogglePlay} style={pill(true, "#FF9500")}>■ STOP</button>
        ) : (loopDisp && loopDisp.length > 0) ? (
          <button onClick={onTogglePlay} style={pill(false, "#30D158")}>▶ PLAY</button>
        ) : null}
        {/* REC / OVERDUB / STOP REC */}
        {(() => {
          const hasEvents = loopDisp && loopDisp.length > 0;
          if (loopRec) return (
            <button onClick={onToggleRec} style={{ ...pill(true, "#FF2D55"), animation: "rb 0.8s infinite" }}>■ STOP REC</button>
          );
          if (loopPlaying && hasEvents) return (
            <button onClick={onToggleRec} style={{ ...pill(false, "#5E5CE6"), border: "1px solid #5E5CE655", background: "rgba(94,92,230,0.15)", color: "#5E5CE6" }}>⊕ OVERDUB</button>
          );
          return <button onClick={onToggleRec} style={pill(false, "#FF2D55")}>⏺ REC</button>;
        })()}
        {/* COUNT DOWN */}
        {!loopPlaying && !loopRec && setLoopMetro && (
          <button onClick={() => setLoopMetro(p => !p)}
            style={{ ...pill(loopMetro, "#FF9500"), padding: "5px 9px" }}>
            {loopMetro ? "COUNT DOWN ON" : "COUNT DOWN"}
          </button>
        )}
        {/* UNDO REDO CLEAR */}
        <button onClick={onUndo} disabled={!loopCanUndo} style={{ ...pill(false, "#5E5CE6"), opacity: loopCanUndo ? 1 : 0.35 }}>↺ UNDO</button>
        <button onClick={onRedo} disabled={!loopCanRedo} style={{ ...pill(false, "#5E5CE6"), opacity: loopCanRedo ? 1 : 0.35 }}>↻ REDO</button>
        <button onClick={onClear} style={pill(false, "#636366")}>✕ CLEAR</button>
        {/* WAV Export */}
        {onExportLoop && loopDisp && loopDisp.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: "auto" }}>
            {[1, 2, 4].map(n => (
              <button key={n} onClick={() => setLoopExportReps(n)}
                disabled={loopExportState === "rendering"}
                style={{ ...pill(loopExportReps === n, "#64D2FF"), padding: "4px 7px", minHeight: "auto", minWidth: 0 }}
              >{n}×</button>
            ))}
            <button onClick={onExportLoop} disabled={loopExportState === "rendering"}
              style={{ ...pill(false, "#64D2FF"), color: "#64D2FF", border: "1px solid #64D2FF55", minHeight: "auto", opacity: loopExportState === "rendering" ? 0.45 : 1 }}
              title="Export looper as WAV"
            >{loopExportState === "rendering" ? "⏳" : "⬇ WAV"}</button>
          </div>
        )}
      </div>

      {/* Hint bar */}
      {!loopRec && (
        <div style={{ marginTop: 6, fontSize: 6.5, color: th.faint, letterSpacing: "0.04em", textAlign: "center" }}>
          {canEdit
            ? "Clic = ajouter · Drag = déplacer · Scroll↕ = vélocité · Double-clic = supprimer"
            : loopDisp && loopDisp.length > 0
              ? "Drag = repositionner · Scroll↕ sur une note = vélocité · APPLY pour snapper"
              : null}
        </div>
      )}
    </div>
  );
}

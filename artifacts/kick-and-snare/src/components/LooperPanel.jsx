import { useState } from "react";
import { THEMES } from "../theme.js";

export default function LooperPanel({
  loopBars, setLoopBars,
  loopRec, loopPlaying, loopPlayhead,
  loopDisp,
  loopMetro, setLoopMetro,
  onToggleRec, onFreshRec, onTogglePlay, onUndo, onClear,
  themeName, isPortrait,
  bpm, tracks,
  onMoveHit,
  onAddHit,
  onRemoveHit,
  onQuantize,
  autoQ, setAutoQ,
  onExportLoop, loopExportState, loopExportReps, setLoopExportReps,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const [quantDiv, setQuantDiv] = useState(16);
  const [dragIdx, setDragIdx] = useState(null);
  const [addTid, setAddTid] = useState(() => (tracks && tracks[0]?.id) || null);

  // keep addTid valid if tracks change
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
  });

  const barCount = loopDisp ? new Set(loopDisp.map(e => e.tid)).size : 0;
  const BARS_OPTS = [1, 2, 4];
  const QUANT_OPTS = [4, 8, 12, 16, 24, 32];
  const QUANT_LABELS = { 4: "1/4", 8: "1/8", 12: "1/8T", 16: "1/16", 24: "1/16T", 32: "1/32" };
  const QUANT_TRIPLET = new Set([12, 24]);

  const recLabel = loopRec ? "■ STOP REC" : "⏺ REC";

  const loopDurMs = loopBars * 4 * (60000 / Math.max(30, bpm || 120));
  const totalSteps = loopBars * 16;

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

      {/* ── QUANTIZE toolbar (shown when there are events or always) ── */}
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
        {/* Apply quantize button */}
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
        {/* AUTO-Q toggle */}
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

      {/* ── Track selector (outside IIFE to avoid Fragment issues) ── */}
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
            style={{ position: "relative", height: 44, marginBottom: 10, background: "rgba(255,255,255,0.03)", borderRadius: 6, overflow: "hidden", border: `1px solid ${canEdit ? "rgba(191,90,242,0.18)" : "rgba(255,255,255,0.07)"}`, cursor: canEdit ? "crosshair" : "default" }}
            onClick={handleTimelineClick}
          >
            {/* Step grid lines */}
            {Array.from({ length: totalSteps + 1 }, (_, i) => {
              const pct = (i / totalSteps) * 100;
              const isBeat = i % 4 === 0;
              const isBar = i % 16 === 0;
              return (
                <div key={`g${i}`} style={{
                  position: "absolute", left: `${pct}%`, top: 0, bottom: 0,
                  width: 1,
                  background: isBar ? "rgba(255,255,255,0.22)" : isBeat ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
                  pointerEvents: "none",
                }} />
              );
            })}

            {/* Quantize snap lines (show when quantDiv ≠ 16) */}
            {quantDiv !== 16 && Array.from({ length: loopBars * quantDiv + 1 }, (_, i) => {
              const pct = (i / (loopBars * quantDiv)) * 100;
              return (
                <div key={`q${i}`} style={{
                  position: "absolute", left: `${pct}%`, top: 0, bottom: 16,
                  width: 1, background: "rgba(255,214,10,0.15)", pointerEvents: "none",
                }} />
              );
            })}

            {/* Beat labels */}
            {Array.from({ length: loopBars * 4 }, (_, i) => (
              <div key={`b${i}`} style={{
                position: "absolute",
                left: `${(i / (loopBars * 4)) * 100 + 0.4}%`,
                bottom: 2, fontSize: 5, lineHeight: 1,
                color: i % 4 === 0 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)",
                fontFamily: "monospace", pointerEvents: "none", userSelect: "none",
              }}>
                {i % 4 === 0 ? `${Math.floor(i / 4) + 1}` : "·"}
              </div>
            ))}

            {/* Recorded hits — draggable + removable on dbl-click */}
            {hasEvents && loopDisp.map((ev, i) => {
              const pct = Math.min(99.5, (ev.tOff / loopDurMs) * 100);
              const color = trackColorMap[ev.tid] || "#BF5AF2";
              const canDrag = !!onMoveHit && !loopRec;
              const canRemove = canEdit && !!onRemoveHit;
              const isDragging = dragIdx === i;
              const label = (tracks||[]).find(t=>t.id===ev.tid)?.label || ev.tid;

              return (
                <div
                  key={`h${i}`}
                  title={canRemove ? `${label} — drag to move · double-click to delete` : canDrag ? `${label} — drag to move` : undefined}
                  style={{
                    position: "absolute",
                    left: `${pct}%`,
                    top: 0,
                    bottom: 0,
                    width: (canDrag || canRemove) ? 16 : 3,
                    transform: (canDrag || canRemove) ? "translateX(-8px)" : "none",
                    display: "flex",
                    alignItems: "stretch",
                    justifyContent: "center",
                    cursor: canDrag ? "ew-resize" : canRemove ? "pointer" : "default",
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
                  onPointerDown={canDrag ? e => {
                    e.preventDefault(); e.stopPropagation();
                    setDragIdx(i);
                    const gridEl = e.currentTarget.parentElement;
                    const rect = gridEl.getBoundingClientRect();
                    const startX = e.clientX;
                    const startTOff = ev.tOff;
                    const snapMs = loopDurMs / (loopBars * 32);
                    let moved = false;
                    const mv = me => {
                      if (Math.abs(me.clientX - startX) > 3) moved = true;
                      const dx = me.clientX - startX;
                      const dMs = (dx / rect.width) * loopDurMs;
                      const raw = startTOff + dMs;
                      const snapped = Math.max(0, Math.min(loopDurMs - snapMs, Math.round(raw / snapMs) * snapMs));
                      onMoveHit && onMoveHit(i, snapped);
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
                  {/* Hit bar */}
                  <div style={{
                    width: 2, height: "100%",
                    background: color,
                    opacity: isDragging ? 1 : (0.5 + (ev.vel || 0.8) * 0.5),
                    borderRadius: 1,
                    flexShrink: 0,
                    boxShadow: isDragging ? `0 0 6px ${color}` : `0 0 2px ${color}44`,
                  }} />
                  {/* Handle indicator */}
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
        {!loopRec && (
          <button onClick={loopPlaying ? onFreshRec : onToggleRec} style={pill(false, "#FF2D55")}>
            {recLabel}
          </button>
        )}
        {!loopPlaying && !loopRec && setLoopMetro && (
          <button
            onClick={() => setLoopMetro(p => !p)}
            title={loopMetro ? "Désactiver le countdown" : "Activer le countdown avant l'enregistrement"}
            style={{
              ...pill(loopMetro, "#FF9500"),
              padding: "3px 9px", minHeight: "auto",
            }}
          >
            {loopMetro ? "COUNTDOWN ON" : "COUNTDOWN"}
          </button>
        )}
        {loopRec && (
          <button onClick={onToggleRec} style={pill(true, "#FF2D55")}>■ STOP REC</button>
        )}
        {loopPlaying && !loopRec && (
          <button onClick={onToggleRec} style={pill(false, "#BF5AF2")}>⊕ OVERDUB</button>
        )}
        {loopPlaying && (
          <button onClick={onTogglePlay} style={pill(false, "#FF9500")}>■ STOP</button>
        )}
        {!loopPlaying && loopDisp && loopDisp.length > 0 && (
          <button onClick={onTogglePlay} style={pill(false, "#30D158")}>▶ PLAY</button>
        )}
        {loopDisp && loopDisp.length > 0 && (
          <button onClick={onUndo} style={pill(false, "#5E5CE6")}>↺ UNDO</button>
        )}
        {(loopPlaying || (loopDisp && loopDisp.length > 0)) && (
          <button onClick={onClear} style={pill(false, "#636366")}>✕ CLEAR</button>
        )}
        {/* WAV Export — hidden by default; restored by passing onExportLoop */}
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
            ? "Clic = ajouter · Drag = déplacer · Double-clic = supprimer · APPLY pour snapper"
            : loopDisp && loopDisp.length > 0
              ? "Drag les barres pour repositionner · APPLY pour snapper tout"
              : null}
        </div>
      )}
    </div>
  );
}

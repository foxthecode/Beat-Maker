import { useRef, useState, useCallback } from "react";
import { THEMES } from "../theme.js";
import { SEQUENCER_TEMPLATES } from "../sequencerTemplates.ts";
import { EUCLID_TEMPLATES } from "../euclidTemplates.ts";

/* ─────────────────────────────────────────────
   Sub-components (unchanged from previous)
───────────────────────────────────────────── */
function MiniGrid({ steps = [], color, n = 16 }) {
  const sz = n > 16 ? 2.5 : 3.5;
  return (
    <div style={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "nowrap" }}>
      {Array(n).fill(0).map((_, i) => (
        <div key={i} style={{
          width: sz, height: 5, borderRadius: 0.8, flexShrink: 0,
          background: steps?.[i] ? color : "rgba(255,255,255,0.07)",
        }} />
      ))}
    </div>
  );
}

function EuclidDots({ hits, N, rot = 0, color }) {
  const r = 10;
  const dots = Array.from({ length: N }, (_, i) => {
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    const x = 12 + r * Math.cos(angle);
    const y = 12 + r * Math.sin(angle);
    const idx = (i - rot + N) % N;
    const isHit = Math.floor((idx + 1) * hits / N) > Math.floor(idx * hits / N);
    return { x, y, isHit };
  });
  return (
    <svg width={24} height={24} style={{ flexShrink: 0 }}>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.isHit ? 2.5 : 1.5}
          fill={d.isHit ? color : "rgba(255,255,255,0.12)"} />
      ))}
    </svg>
  );
}

function EuclidConcentric({ tracks }) {
  const size = 38;
  const cx = size / 2, cy = size / 2;
  const outerR = size / 2 - 2;
  const gap = tracks.length > 1 ? (outerR - 5) / (tracks.length - 1) : 0;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {tracks.map((t, ti) => {
        const r = outerR - ti * gap;
        const dots = Array.from({ length: t.N }, (_, i) => {
          const angle = (i / t.N) * 2 * Math.PI - Math.PI / 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          const isHit = Math.floor((i + 1) * t.hits / t.N) > Math.floor(i * t.hits / t.N);
          return { x, y, isHit };
        });
        return (
          <g key={ti}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={t.color} strokeWidth={0.6} strokeOpacity={0.18} />
            {dots.map((d, di) => (
              <circle key={di} cx={d.x} cy={d.y} r={d.isHit ? 2 : 1}
                fill={d.isHit ? t.color : "rgba(255,255,255,0.07)"} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function TemplateDropdown({ onLoad, onLoadEuclid, th, view, variant, setVariant }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isEuclid = view === "euclid";
  const templates = isEuclid ? EUCLID_TEMPLATES : SEQUENCER_TEMPLATES;
  const n = variant === "32" ? 32 : 16;
  const accentColor = isEuclid ? "#FFD60A" : "#5E5CE6";
  const toggle = () => setOpen(o => !o);
  const load = (tpl) => { if (isEuclid) { onLoadEuclid && onLoadEuclid(tpl); } else { onLoad && onLoad(tpl, variant); } setOpen(false); };
  const handleBlur = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); };

  return (
    <div ref={ref} style={{ position: "relative" }} onBlur={handleBlur} tabIndex={-1}>
      <button
        data-hint={isEuclid
          ? `EUCLID PRESETS · ${EUCLID_TEMPLATES.length} polyrhythms ready to use · Click to open`
          : `TEMPLATES · ${SEQUENCER_TEMPLATES.length} TR-808 patterns available · Variant ${variant} steps`}
        onClick={toggle}
        style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 5, cursor: "pointer", border: `1px solid ${open ? accentColor + "99" : th.sBorder}`, background: open ? accentColor + "18" : "transparent", color: open ? accentColor : th.dim, fontSize: 8, fontWeight: open ? 800 : 500, letterSpacing: "0.06em", fontFamily: "inherit" }}
      >
        <span>{isEuclid ? "⬡ PRESETS" : "PRESETS"}</span>
        <span style={{ fontSize: 7 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 300, width: isEuclid ? 300 : 320, background: "#1a1a1e", border: `1px solid ${accentColor}44`, borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.7)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px 6px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
            <span style={{ fontSize: 8, color: accentColor, fontWeight: 800, letterSpacing: "0.08em", flex: 1 }}>{isEuclid ? "⬡ EUCLIDIAN PRESETS" : "■ STEP TEMPLATES"}</span>
            {!isEuclid && <span style={{ fontSize: 7, color: th.faint }}>{variant} steps</span>}
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {templates.map(tpl => {
              const stepsK = !isEuclid && (variant === "32" && tpl.steps32 ? tpl.steps32.kick : tpl.steps.kick);
              const stepsS = !isEuclid && (variant === "32" && tpl.steps32 ? (tpl.steps32.snare || tpl.steps32.clap || Object.values(tpl.steps32)[1]) : (tpl.steps.snare || tpl.steps.clap || Object.values(tpl.steps)[1]));
              const stepsH = !isEuclid && (variant === "32" && tpl.steps32 ? (tpl.steps32.hihat || Object.values(tpl.steps32)[2]) : (tpl.steps.hihat || Object.values(tpl.steps)[2]));
              const disabled = !isEuclid && variant === "32" && !tpl.steps32;
              return (
                <div key={tpl.id}
                  data-hint={disabled ? `${tpl.name} · No 32-step variant available` : `${tpl.name} · ${tpl.genre}${tpl.bpm ? ` · ${tpl.bpm} BPM` : ""} · Click to load into the current slot`}
                  onClick={() => !disabled && load(tpl)}
                  style={{ display: "flex", flexDirection: "column", gap: isEuclid ? 4 : 3, padding: "7px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.38 : 1, transition: "background 0.08s" }}
                  onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = `${tpl.color}10`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: isEuclid ? 11 : 13, lineHeight: 1, opacity: 0.85 }}>{tpl.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: tpl.color, flex: 1 }}>{tpl.name}</span>
                    <span style={{ fontSize: 7, color: tpl.color + "99", letterSpacing: "0.1em", fontWeight: 700 }}>{tpl.genre}</span>
                    {tpl.bpm && <span style={{ fontSize: 7, color: th.faint }}>{tpl.bpm}</span>}
                    {!isEuclid && <span style={{ fontSize: 7, color: "#30D15899" }}>{Object.keys(variant === "32" && tpl.steps32 ? tpl.steps32 : tpl.steps).length}trk</span>}
                  </div>
                  {isEuclid ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {Object.entries(tpl.params).map(([tid, p]) => (
                        <div key={tid} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                          <EuclidDots hits={p.hits} N={p.N} rot={p.rot || 0} color={tpl.color} />
                          <span style={{ fontSize: 5.5, color: tpl.color + "99", fontFamily: "monospace" }}>E({p.hits},{p.N})</span>
                        </div>
                      ))}
                      {tpl.description && <span style={{ fontSize: 6, color: th.faint, flex: 1, lineHeight: 1.3, minWidth: 80 }}>{tpl.description.split('—')[1]?.trim() || ""}</span>}
                    </div>
                  ) : (
                    <>
                      <MiniGrid steps={stepsK} color={tpl.color} n={n} />
                      {stepsS && <MiniGrid steps={stepsS} color={tpl.color + "77"} n={n} />}
                      {stepsH && <MiniGrid steps={stepsH} color={tpl.color + "44"} n={n} />}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ padding: "5px 10px", fontSize: 7, color: th.faint, textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {isEuclid ? "Euclidean polyrhythms · Source: Toussaint 2005" : "Humanized velocities · All tracks auto-enabled"}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Pattern Picker — small popover shown on slot click
   patIdx = current value (null = empty), onPick(pi|null), onClose
───────────────────────────────────────────── */
function SlotPicker({ patIdx, pBank, SEC_COL, th, onPick, onClose, anchorRef }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        display: "flex", alignItems: "flex-start", justifyContent: "flex-start",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          position: "absolute",
          left: anchorRef.current
            ? Math.min(anchorRef.current.getBoundingClientRect().left, window.innerWidth - 200)
            : 40,
          top: anchorRef.current
            ? anchorRef.current.getBoundingClientRect().bottom + 6
            : 80,
          background: "#1c1c20",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.75)",
          padding: "8px 10px",
          minWidth: 180,
          zIndex: 401,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 7, color: th.faint, letterSpacing: "0.08em", marginBottom: 7, fontWeight: 700 }}>
          {patIdx !== null ? `SLOT : P${patIdx + 1} — CHOISIR OU VIDER` : "CHOISIR UN PATTERN"}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: patIdx !== null ? 8 : 0 }}>
          {pBank.map((pat, pi) => {
            const col = SEC_COL[pi % SEC_COL.length];
            const isCur = pi === patIdx;
            return (
              <button key={pi}
                onClick={() => onPick(pi)}
                style={{
                  padding: "4px 9px", borderRadius: 6,
                  border: `1.5px solid ${col + (isCur ? "cc" : "55")}`,
                  background: isCur ? col + "33" : col + "11",
                  color: col, fontSize: 9, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit",
                  boxShadow: isCur ? `0 0 8px ${col}44` : "none",
                }}>
                {pat._name || `P${pi + 1}`}
              </button>
            );
          })}
        </div>
        {patIdx !== null && (
          <button
            onClick={() => onPick(null)}
            style={{
              width: "100%", padding: "4px 0", borderRadius: 6,
              border: "1px solid rgba(255,45,85,0.3)",
              background: "rgba(255,45,85,0.08)",
              color: "#FF2D55", fontSize: 8, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>✕ Vider ce slot</button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main export
───────────────────────────────────────────── */
export default function PatternBank({
  themeName, pBank, setPBank, cPat, setCPat,
  songRows, setSongRows, songMode, setSongMode, showSong, setShowSong,
  playing, songPosRef, STEPS, MAX_PAT, SEC_COL, mkE, R, isPortrait = false,
  patNameEdit, setPatNameEdit,
  onLoadTemplate, onLoadEuclidTemplate,
  view, onClear, cPatLocked,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const longPressRef = useRef(null);
  const [variant, setVariant] = useState("16");
  const isEuclid = view === "euclid";

  // ── Slot picker state ──────────────────────────────────────────────────────
  // { rowIdx, slotIdx } | null
  const [picker, setPicker] = useState(null);
  const pickerAnchorRef = useRef(null);

  // Derived flat chain for scheduler-position tracking
  const songChain = (songRows || []).flat().filter(v => v !== null);

  // ── Row mutations ─────────────────────────────────────────────────────────
  const setSlot = useCallback((rowIdx, slotIdx, patIdx) => {
    setSongRows(prev => {
      const rows = prev.map(r => [...r]);
      rows[rowIdx][slotIdx] = patIdx; // null = clear
      return rows;
    });
  }, [setSongRows]);

  const addRow = useCallback(() => {
    setSongRows(prev => [...prev, [...Array(16).fill(null)]]);
  }, [setSongRows]);

  const duplicateRow = useCallback((rowIdx) => {
    setSongRows(prev => {
      const rows = [...prev];
      rows.splice(rowIdx + 1, 0, [...rows[rowIdx]]);
      return rows;
    });
  }, [setSongRows]);

  const deleteRow = useCallback((rowIdx) => {
    setSongRows(prev => {
      if (prev.length <= 1) return [[...Array(16).fill(null)]];
      return prev.filter((_, i) => i !== rowIdx);
    });
  }, [setSongRows]);

  const clearAllRows = useCallback(() => {
    setSongRows([[...Array(16).fill(null)]]);
    songPosRef.current = 0;
  }, [setSongRows, songPosRef]);

  // ── Pattern rename long-press ────────────────────────────────────────────
  const startLongPress = (i) => { longPressRef.current = setTimeout(() => { setPatNameEdit && setPatNameEdit(i); }, 500); };
  const cancelLongPress = () => { if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; } };

  // ── Handle slot click ────────────────────────────────────────────────────
  const openPicker = (rowIdx, slotIdx, e) => {
    pickerAnchorRef.current = e.currentTarget;
    setPicker({ rowIdx, slotIdx });
  };

  const handlePick = (pi) => {
    if (!picker) return;
    setSlot(picker.rowIdx, picker.slotIdx, pi);
    setPicker(null);
  };

  // Which slot is currently playing? Find it in the 2D grid.
  const playingPos = (() => {
    if (!playing || !songMode || songChain.length === 0) return null;
    let flatIdx = songPosRef.current;
    let count = 0;
    for (let ri = 0; ri < (songRows || []).length; ri++) {
      for (let si = 0; si < 16; si++) {
        const v = (songRows || [])[ri]?.[si];
        if (v !== null && v !== undefined) {
          if (count === flatIdx) return { ri, si };
          count++;
        }
      }
    }
    return null;
  })();

  return (
    <>
      {/* ══════════════════════════════════════════════════════════
          PATTERN STRIP
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        marginBottom: 6, padding: "6px 10px 8px", borderRadius: 10,
        background: th.surface, border: `1px solid ${th.sBorder}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
          <span data-hint="PAT · Click a thumbnail to switch the active pattern · Long press to rename" style={{ fontSize: 8, color: th.dim }}>PAT</span>
          <div style={{ display: "flex", gap: 4, marginLeft: "auto", position: "relative", zIndex: 10 }}>
            <TemplateDropdown onLoad={onLoadTemplate} onLoadEuclid={onLoadEuclidTemplate} th={th} view={view} variant={variant} setVariant={setVariant} />
            {pBank.length < MAX_PAT && (
              <button data-hint={`DUP · Duplicate pattern ${cPat + 1} · Inserted right after the current pattern`}
                onClick={() => {
                  const dup = JSON.parse(JSON.stringify(pBank[cPat]));
                  setPBank(p => { const n = [...p]; n.splice(cPat + 1, 0, dup); return n; });
                  if (!(playing && songMode)) setCPat(cPat + 1);
                }}
                style={{ padding: "2px 6px", border: `1px solid ${th.sBorder}`, borderRadius: 5, background: "transparent", color: th.dim, fontSize: 8, cursor: "pointer", fontFamily: "inherit" }}>DUP</button>
            )}
            {onClear && (
              <button data-hint={`CLR · Clear all hits in the current pattern · Pattern slot is kept`}
                onClick={onClear}
                style={{ padding: "2px 6px", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 5, background: "transparent", color: "#FF2D55", fontSize: 8, cursor: "pointer", fontFamily: "inherit" }}>CLR</button>
            )}
            {pBank.length > 1 && (
              <button data-hint={`DEL · Delete pattern ${cPat + 1} · Other patterns are not affected`}
                onClick={() => { setPBank(p => p.filter((_, j) => j !== cPat)); if (cPat > 0) setCPat(cPat - 1); }}
                style={{ padding: "2px 6px", border: "1px solid rgba(255,55,95,0.2)", borderRadius: 5, background: "transparent", color: "#FF375F", fontSize: 8, cursor: "pointer", fontFamily: "inherit" }}>DEL</button>
            )}
          </div>
        </div>

        {/* Clip cards */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "4px 0 2px", WebkitOverflowScrolling: "touch" }}>
          {pBank.map((pat, i) => {
            const isActive = cPat === i;
            const isPlaying = playing && songMode && playingPos !== null && (songRows || [])[playingPos.ri]?.[playingPos.si] === i;
            const col = SEC_COL[i % SEC_COL.length];
            const isEditing = patNameEdit === i;
            const ks = pat.kick || []; const ss = pat.snare || pat.clap || []; const hs = pat.hihat || [];
            const n = variant === "32" ? 32 : Math.max(ks.length, ss.length, hs.length, 16);

            return (
              <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                {isEditing ? (
                  <input autoFocus defaultValue={pat._name || ""} maxLength={12}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      setPBank(p => { const n2 = [...p]; n2[i] = { ...n2[i], _name: v || undefined }; return n2; });
                      setPatNameEdit && setPatNameEdit(null);
                    }}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") e.target.blur(); }}
                    style={{ width: 64, height: 54, borderRadius: 10, border: `2px solid ${col}88`, background: "rgba(0,0,0,0.7)", color: col, fontSize: 9, fontWeight: 800, textAlign: "center", fontFamily: "inherit", outline: "none", padding: "0 4px" }}
                  />
                ) : (
                  <div
                    data-hint={isActive
                      ? `P${i + 1}${pat._name ? ` "${pat._name}"` : ""} · Pattern actif · Appui long pour renommer`
                      : `P${i + 1}${pat._name ? ` "${pat._name}"` : ""} · Cliquer pour basculer · Appui long pour renommer`}
                    onClick={() => {
                      setCPat(i);
                      if (playing && songMode) {
                        const playingPat = playingPos !== null ? (songRows || [])[playingPos.ri]?.[playingPos.si] : null;
                        if (cPatLocked) cPatLocked.current = (i !== playingPat);
                      } else {
                        R.pat = pBank[i];
                      }
                    }}
                    onMouseDown={() => startLongPress(i)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={() => startLongPress(i)}
                    onTouchEnd={cancelLongPress}
                    onTouchCancel={cancelLongPress}
                    style={{
                      minWidth: 60, padding: "5px 7px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                      border: `2px solid ${isActive ? col : "transparent"}`,
                      background: isActive ? col + "18" : th.surface,
                      transition: "all 0.18s cubic-bezier(0.32,0.72,0,1)",
                      boxShadow: isPlaying ? `0 0 16px ${col}44` : "none",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 900, color: col, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 54 }}>
                      {pat._name || `P${i + 1}`}
                    </div>
                    {isEuclid ? (
                      (() => {
                        const kHits = ks.filter(v => v > 0).length;
                        const sHits = ss.filter(v => v > 0).length;
                        const hHits = hs.filter(v => v > 0).length;
                        const N2 = Math.max(ks.length, ss.length, 16);
                        const eucTracks = [
                          kHits > 0 && { hits: kHits, N: N2, color: col },
                          sHits > 0 && { hits: sHits, N: N2, color: col + "99" },
                          hHits > 0 && { hits: hHits, N: N2, color: col + "55" },
                        ].filter(Boolean);
                        return eucTracks.length
                          ? <div style={{ display: "flex", justifyContent: "center" }}><EuclidConcentric tracks={eucTracks} /></div>
                          : <div style={{ height: 24 }} />;
                      })()
                    ) : (
                      <MiniGrid steps={ks} color={col} n={Math.min(n, 16)} />
                    )}
                    {isPlaying && <div style={{ height: 2, background: col, borderRadius: 1, marginTop: 3, animation: "rb 0.8s infinite" }} />}
                  </div>
                )}
              </div>
            );
          })}
          {pBank.length < MAX_PAT && (
            <button data-hint={`+ Add empty pattern`}
              onClick={() => { setPBank(p => [...p, mkE(STEPS)]); if (!(playing && songMode)) setCPat(pBank.length); }}
              style={{ minWidth: 40, height: 54, borderRadius: 10, border: `1px dashed ${th.sBorder}`, background: "transparent", color: th.dim, fontSize: 18, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>+</button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SONG ARRANGER — 16-slot grid
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        marginBottom: 8, padding: "7px 10px 8px", borderRadius: 10,
        background: th.surface,
        border: `1px solid ${songMode ? "rgba(191,90,242,0.35)" : th.sBorder}`,
        transition: "border-color 0.2s",
      }}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#BF5AF2", letterSpacing: "0.1em" }}>SONG</span>

          {/* Edit-lock indicator */}
          {playing && songMode && cPat !== ((songRows || [])[playingPos?.ri ?? 0]?.[playingPos?.si ?? 0] ?? cPat) && playingPos !== null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 8, color: "#FFD60A", fontWeight: 800, whiteSpace: "nowrap" }}>✏ P{cPat + 1}</span>
              <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)" }}>·</span>
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", animation: "rb 1s infinite", whiteSpace: "nowrap" }}>
                ▶ P{((songRows || [])[playingPos.ri]?.[playingPos.si] ?? 0) + 1}
              </span>
              <span style={{ fontSize: 6, color: "rgba(255,255,255,0.2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                changes next loop
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 7, color: th.faint, flex: 1 }}>
              {songMode ? "▶ plays filled slots · click a slot to pick a pattern" : "enable SONG to chain patterns"}
            </span>
          )}

          {/* SONG ON/OFF */}
          <button
            data-hint={songMode ? "SONG ON · Song mode active · Chains patterns in row order · Click to disable" : "SONG OFF · Enable song mode · Arrange patterns in a 16-slot per row timeline"}
            onClick={() => setSongMode(p => !p)}
            style={{
              padding: "2px 8px", borderRadius: 6, flexShrink: 0,
              border: `1px solid ${songMode ? "#BF5AF255" : "rgba(255,255,255,0.12)"}`,
              background: songMode ? "#BF5AF218" : "transparent",
              color: songMode ? "#BF5AF2" : th.dim,
              fontSize: 8, fontWeight: 700, cursor: "pointer",
              letterSpacing: "0.07em", textTransform: "uppercase",
              fontFamily: "inherit",
              animation: songMode && playing ? "rb 1s infinite" : "none",
            }}
          >{songMode ? (playing ? "▶ ON" : "ON") : "OFF"}</button>
        </div>

        {/* ── Grid rows ──────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(songRows || []).map((row, ri) => {
            const hasAny = row.some(v => v !== null);
            return (
              <div key={ri} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                {/* Row number */}
                <span style={{
                  fontSize: 7, color: th.faint, width: 12, textAlign: "right",
                  flexShrink: 0, userSelect: "none",
                }}>{ri + 1}</span>

                {/* 16 slots — horizontally scrollable */}
                <div style={{
                  display: "flex", gap: 2, overflowX: "auto",
                  WebkitOverflowScrolling: "touch", flex: 1,
                  padding: "1px 0",
                }}>
                  {row.map((patIdx, si) => {
                    const isEmpty = patIdx === null || patIdx === undefined;
                    const col = isEmpty ? null : SEC_COL[patIdx % SEC_COL.length];
                    const isCurrent = playingPos !== null && playingPos.ri === ri && playingPos.si === si;
                    const isGroupSep = si > 0 && si % 4 === 0;

                    return (
                      <div key={si} style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                        {/* Thin separator every 4 slots */}
                        {isGroupSep && (
                          <div style={{ width: 1, height: 26, background: "rgba(255,255,255,0.08)", borderRadius: 1, flexShrink: 0, marginRight: 2 }} />
                        )}
                        {/* Slot cell */}
                        <div
                          data-hint={isEmpty
                            ? `Slot ${si + 1} empty · click to assign a pattern`
                            : `Slot ${si + 1}: P${patIdx + 1}${pBank[patIdx]?._name ? ` "${pBank[patIdx]._name}"` : ""} · click to change or clear`}
                          onClick={(e) => openPicker(ri, si, e)}
                          style={{
                            width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                            border: isEmpty
                              ? `1px dashed ${isCurrent ? "#BF5AF2" : "rgba(255,255,255,0.1)"}`
                              : `1.5px solid ${col + (isCurrent ? "cc" : "55")}`,
                            background: isEmpty
                              ? isCurrent ? "rgba(191,90,242,0.08)" : "transparent"
                              : col + (isCurrent ? "44" : "18"),
                            display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                            transition: "all 0.12s",
                            boxShadow: isCurrent && !isEmpty ? `0 0 8px ${col}55` : "none",
                            position: "relative",
                          }}
                          onMouseEnter={e => {
                            if (isEmpty) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                          }}
                          onMouseLeave={e => {
                            if (isEmpty) e.currentTarget.style.background = isCurrent ? "rgba(191,90,242,0.08)" : "transparent";
                          }}
                        >
                          {!isEmpty ? (
                            <>
                              <span style={{ fontSize: 10, fontWeight: 900, color: col, lineHeight: 1 }}>
                                {patIdx + 1}
                              </span>
                              {pBank[patIdx]?._name && (
                                <span style={{ fontSize: 4.5, color: col + "aa", lineHeight: 1, maxWidth: 28, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {pBank[patIdx]._name}
                                </span>
                              )}
                              {isCurrent && (
                                <div style={{ position: "absolute", bottom: 0, left: 2, right: 2, height: 2, background: col, borderRadius: 1, animation: "rb 0.8s infinite" }} />
                              )}
                            </>
                          ) : (
                            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.1)", lineHeight: 1 }}>+</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Row actions: ↺ duplicate + ✕ delete */}
                <div style={{ display: "flex", gap: 3, flexShrink: 0, marginLeft: 2 }}>
                  <button
                    data-hint={`↺ Duplicate · Copy row ${ri + 1} right below · Slots are copied as-is`}
                    onClick={() => duplicateRow(ri)}
                    style={{
                      width: 22, height: 30, borderRadius: 5,
                      border: `1px solid rgba(255,255,255,0.1)`,
                      background: "transparent", color: th.dim,
                      fontSize: 11, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "inherit", padding: 0,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >↺</button>
                  {(songRows || []).length > 1 && (
                    <button
                      data-hint={`✕ Delete · Remove row ${ri + 1} · Patterns are not deleted`}
                      onClick={() => deleteRow(ri)}
                      style={{
                        width: 22, height: 30, borderRadius: 5,
                        border: "1px solid rgba(255,45,85,0.2)",
                        background: "transparent", color: "#FF375F99",
                        fontSize: 10, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "inherit", padding: 0,
                        transition: "all 0.1s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,45,85,0.1)"; e.currentTarget.style.color = "#FF375F"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#FF375F99"; }}
                    >✕</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer: Add row + Clear ──────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <button
            data-hint="+ New row · Add a row of 16 empty slots at the bottom of the song timeline"
            onClick={addRow}
            style={{
              padding: "3px 10px", borderRadius: 6,
              border: "1px solid rgba(191,90,242,0.3)",
              background: "rgba(191,90,242,0.07)",
              color: "#BF5AF2", fontSize: 8, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              letterSpacing: "0.05em",
            }}>+ Add row</button>
          <div style={{ flex: 1 }} />
          <button
            data-hint="Clear all · Empty all slots in all rows · Patterns are not deleted"
            onClick={clearAllRows}
            style={{
              padding: "3px 9px", borderRadius: 5,
              border: "1px solid rgba(255,45,85,0.25)",
              background: "rgba(255,45,85,0.06)",
              color: "#FF2D55", fontSize: 7, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>✕ Clear all</button>
        </div>
      </div>

      {/* ── Pattern Picker overlay ─────────────────────────────── */}
      {picker !== null && (
        <SlotPicker
          patIdx={(songRows || [])[picker.rowIdx]?.[picker.slotIdx] ?? null}
          pBank={pBank}
          SEC_COL={SEC_COL}
          th={th}
          onPick={handlePick}
          onClose={() => setPicker(null)}
          anchorRef={pickerAnchorRef}
        />
      )}
    </>
  );
}

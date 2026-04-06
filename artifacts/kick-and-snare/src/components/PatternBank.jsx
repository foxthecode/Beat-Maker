import { useRef, useState } from "react";
import { THEMES } from "../theme.js";
import { SEQUENCER_TEMPLATES } from "../sequencerTemplates.ts";
import { EUCLID_TEMPLATES } from "../euclidTemplates.ts";

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
          ? `PRESETS Euclidian · ${EUCLID_TEMPLATES.length} ready-to-use polyrhythms · Click to browse and load a preset`
          : `TEMPLATES · ${SEQUENCER_TEMPLATES.length} TR-808 patterns (Hip-hop, Techno, Jazz…) · Click to browse · ${variant}-step variant`}
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
                <div key={tpl.id} data-hint={disabled ? `${tpl.name} · No 32-step variant available · Switch to 16 steps to load` : `${tpl.name} · ${tpl.genre}${tpl.bpm ? ` · ${tpl.bpm}` : ""} · ${tpl.description || ""} · Click to load into current pattern`}
                  onClick={() => !disabled && load(tpl)} title={disabled ? "No 32-step variant" : tpl.description || tpl.name}
                  style={{ display: "flex", flexDirection: "column", gap: isEuclid ? 4 : 3, padding: "7px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.38 : 1, transition: "background 0.08s" }}
                  onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = `${tpl.color}10`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: isEuclid ? 11 : 13, lineHeight: 1, opacity: 0.85 }}>{tpl.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: tpl.color, flex: 1, letterSpacing: "0.02em" }}>{tpl.name}</span>
                    <span style={{ fontSize: 7, color: tpl.color + "99", letterSpacing: "0.1em", fontWeight: 700 }}>{tpl.genre}</span>
                    {tpl.bpm && <span style={{ fontSize: 7, color: th.faint, letterSpacing: "0.06em" }}>{tpl.bpm}</span>}
                    {!isEuclid && <span style={{ fontSize: 7, color: "#30D15899", letterSpacing: "0.06em" }}>{Object.keys(variant === "32" && tpl.steps32 ? tpl.steps32 : tpl.steps).length}trk</span>}
                  </div>
                  {isEuclid ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {Object.entries(tpl.params).map(([tid, p]) => (
                        <div key={tid} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                          <EuclidDots hits={p.hits} N={p.N} rot={p.rot || 0} color={tpl.color} />
                          <span style={{ fontSize: 5.5, color: tpl.color + "99", letterSpacing: "0.05em", fontFamily: "monospace" }}>E({p.hits},{p.N})</span>
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
          <div style={{ padding: "5px 10px", fontSize: 7, color: th.faint, textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)", letterSpacing: "0.04em" }}>
            {isEuclid ? "Euclidean polyrhythms · Source: Toussaint 2005" : "Humanized velocities included · All tracks auto-enabled"}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Insert-zone "+" button shown between/after tape blocks ─── */
function InsertZone({ onClick, col }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 18, height: 36, flexShrink: 0, borderRadius: 5,
        border: `1.5px dashed ${col}88`,
        background: col + "0d",
        color: col, fontSize: 13, fontWeight: 900,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 0, fontFamily: "inherit",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = col + "22"; }}
      onMouseLeave={e => { e.currentTarget.style.background = col + "0d"; }}
    >+</button>
  );
}

export default function PatternBank({
  themeName, pBank, setPBank, cPat, setCPat,
  songChain, setSongChain, songMode, setSongMode, showSong, setShowSong,
  playing, songPosRef, STEPS, MAX_PAT, SEC_COL, mkE, R, isPortrait = false,
  patNameEdit, setPatNameEdit,
  onLoadTemplate, onLoadEuclidTemplate,
  view, onClear, cPatLocked,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const longPressRef = useRef(null);       // for pattern rename
  const blockLongRef = useRef(null);       // for tape block removal
  const tapeRef = useRef(null);
  const [variant, setVariant] = useState("16");
  const isEuclid = view === "euclid";

  // ── Pattern armed for tape placement (null = none) ──────────────────────────
  const [placingPat, setPlacingPat] = useState(null);
  const armedCol = placingPat !== null ? SEC_COL[placingPat % SEC_COL.length] : null;

  // ── Pattern card interaction ────────────────────────────────────────────────
  const handlePatClick = (i) => {
    // Edit / arm toggle
    setCPat(i);
    if (playing && songMode) {
      const isPlayingNow = songChain[songPosRef.current] === i;
      if (cPatLocked) cPatLocked.current = !isPlayingNow;
    } else {
      R.pat = pBank[i];
    }
    // Toggle placement arm
    setPlacingPat(prev => (prev === i ? null : i));
  };

  // ── Tape actions ────────────────────────────────────────────────────────────
  const replaceSlot = (si) => {
    if (placingPat === null) return;
    setSongChain(p => { const n = [...p]; n[si] = placingPat; return n; });
  };

  const insertAt = (si) => {
    if (placingPat === null) return;
    setSongChain(p => { const n = [...p]; n.splice(si, 0, placingPat); return n; });
  };

  const appendToChain = () => {
    if (placingPat === null) return;
    setSongChain(p => [...p, placingPat]);
  };

  const removeSlot = (si) => {
    setSongChain(p => p.filter((_, j) => j !== si));
  };

  // long-press rename
  const startLongPress = (i) => { longPressRef.current = setTimeout(() => { setPatNameEdit && setPatNameEdit(i); }, 500); };
  const cancelLongPress = () => { if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; } };

  // long-press tape block → remove
  const startBlockLong = (si) => { blockLongRef.current = setTimeout(() => { removeSlot(si); blockLongRef.current = null; }, 450); };
  const cancelBlockLong = () => { if (blockLongRef.current) { clearTimeout(blockLongRef.current); blockLongRef.current = null; } };

  return (
    <>
      {/* ══════════════════════════════════════════════════════════
          PATTERN STRIP
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        marginBottom: 6, padding: "6px 10px 8px", borderRadius: 10,
        background: th.surface, border: `1px solid ${th.sBorder}`,
      }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
          <span
            data-hint={`PAT · ${pBank.length} pattern${pBank.length > 1 ? "s" : ""} available · Active: ${cPat + 1} · Click a clip to switch · Tap again to arm for Song placement`}
            style={{ fontSize: 8, color: th.dim }}
          >PAT</span>

          {/* Arm hint */}
          {placingPat !== null && (
            <span style={{
              fontSize: 7, color: armedCol, fontWeight: 800, letterSpacing: "0.05em",
              animation: "rb 0.9s infinite", marginLeft: 4,
            }}>
              ✚ P{placingPat + 1} — tap a tape slot to place
            </span>
          )}

          <div style={{ display: "flex", gap: 4, marginLeft: "auto", position: "relative", zIndex: 10 }}>
            <TemplateDropdown onLoad={onLoadTemplate} onLoadEuclid={onLoadEuclidTemplate} th={th} view={view} variant={variant} setVariant={setVariant} />
            {pBank.length < MAX_PAT && (
              <button data-hint={`DUP · Duplicate pattern ${cPat + 1} into slot ${cPat + 2}`}
                onClick={() => {
                  const dup = JSON.parse(JSON.stringify(pBank[cPat]));
                  setPBank(p => { const n = [...p]; n.splice(cPat + 1, 0, dup); return n; });
                  if (!(playing && songMode)) setCPat(cPat + 1);
                }}
                style={{ padding: "2px 6px", border: `1px solid ${th.sBorder}`, borderRadius: 5, background: "transparent", color: th.dim, fontSize: 8, cursor: "pointer", fontFamily: "inherit" }}>DUP</button>
            )}
            {onClear && (
              <button data-hint={`CLR · Efface tous les hits du pattern ${cPat + 1} · Utilise Undo pour annuler`}
                onClick={onClear}
                style={{ padding: "2px 6px", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 5, background: "transparent", color: "#FF2D55", fontSize: 8, cursor: "pointer", fontFamily: "inherit" }}>CLR</button>
            )}
            {pBank.length > 1 && (
              <button data-hint={`DEL · Delete pattern ${cPat + 1}`}
                onClick={() => { setPBank(p => p.filter((_, j) => j !== cPat)); if (cPat > 0) setCPat(cPat - 1); }}
                style={{ padding: "2px 6px", border: "1px solid rgba(255,55,95,0.2)", borderRadius: 5, background: "transparent", color: "#FF375F", fontSize: 8, cursor: "pointer", fontFamily: "inherit" }}>DEL</button>
            )}
          </div>
        </div>

        {/* Clip cards */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "4px 0 2px", WebkitOverflowScrolling: "touch" }}>
          {pBank.map((pat, i) => {
            const isActive = cPat === i;
            const isPlaying = playing && songMode && songPosRef.current != null && songChain[songPosRef.current] === i;
            const isArmed = placingPat === i;
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
                    data-hint={isArmed
                      ? `P${i + 1} armed · Tap a tape slot to place · Tap this card again to disarm`
                      : isActive
                        ? `Pattern ${i + 1}${pat._name ? ` "${pat._name}"` : ""} · Active · Tap to arm for Song placement · Long-press to rename`
                        : `Pattern ${i + 1}${pat._name ? ` "${pat._name}"` : ""} · Tap to switch + arm for placement · Long-press to rename`}
                    onClick={() => handlePatClick(i)}
                    onMouseDown={() => startLongPress(i)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={() => startLongPress(i)}
                    onTouchEnd={cancelLongPress}
                    onTouchCancel={cancelLongPress}
                    style={{
                      minWidth: 60, padding: "5px 7px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                      border: isArmed
                        ? `2px dashed ${col}`
                        : `2px solid ${isActive ? col : "transparent"}`,
                      background: isArmed ? col + "28" : isActive ? col + "18" : th.surface,
                      transition: "all 0.18s cubic-bezier(0.32,0.72,0,1)",
                      boxShadow: isArmed
                        ? `0 0 14px ${col}55, inset 0 0 8px ${col}18`
                        : isPlaying ? `0 0 16px ${col}44` : "none",
                      outline: isArmed ? `2px solid ${col}33` : "none",
                      outlineOffset: 2,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 900, color: col, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 54 }}>
                      {isArmed ? "✚" : ""}{pat._name || `P${i + 1}`}
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
                    {isArmed && !isPlaying && <div style={{ height: 2, background: col + "88", borderRadius: 1, marginTop: 3, animation: "rb 0.6s infinite" }} />}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add pattern button */}
          {pBank.length < MAX_PAT && (
            <button data-hint={`+ Add empty pattern · Slot ${pBank.length + 1}`}
              onClick={() => { setPBank(p => [...p, mkE(STEPS)]); if (!(playing && songMode)) setCPat(pBank.length); }}
              style={{ minWidth: 40, height: 54, borderRadius: 10, border: `1px dashed ${th.sBorder}`, background: "transparent", color: th.dim, fontSize: 18, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>+</button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SONG ARRANGER — always-visible tape
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        marginBottom: 8, padding: "7px 10px 8px", borderRadius: 10,
        background: th.surface,
        border: `1px solid ${songMode ? "rgba(191,90,242,0.35)" : th.sBorder}`,
        transition: "border-color 0.2s",
      }}>
        {/* ── Header row ─────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#BF5AF2", letterSpacing: "0.1em" }}>SONG</span>

          {/* Edit-lock indicator — visible when editing differs from playing */}
          {playing && songMode && cPat !== (songChain[songPosRef.current ?? 0] ?? cPat) ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 8, color: "#FFD60A", fontWeight: 800, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                ✏ P{cPat + 1}
              </span>
              <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)" }}>·</span>
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", animation: "rb 1s infinite", whiteSpace: "nowrap" }}>
                ▶ P{(songChain[songPosRef.current ?? 0] ?? 0) + 1}
              </span>
              <span style={{ fontSize: 6, color: "rgba(255,255,255,0.2)", marginLeft: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                changes audible next loop
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 7, color: th.faint, flex: 1 }}>
              {songMode
                ? placingPat !== null
                  ? `tap a slot to place P${placingPat + 1} · tap "+" to insert`
                  : "playing chain · tap a pattern to arm it for placement"
                : placingPat !== null
                  ? `P${placingPat + 1} armed · tap a slot · enable SONG to play chain`
                  : "tap a pattern card to arm it, then place it in the chain"}
            </span>
          )}

          {/* SONG ON/OFF toggle */}
          <button
            data-hint={songMode
              ? "SONG mode ON · Transport auto-advances the chain · Click to disable"
              : "SONG mode OFF · Enable to chain patterns in sequence"}
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

        {/* ── Tape ───────────────────────────────────────────────── */}
        <div
          ref={tapeRef}
          style={{
            display: "flex", alignItems: "center", gap: 0,
            overflowX: "auto", overflowY: "visible",
            WebkitOverflowScrolling: "touch",
            padding: "2px 0 4px",
            minHeight: 44,
          }}
        >
          {/* Empty-chain hint */}
          {songChain.length === 0 && placingPat === null && (
            <span style={{ fontSize: 8, color: th.faint, paddingLeft: 2, whiteSpace: "nowrap" }}>
              Arm a pattern above, then tap here to build the chain →
            </span>
          )}

          {/* Leading insert zone */}
          {placingPat !== null && (
            <InsertZone col={armedCol} onClick={() => insertAt(0)} />
          )}

          {songChain.map((patIdx, si) => {
            const col = SEC_COL[patIdx % SEC_COL.length];
            const isCurrent = songPosRef.current === si && playing && songMode;
            const isReplaceTarget = placingPat !== null && placingPat !== patIdx;

            return (
              <div key={`wrap-${si}`} style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
                {/* Tape block */}
                <div
                  data-hint={
                    placingPat !== null
                      ? `Tap to replace with P${placingPat + 1} · Long-press to remove`
                      : `Slot ${si + 1}: Pattern ${patIdx + 1}${pBank[patIdx]?._name ? ` "${pBank[patIdx]._name}"` : ""} · Long-press to remove`
                  }
                  onPointerDown={(e) => { e.preventDefault(); startBlockLong(si); }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    cancelBlockLong();
                    if (placingPat !== null) replaceSlot(si);
                  }}
                  onPointerLeave={cancelBlockLong}
                  onPointerCancel={cancelBlockLong}
                  style={{
                    width: 36, height: 36, borderRadius: 7, flexShrink: 0,
                    background: isReplaceTarget
                      ? armedCol + "33"
                      : col + (isCurrent ? "55" : "1a"),
                    border: isReplaceTarget
                      ? `1.5px dashed ${armedCol}99`
                      : `1.5px solid ${col + (isCurrent ? "cc" : "44")}`,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.12s",
                    boxShadow: isCurrent ? `0 0 10px ${col}55` : "none",
                    userSelect: "none", touchAction: "none",
                    position: "relative",
                  }}
                >
                  {/* Replace overlay indicator */}
                  {isReplaceTarget && (
                    <span style={{
                      position: "absolute", top: 1, right: 2,
                      fontSize: 7, color: armedCol, fontWeight: 900,
                    }}>↺</span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 900, color: isReplaceTarget ? armedCol : col, lineHeight: 1 }}>
                    {isReplaceTarget ? placingPat + 1 : patIdx + 1}
                  </span>
                  <span style={{ fontSize: 5, fontWeight: 700, color: (isReplaceTarget ? armedCol : col) + "99", lineHeight: 1, maxWidth: 32, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {isReplaceTarget
                      ? pBank[placingPat]?._name || `P${placingPat + 1}`
                      : pBank[patIdx]?._name || `P${patIdx + 1}`}
                  </span>
                  {isCurrent && (
                    <div style={{ position: "absolute", bottom: 0, left: 2, right: 2, height: 2, background: col, borderRadius: 1, animation: "rb 0.8s infinite" }} />
                  )}
                </div>

                {/* Post-block insert zone */}
                {placingPat !== null && (
                  <InsertZone col={armedCol} onClick={() => insertAt(si + 1)} />
                )}
              </div>
            );
          })}

          {/* Trailing append zone — always show when armed */}
          {placingPat !== null && (
            <div
              onClick={appendToChain}
              data-hint={`Append P${placingPat + 1} at end of chain`}
              style={{
                width: 36, height: 36, borderRadius: 7, flexShrink: 0,
                border: `1.5px dashed ${armedCol}55`,
                background: armedCol + "0a",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", marginLeft: songChain.length > 0 ? 0 : 4,
                fontSize: 14, color: armedCol + "88", fontWeight: 900,
                transition: "background 0.12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = armedCol + "1e"; }}
              onMouseLeave={e => { e.currentTarget.style.background = armedCol + "0a"; }}
            >+</div>
          )}
        </div>

        {/* ── Footer: clear + disarm ───────────────────────────── */}
        {(songChain.length > 0 || placingPat !== null) && (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, alignItems: "center" }}>
            {placingPat !== null && (
              <button
                onClick={() => setPlacingPat(null)}
                style={{
                  padding: "2px 9px", borderRadius: 5,
                  border: `1px solid ${armedCol}44`,
                  background: "transparent", color: armedCol + "bb",
                  fontSize: 7, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", letterSpacing: "0.06em",
                }}>✕ DISARM</button>
            )}
            {songChain.length > 0 && (
              <button
                onClick={() => { setSongChain([]); songPosRef.current = 0; }}
                style={{
                  padding: "2px 9px", borderRadius: 5,
                  border: "1px solid rgba(255,45,85,0.3)",
                  background: "rgba(255,45,85,0.08)",
                  color: "#FF2D55", fontSize: 7, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em",
                }}>✕ CLEAR CHAIN</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

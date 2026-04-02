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

function TemplateDropdown({ onLoad, onLoadEuclid, th, view, variant, setVariant }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isEuclid = view === "euclid";
  const templates = isEuclid ? EUCLID_TEMPLATES : SEQUENCER_TEMPLATES;
  const n = variant === "32" ? 32 : 16;

  const accentColor = isEuclid ? "#FFD60A" : "#5E5CE6";

  const toggle = () => setOpen(o => !o);

  const load = (tpl) => {
    if (isEuclid) {
      onLoadEuclid && onLoadEuclid(tpl);
    } else {
      onLoad && onLoad(tpl, variant);
    }
    setOpen(false);
  };

  const handleBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }} onBlur={handleBlur} tabIndex={-1}>
      <button
        data-hint={isEuclid
          ? `PRESETS Euclidian · ${EUCLID_TEMPLATES.length} ready-to-use polyrhythms · Click to browse and load a preset`
          : `TEMPLATES · ${SEQUENCER_TEMPLATES.length} TR-808 patterns (Hip-hop, Techno, Jazz…) · Click to browse · ${variant}-step variant`}
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "2px 8px", borderRadius: 5, cursor: "pointer",
          border: `1px solid ${open ? accentColor + "99" : th.sBorder}`,
          background: open ? accentColor + "18" : "transparent",
          color: open ? accentColor : th.dim,
          fontSize: 8, fontWeight: open ? 800 : 500,
          letterSpacing: "0.06em", fontFamily: "inherit",
        }}
      >
        <span>{isEuclid ? "⬡ PRESETS" : "TEMPLATES"}</span>
        <span style={{ fontSize: 7 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          zIndex: 300, width: isEuclid ? 300 : 320,
          background: "#1a1a1e", border: `1px solid ${accentColor}44`,
          borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 10px 6px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.02)",
          }}>
            <span style={{ fontSize: 8, color: accentColor, fontWeight: 800, letterSpacing: "0.08em", flex: 1 }}>
              {isEuclid ? "⬡ EUCLIDIAN PRESETS" : "■ STEP TEMPLATES"}
            </span>
            {!isEuclid && (
              <span style={{ fontSize: 7, color: th.faint }}>{variant} steps</span>
            )}
          </div>

          {/* Template list */}
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {templates.map(tpl => {
              const stepsK = !isEuclid && (variant === "32" && tpl.steps32
                ? tpl.steps32.kick : tpl.steps.kick);
              const stepsS = !isEuclid && (variant === "32" && tpl.steps32
                ? (tpl.steps32.snare || tpl.steps32.clap || Object.values(tpl.steps32)[1])
                : (tpl.steps.snare || tpl.steps.clap || Object.values(tpl.steps)[1]));
              const stepsH = !isEuclid && (variant === "32" && tpl.steps32
                ? (tpl.steps32.hihat || Object.values(tpl.steps32)[2])
                : (tpl.steps.hihat || Object.values(tpl.steps)[2]));
              const disabled = !isEuclid && variant === "32" && !tpl.steps32;

              return (
                <div
                  key={tpl.id}
                  data-hint={disabled
                    ? `${tpl.name} · No 32-step variant available · Switch to 16 steps to load`
                    : `${tpl.name} · ${tpl.genre}${tpl.bpm ? ` · ${tpl.bpm}` : ""} · ${tpl.description || ""} · Click to load into current pattern`}
                  onClick={() => !disabled && load(tpl)}
                  title={disabled ? "No 32-step variant" : tpl.description || tpl.name}
                  style={{
                    display: "flex", flexDirection: "column", gap: isEuclid ? 4 : 3,
                    padding: "7px 10px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.38 : 1,
                    transition: "background 0.08s",
                  }}
                  onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = `${tpl.color}10`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Row 1 — icon + name + metadata */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: isEuclid ? 11 : 13, lineHeight: 1, opacity: 0.85 }}>{tpl.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: tpl.color, flex: 1, letterSpacing: "0.02em" }}>
                      {tpl.name}
                    </span>
                    <span style={{ fontSize: 7, color: tpl.color + "99", letterSpacing: "0.1em", fontWeight: 700 }}>
                      {tpl.genre}
                    </span>
                    {tpl.bpm && (
                      <span style={{ fontSize: 7, color: th.faint, letterSpacing: "0.06em" }}>{tpl.bpm}</span>
                    )}
                    {!isEuclid && (
                      <span style={{ fontSize: 7, color: "#30D15899", letterSpacing: "0.06em" }}>
                        {Object.keys(variant === "32" && tpl.steps32 ? tpl.steps32 : tpl.steps).length}trk
                      </span>
                    )}
                  </div>

                  {/* Row 2 — Euclid: circle previews / Sequencer: mini grids */}
                  {isEuclid ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {Object.entries(tpl.params).map(([tid, p]) => (
                        <div key={tid} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                          <EuclidDots hits={p.hits} N={p.N} rot={p.rot || 0} color={tpl.color} />
                          <span style={{ fontSize: 5.5, color: tpl.color + "99", letterSpacing: "0.05em", fontFamily: "monospace" }}>
                            E({p.hits},{p.N})
                          </span>
                        </div>
                      ))}
                      {tpl.description && (
                        <span style={{ fontSize: 6, color: th.faint, flex: 1, lineHeight: 1.3, minWidth: 80 }}>
                          {tpl.description.split('—')[1]?.trim() || ""}
                        </span>
                      )}
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

          <div style={{
            padding: "5px 10px", fontSize: 7, color: th.faint, textAlign: "center",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            letterSpacing: "0.04em",
          }}>
            {isEuclid
              ? "Euclidean polyrhythms · Source: Toussaint 2005"
              : "Humanized velocities included · All tracks auto-enabled"}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PatternBank({
  themeName, pBank, setPBank, cPat, setCPat,
  songChain, setSongChain, songMode, setSongMode, showSong, setShowSong,
  playing, songPosRef, STEPS, MAX_PAT, SEC_COL, mkE, R, isPortrait=false,
  patNameEdit, setPatNameEdit,
  onLoadTemplate, onLoadEuclidTemplate,
  view,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const longPressRef = useRef(null);
  const [variant, setVariant] = useState("16");
  const isEuclid = view === "euclid";

  const startLongPress = (i) => {
    longPressRef.current = setTimeout(() => { setPatNameEdit && setPatNameEdit(i); }, 500);
  };
  const cancelLongPress = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  };

  return (
    <>
      {/* ── Pattern Bank ── */}
      <div style={{ marginBottom: 8, padding: "5px 10px", borderRadius: 10, background: th.surface, border: `1px solid ${th.sBorder}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <span data-hint={`PAT · ${pBank.length} pattern${pBank.length > 1 ? "s" : ""} available · Active pattern: ${cPat + 1} · Click a slot to switch`} style={{ fontSize: 8, color: th.dim }}>PAT</span>

          {/* 16 / 32 step toggle — always visible, sequencer only */}
          {!isEuclid && (
            <div style={{ display: "flex", gap: 2 }}>
              {["16", "32"].map(v => (
                <button
                  key={v}
                  data-hint={`${v}-step variant · Filters compatible ${v}-step templates · Current pattern keeps its own per-track length`}
                  onClick={() => setVariant(v)}
                  style={{
                    padding: "1px 7px", borderRadius: 4, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 7.5, fontWeight: 700,
                    border: `1px solid ${variant === v ? "#5E5CE688" : th.sBorder}`,
                    background: variant === v ? "#5E5CE622" : "transparent",
                    color: variant === v ? "#5E5CE6" : th.dim,
                    letterSpacing: "0.06em",
                  }}
                >{v}</button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 4, marginLeft: "auto", position: "relative", zIndex: 10 }}>
            <TemplateDropdown
              onLoad={onLoadTemplate}
              onLoadEuclid={onLoadEuclidTemplate}
              th={th}
              view={view}
              variant={variant}
              setVariant={setVariant}
            />
            {pBank.length < MAX_PAT && (
              <button
                data-hint={`DUP · Duplicate pattern ${cPat + 1} into slot ${cPat + 2} · Great for creating groove variations`}
                onClick={() => { const dup = JSON.parse(JSON.stringify(pBank[cPat])); setPBank(p => { const n = [...p]; n.splice(cPat + 1, 0, dup); return n; }); setCPat(cPat + 1); }}
                style={{ padding: "2px 6px", border: `1px solid ${th.sBorder}`, borderRadius: 5, background: "transparent", color: th.dim, fontSize: 8, cursor: "pointer", fontFamily: "inherit" }}
              >DUP</button>
            )}
            {pBank.length > 1 && (
              <button
                data-hint={`DEL · Delete pattern ${cPat + 1} from the bank · This action is irreversible`}
                onClick={() => { setPBank(p => p.filter((_, j) => j !== cPat)); if (cPat > 0) setCPat(cPat - 1); }}
                style={{ padding: "2px 6px", border: "1px solid rgba(255,55,95,0.2)", borderRadius: 5, background: "transparent", color: "#FF375F", fontSize: 8, cursor: "pointer", fontFamily: "inherit" }}
              >DEL</button>
            )}
          </div>
        </div>

        <div style={isPortrait
          ? { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4 }
          : { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }
        }>
          {pBank.map((pat, i) => {
            const col = SEC_COL[i % 8];
            const isCur = cPat === i;
            const isEditing = patNameEdit === i;
            return (
              <div key={i} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
                {isEditing ? (
                  <input
                    autoFocus
                    defaultValue={pat._name || ""}
                    maxLength={12}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      setPBank(p => { const n = [...p]; n[i] = { ...n[i], _name: v || undefined }; return n; });
                      setPatNameEdit && setPatNameEdit(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === "Escape") e.target.blur();
                    }}
                    style={{ width: isPortrait ? "100%" : 42, height: 24, borderRadius: 5, border: `1px solid ${col}88`, background: "rgba(0,0,0,0.6)", color: col, fontSize: 8, fontWeight: 800, textAlign: "center", fontFamily: "inherit", outline: "none", padding: "0 2px" }}
                  />
                ) : (
                  <button
                    data-hint={isCur
                      ? `Pattern ${i + 1}${pat._name ? ` "${pat._name}"` : ""} · Active · Long-press to rename`
                      : `Pattern ${i + 1}${pat._name ? ` "${pat._name}"` : ""} · Click to switch · Long-press to rename`}
                    onClick={() => { setCPat(i); R.pat = pBank[i]; }}
                    onMouseDown={() => startLongPress(i)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={() => startLongPress(i)}
                    onTouchEnd={cancelLongPress}
                    onTouchCancel={cancelLongPress}
                    title={pat._name || `Pattern ${i + 1}` + " (long-press to rename)"}
                    style={{ width: isPortrait ? "100%" : 36, height: 24, borderRadius: 5, cursor: "pointer", fontFamily: "inherit", fontSize: pat._name ? 7 : 10, fontWeight: 800, border: `1px solid ${isCur ? col + "66" : th.sBorder}`, background: isCur ? col + "20" : "transparent", color: isCur ? col : th.dim, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", padding: "0 2px" }}>
                    {pat._name || (i + 1)}
                  </button>
                )}
              </div>
            );
          })}
          {pBank.length < MAX_PAT && (
            <button
              data-hint={`+ Add an empty pattern · Slot ${pBank.length + 1} · ${MAX_PAT - pBank.length - 1} slot${MAX_PAT - pBank.length - 1 > 1 ? "s" : ""} remaining`}
              onClick={() => { setPBank(p => [...p, mkE(STEPS)]); setCPat(pBank.length); }}
              style={{ width: isPortrait ? "100%" : 24, height: 24, border: `1px dashed ${th.sBorder}`, borderRadius: 5, background: "transparent", color: th.dim, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >+</button>
          )}
        </div>
      </div>

      {/* ── Song Arranger — sequencer only ── */}
      {!isEuclid && (
        <div style={{ marginBottom: 8, borderRadius: 10, background: th.surface, border: `1px solid ${showSong ? "rgba(191,90,242,0.35)" : th.sBorder}`, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", userSelect: "none" }}>
            <div data-hint="Song Arranger · Chain patterns to build a song · Enable SONG mode to play the chain in order" onClick={() => setShowSong(p => !p)} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: "#BF5AF2", letterSpacing: "0.1em" }}>SONG ARRANGER</span>
              <span style={{ fontSize: 10, color: th.dim }}>{showSong ? "▲" : "▼"}</span>
            </div>
            <button
              data-hint={songMode
                ? playing ? "SONG mode active · Auto-plays the chain · Click to disable" : "SONG mode ON · Start playback to chain patterns · Click to disable"
                : "SONG mode OFF · Enable to play patterns in chain order · Click to activate"}
              onClick={e => { e.stopPropagation(); setSongMode(p => !p); }}
              style={{ padding: "2px 8px", borderRadius: 6, border: `1px solid ${songMode ? "#BF5AF255" : "rgba(255,255,255,0.12)"}`, background: songMode ? "#BF5AF218" : "transparent", color: songMode ? "#BF5AF2" : "inherit", fontSize: 8, fontWeight: 700, cursor: "pointer", letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "inherit", animation: songMode && playing ? "pulse 1s infinite" : "none" }}
            >
              {songMode ? (playing ? "▶ ON" : "ON") : "OFF"}
            </button>
          </div>
          {showSong && (
            <div style={{ padding: "0 12px 12px" }}>
              <div style={{ marginBottom: 10 }}>
                {songMode && <span style={{ fontSize: 8, color: th.dim }}>The sequencer automatically advances through the pattern chain each cycle</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                {songChain.map((patIdx, chainIdx) => {
                  const isActive = songMode && playing && songPosRef.current === chainIdx;
                  return (
                    <div key={chainIdx} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 6, background: isActive ? "rgba(191,90,242,0.08)" : "transparent", border: `1px solid ${isActive ? "rgba(191,90,242,0.3)" : "transparent"}` }}>
                      <span style={{ width: 16, fontSize: 8, color: isActive ? "#BF5AF2" : th.faint, fontWeight: 700, textAlign: "right", flexShrink: 0 }}>{chainIdx + 1}</span>
                      <div style={{ display: "flex", gap: 3, flex: 1, flexWrap: "wrap" }}>
                        {pBank.map((_, pi) => (
                          <button
                            key={pi}
                            data-hint={`Song slot ${chainIdx + 1} → Pattern ${pi + 1} · Click to assign this pattern to this chain slot`}
                            onClick={() => setSongChain(p => { const n = [...p]; n[chainIdx] = pi; return n; })}
                            style={{ width: 26, height: 22, borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 800, border: `1px solid ${patIdx === pi ? SEC_COL[pi % 8] + "66" : th.sBorder}`, background: patIdx === pi ? SEC_COL[pi % 8] + "20" : "transparent", color: patIdx === pi ? SEC_COL[pi % 8] : th.dim }}>{pi + 1}</button>
                        ))}
                      </div>
                      {isActive && <span style={{ fontSize: 9, color: "#BF5AF2" }}>▶</span>}
                      <button
                        data-hint={`⊕ DUP · Duplicate slot ${chainIdx + 1} right after in the chain`}
                        onClick={() => setSongChain(p => { const n = [...p]; n.splice(chainIdx + 1, 0, patIdx); return n; })}
                        title="Duplicate this row"
                        style={{ padding: "0 6px", height: 18, border: "1px solid rgba(48,209,88,0.35)", borderRadius: 3, background: "transparent", color: "#30D158", fontSize: 8, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, letterSpacing: "0.04em", fontFamily: "inherit" }}>⊕ DUP</button>
                      {songChain.length > 1 && (
                        <button
                          data-hint={`× Remove slot ${chainIdx + 1} from the song chain`}
                          onClick={() => setSongChain(p => p.filter((_, j) => j !== chainIdx))}
                          style={{ width: 18, height: 18, border: "1px solid rgba(255,55,95,0.25)", borderRadius: 3, background: "transparent", color: "#FF375F", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  data-hint={`+ ADD STEP · Appends pattern ${cPat + 1} to the end of the song chain · Current chain: ${songChain.length} step${songChain.length > 1 ? "s" : ""}`}
                  onClick={() => setSongChain(p => [...p, cPat])}
                  style={{ padding: "4px 12px", borderRadius: 6, border: "1px dashed rgba(191,90,242,0.35)", background: "transparent", color: "#BF5AF2", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ ADD STEP</button>
                <button
                  data-hint="RESET · Resets the song chain to a single step with the current pattern · Clears the entire song sequence"
                  onClick={() => setSongChain([cPat])}
                  style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${th.sBorder}`, background: "transparent", color: th.dim, fontSize: 9, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>RESET</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

import { useRef, useState } from "react";
import { THEMES } from "../theme.js";
import { SEQUENCER_TEMPLATES } from "../sequencerTemplates.ts";

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

function TemplateDropdown({ onLoad, th, view }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState("16");
  const ref = useRef(null);

  const n = variant === "32" ? 32 : 16;

  const toggle = () => setOpen(o => !o);

  const load = (tpl) => {
    onLoad && onLoad(tpl, variant);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "2px 8px", borderRadius: 5, cursor: "pointer",
          border: `1px solid ${open ? "#5E5CE699" : th.sBorder}`,
          background: open ? "#5E5CE618" : "transparent",
          color: open ? "#5E5CE6" : th.dim,
          fontSize: 8, fontWeight: open ? 800 : 500,
          letterSpacing: "0.06em", fontFamily: "inherit",
        }}
      >
        <span>TEMPLATES</span>
        <span style={{ fontSize: 7 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          zIndex: 200, width: 320,
          background: "#1a1a1e", border: `1px solid #5E5CE644`,
          borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}>
          {/* Header: 16 / 32 toggle */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 10px 6px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <span style={{ fontSize: 8, color: th.dim, flex: 1, letterSpacing: "0.06em" }}>STEPS</span>
            {["16","32"].map(v => (
              <button
                key={v}
                onClick={() => setVariant(v)}
                style={{
                  padding: "2px 10px", borderRadius: 5, cursor: "pointer",
                  fontFamily: "inherit", fontSize: 8, fontWeight: 700,
                  border: `1px solid ${variant === v ? "#5E5CE688" : th.sBorder}`,
                  background: variant === v ? "#5E5CE622" : "transparent",
                  color: variant === v ? "#5E5CE6" : th.dim,
                  letterSpacing: "0.08em",
                }}
              >{v}</button>
            ))}
            {variant === "32" && (
              <span style={{ fontSize: 7, color: "#FFD60A", letterSpacing: "0.04em" }}>+FINE</span>
            )}
          </div>

          {/* Template list */}
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {SEQUENCER_TEMPLATES.map(tpl => {
              const has32 = !!tpl.steps32;
              const disabled = variant === "32" && !has32;
              const stepsK = variant === "32" && tpl.steps32 ? tpl.steps32.kick : tpl.steps.kick;
              const stepsS = variant === "32" && tpl.steps32
                ? (tpl.steps32.snare || tpl.steps32.clap || Object.values(tpl.steps32)[1])
                : (tpl.steps.snare || tpl.steps.clap || Object.values(tpl.steps)[1]);
              const stepsH = variant === "32" && tpl.steps32
                ? (tpl.steps32.hihat || Object.values(tpl.steps32)[2])
                : (tpl.steps.hihat || Object.values(tpl.steps)[2]);
              const trackCount = Object.keys(
                variant === "32" && tpl.steps32 ? tpl.steps32 : tpl.steps
              ).length;

              return (
                <div
                  key={tpl.id}
                  onClick={() => !disabled && load(tpl)}
                  title={disabled ? "Pas de variante 32 steps" : `Charger ${tpl.name} — ${tpl.bpm || "?"}bpm`}
                  style={{
                    display: "flex", flexDirection: "column", gap: 3,
                    padding: "7px 10px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.38 : 1,
                    transition: "background 0.08s",
                  }}
                  onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = `${tpl.color}12`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, lineHeight: 1 }}>{tpl.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: tpl.color, flex: 1, letterSpacing: "0.02em" }}>
                      {tpl.name}
                    </span>
                    <span style={{ fontSize: 7, color: tpl.color + "99", letterSpacing: "0.1em", fontWeight: 700 }}>
                      {tpl.genre}
                    </span>
                    {tpl.bpm && (
                      <span style={{ fontSize: 7, color: th.faint, letterSpacing: "0.06em" }}>{tpl.bpm}</span>
                    )}
                    <span style={{ fontSize: 7, color: "#30D15899", letterSpacing: "0.06em" }}>
                      {trackCount}trk
                    </span>
                  </div>
                  <MiniGrid steps={stepsK} color={tpl.color} n={n} />
                  {stepsS && <MiniGrid steps={stepsS} color={tpl.color + "77"} n={n} />}
                  {stepsH && <MiniGrid steps={stepsH} color={tpl.color + "44"} n={n} />}
                </div>
              );
            })}
          </div>

          <div style={{
            padding: "5px 10px", fontSize: 7, color: th.faint, textAlign: "center",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            letterSpacing: "0.04em",
          }}>
            Vélocités humanisées incluses · Toutes pistes activées automatiquement
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
  onLoadTemplate,
  view,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const longPressRef = useRef(null);

  const startLongPress = (i) => {
    longPressRef.current = setTimeout(() => { setPatNameEdit && setPatNameEdit(i); }, 500);
  };
  const cancelLongPress = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  };

  const handleLoadTemplate = (tpl, variant) => {
    onLoadTemplate && onLoadTemplate(tpl, variant);
  };

  return (
    <>
      {/* ── Pattern Bank ── */}
      <div style={{ marginBottom: 8, padding: "5px 10px", borderRadius: 10, background: th.surface, border: `1px solid ${th.sBorder}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: 8, color: th.dim }}>PAT</span>
          <div style={{ display: "flex", gap: 4, marginLeft: "auto", position: "relative", zIndex: 10 }}>
            <TemplateDropdown onLoad={handleLoadTemplate} th={th} view={view} />
            {pBank.length < MAX_PAT && (
              <button
                onClick={() => { const dup = JSON.parse(JSON.stringify(pBank[cPat])); setPBank(p => { const n = [...p]; n.splice(cPat + 1, 0, dup); return n; }); setCPat(cPat + 1); }}
                style={{ padding: "2px 6px", border: `1px solid ${th.sBorder}`, borderRadius: 5, background: "transparent", color: th.dim, fontSize: 8, cursor: "pointer", fontFamily: "inherit" }}
              >DUP</button>
            )}
            {pBank.length > 1 && (
              <button
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
              onClick={() => { setPBank(p => [...p, mkE(STEPS)]); setCPat(pBank.length); }}
              style={{ width: isPortrait ? "100%" : 24, height: 24, border: `1px dashed ${th.sBorder}`, borderRadius: 5, background: "transparent", color: th.dim, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >+</button>
          )}
        </div>
      </div>

      {/* ── Song Arranger ── */}
      <div style={{ marginBottom: 8, borderRadius: 10, background: th.surface, border: `1px solid ${showSong ? "rgba(191,90,242,0.35)" : th.sBorder}`, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", userSelect: "none" }}>
          <div onClick={() => setShowSong(p => !p)} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: "#BF5AF2", letterSpacing: "0.1em" }}>SONG ARRANGER</span>
            <span style={{ fontSize: 10, color: th.dim }}>{showSong ? "▲" : "▼"}</span>
          </div>
          <button
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
                        <button key={pi} onClick={() => setSongChain(p => { const n = [...p]; n[chainIdx] = pi; return n; })} style={{ width: 26, height: 22, borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 800, border: `1px solid ${patIdx === pi ? SEC_COL[pi % 8] + "66" : th.sBorder}`, background: patIdx === pi ? SEC_COL[pi % 8] + "20" : "transparent", color: patIdx === pi ? SEC_COL[pi % 8] : th.dim }}>{pi + 1}</button>
                      ))}
                    </div>
                    {isActive && <span style={{ fontSize: 9, color: "#BF5AF2" }}>▶</span>}
                    <button onClick={() => setSongChain(p => { const n = [...p]; n.splice(chainIdx + 1, 0, patIdx); return n; })} title="Dupliquer cette ligne en dessous" style={{ padding: "0 6px", height: 18, border: `1px solid rgba(48,209,88,0.35)`, borderRadius: 3, background: "transparent", color: "#30D158", fontSize: 8, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, letterSpacing: "0.04em", fontFamily: "inherit" }}>⊕ DUP</button>
                    {songChain.length > 1 && (
                      <button onClick={() => setSongChain(p => p.filter((_, j) => j !== chainIdx))} style={{ width: 18, height: 18, border: "1px solid rgba(255,55,95,0.25)", borderRadius: 3, background: "transparent", color: "#FF375F", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setSongChain(p => [...p, cPat])} style={{ padding: "4px 12px", borderRadius: 6, border: "1px dashed rgba(191,90,242,0.35)", background: "transparent", color: "#BF5AF2", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ ADD STEP</button>
              <button onClick={() => setSongChain([cPat])} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${th.sBorder}`, background: "transparent", color: th.dim, fontSize: 9, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>RESET</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

import { useRef, useState, useEffect } from "react";
import { THEMES } from "../theme.js";

const pill = (on, c) => ({
  padding: "5px 11px", borderRadius: 6,
  border: `1px solid ${on ? c + "55" : "rgba(255,255,255,0.12)"}`,
  background: on ? c + "18" : "transparent",
  color: on ? c : "inherit",
  fontSize: 9, fontWeight: 700, cursor: "pointer",
  letterSpacing: "0.07em", textTransform: "uppercase",
  fontFamily: "inherit",
});

export default function TransportBar({
  themeName, bpm, setBpm, playing, startStop,
  rec, setRec, handleTap, onRecClick,
  swing, setSwing, metro, setMetro, metroVol, setMetroVol, metroSub, setMetroSub,
  midiLM, setMidiLM,
  MidiTag,
  view, sig, showTS, setShowTS, showK, setShowK,
  hasMidiApi, midiNotes, setMidiNotes, initMidi, midiLearnTrack, setMidiLearnTrack,
  isPortrait, isAudioReady, isMobile,
  masterVol, setMasterVol,
  cPat, pBank, SEC_COL, setShowSong,
  onClear,
  exportState, exportBars, setExportBars, exportMode, setExportMode,
  onExport, onExportMidi, exportFx, setExportFx,
  loopRec, loopPlaying, loopEventsCount, toggleLoopRec, toggleLoopPlay,
  loopMetro, setLoopMetro, recCountdown, showLooper,
  onLoopUndo, onLoopRedo, onLoopClear, loopCanUndo, loopCanRedo,
  freeCaptureCount, freeBpm, onLoopCapture, onClearCapture,
  onShowFxRack,
  undo, redo, histLen,
  showInfo, setShowInfo,
  hintMode, setHintMode,
  setOverlayVisible,
  onOpenSave,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const lastTapRef = useRef(0);
  const [bpmFlash, setBpmFlash] = useState(false);
  const bpmFlashTRef = useRef(null);
  const [draftBpm, setDraftBpm] = useState(bpm);
  const isDraggingBpm = useRef(false);
  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    if (!isDraggingBpm.current) setDraftBpm(bpm);
  }, [bpm]);

  useEffect(() => {
    clearTimeout(bpmFlashTRef.current);
    setBpmFlash(true);
    bpmFlashTRef.current = setTimeout(() => setBpmFlash(false), 150);
  }, [bpm]);

  useEffect(() => {
    if (!showExport) return;
    const handler = e => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [showExport]);

  const onMDown = e => {
    e.preventDefault();
    const startY = e.clientY;
    const startVol = metroVol;
    let moved = false;
    const mv = ev => {
      const dy = ev.clientY - startY;
      if (Math.abs(dy) > 5) { moved = true; setMetroVol(Math.max(0, Math.min(100, Math.round(startVol - dy * 0.8)))); }
    };
    const up = () => {
      if (!moved) { setMetro(p => !p); if (!metro) setMetroSub("off"); }
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const onVolDown = e => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastTapRef.current < 350) { setMasterVol(80); lastTapRef.current = 0; return; }
    lastTapRef.current = now;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startVol = masterVol;
    const mv = pe => setMasterVol(Math.max(0, Math.min(100, Math.round(startVol + (startY - pe.clientY) * 0.8))));
    const up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up, { once: true });
  };

  const isPads = view === "pads";
  const looperActive = isPads && (loopPlaying || loopRec);
  const padsPlayAction = looperActive ? toggleLoopPlay : startStop;
  const playIsActive = isPads ? (looperActive ? loopPlaying : playing) : playing;

  const PlayBtn = (
    <div style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
      <button
        data-hint={isPads
          ? (looperActive ? (loopPlaying ? "STOP LOOPER · Stop the looper" : "LOOPER PENDING") : (playing ? "STOP · Shortcut: Space" : "PLAY · Shortcut: Space"))
          : (playing ? "STOP · Stop the sequencer · Shortcut: Space" : "PLAY · Start the sequencer · Shortcut: Space")}
        onClick={isPads ? padsPlayAction : startStop}
        style={{
          width: 44, height: 44, borderRadius: "50%", border: "none",
          background: playIsActive ? "linear-gradient(135deg,#FF2D55,#FF375F)" : "linear-gradient(135deg,#30D158,#34C759)",
          color: "#fff", fontSize: 16, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: playIsActive ? "0 0 20px rgba(255,45,85,0.4)" : "0 0 20px rgba(48,209,88,0.4)",
          transition: "all 0.15s", flexShrink: 0,
        }}
      >{playIsActive ? "■" : "▶"}</button>
      <div style={{ position: "absolute", top: -4, right: -4, pointerEvents: "none" }}><MidiTag id="__play__" /></div>
    </div>
  );

  const RecBtn = (
    <div style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
      <button
        data-hint={rec ? "REC active · Hit pads or keyboard to record live · Shortcut: Alt" : playing ? "REC · Enable live recording · Shortcut: Alt" : "REC · Start playback + recording · Shortcut: Alt"}
        onClick={() => { onRecClick ? onRecClick() : setRec(p => !p); }}
        style={{
          width: 44, height: 44, borderRadius: "50%",
          border: rec ? "2px solid #FF2D55" : "2px solid rgba(255,45,85,0.3)",
          background: rec ? "rgba(255,45,85,0.25)" : "rgba(255,45,85,0.06)",
          color: rec ? "#FF2D55" : "rgba(255,45,85,0.45)",
          fontSize: 16, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: rec ? "rb 0.8s infinite" : "none",
          transition: "all 0.15s",
        }}>●</button>
      <div style={{ position: "absolute", top: -4, right: -4, pointerEvents: "none" }}><MidiTag id="__rec__" /></div>
    </div>
  );

  const BpmCtrl = (
    <div data-hint={`BPM · Current tempo: ${bpm} BPM · ‹ › or slider to adjust · Shortcut: ← →`}
      style={{ display: "flex", alignItems: "center", gap: 4, flex: "1 1 80px", minWidth: 80 }}>
      <span style={{ fontSize: 7, color: th.dim, letterSpacing: "0.12em", flexShrink: 0 }}>BPM</span>
      <div style={{ flexShrink: 0 }}><MidiTag id="__bpm__" /></div>
      <button onClick={() => setBpm(Math.max(30, bpm - 1))} style={{ border: "none", background: "transparent", color: th.dim, cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>‹</button>
      <span className={bpmFlash ? "bpmFlash" : ""} style={{ fontSize: 22, fontWeight: 900, color: "#FF9500", display: "inline-block", minWidth: 30, textAlign: "center", flexShrink: 0 }}>{isMobile ? draftBpm : bpm}</span>
      <button onClick={() => setBpm(Math.min(300, bpm + 1))} style={{ border: "none", background: "transparent", color: th.dim, cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>›</button>
      <input
        type="range" min={30} max={300}
        value={isMobile ? draftBpm : bpm}
        onChange={e => {
          const v = Number(e.target.value);
          if (isMobile) { isDraggingBpm.current = true; setDraftBpm(v); }
          else { setBpm(v); }
        }}
        onPointerUp={isMobile ? e => { isDraggingBpm.current = false; setBpm(Number(e.target.value)); } : undefined}
        onTouchEnd={isMobile ? () => { isDraggingBpm.current = false; setBpm(draftBpm); } : undefined}
        style={{ flex: 1, minWidth: 50, height: 4, accentColor: "#FF9500" }}
      />
    </div>
  );

  const TapBtn = (
    <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
      <button
        data-hint="TAP · Tap 4× in rhythm to auto-detect BPM · Also assignable via MIDI"
        onClick={handleTap}
        style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(255,149,0,0.15)", color: "#FF9500", border: "1px solid rgba(255,149,0,0.3)", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>TAP</button>
      <div style={{ flexShrink: 0 }}><MidiTag id="__tap__" /></div>
    </div>
  );

  const VolKnob = (
    <div
      data-hint={`VOL MASTER · Master volume: ${masterVol}% · Drag ↕ to adjust · Double-tap = 80%`}
      onPointerDown={onVolDown}
      title="VOL MASTER (drag ↕, double-tap = 80)"
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
        cursor: "ns-resize", userSelect: "none", touchAction: "none",
        position: "relative", padding: "4px 8px", borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.12)", minWidth: 48,
      }}>
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: `${masterVol}%`, background: "rgba(255,214,10,0.1)",
        borderRadius: "0 0 6px 6px", pointerEvents: "none",
      }} />
      <span style={{ position: "relative", fontSize: 7, color: th.dim, letterSpacing: "0.1em", fontWeight: 700 }}>VOL</span>
      <span style={{ position: "relative", fontSize: 10, fontWeight: 800, color: "#FFD60A" }}>{masterVol}</span>
    </div>
  );

  const SwingCtrl = view !== "euclid" && (
    <div data-hint={`SWING · Delays the off-beats for shuffle groove · 0 = straight · ~67% = triplet swing · Currently ${swing}%`}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 7, color: th.dim, fontWeight: 700 }}>SWING {swing}%</span>
        <div style={{ flexShrink: 0 }}><MidiTag id="__swing__" /></div>
      </div>
      <input type="range" min={0} max={100} value={swing} onChange={e => setSwing(Number(e.target.value))} style={{ width: 44, height: 3, accentColor: "#5E5CE6" }} />
    </div>
  );

  const TSBtn = view !== "euclid" && view !== "pads" && (
    <button
      data-hint={`Time Signature · Current: ${sig?.label || "4/4"} · Click to change · Sets metronome accents`}
      onClick={() => setShowTS(!showTS)}
      style={pill(showTS, "#30D158")}>{sig.label}</button>
  );

  const MetroBtn = (
    <div
      data-hint={metro ? `METRO active · ${metroVol}% · Click to disable · Drag ↕ to adjust volume` : `METRO · ${metroVol}% · Click to enable · Drag ↕ to adjust volume`}
      onPointerDown={onMDown}
      style={{ ...pill(metro, "#FF9500"), position: "relative", overflow: "hidden", touchAction: "none", userSelect: "none", cursor: "pointer" }}>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${metroVol}%`, background: metro ? "rgba(255,149,0,0.12)" : "transparent", borderRadius: 6, transition: "height 0.15s", pointerEvents: "none" }} />
      <span style={{ position: "relative", zIndex: 1 }}>{`METRO ${metroVol}%`}</span>
    </div>
  );

  const SubBtn = metro && (
    <button
      data-hint={`SUB · Subdivisions · ${metroSub === "off" ? "Disabled" : metroSub === "light" ? "Light (8th)" : "Full (16th)"} · Click to change`}
      onClick={() => setMetroSub(p => p === "off" ? "light" : p === "light" ? "full" : "off")}
      style={pill(metroSub !== "off", "#FF9500")}>SUB {metroSub === "off" ? "OFF" : metroSub === "light" ? "◦" : "●"}</button>
  );

  const KeybBtn = (
    <button
      data-hint={showK ? "Close keyboard mapping" : "KEYB · Open keyboard mapping · Space=Play · Alt=Rec · ←→=BPM"}
      onClick={() => setShowK(!showK)}
      style={{ ...pill(showK, "#FFD60A"), display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 11, lineHeight: 1 }}>⌨</span>
      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.04em" }}>KEYB</span>
    </button>
  );

  const MidiBtn = hasMidiApi && (
    <button
      data-hint={midiLM ? "MIDI LEARN active · Touch a pad then hit a MIDI note to assign · Click to exit" : "MIDI · Enable MIDI · LEARN = assign a note to each track or button"}
      onClick={async () => {
        if (!midiNotes) { const ok = await initMidi(); if (!ok) return; setMidiNotes(true); }
        const entering = !midiLM; setMidiLM(entering); if (!entering) setMidiLearnTrack(null);
      }}
      style={{ ...pill(midiLM, "#FF9500"), display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 11 }}>🎹</span>
      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.04em" }}>MIDI</span>
    </button>
  );

  const ExportBtn = (onExport || onExportMidi) && (
    <div ref={exportRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setShowExport(p => !p)}
        data-hint="Export · Open export options (WAV / MIDI)"
        style={{ ...pill(showExport, "#64D2FF"), display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 10, lineHeight: 1 }}>⬇</span>
        <span>EXPORT</span>
      </button>
      {showExport && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          zIndex: 500,
          minWidth: 210,
          padding: "10px 12px",
          borderRadius: 10,
          background: themeName === "dark" ? "rgba(18,18,32,0.98)" : "rgba(255,255,255,0.98)",
          border: "1px solid rgba(100,210,255,0.3)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
          backdropFilter: "blur(16px)",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.15em", color: "#64D2FF", textTransform: "uppercase" }}>Export</span>
            <button onClick={() => setShowExport(false)} style={{ background: "none", border: "none", color: th.dim, fontSize: 16, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>×</button>
          </div>

          {setExportMode && (
            <div style={{ display: "flex", gap: 4 }}>
              {["pattern", "song"].map(m => (
                <button key={m} onClick={() => setExportMode(m)} style={{
                  flex: 1, padding: "5px 0", borderRadius: 5,
                  border: `1px solid ${exportMode === m ? "rgba(100,210,255,0.5)" : th.sBorder}`,
                  background: exportMode === m ? "rgba(100,210,255,0.15)" : "transparent",
                  color: exportMode === m ? "#64D2FF" : th.dim,
                  fontSize: 9, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                }}>{m === "pattern" ? "PAT" : "SONG"}</button>
              ))}
            </div>
          )}

          {exportMode !== "song" && (
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 4].map(n => (
                <button key={n} onClick={() => setExportBars(n)}
                  disabled={playing || exportState === "rendering"}
                  style={{
                    flex: 1, padding: "5px 0", borderRadius: 5,
                    border: `1px solid ${exportBars === n ? "rgba(100,210,255,0.5)" : th.sBorder}`,
                    background: exportBars === n ? "rgba(100,210,255,0.15)" : "transparent",
                    color: exportBars === n ? "#64D2FF" : th.dim,
                    fontSize: 9, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                    opacity: playing || exportState === "rendering" ? 0.45 : 1,
                  }}>{n} {n === 1 ? "BAR" : "BARS"}</button>
              ))}
            </div>
          )}

          {setExportFx && (
            <button onClick={() => setExportFx(!exportFx)}
              data-hint={exportFx ? "FX ON · WAV includes reverb, delay, compressor · Click for dry" : "FX OFF · Dry export · Click to include effects"}
              style={{
                padding: "6px 10px", borderRadius: 5, width: "100%",
                border: `1px solid ${exportFx ? "rgba(255,159,10,0.5)" : th.sBorder}`,
                background: exportFx ? "rgba(255,159,10,0.12)" : "transparent",
                color: exportFx ? "#FF9F0A" : th.dim,
                fontSize: 9, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                textAlign: "left",
              }}>
              {exportFx ? "✓ FX ON — Reverb · Delay · Comp" : "○ FX OFF — Dry signal"}
            </button>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            {onExport && (
              <button
                onClick={() => { onExport(); setShowExport(false); }}
                disabled={playing || exportState === "rendering"}
                data-hint={exportState === "rendering" ? "Rendering…" : `Export ${exportMode === "song" ? "song" : exportBars + " bar"} as WAV`}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 6,
                  border: "1px solid rgba(100,210,255,0.4)",
                  background: "rgba(100,210,255,0.1)", color: "#64D2FF",
                  fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  opacity: playing || exportState === "rendering" ? 0.45 : 1,
                  letterSpacing: "0.05em",
                }}>{exportState === "rendering" ? "⏳ …" : "⬇ WAV"}</button>
            )}
            {onExportMidi && (
              <button
                onClick={() => { onExportMidi(); setShowExport(false); }}
                disabled={playing || exportState === "rendering"}
                data-hint={exportState === "rendering" ? "Rendering…" : `Export ${exportMode === "song" ? "song" : exportBars + " bar"} as MIDI`}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 6,
                  border: "1px solid rgba(191,90,242,0.4)",
                  background: "rgba(191,90,242,0.1)", color: "#BF5AF2",
                  fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  opacity: playing || exportState === "rendering" ? 0.45 : 1,
                  letterSpacing: "0.05em",
                }}>{exportState === "rendering" ? "⏳ …" : "⬇ MIDI"}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const undoBtnStyle = has => ({
    width: 28, height: 28, borderRadius: 6, padding: 0,
    border: `1px solid ${has ? "rgba(100,210,255,0.35)" : "rgba(255,255,255,0.08)"}`,
    background: has ? "rgba(100,210,255,0.06)" : "transparent",
    color: has ? "#64D2FF" : th.faint,
    fontSize: 16, cursor: has ? "pointer" : "default",
    fontFamily: "inherit", opacity: has ? 1 : 0.3,
    display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
    transition: "all 0.15s", flexShrink: 0,
  });

  const UndoBtn = undo && (
    <button data-hint="Undo (Ctrl+Z) · Step back" onClick={undo} disabled={!histLen?.past}
      title={`Undo${histLen?.past ? ` (${histLen.past})` : ""}`}
      style={undoBtnStyle(histLen?.past)}>↺</button>
  );

  const RedoBtn = redo && (
    <button data-hint="Redo (Ctrl+Y) · Restore undone action" onClick={redo} disabled={!histLen?.future}
      title={`Redo${histLen?.future ? ` (${histLen.future})` : ""}`}
      style={undoBtnStyle(histLen?.future)}>↻</button>
  );

  const SaveBtn = onOpenSave && (
    <button data-hint="Projects · Save and load projects (patterns, kit, song, FX)"
      onClick={onOpenSave} title="Save / Load project"
      style={{ width: 28, height: 28, border: "1px solid rgba(48,209,88,0.25)", borderRadius: 6, background: "transparent", color: "rgba(48,209,88,0.55)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0, transition: "all 0.15s", flexShrink: 0 }}>💾</button>
  );

  const IntroBtn = setOverlayVisible && (
    <button data-hint="Welcome screen · Re-display the intro overlay"
      onClick={() => { setShowInfo?.(false); setOverlayVisible(true); }} title="Intro"
      style={{ width: 28, height: 28, border: "1px solid rgba(255,45,85,0.2)", borderRadius: 6, background: "transparent", color: "rgba(255,45,85,0.45)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0, transition: "all 0.15s", flexShrink: 0 }}>⊙</button>
  );

  const ManualBtn = setShowInfo && (
    <button data-hint="User manual · Full reference for all controls" onClick={() => setShowInfo(p => !p)} title="Manual"
      style={{ width: 28, height: 28, border: `1px solid ${showInfo ? "#BF5AF255" : "rgba(191,90,242,0.2)"}`, borderRadius: 6, background: showInfo ? "rgba(191,90,242,0.15)" : "transparent", color: showInfo ? "#BF5AF2" : "rgba(191,90,242,0.55)", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0, transition: "all 0.15s", flexShrink: 0 }}>📖</button>
  );

  const HintBtn = setHintMode && (
    <button data-hint={hintMode ? "Tooltips ON · Click to disable" : "Tooltips OFF · Click to enable hints"}
      onClick={() => setHintMode(p => !p)} title={hintMode ? "Disable tooltips" : "Enable tooltips"}
      style={{ width: 28, height: 28, border: `1px solid ${hintMode ? "#FFD60A88" : "rgba(255,214,10,0.2)"}`, borderRadius: 6, background: hintMode ? "rgba(255,214,10,0.18)" : "transparent", color: hintMode ? "#FFD60A" : "rgba(255,214,10,0.45)", fontSize: 14, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0, fontStyle: "italic", transition: "all 0.15s", flexShrink: 0 }}>?</button>
  );

  const containerStyle = {
    display: "flex", flexDirection: "column", gap: 6,
    padding: "7px 12px 8px", borderRadius: 12,
    background: th.surface, border: `1px solid ${th.sBorder}`,
  };
  const rowStyle = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" };

  if (isPortrait) {
    return (
      <div style={{ ...containerStyle, marginBottom: 8 }}>
        <div style={rowStyle}>
          {PlayBtn}{RecBtn}{BpmCtrl}{TapBtn}{MetroBtn}
        </div>
        <div style={rowStyle}>
          {VolKnob}{SwingCtrl}{TSBtn}{SubBtn}{MidiBtn}{ExportBtn}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, paddingTop: 4, borderTop: `1px solid ${th.sBorder}` }}>
          {UndoBtn}{RedoBtn}
          <div style={{ flex: 1 }} />
          {SaveBtn}{IntroBtn}{ManualBtn}{HintBtn}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...containerStyle, marginBottom: 12 }}>
      <div style={rowStyle}>
        {PlayBtn}{RecBtn}{BpmCtrl}{TapBtn}{VolKnob}
      </div>
      <div style={rowStyle}>
        {SwingCtrl}{TSBtn}{MetroBtn}{SubBtn}
        {!isMobile && KeybBtn}{MidiBtn}{ExportBtn}
        <div style={{ flex: 1 }} />
        {SaveBtn}{UndoBtn}{RedoBtn}
      </div>
    </div>
  );
}

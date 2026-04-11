import { useRef, useState, useEffect } from "react";
import { THEMES } from "../theme.js";

const pill=(on,c)=>({padding:"5px 11px",borderRadius:6,border:`1px solid ${on?c+"55":on===false?"rgba(255,45,85,0.25)":"rgba(255,255,255,0.12)"}`,background:on?c+"18":"transparent",color:on?c:"inherit",fontSize:9,fontWeight:700,cursor:"pointer",letterSpacing:"0.07em",textTransform:"uppercase",fontFamily:"inherit"});

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
  exportState, exportBars, setExportBars, exportMode, setExportMode, onExport,
  loopRec, loopPlaying, loopEventsCount, toggleLoopRec, toggleLoopPlay,
  loopMetro, setLoopMetro, recCountdown, showLooper,
  onLoopUndo, onLoopRedo, onLoopClear, loopCanUndo, loopCanRedo,
  freeCaptureCount, freeBpm, onLoopCapture, onClearCapture,
  onShowFxRack,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const lastTapRef = useRef(0);
  const [bpmFlash, setBpmFlash] = useState(false);
  const bpmFlashTRef = useRef(null);
  // Draft BPM — shows live slider position on mobile without changing audio until release
  const [draftBpm, setDraftBpm] = useState(bpm);
  const isDraggingBpm = useRef(false);
  useEffect(() => {
    // Sync draft when BPM changes externally (tap tempo, arrow keys, load, etc.)
    if (!isDraggingBpm.current) setDraftBpm(bpm);
  }, [bpm]);
  useEffect(() => {
    clearTimeout(bpmFlashTRef.current);
    setBpmFlash(true);
    bpmFlashTRef.current = setTimeout(() => setBpmFlash(false), 150);
  }, [bpm]);

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
    const mv = pe => {
      const dy = startY - pe.clientY;
      setMasterVol(Math.max(0, Math.min(100, Math.round(startVol + dy * 0.8))));
    };
    const up = () => {
      el.removeEventListener("pointermove", mv);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up, { once: true });
  };

  const VolKnob = (
    <div
      data-hint={`VOL MASTER · Master volume: ${masterVol}% · Drag ↕ to adjust · Double-tap = 80%`}
      onPointerDown={onVolDown}
      title="VOL MASTER (drag ↕, double-tap = 80)"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, cursor: "ns-resize", userSelect: "none", touchAction: "none", position: "relative", overflow: "hidden", padding: "4px 8px", borderRadius: 6, border: `1px solid rgba(255,255,255,0.12)`, minWidth: 50 }}>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${masterVol}%`, background: "rgba(255,214,10,0.1)", pointerEvents: "none" }} />
      <span style={{ position: "relative", fontSize: 7, color: th.dim, letterSpacing: "0.1em", fontWeight: 700 }}>VOL</span>
      <span style={{ position: "relative", fontSize: 10, fontWeight: 800, color: "#FFD60A" }}>{masterVol}</span>
    </div>
  );

  const PatIndicator = pBank && SEC_COL && (
    <div
      data-hint={`Active pattern: ${pBank[cPat]?._name || `PAT ${(cPat ?? 0) + 1}`} · Click to show the Pattern Bank`}
      onClick={() => setShowSong && setShowSong(false)}
      title="Tap to show pattern bank"
      style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ fontSize: 8, fontWeight: 800, color: SEC_COL[cPat % 8], letterSpacing: "0.08em" }}>
        {pBank[cPat]?._name || `PAT ${(cPat ?? 0) + 1}`}
      </span>
    </div>
  );

  const isPads = view === "pads";
  const isEuclid = view === "euclid";
  // Looper is "active" when it is playing or recording (includes countdown)
  const looperActive = isPads && (loopPlaying || loopRec);
  // In pads: if looper active → control looper; otherwise → control main sequencer
  const padsPlayAction = looperActive ? toggleLoopPlay : startStop;
  // Visual state: show active (red/stop) when relevant engine is running
  const playIsActive = isPads ? (looperActive ? loopPlaying : playing) : playing;
  const PlayBtn = (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        data-hint={isPads
          ? (looperActive
              ? (loopPlaying ? "STOP LOOPER · Stop the looper" : "LOOPER PENDING · Recording queued")
              : (playing ? "STOP · Stop the sequencer · Shortcut: Space" : "PLAY · Start the sequencer · Shortcut: Space"))
          : (playing ? "STOP · Stop the sequencer · Shortcut: Space" : "PLAY · Start the sequencer · Shortcut: Space")}
        onClick={isPads ? padsPlayAction : startStop}
        style={{
          width: 44, height: 44, borderRadius: "50%", border: "none",
          background: playIsActive
            ? "linear-gradient(135deg,#FF2D55,#FF375F)"
            : "linear-gradient(135deg,#30D158,#34C759)",
          color: "#fff", fontSize: 16, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: playIsActive
            ? "0 0 20px rgba(255,45,85,0.4)"
            : "0 0 20px rgba(48,209,88,0.4)",
          transition: "all 0.15s",
        }}
      >
        {playIsActive ? "■" : "▶"}
      </button>
      <div style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)" }}><MidiTag id="__play__" /></div>
    </div>
  );

  const RecBtn = (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        data-hint={rec ? "REC active · Hit pads or keyboard to record live · Shortcut: Alt" : playing ? "REC · Enable live recording · Shortcut: Alt" : "REC · Start playback + recording simultaneously · Shortcut: Alt"}
        onClick={() => { onRecClick ? onRecClick() : setRec(p => !p); }}
        style={{
          width: 44, height: 44, borderRadius: "50%",
          border: rec ? "2px solid #FF2D55" : `2px solid rgba(255,45,85,0.3)`,
          background: rec ? "rgba(255,45,85,0.25)" : "rgba(255,45,85,0.06)",
          color: rec ? "#FF2D55" : "rgba(255,45,85,0.45)",
          fontSize: 16, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: rec ? "rb 0.8s infinite" : "none",
          transition: "all 0.15s",
        }}>●</button>
      <div style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)" }}><MidiTag id="__rec__" /></div>
    </div>
  );

  const LooperControls = null;

  const BpmCtrl = (
    <div data-hint={`BPM · Current tempo: ${bpm} BPM · ‹ › or slider to adjust · Shortcut: ← →`}
      style={{ display: "flex", alignItems: "center", gap: 4, flex: "1 1 80px", minWidth: 80 }}>
      <span style={{ fontSize: 7, color: th.dim, letterSpacing: "0.12em", flexShrink: 0 }}>BPM</span>
      <MidiTag id="__bpm__" />
      <button onClick={() => setBpm(Math.max(30, bpm - 1))} style={{ border: "none", background: "transparent", color: th.dim, cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>‹</button>
      <span className={bpmFlash ? "bpmFlash" : ""} style={{ fontSize: 22, fontWeight: 900, color: "#FF9500", display: "inline-block", minWidth: 30, textAlign: "center", flexShrink: 0 }}>{isMobile ? draftBpm : bpm}</span>
      <button onClick={() => setBpm(Math.min(300, bpm + 1))} style={{ border: "none", background: "transparent", color: th.dim, cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>›</button>
      <input
        type="range" min={30} max={300}
        value={isMobile ? draftBpm : bpm}
        onChange={e => {
          const v = Number(e.target.value);
          if (isMobile) {
            // On mobile: only update visual draft, audio BPM commits on release
            isDraggingBpm.current = true;
            setDraftBpm(v);
          } else {
            setBpm(v);
          }
        }}
        onPointerUp={isMobile ? e => {
          const v = Number(e.target.value);
          isDraggingBpm.current = false;
          setBpm(v);
        } : undefined}
        onTouchEnd={isMobile ? e => {
          // Fallback for browsers that don't fire pointerUp on touch
          isDraggingBpm.current = false;
          setBpm(draftBpm);
        } : undefined}
        style={{ flex: 1, minWidth: 50, height: 4, accentColor: "#FF9500" }}
      />
    </div>
  );

  const TapBtn = (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        data-hint="TAP · Tap 4× in rhythm to auto-detect BPM · Also assignable via MIDI"
        onClick={handleTap}
        style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,149,0,0.15)", color: "#FF9500", border: "1px solid rgba(255,149,0,0.3)", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>TAP</button>
      <MidiTag id="__tap__" />
    </div>
  );

  const SwingCtrl = view !== "euclid" && (
    <div data-hint={`SWING · Delays the off-beats for a shuffle groove · 0 = straight · ~67% = triplet swing (jazz/hip-hop) · 100% = max dotted shuffle · Currently ${swing}%`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 7, color: th.dim }}>SWING</span>
        <MidiTag id="__swing__" />
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color: "#5E5CE6" }}>{swing}%</span>
      <input type="range" min={0} max={100} value={swing} onChange={e => setSwing(Number(e.target.value))} style={{ width: 42, height: 3, accentColor: "#5E5CE6" }} />
    </div>
  );

  const TSBtn = view !== "euclid" && view !== "pads" && (
    <button
      data-hint={`Time Signature · Current: ${sig?.label || "4/4"} · Click to change (3/4, 5/4, 6/8…) · Sets the metronome accents`}
      onClick={() => setShowTS(!showTS)}
      style={pill(showTS, "#30D158")}>{sig.label}</button>
  );

  const MetroBtn = (
    <div
      data-hint={metro ? `METRO active · Volume: ${metroVol}% · Click to disable · Drag ↕ to adjust volume` : `METRO · Reference metronome · ${metroVol}% · Click to enable · Drag ↕ to adjust volume`}
      onPointerDown={onMDown}
      style={{ ...pill(metro, "#FF9500"), position: "relative", overflow: "hidden", touchAction: "none", userSelect: "none", cursor: "pointer" }}>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${metroVol}%`, background: metro ? "rgba(255,149,0,0.12)" : "transparent", borderRadius: 6, transition: "height 0.15s", pointerEvents: "none" }} />
      <span style={{ position: "relative", zIndex: 1 }}>{`METRO ${metroVol}%`}</span>
    </div>
  );

  const SubBtn = metro && (
    <button
      data-hint={`SUB · Metronome subdivisions · ${metroSub === "off" ? "Disabled" : metroSub === "light" ? "Light (eighth notes)" : "Full (sixteenth notes)"} · Click to change`}
      onClick={() => setMetroSub(p => p === "off" ? "light" : p === "light" ? "full" : "off")}
      style={pill(metroSub !== "off", "#FF9500")}>SUB {metroSub === "off" ? "OFF" : metroSub === "light" ? "◦" : "●"}</button>
  );

  const ExportGroup = onExport && (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "4px 6px 5px", borderRadius: 7, border: "1px solid rgba(100,210,255,0.2)", background: "rgba(100,210,255,0.04)" }}>
      <div style={{ fontSize: 6, fontWeight: 800, letterSpacing: "0.12em", color: "#64D2FF", textTransform: "uppercase", lineHeight: 1 }}>Export WAV</div>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        {setExportMode && (
          <button
            onClick={() => setExportMode(exportMode === "pattern" ? "song" : "pattern")}
            style={{
              padding: "4px 7px",
              borderRadius: 4,
              border: `1px solid ${exportMode === "song" ? "rgba(255,159,10,0.5)" : "rgba(255,255,255,0.15)"}`,
              background: exportMode === "song" ? "rgba(255,159,10,0.15)" : "transparent",
              color: exportMode === "song" ? "#FF9F0A" : "#888",
              fontSize: 9,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.05em",
            }}
            title={exportMode === "song" ? "Export Song Arrangement" : "Export Pattern"}
          >
            {exportMode === "song" ? "SONG" : "PAT"}
          </button>
        )}
        {exportMode !== "song" && [1,2,4].map(n => (
          <button key={n} onClick={() => setExportBars(n)}
            data-hint={`Export ${n} bar${n > 1 ? "s" : ""} · Click to select this WAV export duration`}
            style={{ ...pill(exportBars===n, "#64D2FF"), padding: "5px 7px", minWidth: 0 }}
            disabled={playing || exportState==="rendering"}
          >{n}b</button>
        ))}
        <button onClick={onExport}
          data-hint={exportState === "rendering" ? "Rendering… · Please wait" : `⬇ WAV · Export ${exportMode==="song"?"song arrangement":exportBars+" bar"+(exportBars>1?"s":"")} to WAV file · Disabled during playback`}
          disabled={playing || exportState==="rendering"}
          style={{ ...pill(false, "#64D2FF"), color: "#64D2FF", border: "1px solid #64D2FF55", opacity: (playing||exportState==="rendering") ? 0.45 : 1 }}
          title="Export WAV"
        >{exportState==="rendering" ? "⏳" : "⬇ WAV"}</button>
      </div>
    </div>
  );

  const KeybBtn = (
    <button
      data-hint={showK ? "Close keyboard mapping · Assign keys to tracks" : "KEYB · Open keyboard mapping · Assign a key to each track · Space=Play · Alt=Rec · ←→=BPM"}
      onClick={() => setShowK(!showK)}
      style={{ ...pill(showK, "#FFD60A"), display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 11, lineHeight: 1 }}>⌨</span>
      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.04em" }}>KEYB</span>
    </button>
  );

  const MidiBtn = hasMidiApi && (
    <button
      data-hint={midiLM ? "MIDI LEARN active · Touch a pad or button then hit a MIDI note to assign · Click to exit" : "MIDI · Enable MIDI connection · LEARN mode = assign a MIDI note to each track or button"}
      onClick={async () => {
        if (!midiNotes) { const ok = await initMidi(); if (!ok) return; setMidiNotes(true); }
        const entering = !midiLM; setMidiLM(entering); if (!entering) setMidiLearnTrack(null);
      }} style={{ ...pill(midiLM, "#FF9500"), display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 11 }}>🎹</span>
      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.04em" }}>MIDI</span>
    </button>
  );


  const rowStyle = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };

  if (isPortrait) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8, padding: "7px 12px 8px", borderRadius: 12, background: th.surface, border: `1px solid ${th.sBorder}` }}>
        {/* Row 1 : Play | [< BPM >] [slider] | TAP | METRO */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {PlayBtn}
          {RecBtn}
          {BpmCtrl}
          {TapBtn}
          {MetroBtn}
        </div>
        {/* Row 2 : VOL · SWING · TS · SUB · MIDI · EXPORT */}
        <div style={{ ...rowStyle, flexWrap: "wrap" }}>
          {VolKnob}
          {SwingCtrl}
          {TSBtn}
          {SubBtn}
          {MidiBtn}
          {ExportGroup}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "10px 12px", borderRadius: 12, background: th.surface, border: `1px solid ${th.sBorder}`, flexWrap: "wrap" }}>
      {PlayBtn}
      {RecBtn}
      {isPads && LooperControls}
      {BpmCtrl}
      {TapBtn}
      {VolKnob}
      {SwingCtrl}
      {TSBtn}
      {MetroBtn}
      {SubBtn}
      {!isPortrait && !isMobile && KeybBtn}
      {MidiBtn}
      {ExportGroup}
    </div>
  );
}

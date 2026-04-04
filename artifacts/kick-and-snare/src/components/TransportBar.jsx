import { useRef, useState, useEffect } from "react";
import { THEMES } from "../theme.js";

const pill=(on,c)=>({padding:"5px 11px",borderRadius:6,border:`1px solid ${on?c+"55":on===false?"rgba(255,45,85,0.25)":"rgba(255,255,255,0.12)"}`,background:on?c+"18":"transparent",color:on?c:"inherit",fontSize:9,fontWeight:700,cursor:"pointer",letterSpacing:"0.07em",textTransform:"uppercase",fontFamily:"inherit"});

export default function TransportBar({
  themeName, bpm, setBpm, playing, startStop,
  rec, setRec, handleTap, onRecClick,
  swing, setSwing, metro, setMetro, metroVol, setMetroVol, metroSub, setMetroSub,
  midiLM, setMidiLM, linkConnected, linkPeers, showLink, setShowLink,
  MidiTag,
  view, sig, showTS, setShowTS, showK, setShowK,
  hasMidiApi, hasLinkApi, midiNotes, setMidiNotes, initMidi, midiLearnTrack, setMidiLearnTrack,
  isPortrait, isAudioReady, isMobile,
  masterVol, setMasterVol,
  cPat, pBank, SEC_COL, setShowSong,
  onClear,
  exportState, exportBars, setExportBars, onExport,
  loopRec, loopPlaying, loopEventsCount, toggleLoopRec, toggleLoopPlay,
  loopMetro, setLoopMetro, recCountdown, showLooper,
  onLoopUndo, onLoopRedo, onLoopClear, loopCanUndo, loopCanRedo,
  freeCaptureCount, freeBpm, onLoopCapture, onClearCapture,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const lastTapRef = useRef(0);
  const [bpmFlash, setBpmFlash] = useState(false);
  const bpmFlashTRef = useRef(null);
  useEffect(() => {
    clearTimeout(bpmFlashTRef.current);
    setBpmFlash(true);
    bpmFlashTRef.current = setTimeout(() => setBpmFlash(false), 150);
  }, [bpm]);

  const onMDown = e => {
    e.preventDefault();
    const startY = e.touches ? e.touches[0].clientY : e.clientY;
    const startVol = metroVol;
    let moved = false;
    const mv = ev => {
      ev.preventDefault();
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const dy = cy - startY;
      if (Math.abs(dy) > 5) { moved = true; setMetroVol(Math.max(0, Math.min(100, Math.round(startVol - dy * 0.8)))); }
    };
    const up = () => {
      if (!moved) { setMetro(p => !p); if (!metro) setMetroSub("off"); }
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", mv);
      window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("touchend", up);
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
      data-hint={`VOL MASTER · Volume général : ${masterVol}% · Drag ↕ pour ajuster · Double-tap = 80%`}
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
      data-hint={`Pattern actif : ${pBank[cPat]?._name || `PAT ${(cPat ?? 0) + 1}`} · Clic pour afficher la Pattern Bank`}
      onClick={() => setShowSong && setShowSong(false)}
      title="Tap to show pattern bank"
      style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ fontSize: 8, fontWeight: 800, color: SEC_COL[cPat % 8], letterSpacing: "0.08em" }}>
        {pBank[cPat]?._name || `PAT ${(cPat ?? 0) + 1}`}
      </span>
    </div>
  );

  const isPads = view === "pads";
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
              ? (loopPlaying ? "STOP LOOPER · Arrête le looper" : "LOOPER EN COURS · Enregistrement en attente")
              : (playing ? "STOP · Arrête le séquenceur · Raccourci : Espace" : "PLAY · Lance le séquenceur · Raccourci : Espace"))
          : (playing ? "STOP · Arrête le séquenceur · Raccourci : Espace" : "PLAY · Lance le séquenceur · Raccourci : Espace")}
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
        data-hint={rec ? "REC actif · Frappe les pads ou le clavier pour enregistrer en live · Raccourci : Alt" : playing ? "REC · Active l'enregistrement live · Raccourci : Alt" : "REC · Lance la lecture + l'enregistrement simultanément · Raccourci : Alt"}
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
    <div data-hint={`BPM · Tempo actuel : ${bpm} BPM · ‹ › ou slider pour ajuster · Raccourci : ← →`} style={{ flex: "1 1 80px", minWidth: 70 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 8, color: th.dim, letterSpacing: "0.15em" }}>BPM</span>
        <MidiTag id="__bpm__" />
        <button onClick={() => setBpm(Math.max(30, bpm - 1))} style={{ border: "none", background: "transparent", color: th.dim, cursor: "pointer", fontSize: 11, padding: "0 3px" }}>&lt;</button>
        <span className={bpmFlash ? "bpmFlash" : ""} style={{ fontSize: 28, fontWeight: 900, color: "#FF9500", display: "inline-block" }}>{bpm}</span>
        <button onClick={() => setBpm(Math.min(300, bpm + 1))} style={{ border: "none", background: "transparent", color: th.dim, cursor: "pointer", fontSize: 11, padding: "0 3px" }}>&gt;</button>
      </div>
      <input type="range" min={30} max={300} value={bpm} onChange={e => setBpm(Number(e.target.value))} style={{ width: "100%", height: 4, accentColor: "#FF9500" }} />
    </div>
  );

  const TapBtn = (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        data-hint="TAP · Taper 4× en rythme pour détecter le BPM automatiquement · Aussi assignable en MIDI"
        onClick={handleTap}
        style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,149,0,0.15)", color: "#FF9500", border: "1px solid rgba(255,149,0,0.3)", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>TAP</button>
      <MidiTag id="__tap__" />
    </div>
  );

  const SwingCtrl = view !== "euclid" && (
    <div data-hint={`SWING · Décale les "ET" en retard pour le groove shuffle · 0 = droit · ~67% = swing triolet (jazz/hip-hop) · 100% = dotted shuffle max · Actuellement ${swing}%`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
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
      data-hint={`Time Signature · Mesure actuelle : ${sig?.label || "4/4"} · Clic pour changer (3/4, 5/4, 6/8…) · Définit les accents du métronome`}
      onClick={() => setShowTS(!showTS)}
      style={pill(showTS, "#30D158")}>{sig.label}</button>
  );

  const MetroBtn = (
    <div
      data-hint={metro ? `METRO actif · Volume : ${metroVol}% · Clic pour désactiver · Drag ↕ pour régler le volume` : `METRO · Métronome de référence · ${metroVol}% · Clic pour activer · Drag ↕ pour régler le volume`}
      onMouseDown={onMDown} onTouchStart={onMDown}
      style={{ ...pill(metro, "#FF9500"), position: "relative", overflow: "hidden", touchAction: "none", userSelect: "none", cursor: "pointer" }}>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${metroVol}%`, background: metro ? "rgba(255,149,0,0.12)" : "transparent", borderRadius: 6, transition: "height 0.15s", pointerEvents: "none" }} />
      <span style={{ position: "relative", zIndex: 1 }}>{`METRO ${metroVol}%`}</span>
    </div>
  );

  const SubBtn = metro && (
    <button
      data-hint={`SUB · Subdivisions du métronome · ${metroSub === "off" ? "Désactivé" : metroSub === "light" ? "Légères (croches)" : "Complètes (doubles croches)"} · Clic pour changer`}
      onClick={() => setMetroSub(p => p === "off" ? "light" : p === "light" ? "full" : "off")}
      style={pill(metroSub !== "off", "#FF9500")}>SUB {metroSub === "off" ? "OFF" : metroSub === "light" ? "◦" : "●"}</button>
  );

  const ExportBtn = onExport && (
    <div data-hint={`Export WAV · Rend ${exportBars} mesure${exportBars > 1 ? "s" : ""} en fichier audio 16-bit PCM · Choisir 1b/2b/4b puis ⬇ WAV`} style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {[1,2,4].map(n => (
        <button key={n} onClick={() => setExportBars(n)}
          data-hint={`Export ${n} mesure${n > 1 ? "s" : ""} · Clic pour sélectionner cette durée d'export WAV`}
          style={{ ...pill(exportBars===n, "#64D2FF"), padding: "5px 7px", minWidth: 0 }}
          disabled={playing || exportState==="rendering"}
        >{n}b</button>
      ))}
      <button onClick={onExport}
        data-hint={exportState === "rendering" ? "Rendu en cours… · Veuillez patienter" : `⬇ WAV · Exporte ${exportBars} mesure${exportBars > 1 ? "s" : ""} en fichier WAV · Désactivé pendant la lecture`}
        disabled={playing || exportState==="rendering"}
        style={{ ...pill(false, "#64D2FF"), color: "#64D2FF", border: "1px solid #64D2FF55", opacity: (playing||exportState==="rendering") ? 0.45 : 1 }}
        title="Export WAV"
      >{exportState==="rendering" ? "⏳" : "⬇ WAV"}</button>
    </div>
  );

  const KeybBtn = (
    <button
      data-hint={showK ? "Fermer le mapping clavier · Assigner des touches aux pistes" : "KEYB · Ouvrir le mapping clavier · Assigne une touche à chaque piste · Espace=Play · Alt=Rec · ←→=BPM"}
      onClick={() => setShowK(!showK)}
      style={{ ...pill(showK, "#FFD60A"), display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 11, lineHeight: 1 }}>⌨</span>
      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.04em" }}>KEYB</span>
    </button>
  );

  const MidiBtn = hasMidiApi && (
    <button
      data-hint={midiLM ? "Mode MIDI LEARN actif · Touche un pad ou bouton puis frappe une note MIDI pour l'assigner · Clic pour terminer" : "MIDI · Active la connexion MIDI · Mode LEARN = assigner une note MIDI à chaque piste ou bouton"}
      onClick={async () => {
        if (!midiNotes) { const ok = await initMidi(); if (!ok) return; setMidiNotes(true); }
        const entering = !midiLM; setMidiLM(entering); if (!entering) setMidiLearnTrack(null);
      }} style={{ ...pill(midiLM, "#FF9500"), display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 11 }}>🎹</span>
      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.04em" }}>MIDI</span>
    </button>
  );

  const LinkBtn = hasLinkApi && (
    <button
      data-hint={linkConnected ? `Ableton LINK · Connecté · ${linkPeers} pair${linkPeers > 1 ? "s" : ""} · Synchronisation BPM réseau active` : "Ableton LINK · Synchroniser le BPM avec d'autres apps sur le réseau local (Ableton, Traktor…)"}
      onClick={() => setShowLink(p => !p)}
      style={{ ...pill(showLink || linkConnected, "#BF5AF2"), fontSize: 8, display: "flex", alignItems: "center", gap: 3 }}>
      🔗{linkConnected ? ` ${linkPeers}p` : ' LINK'}
    </button>
  );

  const rowStyle = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };

  if (isPortrait) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: "10px 12px", borderRadius: 12, background: th.surface, border: `1px solid ${th.sBorder}` }}>
        <div style={{ ...rowStyle }}>
          {PlayBtn}
          {!isPads && RecBtn}
          {BpmCtrl}
        </div>
        {isPads && LooperControls && <div style={{ ...rowStyle }}>{LooperControls}</div>}
        <div style={{ ...rowStyle }}>
          {TapBtn}
          {VolKnob}
          {SwingCtrl}
          {TSBtn}
          {MetroBtn}
          {SubBtn}
        </div>
        <div style={{ ...rowStyle }}>
          {MidiBtn}
          {LinkBtn}
          {ExportBtn}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "10px 12px", borderRadius: 12, background: th.surface, border: `1px solid ${th.sBorder}`, flexWrap: "wrap" }}>
      {PlayBtn}
      {!isPads && RecBtn}
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
      {LinkBtn}
      {ExportBtn}
    </div>
  );
}

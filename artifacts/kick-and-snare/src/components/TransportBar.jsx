import { useRef } from "react";
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
  isPortrait, isAudioReady,
  masterVol, setMasterVol,
  cPat, pBank, SEC_COL, setShowSong,
  onClear,
}) {
  const th = THEMES[themeName] || THEMES.dark;
  const lastTapRef = useRef(0);

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
      if (!moved) setMetro(p => !p);
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
    <div onPointerDown={onVolDown} title="VOL MASTER (drag ↕, double-tap = 80)" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, cursor: "ns-resize", userSelect: "none", touchAction: "none", position: "relative", overflow: "hidden", padding: "4px 8px", borderRadius: 6, border: `1px solid rgba(255,255,255,0.12)`, minWidth: 50 }}>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${masterVol}%`, background: "rgba(255,149,0,0.1)", pointerEvents: "none" }} />
      <span style={{ position: "relative", fontSize: 7, color: th.dim, letterSpacing: "0.1em", fontWeight: 700 }}>VOL</span>
      <span style={{ position: "relative", fontSize: 10, fontWeight: 800, color: "#FF9500" }}>{masterVol}</span>
    </div>
  );

  const PatIndicator = pBank && SEC_COL && (
    <div onClick={() => setShowSong && setShowSong(false)} title="Tap to show pattern bank" style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ fontSize: 8, fontWeight: 800, color: SEC_COL[cPat % 8], letterSpacing: "0.08em" }}>
        {pBank[cPat]?._name || `PAT ${(cPat ?? 0) + 1}`}
      </span>
    </div>
  );

  const PlayBtn = (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={startStop}
        disabled={!isAudioReady}
        style={{
          width: 44, height: 44, borderRadius: "50%", border: "none",
          background: !isAudioReady
            ? "rgba(80,80,80,0.4)"
            : playing
              ? "linear-gradient(135deg,#FF2D55,#FF375F)"
              : "linear-gradient(135deg,#30D158,#34C759)",
          color: "#fff", fontSize: 16, cursor: isAudioReady ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: !isAudioReady ? "none" : playing ? "0 0 20px rgba(255,45,85,0.4)" : "0 0 20px rgba(48,209,88,0.4)",
          opacity: isAudioReady ? 1 : 0.55, transition: "opacity 0.25s",
        }}
      >
        {!isAudioReady ? "…" : playing ? "■" : "▶"}
      </button>
      <div style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)" }}><MidiTag id="__play__" /></div>
    </div>
  );

  const RecBtn = (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => onRecClick ? onRecClick() : (playing && setRec(!rec))}
        style={{
          width: 32, height: 32, borderRadius: "50%",
          border: rec ? "2px solid #FF2D55" : `2px solid ${th.sBorder}`,
          background: rec ? "rgba(255,45,85,0.2)" : "transparent",
          color: rec ? "#FF2D55" : th.dim,
          fontSize: 11, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: 1,
          animation: rec ? "rb 0.8s infinite" : "none",
        }}>●</button>
      <div style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)" }}><MidiTag id="__rec__" /></div>
    </div>
  );

  const BpmCtrl = (
    <div style={{ flex: "1 1 80px", minWidth: 70 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 8, color: th.dim, letterSpacing: "0.15em" }}>BPM</span>
        <MidiTag id="__bpm__" />
        {PatIndicator}
        <button onClick={() => setBpm(Math.max(30, bpm - 1))} style={{ border: "none", background: "transparent", color: th.dim, cursor: "pointer", fontSize: 11, padding: "0 3px" }}>&lt;</button>
        <span style={{ fontSize: 17, fontWeight: 900, color: "#FF9500" }}>{bpm}</span>
        <button onClick={() => setBpm(Math.min(300, bpm + 1))} style={{ border: "none", background: "transparent", color: th.dim, cursor: "pointer", fontSize: 11, padding: "0 3px" }}>&gt;</button>
      </div>
      <input type="range" min={30} max={300} value={bpm} onChange={e => setBpm(Number(e.target.value))} style={{ width: "100%", height: 4, accentColor: "#FF9500" }} />
    </div>
  );

  const TapBtn = (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button onClick={handleTap} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,149,0,0.15)", color: "#FF9500", border: "1px solid rgba(255,149,0,0.3)", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>TAP</button>
      <MidiTag id="__tap__" />
    </div>
  );

  const SwingCtrl = view !== "euclid" && (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 7, color: th.dim }}>SWING</span>
        <MidiTag id="__swing__" />
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color: "#5E5CE6" }}>{swing}%</span>
      <input type="range" min={0} max={100} value={swing} onChange={e => setSwing(Number(e.target.value))} style={{ width: 42, height: 3, accentColor: "#5E5CE6" }} />
    </div>
  );

  const TSBtn = view !== "euclid" && (
    <button onClick={() => setShowTS(!showTS)} style={pill(showTS, "#30D158")}>{sig.label}</button>
  );

  const MetroBtn = (
    <div onMouseDown={onMDown} onTouchStart={onMDown} style={{ ...pill(metro, "#FF9500"), position: "relative", overflow: "hidden", touchAction: "none", userSelect: "none", cursor: "pointer" }}>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${metroVol}%`, background: metro ? "rgba(255,149,0,0.12)" : "transparent", borderRadius: 6, transition: "height 0.15s", pointerEvents: "none" }} />
      <span style={{ position: "relative", zIndex: 1 }}>{`METRO ${metroVol}%`}</span>
    </div>
  );

  const SubBtn = metro && (
    <button onClick={() => setMetroSub(p => p === "off" ? "light" : p === "light" ? "full" : "off")} style={pill(metroSub !== "off", "#FF9500")}>SUB {metroSub === "off" ? "OFF" : metroSub === "light" ? "◦" : "●"}</button>
  );

  const ClearBtn = (
    <button onClick={onClear} style={pill(false, "#FF2D55")} title="Clear all hits">✕ CLEAR</button>
  );

  const KeybBtn = (
    <button onClick={() => setShowK(!showK)} style={{ ...pill(showK, "#FFD60A"), display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 11, lineHeight: 1 }}>⌨</span>
      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.04em" }}>KEYB</span>
    </button>
  );

  const MidiBtn = hasMidiApi && (
    <button onClick={async () => {
      if (!midiNotes) { const ok = await initMidi(); if (!ok) return; setMidiNotes(true); }
      const entering = !midiLM; setMidiLM(entering); if (!entering) setMidiLearnTrack(null);
    }} style={{ ...pill(midiLM, "#FF9500"), display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 11 }}>🎹</span>
      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.04em" }}>MIDI</span>
    </button>
  );

  const LinkBtn = hasLinkApi && (
    <button onClick={() => setShowLink(p => !p)} style={{ ...pill(showLink || linkConnected, "#BF5AF2"), fontSize: 8, display: "flex", alignItems: "center", gap: 3 }}>
      🔗{linkConnected ? ` ${linkPeers}p` : ' LINK'}
    </button>
  );

  const rowStyle = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };

  if (isPortrait) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: "10px 12px", borderRadius: 12, background: th.surface, border: `1px solid ${th.sBorder}` }}>
        <div style={{ ...rowStyle }}>
          {PlayBtn}
          {RecBtn}
          {BpmCtrl}
        </div>
        <div style={{ ...rowStyle }}>
          {TapBtn}
          {SwingCtrl}
          {TSBtn}
          {MetroBtn}
          {SubBtn}
          {VolKnob}
          {ClearBtn}
        </div>
        <div style={{ ...rowStyle }}>
          {KeybBtn}
          {MidiBtn}
          {LinkBtn}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "10px 12px", borderRadius: 12, background: th.surface, border: `1px solid ${th.sBorder}`, flexWrap: "wrap" }}>
      {PlayBtn}
      {RecBtn}
      {BpmCtrl}
      {TapBtn}
      {SwingCtrl}
      {TSBtn}
      {MetroBtn}
      {SubBtn}
      {VolKnob}
      {ClearBtn}
      {KeybBtn}
      {MidiBtn}
      {LinkBtn}
    </div>
  );
}

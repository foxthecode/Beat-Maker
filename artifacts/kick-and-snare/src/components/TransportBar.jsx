import { THEMES } from "../theme.js";

const pill=(on,c)=>({padding:"5px 11px",borderRadius:6,border:`1px solid ${on?c+"55":on===false?"rgba(255,45,85,0.25)":"rgba(255,255,255,0.12)"}`,background:on?c+"18":"transparent",color:on?c:"inherit",fontSize:9,fontWeight:700,cursor:"pointer",letterSpacing:"0.07em",textTransform:"uppercase",fontFamily:"inherit"});

export default function TransportBar({
  themeName, bpm, setBpm, playing, startStop,
  rec, setRec, handleTap,
  swing, setSwing, metro, setMetro, metroVol, setMetroVol, metroSub, setMetroSub,
  midiLM, setMidiLM, linkConnected, linkPeers, showLink, setShowLink,
  MidiTag,
  view, sig, showTS, setShowTS, showK, setShowK,
  hasMidiApi, hasLinkApi, midiNotes, setMidiNotes, initMidi, midiLearnTrack, setMidiLearnTrack,
  onClear,
}) {
  const th = THEMES[themeName] || THEMES.dark;

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

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "10px 12px", borderRadius: 12, background: th.surface, border: `1px solid ${th.sBorder}`, flexWrap: "wrap" }}>
      {/* Play/Stop */}
      <div style={{ position: "relative", display: "inline-block" }}>
        <button onClick={startStop} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: playing ? "linear-gradient(135deg,#FF2D55,#FF375F)" : "linear-gradient(135deg,#30D158,#34C759)", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: playing ? "0 0 20px rgba(255,45,85,0.4)" : "0 0 20px rgba(48,209,88,0.4)" }}>{playing ? "■" : "▶"}</button>
        <div style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)" }}><MidiTag id="__play__" /></div>
      </div>
      {/* Record */}
      <div style={{ position: "relative", display: "inline-block" }}>
        <button onClick={() => { if (playing) setRec(!rec); }} style={{ width: 32, height: 32, borderRadius: "50%", border: rec ? "2px solid #FF2D55" : `2px solid ${th.sBorder}`, background: rec ? "rgba(255,45,85,0.2)" : "transparent", color: rec ? "#FF2D55" : th.dim, fontSize: 11, cursor: playing ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: playing ? 1 : 0.3, animation: rec ? "rb 0.8s infinite" : "none" }}>●</button>
        <div style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)" }}><MidiTag id="__rec__" /></div>
      </div>
      {/* BPM */}
      <div style={{ flex: "1 1 80px", minWidth: 70 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 8, color: th.dim, letterSpacing: "0.15em" }}>BPM</span>
          <MidiTag id="__bpm__" />
          <button onClick={() => setBpm(Math.max(30, bpm - 1))} style={{ border: "none", background: "transparent", color: th.dim, cursor: "pointer", fontSize: 11, padding: "0 3px" }}>&lt;</button>
          <span style={{ fontSize: 17, fontWeight: 900, color: "#FF9500" }}>{bpm}</span>
          <button onClick={() => setBpm(Math.min(300, bpm + 1))} style={{ border: "none", background: "transparent", color: th.dim, cursor: "pointer", fontSize: 11, padding: "0 3px" }}>&gt;</button>
        </div>
        <input type="range" min={30} max={300} value={bpm} onChange={e => setBpm(Number(e.target.value))} style={{ width: "100%", height: 4, accentColor: "#FF9500" }} />
      </div>
      {/* TAP */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={handleTap} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,149,0,0.15)", color: "#FF9500", border: "1px solid rgba(255,149,0,0.3)", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>TAP</button>
        <MidiTag id="__tap__" />
      </div>
      {/* SWING */}
      {view !== "euclid" && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 7, color: th.dim }}>SWING</span>
          <MidiTag id="__swing__" />
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color: "#5E5CE6" }}>{swing}%</span>
        <input type="range" min={0} max={100} value={swing} onChange={e => setSwing(Number(e.target.value))} style={{ width: 42, height: 3, accentColor: "#5E5CE6" }} />
      </div>}
      {/* Time Sig */}
      {view !== "euclid" && <button onClick={() => setShowTS(!showTS)} style={pill(showTS, "#30D158")}>{sig.label}</button>}
      {/* METRO */}
      <div onMouseDown={onMDown} onTouchStart={onMDown} style={{ ...pill(metro, "#FF9500"), position: "relative", overflow: "hidden", touchAction: "none", userSelect: "none", cursor: "pointer" }}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${metroVol}%`, background: metro ? "rgba(255,149,0,0.12)" : "transparent", borderRadius: 6, transition: "height 0.15s", pointerEvents: "none" }} />
        <span style={{ position: "relative", zIndex: 1 }}>{`METRO ${metroVol}%`}</span>
      </div>
      {/* SUB */}
      {metro && <button onClick={() => setMetroSub(p => p === "off" ? "light" : p === "light" ? "full" : "off")} style={pill(metroSub !== "off", "#FF9500")}>SUB {metroSub === "off" ? "OFF" : metroSub === "light" ? "◦" : "●"}</button>}
      {/* CLEAR */}
      <button onClick={onClear} style={pill(false, "#FF2D55")} title="Clear all hits">✕ CLEAR</button>
      {/* KEYB */}
      <button onClick={() => setShowK(!showK)} style={{ ...pill(showK, "#FFD60A"), display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 11, lineHeight: 1 }}>⌨</span>
        <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.04em" }}>KEYB</span>
      </button>
      {/* MIDI */}
      {hasMidiApi && <button onClick={async () => {
        if (!midiNotes) { const ok = await initMidi(); if (!ok) return; setMidiNotes(true); }
        const entering = !midiLM; setMidiLM(entering); if (!entering) setMidiLearnTrack(null);
      }} style={{ ...pill(midiLM, "#FF9500"), display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 11 }}>🎹</span>
        <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.04em" }}>MIDI</span>
      </button>}
      {/* LINK */}
      {hasLinkApi && <button onClick={() => setShowLink(p => !p)} style={{ ...pill(showLink || linkConnected, "#BF5AF2"), fontSize: 8, display: "flex", alignItems: "center", gap: 3 }}>
        🔗{linkConnected ? ` ${linkPeers}p` : ' LINK'}
      </button>}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { DEFAULT_SAMPLES, b64toAB } from "./defaultSamples";

const THEMES={daylight:{bg:"linear-gradient(170deg,#F5F3EE 0%,#EDEAE4 100%)",surface:"rgba(0,0,0,0.03)",sBorder:"rgba(0,0,0,0.08)",text:"#1a1a1a",dim:"#888",faint:"#bbb",stepOff:"rgba(0,0,0,0.03)",stepAlt:"rgba(0,0,0,0.045)",cursor:"rgba(0,0,0,0.1)",btn:"rgba(0,0,0,0.04)",btnH:"rgba(0,0,0,0.08)"}};

const TIME_SIGS=[
  {label:"4/4",beats:4,steps:16,groups:[4,4,4,4]},
  {label:"3/4",beats:3,steps:12,groups:[4,4,4]},
  {label:"6/8",beats:2,steps:12,groups:[6,6]},
  {label:"5/4",beats:5,steps:20,groups:[4,4,4,4,4]},
  {label:"7/8",beats:3,steps:14,groups:[4,4,6],groupOptions:[[4,4,6,"2+2+3"],[6,4,4,"3+2+2"],[4,6,4,"2+3+2"]]},
  {label:"5/8",beats:2,steps:10,groups:[6,4],groupOptions:[[6,4,"3+2"],[4,6,"2+3"]]},
];

const ALL_TRACKS=[
  {id:"kick",label:"KICK",color:"#FF2D55",icon:"◆"},
  {id:"snare",label:"SNARE",color:"#FF9500",icon:"◼"},
  {id:"hihat",label:"HI-HAT",color:"#30D158",icon:"△"},
  {id:"clap",label:"CLAP",color:"#5E5CE6",icon:"✦"},
  {id:"tom",label:"TOM",color:"#FF375F",icon:"●"},
  {id:"ride",label:"RIDE",color:"#64D2FF",icon:"◇"},
  {id:"crash",label:"CRASH",color:"#FFD60A",icon:"✶"},
  {id:"perc",label:"PERC",color:"#BF5AF2",icon:"▲"},
];
const TRACKS=ALL_TRACKS;
const DEFAULT_ACTIVE=["kick","snare"];
const DEFAULT_KEYS=["q","s","d","f","g","h","j","k"];
const MAX_PAT=8,NR=50;
const SEC_COL=["#FF2D55","#FF9500","#30D158","#5E5CE6","#BF5AF2","#64D2FF","#FFD60A","#FF375F"];
const mkE=s=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(0)]));
const mkN=s=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(0)]));

const TEMPLATES=[
  {name:"Amen Break",bpm:136,sig:"4/4",pattern:{kick:[1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0],snare:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],hihat:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]}},
  {name:"Funky Drummer",bpm:102,sig:"4/4",pattern:{kick:[1,0,0,1,0,0,1,0,0,0,1,0,0,0,0,0],snare:[0,0,0,0,1,0,0,0,0,1,0,0,1,0,0,0],hihat:[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]}},
  {name:"Boom Bap",bpm:90,sig:"4/4",pattern:{kick:[1,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0],snare:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],hihat:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]}},
  {name:"808 Trap",bpm:140,sig:"4/4",pattern:{kick:[1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0],snare:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],hihat:[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]}},
  {name:"Waltz",bpm:120,sig:"3/4",pattern:{kick:[1,0,0,0,0,0,0,0,0,0,0,0],snare:[0,0,0,0,1,0,0,0,1,0,0,0],hihat:[1,0,1,0,1,0,1,0,1,0,1,0]}},
  {name:"Afrobeat 6/8",bpm:110,sig:"6/8",pattern:{kick:[1,0,0,0,0,0,1,0,0,0,0,0],snare:[0,0,0,1,0,0,0,0,0,1,0,0],hihat:[1,0,1,0,1,0,1,0,1,0,1,0]}},
];

const defFx=()=>({pitch:0,fType:"lowpass",cut:20000,res:0,drive:0,crush:0,cThr:-24,cRat:1,rMix:0,rDecay:1.5,dMix:0,dTime:0.25,dSync:false,dDiv:"1/4",vol:80,pan:0,
  // per-section bypass
  onPitch:true,onFilter:true,onDrive:true,onComp:true,onReverb:false,onDelay:false});

// Delay sync divisions
const DELAY_DIVS=["1/4","1/8","1/16","1/4d","1/8d","1/4t","1/8t"];
const divToSec=(div,bpm)=>{const b=60/bpm;const m={
  "1/4":b,"1/8":b/2,"1/16":b/4,"1/4d":b*1.5,"1/8d":b*0.75,"1/4t":b*2/3,"1/8t":b/3
};return m[div]||b;};


// ═══ Improved Synth Engine ═══
class Eng{
  constructor(){this.ctx=null;this.mg=null;this.buf={};this.rv=null;this.ch={};this._c={};}
  init(){if(this.ctx)return;this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.mg=this.ctx.createGain();this.mg.gain.value=0.8;this.mg.connect(this.ctx.destination);this._mkRv();TRACKS.forEach(t=>this._build(t.id));this._loadDefaults();}
  async _loadDefaults(){
    for(const [id,b64] of Object.entries(DEFAULT_SAMPLES)){
      try{const ab=b64toAB(b64);this.buf[id]=await this.ctx.decodeAudioData(ab);}catch(e){console.warn("Default sample load failed:",id,e);}
    }
  }
  _mkRv(decay){
    const d=decay||2;const sr=this.ctx.sampleRate;const l=Math.ceil(sr*Math.min(5,d));
    const b=this.ctx.createBuffer(2,l,sr);
    // Early reflections (short taps simulating room walls)
    const erTaps=[0.012,0.019,0.028,0.037,0.042,0.053,0.067];
    const erGains=[0.7,0.5,0.6,0.35,0.4,0.3,0.25];
    for(let ch=0;ch<2;ch++){
      const data=b.getChannelData(ch);
      // Early reflections
      for(let t=0;t<erTaps.length;t++){
        const idx=Math.floor(erTaps[t]*sr*(ch===1?1.05:1));// slight stereo spread
        if(idx<l) data[idx]+=(erGains[t]*(0.8+Math.random()*0.4))*(ch===0?1:0.9);
      }
      // Late diffuse tail: filtered noise with exponential + lowpass decay
      for(let i=Math.floor(sr*0.08);i<l;i++){
        const t=i/sr;
        const env=Math.exp(-t*3/d); // exponential decay controlled by decay param
        const lpf=Math.exp(-t*1.5/d); // progressive lowpass (high freqs die faster)
        const noise=Math.random()*2-1;
        // Apply crude lowpass by mixing with previous sample
        const raw=noise*env;
        data[i]+=(raw*lpf*0.5 + (i>0?data[i-1]*0.3:0));
      }
    }
    this.rv=b;
  }
  // Rebuild reverb buffer when decay changes and reassign to all convolvers
  updateReverb(decay){
    this._mkRv(decay);
    TRACKS.forEach(id=>{const c=this.ch[id.id||id];if(c&&c.conv){try{c.conv.buffer=this.rv;}catch(e){}}});
  }
  _build(id){const c={};c.in=this.ctx.createGain();c.flt=this.ctx.createBiquadFilter();c.flt.type="lowpass";c.flt.frequency.value=20000;c.drv=this.ctx.createWaveShaper();c.drv.oversample="2x";c.drv.curve=this._cv(0);c.cmp=this.ctx.createDynamicsCompressor();c.cmp.threshold.value=-24;c.cmp.ratio.value=1;c.cmp.attack.value=0.003;c.cmp.release.value=0.15;c.vol=this.ctx.createGain();c.vol.gain.value=0.8;c.pan=this.ctx.createStereoPanner?this.ctx.createStereoPanner():this.ctx.createGain();c.dry=this.ctx.createGain();c.rvG=this.ctx.createGain();c.rvG.gain.value=0;c.conv=this.ctx.createConvolver();c.conv.buffer=this.rv;c.dlG=this.ctx.createGain();c.dlG.gain.value=0;c.dl=this.ctx.createDelay(2);c.dl.delayTime.value=0.25;c.dlFb=this.ctx.createGain();c.dlFb.gain.value=0.3;c.in.connect(c.flt);c.flt.connect(c.drv);c.drv.connect(c.cmp);c.cmp.connect(c.vol);c.vol.connect(c.pan);c.pan.connect(c.dry);c.dry.connect(this.mg);c.pan.connect(c.rvG);c.rvG.connect(c.conv);c.conv.connect(this.mg);c.pan.connect(c.dlG);c.dlG.connect(c.dl);c.dl.connect(c.dlFb);c.dlFb.connect(c.dl);c.dl.connect(this.mg);this.ch[id]=c;}
  _cv(d){const k=Math.round(d*100);if(this._c[k])return this._c[k];const n=8192,a=new Float32Array(n),v=d*5;for(let i=0;i<n;i++){const x=i*2/n-1;a[i]=v===0?x:((1+v)*x)/(1+v*Math.abs(x));}this._c[k]=a;return a;}
  uFx(id,f){
    const c=this.ch[id];if(!c)return;const t=this.ctx.currentTime;
    // Filter (bypass = open filter)
    c.flt.type=f.onFilter?(f.fType||"lowpass"):"lowpass";
    c.flt.frequency.setTargetAtTime(f.onFilter?Math.min(20000,Math.max(20,f.cut||20000)):20000,t,0.02);
    c.flt.Q.setTargetAtTime(f.onFilter?(f.res||0):0,t,0.02);
    // Drive (bypass = no curve)
    c.drv.curve=f.onDrive?this._cv((f.drive||0)/100):this._cv(0);
    // Comp (bypass = no compression)
    c.cmp.threshold.setTargetAtTime(f.onComp?(f.cThr||-24):0,t,0.02);
    c.cmp.ratio.setTargetAtTime(f.onComp?Math.max(1,f.cRat||1):1,t,0.02);
    c.vol.gain.setTargetAtTime((f.vol||80)/100,t,0.02);
    if(c.pan.pan)c.pan.pan.setTargetAtTime((f.pan||0)/100,t,0.02);
    const wv=f.onReverb?(f.rMix||0)/100:0;
    const wd=f.onDelay?(f.dMix||0)/100:0;
    c.dry.gain.setTargetAtTime(Math.max(0.1,1-wv*0.5-wd*0.5),t,0.02);
    c.rvG.gain.setTargetAtTime(wv,t,0.02);
    c.dlG.gain.setTargetAtTime(wd,t,0.02);
    c.dl.delayTime.setTargetAtTime(f.dTime||0.25,t,0.02);
  }
  async load(id,file){this.init();try{const a=await file.arrayBuffer();this.buf[id]=await this.ctx.decodeAudioData(a);return true;}catch(e){return false;}}
  play(id,vel=1,dMs=0,f=null,at=null){
    if(!this.ctx)this.init();const c=this.ch[id];if(!c)return;
    const t=at!==null?(at+Math.max(0,dMs)/1000):(this.ctx.currentTime+Math.max(0,dMs)/1000);
    if(f)this.uFx(id,f);const r=Math.pow(2,((f?.onPitch?f.pitch:0)||0)/12);
    if(this.buf[id]){const s=this.ctx.createBufferSource();s.buffer=this.buf[id];s.playbackRate.setValueAtTime(r,t);const g=this.ctx.createGain();g.gain.setValueAtTime(vel,t);s.connect(g);g.connect(c.in);s.start(t);s.stop(t+s.buffer.duration/r+0.1);}
    else this._syn(id,t,vel,c.in);
  }
  // Improved synth sounds
  _syn(id,t,v,d){v*=0.8;const ctx=this.ctx;const S={
    kick:()=>{
      // 808-style: layered sine with sub + click transient
      const o=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain(),g2=ctx.createGain();
      o.type="sine";o.frequency.setValueAtTime(180,t);o.frequency.exponentialRampToValueAtTime(28,t+0.12);
      g.gain.setValueAtTime(v*1.2,t);g.gain.setValueAtTime(v*1.0,t+0.02);g.gain.exponentialRampToValueAtTime(0.001,t+0.5);
      o.connect(g);g.connect(d);o.start(t);o.stop(t+0.5);
      // Sub layer
      o2.type="sine";o2.frequency.setValueAtTime(55,t);
      g2.gain.setValueAtTime(v*0.6,t);g2.gain.exponentialRampToValueAtTime(0.001,t+0.4);
      o2.connect(g2);g2.connect(d);o2.start(t);o2.stop(t+0.4);
      // Click transient
      const nb=ctx.createBuffer(1,ctx.sampleRate*0.008,ctx.sampleRate),dd=nb.getChannelData(0);
      for(let i=0;i<dd.length;i++)dd[i]=(Math.random()*2-1)*Math.exp(-i*8/dd.length);
      const ns=ctx.createBufferSource();ns.buffer=nb;const ng=ctx.createGain();ng.gain.setValueAtTime(v*0.4,t);
      ns.connect(ng);ng.connect(d);ns.start(t);
    },
    snare:()=>{
      // Body tone + noise with bandpass
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.type="triangle";o.frequency.setValueAtTime(220,t);o.frequency.exponentialRampToValueAtTime(120,t+0.04);
      g.gain.setValueAtTime(v*0.6,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.1);
      o.connect(g);g.connect(d);o.start(t);o.stop(t+0.1);
      // Noise
      const nb=ctx.createBuffer(1,ctx.sampleRate*0.18,ctx.sampleRate),dd=nb.getChannelData(0);
      for(let i=0;i<dd.length;i++)dd[i]=(Math.random()*2-1);
      const ns=ctx.createBufferSource();ns.buffer=nb;
      const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=3500;bp.Q.value=1.5;
      const ng=ctx.createGain();ng.gain.setValueAtTime(v*0.7,t);ng.gain.exponentialRampToValueAtTime(0.001,t+0.18);
      ns.connect(bp);bp.connect(ng);ng.connect(d);ns.start(t);ns.stop(t+0.18);
    },
    hihat:()=>{
      // Multiple detuned square oscs for metallic tone
      const g=ctx.createGain();g.gain.setValueAtTime(v*0.3,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.06);g.connect(d);
      [4000,5340,6800].forEach(f=>{const o=ctx.createOscillator();o.type="square";o.frequency.value=f;const og=ctx.createGain();og.gain.value=0.3;o.connect(og);og.connect(g);o.start(t);o.stop(t+0.06);});
      // Noise layer
      const nb=ctx.createBuffer(1,ctx.sampleRate*0.04,ctx.sampleRate),dd=nb.getChannelData(0);
      for(let i=0;i<dd.length;i++)dd[i]=Math.random()*2-1;
      const ns=ctx.createBufferSource();ns.buffer=nb;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=9000;
      const ng=ctx.createGain();ng.gain.setValueAtTime(v*0.25,t);ng.gain.exponentialRampToValueAtTime(0.001,t+0.04);
      ns.connect(hp);hp.connect(ng);ng.connect(d);ns.start(t);ns.stop(t+0.04);
    },
    clap:()=>{
      // Multi-burst noise
      const g=ctx.createGain();g.connect(d);
      [0,0.01,0.02].forEach((off,i)=>{
        const nb=ctx.createBuffer(1,ctx.sampleRate*0.01,ctx.sampleRate),dd=nb.getChannelData(0);
        for(let j=0;j<dd.length;j++)dd[j]=Math.random()*2-1;
        const ns=ctx.createBufferSource();ns.buffer=nb;
        const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=2000;bp.Q.value=1;
        const ig=ctx.createGain();ig.gain.setValueAtTime(v*0.25,t+off);ig.gain.exponentialRampToValueAtTime(0.001,t+off+0.015);
        ns.connect(bp);bp.connect(ig);ig.connect(g);ns.start(t+off);ns.stop(t+off+0.015);
      });
      // Tail
      const nb=ctx.createBuffer(1,ctx.sampleRate*0.15,ctx.sampleRate),dd=nb.getChannelData(0);
      for(let i=0;i<dd.length;i++)dd[i]=(Math.random()*2-1);
      const ns=ctx.createBufferSource();ns.buffer=nb;
      const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=1500;bp.Q.value=2;
      const ng=ctx.createGain();ng.gain.setValueAtTime(v*0.5,t+0.03);ng.gain.exponentialRampToValueAtTime(0.001,t+0.15);
      ns.connect(bp);bp.connect(ng);ng.connect(g);ns.start(t+0.03);ns.stop(t+0.15);
    },
    tom:()=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(60,t+0.15);g.gain.setValueAtTime(v*0.8,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.3);o.connect(g);g.connect(d);o.start(t);o.stop(t+0.3);},
    ride:()=>{const nb=ctx.createBuffer(1,ctx.sampleRate*0.4,ctx.sampleRate),dd=nb.getChannelData(0);for(let i=0;i<dd.length;i++)dd[i]=Math.random()*2-1;const ns=ctx.createBufferSource();ns.buffer=nb;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=5500;const g=ctx.createGain();g.gain.setValueAtTime(v*0.2,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.4);ns.connect(hp);hp.connect(g);g.connect(d);ns.start(t);ns.stop(t+0.4);},
    crash:()=>{const nb=ctx.createBuffer(1,ctx.sampleRate*0.8,ctx.sampleRate),dd=nb.getChannelData(0);for(let i=0;i<dd.length;i++)dd[i]=Math.random()*2-1;const ns=ctx.createBufferSource();ns.buffer=nb;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=3500;const g=ctx.createGain();g.gain.setValueAtTime(v*0.35,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.8);ns.connect(hp);hp.connect(g);g.connect(d);ns.start(t);ns.stop(t+0.8);},
    perc:()=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type="triangle";o.frequency.setValueAtTime(900,t);o.frequency.exponentialRampToValueAtTime(400,t+0.03);g.gain.setValueAtTime(v*0.35,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.06);o.connect(g);g.connect(d);o.start(t);o.stop(t+0.06);},
  };if(S[id])S[id]();}
}
const engine=new Eng();

// ═══ SSL Strip with sections, on/off, drag faders ═══
function SSL({tid,color,fx,setFx,bpm,onClose}){
  const th=THEMES.daylight;const f=fx[tid]||defFx();
  const u=(k,v)=>setFx(p=>({...p,[tid]:{...(p[tid]||defFx()),[k]:v}}));
  const tog=k=>u(k,!f[k]);

  const VF=({label,value,min,max,step,unit,c,onChange})=>{
    const pct=((value-min)/(max-min))*100;
    const onStart=e=>{e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();
      const calc=cy=>{const y=1-(cy-rect.top)/rect.height;onChange(min+(max-min)*Math.max(0,Math.min(1,y)));};
      calc(e.touches?e.touches[0].clientY:e.clientY);
      const mv=ev=>{ev.preventDefault();calc(ev.touches?ev.touches[0].clientY:ev.clientY);};
      const up=()=>{window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);window.removeEventListener("touchmove",mv);window.removeEventListener("touchend",up);};
      window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);window.addEventListener("touchmove",mv,{passive:false});window.addEventListener("touchend",up);
    };
    return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:30,flex:1}}>
      <span style={{fontSize:8,fontWeight:700,color:th.dim,whiteSpace:"nowrap"}}>{label}</span>
      <div style={{position:"relative",width:10,height:80,background:th.btn,borderRadius:5,cursor:"pointer",touchAction:"none"}} onMouseDown={onStart} onTouchStart={onStart}>
        <div style={{position:"absolute",bottom:0,width:"100%",height:`${pct}%`,background:`${c}44`,borderRadius:5}}/>
        <div style={{position:"absolute",left:"50%",transform:"translateX(-50%)",bottom:`calc(${pct}% - 6px)`,width:18,height:12,borderRadius:4,background:c,border:"2px solid rgba(255,255,255,0.5)",boxShadow:`0 0 8px ${c}44`,pointerEvents:"none"}}/>
      </div>
      <span style={{fontSize:8,fontWeight:700,color:c,fontFamily:"monospace"}}>{typeof value==="number"?Number(value).toFixed(step<1?1:0):value}{unit||""}</span>
    </div>);
  };

  const Sec=({title,c,on,onToggle,children})=>(
    <div style={{minWidth:0,flex:1}}>
      <div onClick={onToggle} style={{fontSize:9,fontWeight:800,color:on?c:th.faint,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6,paddingBottom:3,borderBottom:`2px solid ${on?c+"44":th.btn}`,cursor:"pointer",userSelect:"none",opacity:on?1:0.4}}>{title} {on?"":"(off)"}</div>
      <div style={{display:"flex",gap:3,opacity:on?1:0.25,pointerEvents:on?"auto":"none"}}>{children}</div>
    </div>
  );

  return(<div style={{margin:"2px 0 6px",padding:"14px 12px",borderRadius:12,background:th.surface,border:`1px solid ${color}22`,willChange:"transform",contain:"layout"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,fontWeight:700,color,letterSpacing:"0.08em"}}>FX CHAIN</span>
        <button onClick={()=>{engine.init();engine.play(tid,1,0,f);}} style={{padding:"4px 12px",borderRadius:5,border:"none",background:color+"22",color,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>▶ PREVIEW</button>
      </div>
      <div style={{display:"flex",gap:4}}>
        <button onClick={()=>setFx(p=>({...p,[tid]:defFx()}))} style={{padding:"3px 10px",borderRadius:4,border:"1px solid rgba(255,55,95,0.2)",background:"transparent",color:"#FF375F",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>RESET</button>
        <button onClick={onClose} style={{width:24,height:24,borderRadius:5,border:"none",background:"rgba(255,55,95,0.1)",color:"#FF375F",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>
    </div>
    {/* Filter type */}
    <div style={{display:"flex",gap:4,marginBottom:12}}>
      {["lowpass","highpass","bandpass"].map(ft=>(<button key={ft} onClick={()=>u("fType",ft)} style={{flex:1,padding:"4px 0",borderRadius:4,border:"1px solid",fontSize:8,fontWeight:700,fontFamily:"inherit",cursor:"pointer",textTransform:"uppercase",borderColor:f.fType===ft?color+"55":th.sBorder,background:f.fType===ft?color+"15":"transparent",color:f.fType===ft?color:th.dim}}>{ft.replace("pass","")}</button>))}
    </div>
    <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
      <Sec title="Pitch" c="#FF2D55" on={f.onPitch} onToggle={()=>tog("onPitch")}>
        <VF label="Semi" value={f.pitch} min={-12} max={12} step={1} unit="st" c="#FF2D55" onChange={v=>u("pitch",Math.round(v))}/>
      </Sec>
      <Sec title="Filter" c="#555" on={f.onFilter} onToggle={()=>tog("onFilter")}>
        <VF label="Cutoff" value={f.cut} min={20} max={20000} step={10} unit="" c="#555" onChange={v=>u("cut",Math.round(v))}/>
        <VF label="Reso" value={f.res} min={0} max={25} step={0.5} unit="" c="#555" onChange={v=>u("res",v)}/>
      </Sec>
      <Sec title="Drive" c="#FF9500" on={f.onDrive} onToggle={()=>tog("onDrive")}>
        <VF label="Satur." value={f.drive} min={0} max={100} step={1} unit="%" c="#FF9500" onChange={v=>u("drive",Math.round(v))}/>
        <VF label="Crush" value={f.crush} min={0} max={100} step={1} unit="%" c="#BF5AF2" onChange={v=>u("crush",Math.round(v))}/>
      </Sec>
      <Sec title="Comp" c="#5E5CE6" on={f.onComp} onToggle={()=>tog("onComp")}>
        <VF label="Thresh" value={f.cThr} min={-60} max={0} step={1} unit="dB" c="#5E5CE6" onChange={v=>u("cThr",Math.round(v))}/>
        <VF label="Ratio" value={f.cRat} min={1} max={20} step={0.5} unit=":1" c="#5E5CE6" onChange={v=>u("cRat",v)}/>
      </Sec>
      <Sec title="Reverb" c="#64D2FF" on={f.onReverb} onToggle={()=>tog("onReverb")}>
        <VF label="Mix" value={f.rMix} min={0} max={100} step={1} unit="%" c="#64D2FF" onChange={v=>u("rMix",Math.round(v))}/>
        <VF label="Decay" value={f.rDecay} min={0.1} max={5} step={0.1} unit="s" c="#64D2FF" onChange={v=>{u("rDecay",v);if(engine.ctx)engine.updateReverb(v);}}/>
      </Sec>
      <Sec title="Delay" c="#30D158" on={f.onDelay} onToggle={()=>tog("onDelay")}>
        <VF label="Mix" value={f.dMix} min={0} max={100} step={1} unit="%" c="#30D158" onChange={v=>u("dMix",Math.round(v))}/>
        {f.dSync?(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:30,flex:1}}>
            <span style={{fontSize:8,fontWeight:700,color:th.dim}}>Div</span>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              {DELAY_DIVS.map(dv=>(<button key={dv} onClick={()=>{u("dDiv",dv);u("dTime",divToSec(dv,bpm));}} style={{padding:"2px 6px",borderRadius:3,border:`1px solid ${f.dDiv===dv?"rgba(48,209,88,0.4)":th.sBorder}`,background:f.dDiv===dv?"rgba(48,209,88,0.1)":"transparent",color:f.dDiv===dv?"#30D158":th.dim,fontSize:7,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{dv}</button>))}
            </div>
          </div>
        ):(
          <VF label="Time" value={f.dTime} min={0.05} max={1} step={0.05} unit="s" c="#30D158" onChange={v=>u("dTime",v)}/>
        )}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:30}}>
          <span style={{fontSize:8,fontWeight:700,color:th.dim}}>Sync</span>
          <button onClick={()=>{const ns=!f.dSync;u("dSync",ns);if(ns)u("dTime",divToSec(f.dDiv||"1/4",bpm));}} style={{padding:"4px 8px",borderRadius:4,border:`1px solid ${f.dSync?"rgba(48,209,88,0.4)":th.sBorder}`,background:f.dSync?"rgba(48,209,88,0.12)":"transparent",color:f.dSync?"#30D158":th.dim,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{f.dSync?"ON":"OFF"}</button>
        </div>
      </Sec>
      <Sec title="Output" c="#888" on={true} onToggle={()=>{}}>
        <VF label="Volume" value={f.vol} min={0} max={100} step={1} unit="%" c="#888" onChange={v=>u("vol",Math.round(v))}/>
        <VF label="Pan" value={f.pan} min={-100} max={100} step={1} unit={f.pan===0?"C":f.pan<0?"L":"R"} c="#888" onChange={v=>u("pan",Math.round(v))}/>
      </Sec>
    </div>
  </div>);
}

// ═══ Main ═══
export default function KickAndSnare(){
  const th=THEMES.daylight;
  const [tSig,setTSig]=useState(TIME_SIGS[0]);
  const [cBeats,setCBeats]=useState(4);const [cSub,setCSub]=useState(4);
  const [useC,setUseC]=useState(false);const [grpIdx,setGrpIdx]=useState(0);
  const bSig=useC?{label:`${cBeats}/${cSub===4?4:8}`,beats:cBeats,steps:cBeats*cSub,groups:Array(cBeats).fill(cSub)}:tSig;
  const aGrp=(!useC&&tSig.groupOptions)?tSig.groupOptions[grpIdx]?.slice(0,-1)||tSig.groups:bSig.groups;
  const sig={...bSig,groups:aGrp};const STEPS=sig.steps;
  const gInfo=s=>{let a=0;for(let g=0;g<sig.groups.length;g++){if(s<a+sig.groups[g])return{gi:g,first:s===a,pos:s-a};a+=sig.groups[g];}return{gi:0,first:false,pos:0};};

  const [pBank,setPBank]=useState([mkE(16)]);const [cPat,setCPat]=useState(0);
  const pat=pBank[cPat]||mkE(STEPS);
  const setPat=u=>setPBank(p=>{const n=[...p];n[cPat]=typeof u==="function"?u(n[cPat]):u;return n;});
  const resize=ns=>{setPBank(pb=>pb.map(p=>{const np={};ALL_TRACKS.forEach(t=>{const o=p[t.id]||[];np[t.id]=Array(ns).fill(0).map((_,i)=>o[i]||0);});return np;}));setStNudge(sn=>{const np={};ALL_TRACKS.forEach(t=>{const o=sn[t.id]||[];np[t.id]=Array(ns).fill(0).map((_,i)=>o[i]||0);});return np;});setStVel(sv=>{const np={};ALL_TRACKS.forEach(t=>{const o=sv[t.id]||[];np[t.id]=Array(ns).fill(100).map((_,i)=>o[i]!==undefined?o[i]:100);});return np;});};
  const chSig=s=>{setTSig(s);setUseC(false);setGrpIdx(0);resize(s.steps);};

  const [bpm,setBpm]=useState(120);const [playing,setPlaying]=useState(false);const [cStep,setCStep]=useState(-1);
  const [swing,setSwing]=useState(0);const [muted,setMuted]=useState({});const [soloed,setSoloed]=useState(null);
  const [view,setView]=useState("sequencer");const [act,setAct]=useState(DEFAULT_ACTIVE);const [showAdd,setShowAdd]=useState(false);
  const [fxO,setFxO]=useState(null);const [smpN,setSmpN]=useState({kick:"BWJAZZ Kick (default)",snare:"BB3 Snare (default)"});
  const [fx,setFx]=useState(Object.fromEntries(TRACKS.map(t=>[t.id,defFx()])));
  const [stNudge,setStNudge]=useState(mkN(16));
  // Velocity per step: 0-100, default 100 for active steps
  const mkVel=s=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(100)]));
  const [stVel,setStVel]=useState(mkVel(16));
  const [rec,setRec]=useState(false);const [kMap,setKMap]=useState([...DEFAULT_KEYS]);const [showK,setShowK]=useState(false);
  const [showTS,setShowTS]=useState(false);const [flash,setFlash]=useState(null);
  
  const [showTpl,setShowTpl]=useState(false);const [metro,setMetro]=useState(false);
  const [metroVol,setMetroVol]=useState(70); // 0-100
  // Drag state: direction locked after 5px threshold
  const [dragInfo,setDragInfo]=useState(null); // {tid,step,axis:"h"|"v"|null}

  const atO=act.map(id=>ALL_TRACKS.find(t=>t.id===id)).filter(Boolean);
  const inact=ALL_TRACKS.filter(t=>!act.includes(t.id));

  const R=useRef({step:-1}).current;
  R.pat=pat;R.mut=muted;R.sol=soloed;R.fx=fx;R.sn=stNudge;R.vel=stVel;R.at=act;R.pb=pBank;
  R.cp=cPat;R.bpm=bpm;R.sw=swing;R.rec=rec;R.km=kMap;R.sig=sig;R.metro=metro;R.mVol=metroVol;

  // Keyboard
  const trigPad=useCallback(tid=>{
    engine.init();engine.play(tid,1,0,R.fx[tid]||defFx());
    setFlash(tid);setTimeout(()=>setFlash(null),100);
    if(R.rec&&R.step>=0){const s=R.step;setPBank(pb=>{const n=[...pb];const p={...n[R.cp]};p[tid]=[...p[tid]];p[tid][s]=1;n[R.cp]=p;return n;});}
  },[]);
  const ssRef=useRef(null);const playRef=useRef(false);
  useEffect(()=>{playRef.current=playing;},[playing]);
  useEffect(()=>{
    const down=e=>{if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")return;
      if(e.code==="Space"){e.preventDefault();ssRef.current?.();return;}
      if(e.key==="Alt"){e.preventDefault();if(playRef.current)setRec(p=>!p);return;}
      if(e.key==="ArrowLeft"){e.preventDefault();setBpm(p=>Math.max(30,p-1));return;}
      if(e.key==="ArrowRight"){e.preventDefault();setBpm(p=>Math.min(300,p+1));return;}
      if(e.key==="ArrowUp"){e.preventDefault();setBpm(p=>Math.min(300,p+5));return;}
      if(e.key==="ArrowDown"){e.preventDefault();setBpm(p=>Math.max(30,p-5));return;}
      const k=e.key.toLowerCase();const idx=R.km.indexOf(k);if(idx>=0&&idx<R.at.length){e.preventDefault();trigPad(R.at[idx]);}
    };window.addEventListener("keydown",down);return()=>window.removeEventListener("keydown",down);
  },[trigPad]);

  // Song
  

  // Metronome subdivision mode: "off"=beats only, "light"=ghost subs, "full"=loud subs
  const [metroSub,setMetroSub]=useState("off");
  R.mSub=metroSub;

  // Organic woodblock click — 3 levels: accent (beat 1), beat (group start), subdivision
  const playClk=(time,level)=>{
    // level: "accent" | "beat" | "sub"
    if(!engine.ctx)return;const ctx=engine.ctx;const mv=R.mVol/100;
    if(level==="sub"&&R.mSub==="off")return;
    const subVol=R.mSub==="light"?0.2:R.mSub==="full"?0.6:0;
    const vol=level==="accent"?1.0:level==="beat"?0.7:subVol;
    const freq=level==="accent"?2200:level==="beat"?1600:1000;
    const fDrop=level==="accent"?1100:level==="beat"?800:500;
    if(vol*mv<0.01)return;
    // Resonant body (woodblock character)
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type="sine";
    o.frequency.setValueAtTime(freq,time);
    o.frequency.exponentialRampToValueAtTime(fDrop,time+0.015);
    g.gain.setValueAtTime(vol*mv,time);
    g.gain.setValueAtTime(vol*mv*0.6,time+0.005);
    g.gain.exponentialRampToValueAtTime(0.001,time+(level==="sub"?0.03:0.06));
    o.connect(g);g.connect(engine.mg);o.start(time);o.stop(time+0.08);
    // Transient (click attack)
    if(level!=="sub"){
      const nb=ctx.createBuffer(1,ctx.sampleRate*0.004,ctx.sampleRate);
      const dd=nb.getChannelData(0);for(let i=0;i<dd.length;i++)dd[i]=(Math.random()*2-1)*Math.exp(-i*4/dd.length);
      const ns=ctx.createBufferSource();ns.buffer=nb;
      const ng=ctx.createGain();ng.gain.setValueAtTime(vol*mv*0.6,time);
      ns.connect(ng);ng.connect(engine.mg);ns.start(time);
    }
  };
  const isGS=(step,groups)=>{let a=0;for(let g=0;g<groups.length;g++){if(step===a)return{y:true,f:g===0};a+=groups[g];}return{y:false,f:false};};

  const nxtRef=useRef(0);const schRef=useRef(null);
  const schSt=useCallback((sn,time)=>{
    const p=R.pat,m=R.mut,s=R.sol,f=R.fx,nudge=R.sn,vel=R.vel,at=R.at;
    ALL_TRACKS.forEach(tr=>{if(!at.includes(tr.id))return;if(s&&s!==tr.id)return;if(m[tr.id])return;
      if(p?.[tr.id]?.[sn]){const v=(vel[tr.id]?.[sn]??100)/100;engine.play(tr.id,v,(nudge[tr.id]?.[sn]||0),f[tr.id]||defFx(),time);}
    });
  },[]);
  const schLoop=useCallback(()=>{
    if(!engine.ctx)return;const ct=engine.ctx.currentTime;const cs=R.sig;const gr=cs.groups||[cs.steps];
    let stepped=false;
    while(nxtRef.current<ct+0.1){
      R.step=(R.step+1)%cs.steps;
      const st=nxtRef.current;schSt(R.step,st);
      if(R.metro){
        const gs=isGS(R.step,gr);
        if(gs.y) playClk(st,gs.f?"accent":"beat");
        else playClk(st,"sub");
      }
      stepped=true;
      const bd=(60/R.bpm)*(cs.beats||(cs.groups?.length||4))/cs.steps;
      const sw=bd*(R.sw/100);nxtRef.current+=R.step%2===0?(bd-sw):(bd+sw);
    }
    if(stepped) setCStep(R.step); // single re-render per 25ms cycle
    schRef.current=setTimeout(schLoop,25);
  },[schSt]);

  const startStop=()=>{engine.init();if(playing){clearTimeout(schRef.current);setPlaying(false);setCStep(-1);R.step=-1;setRec(false);}else{R.step=-1;nxtRef.current=engine.ctx.currentTime+0.05;schLoop();setPlaying(true);}};
  ssRef.current=startStop;
  useEffect(()=>()=>clearTimeout(schRef.current),[]);

  // Step click: toggle step (normal) or start drag nudge
  const handleClick=(tid,step)=>setPat(p=>{const r=[...(p[tid]||[])];r[step]=r[step]?0:1;return{...p,[tid]:r};});

  // Bi-directional drag: H=nudge, V=velocity, axis locked after 5px
  // If no movement detected on release → treat as click (toggle step)
  const didDragRef=useRef(false);
  const startDrag=(tid,step,e)=>{
    e.preventDefault();
    const ac=!!pat[tid]?.[step];
    const startX=e.touches?e.touches[0].clientX:e.clientX;
    const startY=e.touches?e.touches[0].clientY:e.clientY;
    const startNudge=stNudge[tid]?.[step]||0;
    const startVel=stVel[tid]?.[step]??100;
    let axis=null;
    let moved=false;
    didDragRef.current=false;
    if(ac) setDragInfo({tid,step,axis:null});

    const mv=ev=>{
      if(!ac) return; // only drag active steps
      ev.preventDefault();
      const cx=ev.touches?ev.touches[0].clientX:ev.clientX;
      const cy=ev.touches?ev.touches[0].clientY:ev.clientY;
      const dx=cx-startX, dy=cy-startY;
      if(!axis&&(Math.abs(dx)>5||Math.abs(dy)>5)){
        axis=Math.abs(dx)>Math.abs(dy)?"h":"v";
        moved=true;didDragRef.current=true;
        setDragInfo({tid,step,axis});
      }
      if(axis==="h"){
        const nv=Math.round((startNudge+dx*0.5)/5)*5;
        setStNudge(p=>{const n={...p};const a=[...(n[tid]||Array(STEPS).fill(0))];a[step]=Math.max(-NR,Math.min(NR,nv));n[tid]=a;return n;});
      } else if(axis==="v"){
        const nv=Math.round(startVel-dy*0.8);
        setStVel(p=>{const n={...p};const a=[...(n[tid]||Array(STEPS).fill(100))];a[step]=Math.max(5,Math.min(100,nv));n[tid]=a;return n;});
      }
    };
    const up=()=>{
      setDragInfo(null);
      // No movement → toggle step on/off
      if(!moved){
        dblTap(tid,step);
        // Small delay to let dblTap check run first
        setTimeout(()=>{
          if(!didDragRef.current) handleClick(tid,step);
        },10);
      }
      window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);
      window.removeEventListener("touchmove",mv);window.removeEventListener("touchend",up);
    };
    window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);
    window.addEventListener("touchmove",mv,{passive:false});window.addEventListener("touchend",up);
  };
  // Double tap: reset both nudge and velocity
  const lastTap=useRef({});
  const dblTap=(tid,step)=>{
    const key=`${tid}-${step}`;const now=Date.now();
    if(lastTap.current[key]&&now-lastTap.current[key]<300){
      setStNudge(p=>{const n={...p};const a=[...(n[tid]||Array(STEPS).fill(0))];a[step]=0;n[tid]=a;return n;});
      setStVel(p=>{const n={...p};const a=[...(n[tid]||Array(STEPS).fill(100))];a[step]=100;n[tid]=a;return n;});
      didDragRef.current=true; // prevent toggle
      lastTap.current[key]=0;
    } else lastTap.current[key]=now;
  };

  const loadTpl=i=>{const t=TEMPLATES[i];const ts=TIME_SIGS.find(s=>s.label===t.sig)||TIME_SIGS[0];chSig(ts);const p=mkE(ts.steps);Object.keys(t.pattern).forEach(k=>{p[k]=t.pattern[k].slice(0,ts.steps);while(p[k].length<ts.steps)p[k].push(0);});setPat(p);setBpm(t.bpm);const need=ALL_TRACKS.filter(tr=>p[tr.id]?.some(v=>v)).map(tr=>tr.id);if(need.length>0)setAct(prev=>{const m=[...prev];need.forEach(id=>{if(!m.includes(id))m.push(id);});return m;});setShowTpl(false);};

  const fileRef=useRef(null);const ldRef=useRef(null);
  const ldFile=tid=>{ldRef.current=tid;if(fileRef.current){fileRef.current.value="";fileRef.current.click();}};
  const onFile=async e=>{const f=e.target.files?.[0];const tid=ldRef.current;if(!f||!tid)return;engine.init();const ok=await engine.load(tid,f);if(ok){setSmpN(p=>({...p,[tid]:f.name}));engine.play(tid,1,0,R.fx[tid]);}ldRef.current=null;};

  const pill=(on,c)=>({padding:"5px 11px",border:`1px solid ${on?c+"55":th.sBorder}`,borderRadius:6,background:on?c+"18":"transparent",color:on?c:th.dim,fontSize:9,fontWeight:700,cursor:"pointer",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"inherit"});

  return(
    <div style={{minHeight:"100vh",background:th.bg,color:th.text,fontFamily:"'JetBrains Mono','SF Mono','Fira Code',monospace",overflow:"auto"}}>
      <input type="file" accept="audio/*" ref={fileRef} onChange={onFile} style={{display:"none"}}/>
      <div style={{maxWidth:960,margin:"0 auto",padding:"16px 12px"}}>
        {/* Header with integrated drummer */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,padding:"10px 0",borderBottom:`1px solid ${th.sBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,borderRadius:8,background:"linear-gradient(135deg,#FF2D55,#FF9500)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:"#fff",boxShadow:"0 0 20px rgba(255,45,85,0.3)"}}>K</div>
            <div>
              <div style={{fontSize:15,fontWeight:800,letterSpacing:"0.08em",background:"linear-gradient(90deg,#FF2D55,#FF9500,#FFD60A)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>KICK & SNARE</div>
              <div style={{fontSize:8,letterSpacing:"0.3em",color:th.dim}}>v8.0</div>
            </div>
          </div>
          {/* Animated drummer mascot — always visible in header */}
          {(()=>{
            const isAct=id=>act.includes(id)&&!muted[id];
            const hK=playing&&isAct("kick")&&!!pat.kick?.[cStep];
            const hS=playing&&isAct("snare")&&!!pat.snare?.[cStep];
            const hH=playing&&isAct("hihat")&&!!pat.hihat?.[cStep];
            const hR=playing&&(isAct("ride")&&!!pat.ride?.[cStep]||isAct("crash")&&!!pat.crash?.[cStep]);
            const hT=playing&&isAct("tom")&&!!pat.tom?.[cStep];
            const hC=playing&&isAct("clap")&&!!pat.clap?.[cStep];
            const lHit=hS||hH||hC;
            const rHit=hR||hT;
            const lA=hS?-55:hH?-30:hC?-45:5;
            const rA=hR?-60:hT?-30:5;
            const ac=playing?"#FF9500":"#bbb";
            const hi="#FF2D55";
            const bob=playing?Math.sin((cStep||0)*0.7)*2:0;
            return(
              <svg viewBox="0 0 110 52" width="110" height="52" style={{flexShrink:0,overflow:"visible",willChange:"contents"}}>
                {/* === DRUM KIT === */}
                {/* Hi-hat stand + cymbals */}
                <line x1="14" y1="16" x2="14" y2="50" stroke="#ccc" strokeWidth="0.7"/>
                <ellipse cx="14" cy="16" rx="7" ry="1.8" fill={hH?"#fff5e0":"none"} stroke={hH?hi:"#ccc"} strokeWidth={hH?1.5:0.7}/>
                <ellipse cx="14" cy={hH?"14.5":"15"} rx="7" ry="1.8" fill="none" stroke={hH?hi:"#ccc"} strokeWidth={hH?1.5:0.7}
                  style={{transition:"cy 0.04s"}}/>
                {/* Snare drum */}
                <rect x="22" y="30" width="16" height="7" rx="3" fill={hS?"#fff0e8":"none"} stroke={hS?hi:"#ccc"} strokeWidth={hS?1.5:0.7}/>
                <line x1="24" y1="31" x2="24" y2="36" stroke="#ddd" strokeWidth="0.4"/>
                <line x1="28" y1="31" x2="28" y2="36" stroke="#ddd" strokeWidth="0.4"/>
                <line x1="32" y1="31" x2="32" y2="36" stroke="#ddd" strokeWidth="0.4"/>
                <line x1="36" y1="31" x2="36" y2="36" stroke="#ddd" strokeWidth="0.4"/>
                {/* Kick drum */}
                <ellipse cx="55" cy="42" rx="12" ry="8" fill={hK?"#ffe8e8":"none"} stroke={hK?hi:"#ccc"} strokeWidth={hK?1.8:0.7}/>
                <ellipse cx="55" cy="42" rx="6" ry="4" fill="none" stroke={hK?hi:"#ddd"} strokeWidth="0.5"/>
                {/* Tom */}
                <ellipse cx="52" cy="25" rx="7" ry="3" fill={hT?"#fff0e8":"none"} stroke={hT?hi:"#ccc"} strokeWidth={hT?1.2:0.6}/>
                {/* Ride/crash cymbal */}
                <line x1="78" y1="12" x2="78" y2="50" stroke="#ccc" strokeWidth="0.7"/>
                <ellipse cx="78" cy="12" rx="9" ry="2" fill={hR?"#fffbe8":"none"} stroke={hR?"#FFD60A":"#ccc"} strokeWidth={hR?1.5:0.7}/>
                {/* Floor tom */}
                <ellipse cx="72" cy="40" rx="7" ry="4" fill="none" stroke="#ddd" strokeWidth="0.5"/>
                
                {/* === DRUMMER === */}
                <g style={{transform:`translateY(${bob}px)`,transition:"transform 0.08s"}}>
                  {/* Stool */}
                  <ellipse cx="44" cy="38" rx="6" ry="2" fill="none" stroke="#bbb" strokeWidth="0.8"/>
                  <line x1="38" y1="38" x2="36" y2="50" stroke="#bbb" strokeWidth="0.7"/>
                  <line x1="50" y1="38" x2="52" y2="50" stroke="#bbb" strokeWidth="0.7"/>
                  
                  {/* Legs */}
                  <path d="M41,37 Q37,43 33,49" fill="none" stroke={ac} strokeWidth="2" strokeLinecap="round"/>
                  {/* Right leg — kicks */}
                  <g style={{transform:`rotate(${hK?-10:0}deg)`,transformOrigin:"47px 37px",transition:"transform 0.04s"}}>
                    <path d="M47,37 Q51,43 55,49" fill="none" stroke={hK?hi:ac} strokeWidth={hK?2.5:2} strokeLinecap="round"/>
                    <line x1="55" y1="49" x2="60" y2="48" stroke={hK?hi:ac} strokeWidth={hK?2.5:2} strokeLinecap="round"/>
                  </g>
                  
                  {/* Torso */}
                  <path d={`M44,18 Q${43+bob*0.3},28 44,36`} fill="none" stroke={ac} strokeWidth="2.2" strokeLinecap="round"/>
                  
                  {/* Left arm + stick */}
                  <g style={{transform:`rotate(${lA}deg)`,transformOrigin:"38px 20px",transition:"transform 0.05s ease-out"}}>
                    <path d="M44,20 Q38,24 30,28" fill="none" stroke={lHit?hi:ac} strokeWidth={lHit?2.5:2} strokeLinecap="round"/>
                    {/* Drumstick */}
                    <line x1="30" y1="28" x2="19" y2="22" stroke={lHit?hi:ac} strokeWidth={lHit?2.2:1.5} strokeLinecap="round"/>
                    {/* Stick tip glow */}
                    {lHit&&<circle cx="19" cy="22" r="2" fill={hi} opacity="0.6"/>}
                  </g>
                  
                  {/* Right arm + stick */}
                  <g style={{transform:`rotate(${-rA}deg)`,transformOrigin:"50px 20px",transition:"transform 0.05s ease-out"}}>
                    <path d="M44,20 Q50,24 58,28" fill="none" stroke={rHit?hi:ac} strokeWidth={rHit?2.5:2} strokeLinecap="round"/>
                    <line x1="58" y1="28" x2="69" y2="22" stroke={rHit?hi:ac} strokeWidth={rHit?2.2:1.5} strokeLinecap="round"/>
                    {rHit&&<circle cx="69" cy="22" r="2" fill={hi} opacity="0.6"/>}
                  </g>
                  
                  {/* Head */}
                  <g style={{transform:`rotate(${playing?Math.sin((cStep||0)*0.6)*4:0}deg)`,transformOrigin:"44px 12px",transition:"transform 0.08s"}}>
                    <circle cx="44" cy="10" r="6" fill="none" stroke={ac} strokeWidth="2"/>
                    {/* Sunglasses — cool! */}
                    <line x1="39" y1="9" x2="49" y2="9" stroke={ac} strokeWidth="1.2"/>
                    <rect x="39" y="8" width="4" height="3" rx="1" fill={playing?"#333":"#aaa"}/>
                    <rect x="45" y="8" width="4" height="3" rx="1" fill={playing?"#333":"#aaa"}/>
                    {/* Smile when playing */}
                    {playing&&<path d="M41,13 Q44,15 47,13" fill="none" stroke={ac} strokeWidth="0.8"/>}
                    {/* Headphones */}
                    <path d="M38,6 Q44,0 50,6" fill="none" stroke={ac} strokeWidth="1.5" strokeLinecap="round"/>
                    <rect x="36" y="5" width="3" height="5" rx="1.5" fill={ac} opacity="0.5"/>
                    <rect x="49" y="5" width="3" height="5" rx="1.5" fill={ac} opacity="0.5"/>
                  </g>
                </g>
                
                {/* Impact bursts */}
                {hS&&<><line x1="22" y1="28" x2="19" y2="25" stroke={hi} strokeWidth="1" opacity="0.6"/><line x1="38" y1="28" x2="41" y2="25" stroke={hi} strokeWidth="1" opacity="0.6"/></>}
                {hK&&<><line x1="55" y1="32" x2="55" y2="28" stroke={hi} strokeWidth="1" opacity="0.5"/><line x1="48" y1="35" x2="45" y2="33" stroke={hi} strokeWidth="0.8" opacity="0.4"/><line x1="62" y1="35" x2="65" y2="33" stroke={hi} strokeWidth="0.8" opacity="0.4"/></>}
                {hR&&<><line x1="74" y1="9" x2="72" y2="5" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/><line x1="82" y1="9" x2="84" y2="5" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/><line x1="78" y1="9" x2="78" y2="4" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/></>}
                {hH&&<><line x1="10" y1="12" x2="8" y2="8" stroke={hi} strokeWidth="0.8" opacity="0.5"/><line x1="18" y1="12" x2="20" y2="8" stroke={hi} strokeWidth="0.8" opacity="0.5"/></>}
              </svg>
            );
          })()}
          <div style={{display:"flex",gap:3}}>
            {["sequencer","pads"].map(v=>(<button key={v} onClick={()=>setView(v)} style={pill(view===v,v==="song"?"#BF5AF2":"#FF2D55")}>{v}</button>))}
          </div>
        </div>

        {/* Transport */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"10px 12px",borderRadius:12,background:th.surface,border:`1px solid ${th.sBorder}`,flexWrap:"wrap"}}>
          <button onClick={startStop} style={{width:40,height:40,borderRadius:"50%",border:"none",background:playing?"linear-gradient(135deg,#FF2D55,#FF375F)":"linear-gradient(135deg,#30D158,#34C759)",color:"#fff",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:playing?"0 0 20px rgba(255,45,85,0.4)":"0 0 20px rgba(48,209,88,0.4)"}}>{playing?"■":"▶"}</button>
          <button onClick={()=>{if(playing)setRec(!rec);}} style={{width:32,height:32,borderRadius:"50%",border:rec?"2px solid #FF2D55":`2px solid ${th.sBorder}`,background:rec?"rgba(255,45,85,0.2)":"transparent",color:rec?"#FF2D55":th.dim,fontSize:11,cursor:playing?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",opacity:playing?1:0.3,animation:rec?"rb 0.8s infinite":"none"}}>●</button>
          <style>{`@keyframes rb{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
          <div style={{flex:"1 1 80px",minWidth:70}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
              <span style={{fontSize:8,color:th.dim,letterSpacing:"0.15em"}}>BPM</span>
              <span style={{fontSize:20,fontWeight:900,color:"#FF9500"}}>{bpm}</span>
            </div>
            <input type="range" min={30} max={300} value={bpm} onChange={e=>setBpm(Number(e.target.value))} style={{width:"100%",height:4,accentColor:"#FF9500"}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
            <span style={{fontSize:8,color:th.dim}}>SWING</span>
            <span style={{fontSize:11,fontWeight:700,color:"#5E5CE6"}}>{swing}%</span>
            <input type="range" min={0} max={100} value={swing} onChange={e=>setSwing(Number(e.target.value))} style={{width:55,height:3,accentColor:"#5E5CE6"}}/>
          </div>
          <button onClick={()=>setShowTS(!showTS)} style={pill(showTS,"#30D158")}>{sig.label}</button>
          {/* Metro: tap=toggle, drag vertical=volume */}
          {(()=>{
            const mDragRef=useRef(false);
            const onMDown=e=>{
              e.preventDefault();
              const startY=e.touches?e.touches[0].clientY:e.clientY;
              const startVol=metroVol;let moved=false;
              const mv=ev=>{
                ev.preventDefault();
                const cy=ev.touches?ev.touches[0].clientY:ev.clientY;
                const dy=cy-startY;
                if(Math.abs(dy)>5){moved=true;setMetroVol(Math.max(0,Math.min(100,Math.round(startVol-dy*0.8))));}
              };
              const up=()=>{
                if(!moved)setMetro(p=>!p);
                window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);
                window.removeEventListener("touchmove",mv);window.removeEventListener("touchend",up);
              };
              window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);
              window.addEventListener("touchmove",mv,{passive:false});window.addEventListener("touchend",up);
            };
            return(<div onMouseDown={onMDown} onTouchStart={onMDown}
              style={{...pill(metro,"#FF9500"),position:"relative",overflow:"hidden",touchAction:"none",userSelect:"none",cursor:"pointer"}}>
              {/* Volume fill background */}
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:`${metroVol}%`,background:metro?"rgba(255,149,0,0.12)":"transparent",borderRadius:6,transition:"height 0.15s",pointerEvents:"none"}}/>
              <span style={{position:"relative",zIndex:1}}>{metro?"METRO":"METRO"} {metroVol}%</span>
            </div>);
          })()}
          <button onClick={()=>setShowK(!showK)} style={pill(showK,"#FFD60A")}>⌨</button>
          {metro&&<button onClick={()=>setMetroSub(p=>p==="off"?"light":p==="light"?"full":"off")} style={pill(metroSub!=="off","#FF9500")}>SUB {metroSub==="off"?"OFF":metroSub==="light"?"◦":"●"}</button>}
          
        </div>

        {/* Time sig */}
        {showTS&&(<div style={{marginBottom:10,padding:10,borderRadius:10,background:th.surface,border:`1px solid ${th.sBorder}`}}>
          <div style={{fontSize:9,fontWeight:700,color:"#30D158",marginBottom:8}}>TIME SIGNATURE</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
            {TIME_SIGS.map(s=>(<button key={s.label} onClick={()=>chSig(s)} style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${!useC&&tSig.label===s.label?"rgba(48,209,88,0.4)":th.sBorder}`,background:!useC&&tSig.label===s.label?"rgba(48,209,88,0.1)":"transparent",color:!useC&&tSig.label===s.label?"#30D158":th.dim,fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>{s.label}</button>))}
          </div>
          {!useC&&tSig.groupOptions&&(<div style={{marginBottom:8}}>
            <div style={{fontSize:8,color:th.dim,marginBottom:4}}>BEAT GROUPING</div>
            <div style={{display:"flex",gap:4}}>
              {tSig.groupOptions.map((o,i)=>(<button key={i} onClick={()=>setGrpIdx(i)} style={{padding:"5px 12px",borderRadius:5,border:`1px solid ${grpIdx===i?"rgba(48,209,88,0.4)":th.sBorder}`,background:grpIdx===i?"rgba(48,209,88,0.1)":"transparent",color:grpIdx===i?"#30D158":th.dim,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{o[o.length-1]}</button>))}
            </div>
          </div>)}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:9,color:th.dim}}>CUSTOM:</span>
            <input type="number" min={1} max={15} value={cBeats} onChange={e=>setCBeats(Math.max(1,Math.min(15,Number(e.target.value))))} style={{width:36,height:26,textAlign:"center",borderRadius:4,border:`1px solid ${th.sBorder}`,background:"transparent",color:th.text,fontSize:12,fontWeight:800,fontFamily:"inherit"}}/>
            <span style={{color:th.dim}}>/</span>
            {[2,4].map(s=>(<button key={s} onClick={()=>setCSub(s)} style={{padding:"4px 10px",borderRadius:4,border:`1px solid ${cSub===s&&useC?"rgba(48,209,88,0.4)":th.sBorder}`,background:cSub===s&&useC?"rgba(48,209,88,0.1)":"transparent",color:cSub===s?"#30D158":th.dim,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{s===2?"8":"4"}</button>))}
            <button onClick={()=>{setUseC(true);resize(cBeats*cSub);}} style={{padding:"4px 12px",borderRadius:4,border:"none",background:"rgba(48,209,88,0.15)",color:"#30D158",fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>APPLY</button>
          </div>
        </div>)}

        {/* Key config */}
        {showK&&(<div style={{marginBottom:10,padding:10,borderRadius:10,background:th.surface,border:`1px solid ${th.sBorder}`}}>
          <div style={{fontSize:9,fontWeight:700,color:"#FFD60A",marginBottom:8}}>KEYBOARD MAPPING — Space=Play · Alt=Rec · ←→=BPM</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {atO.map((tr,i)=>(<div key={tr.id} style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:9,color:tr.color,fontWeight:700}}>{tr.icon}{tr.label}</span>
              <input value={kMap[i]||""} onChange={e=>{const v=e.target.value.slice(-1).toLowerCase();setKMap(p=>{const n=[...p];n[i]=v;return n;});}} style={{width:28,height:24,textAlign:"center",borderRadius:4,border:`1px solid ${th.sBorder}`,background:"transparent",color:"#FFD60A",fontSize:12,fontWeight:800,fontFamily:"inherit"}}/>
            </div>))}
          </div>
        </div>)}

        {/* Pattern bank */}
        <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:8,padding:"5px 10px",borderRadius:10,background:th.surface,border:`1px solid ${th.sBorder}`}}>
          <span style={{fontSize:8,color:th.dim}}>PAT</span>
          {pBank.map((_,i)=>(<button key={i} onClick={()=>{setCPat(i);R.pat=pBank[i];}} style={{width:28,height:24,borderRadius:5,cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:800,border:`1px solid ${cPat===i?SEC_COL[i%8]+"66":th.sBorder}`,background:cPat===i?SEC_COL[i%8]+"20":"transparent",color:cPat===i?SEC_COL[i%8]:th.dim}}>{i+1}</button>))}
          {pBank.length<MAX_PAT&&<button onClick={()=>{setPBank(p=>[...p,mkE(STEPS)]);setCPat(pBank.length);}} style={{width:24,height:24,border:`1px dashed ${th.sBorder}`,borderRadius:5,background:"transparent",color:th.dim,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>}
          {pBank.length>1&&<button onClick={()=>{setPBank(p=>p.filter((_,j)=>j!==cPat));if(cPat>0)setCPat(cPat-1);}} style={{padding:"2px 6px",border:"1px solid rgba(255,55,95,0.2)",borderRadius:5,background:"transparent",color:"#FF375F",fontSize:8,cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>DEL</button>}
        </div>

        {/* Beat labels */}
        {view==="sequencer"&&(<div style={{display:"flex",gap:0,marginBottom:2,paddingLeft:120,paddingRight:82}}>
          {Array(STEPS).fill(0).map((_,step)=>{const gi=gInfo(step);return(<div key={step} style={{flex:1,marginLeft:gi.first&&step>0?4:1,textAlign:"center",fontSize:9,fontWeight:700,color:th.dim}}>{gi.first?gi.gi+1:""}</div>);})}
        </div>)}

        {/* ═══ SEQUENCER ═══ */}
        {view==="sequencer"&&(<>
          <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {atO.map((track,tIdx)=>{
              const isM=muted[track.id],isS=soloed===track.id,aud=soloed?isS:!isM;
              const hasSmp=!!smpN[track.id];const hasFx=fx[track.id]&&(fx[track.id].drive>0||fx[track.id].pitch!==0||fx[track.id].cut<20000||fx[track.id].onReverb||fx[track.id].onDelay);
              const isFO=fxO===track.id;
              return(<div key={track.id}>
                <div style={{display:"flex",alignItems:"center",gap:3,opacity:aud?1:0.3,padding:"3px 0"}}>
                  <div style={{width:116,display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                    <span style={{fontSize:12,color:track.color}}>{track.icon}</span>
                    <span style={{fontSize:10,fontWeight:700,color:track.color,minWidth:34}}>{track.label}</span>
                    <button onClick={()=>setMuted(p=>({...p,[track.id]:!p[track.id]}))} style={{width:18,height:16,border:"none",borderRadius:3,background:isM?"rgba(255,55,95,0.25)":th.btn,color:isM?"#FF375F":th.faint,fontSize:7,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>M</button>
                    <button onClick={()=>setSoloed(p=>p===track.id?null:track.id)} style={{width:18,height:16,border:"none",borderRadius:3,background:isS?"rgba(255,214,10,0.25)":th.btn,color:isS?"#FFD60A":th.faint,fontSize:7,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>S</button>
                  </div>
                  {/* Steps — drag H=nudge V=velocity */}
                  <div style={{display:"flex",gap:0,flex:1}}>
                    {Array(STEPS).fill(0).map((_,step)=>{
                      const ac=!!pat[track.id]?.[step];const isCur=cStep===step;
                      const gi=gInfo(step);const odd=gi.gi%2===1;
                      const sn=stNudge[track.id]?.[step]||0;
                      const vel=(stVel[track.id]?.[step]??100);
                      const isDrag=dragInfo?.tid===track.id&&dragInfo?.step===step;
                      const dragAxis=isDrag?dragInfo.axis:null;
                      return(<div key={step}
                        onMouseDown={e=>startDrag(track.id,step,e)}
                        onTouchStart={e=>startDrag(track.id,step,e)}
                        style={{
                          flex:1,aspectRatio:"1",borderRadius:3,cursor:ac?"grab":"pointer",
                          position:"relative",minWidth:0,overflow:"hidden",
                          marginLeft:gi.first&&step>0?4:1,touchAction:"none",userSelect:"none",
                          background:isCur?th.cursor:odd?th.stepAlt:th.stepOff,
                          boxShadow:ac&&isCur?`0 0 10px ${track.color}66`:"none",
                          transform:isDrag?"scale(1.15)":ac&&isCur?"scale(1.08)":"scale(1)",
                          transition:isDrag?"none":"all 0.08s",
                          border:isDrag?`1px solid ${dragAxis==="v"?"#FFD60A":dragAxis==="h"?"#64D2FF":"transparent"}`:"1px solid transparent",
                        }}>
                        {/* Velocity fill — height represents velocity */}
                        {ac&&<div style={{
                          position:"absolute",bottom:0,left:0,right:0,
                          height:`${vel}%`,borderRadius:3,
                          background:`${track.color}${isCur?"dd":"88"}`,
                          transition:isDrag?"none":"height 0.15s",
                        }}/>}
                        {/* Nudge offset line */}
                        {ac&&sn!==0&&<div style={{position:"absolute",top:0,bottom:0,left:`${50+sn*0.4}%`,width:2,borderRadius:1,background:track.color,opacity:0.6,transform:"translateX(-50%)",pointerEvents:"none"}}/>}
                        {/* Velocity % during drag */}
                        {isDrag&&dragAxis==="v"&&<span style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:7,fontWeight:800,color:"#fff",textShadow:"0 0 3px rgba(0,0,0,0.5)",pointerEvents:"none",zIndex:2}}>{vel}%</span>}
                        {/* Nudge ms during drag */}
                        {isDrag&&dragAxis==="h"&&<span style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:7,fontWeight:800,color:"#fff",textShadow:"0 0 3px rgba(0,0,0,0.5)",pointerEvents:"none",zIndex:2}}>{sn>0?"+":""}{sn}</span>}
                        {/* Nudge indicator (when not dragging) */}
                        {ac&&sn!==0&&!isDrag&&<span style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",fontSize:5,color:sn<0?"#30D158":"#FF9500",fontWeight:700,lineHeight:1,pointerEvents:"none",zIndex:1}}>{sn>0?"+":""}{sn}</span>}
                      </div>);
                    })}
                  </div>
                  <div style={{display:"flex",gap:2,marginLeft:2,flexShrink:0}}>
                    <button onClick={()=>setPat(p=>({...p,[track.id]:Array(STEPS).fill(0)}))} style={{width:20,height:20,border:"none",borderRadius:3,background:th.btn,color:th.dim,fontSize:7,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>CLR</button>
                    <button onClick={()=>ldFile(track.id)} style={{width:20,height:20,border:"none",borderRadius:3,background:hasSmp?"rgba(255,149,0,0.2)":th.btn,color:hasSmp?"#FF9500":th.dim,fontSize:7,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>♪</button>
                    <button onClick={()=>setFxO(isFO?null:track.id)} style={{width:20,height:20,border:"none",borderRadius:3,background:isFO?"rgba(191,90,242,0.25)":hasFx?"rgba(191,90,242,0.12)":th.btn,color:isFO||hasFx?"#BF5AF2":th.dim,fontSize:7,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>FX</button>
                    {act.length>1&&<button onClick={()=>{setAct(p=>p.filter(x=>x!==track.id));if(fxO===track.id)setFxO(null);}} style={{width:20,height:20,border:"none",borderRadius:3,background:"rgba(255,55,95,0.08)",color:"#FF375F",fontSize:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>}
                  </div>
                </div>
                {isFO&&<SSL tid={track.id} color={track.color} fx={fx} setFx={setFx} bpm={bpm} onClose={()=>setFxO(null)} theme="daylight"/>}
              </div>);
            })}
          </div>
          {inact.length>0&&<div style={{marginTop:6}}>
            {!showAdd?<button onClick={()=>setShowAdd(true)} style={{width:"100%",padding:"8px",border:`1px dashed ${th.sBorder}`,borderRadius:8,background:"transparent",color:th.dim,fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>+ ADD TRACK</button>:(
              <div style={{padding:"8px 10px",borderRadius:8,background:th.surface,border:`1px solid ${th.sBorder}`,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                {inact.map(t=>(<button key={t.id} onClick={()=>{setAct(p=>[...p,t.id]);setShowAdd(false);}} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.color}33`,background:t.color+"10",color:t.color,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{t.icon} {t.label}</button>))}
                <button onClick={()=>setShowAdd(false)} style={{marginLeft:"auto",padding:"4px 8px",border:"none",borderRadius:4,background:"rgba(255,55,95,0.1)",color:"#FF375F",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>CANCEL</button>
              </div>)}
          </div>}
        </>)}

        {/* ═══ PADS ═══ */}
        {view==="pads"&&(<div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(4,atO.length)},1fr)`,gap:8,padding:"8px 0"}}>
          {atO.map((track,i)=>(<button key={track.id} onPointerDown={()=>trigPad(track.id)} style={{aspectRatio:"1",borderRadius:12,background:flash===track.id?track.color+"44":`linear-gradient(145deg,${track.color}22,${track.color}08)`,border:`1px solid ${track.color}33`,color:track.color,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer",fontFamily:"inherit",boxShadow:flash===track.id?`0 0 30px ${track.color}44`:`0 0 20px ${track.color}11`,transition:"all 0.08s"}}>
            <span style={{fontSize:24}}>{track.icon}</span>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em"}}>{track.label}</span>
            <span style={{fontSize:9,color:th.dim,border:`1px solid ${th.sBorder}`,borderRadius:3,padding:"1px 5px"}}>{kMap[i]?.toUpperCase()||""}</span>
          </button>))}
        </div>)}

        

        {/* Actions */}
        {view==="sequencer"&&(<div style={{display:"flex",gap:5,marginTop:12,padding:"8px 12px",borderRadius:12,background:th.surface,border:`1px solid ${th.sBorder}`,justifyContent:"center",flexWrap:"wrap"}}>
          {[{l:"RANDOM",a:()=>atO.forEach(t=>setPat(p=>({...p,[t.id]:Array(STEPS).fill(0).map(()=>Math.random()>0.7?1:0)}))),c:"#BF5AF2"},{l:"CLEAR",a:()=>setPat(mkE(STEPS)),c:"#FF375F"},{l:"½×",a:()=>setBpm(Math.max(30,Math.round(bpm/2))),c:"#64D2FF"},{l:"2×",a:()=>setBpm(Math.min(300,bpm*2)),c:"#30D158"}].map(b=><button key={b.l} onClick={b.a} style={{padding:"6px 12px",border:`1px solid ${b.c}33`,borderRadius:8,background:"transparent",color:b.c,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{b.l}</button>)}
          <button onClick={()=>setShowTpl(!showTpl)} style={pill(showTpl,"#FFD60A")}>TEMPLATES</button>
        </div>)}
        {showTpl&&(<div style={{marginTop:8,padding:10,borderRadius:10,background:th.surface,border:`1px solid ${th.sBorder}`,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
          {TEMPLATES.map((t,i)=>(<button key={i} onClick={()=>loadTpl(i)} style={{padding:"8px 10px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",textAlign:"left",border:`1px solid ${th.sBorder}`,background:"transparent",color:th.text,fontSize:10,fontWeight:600}}>
            <div style={{color:"#FFD60A"}}>{t.name}</div><div style={{fontSize:8,color:th.dim,marginTop:2}}>{t.bpm} BPM · {t.sig}</div>
          </button>))}
        </div>)}

        {/* Step viz */}
        <div style={{display:"flex",gap:0,marginTop:14,justifyContent:"center"}}>
          {Array(STEPS).fill(0).map((_,i)=>{const gi=gInfo(i);return(<div key={i} style={{width:5,height:cStep===i?18:gi.first?8:5,borderRadius:3,marginLeft:gi.first&&i>0?6:2,background:cStep===i?"linear-gradient(180deg,#FF2D55,#FF9500)":gi.first?th.btnH:th.btn,transition:"all 0.1s",boxShadow:cStep===i?"0 0 8px rgba(255,45,85,0.5)":"none"}}/>);})}
        </div>
        <div style={{textAlign:"center",marginTop:14,padding:"8px 0",borderTop:`1px solid ${th.sBorder}`,fontSize:8,color:th.faint}}>KICK & SNARE v8 — Drag ↔ nudge · Drag ↕ velocity · Double-tap reset</div>
      </div>
    </div>
  );
}

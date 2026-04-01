import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { DEFAULT_SAMPLES, b64toAB } from "./defaultSamples";
import { THEMES } from "./theme.js";
import { DrumSVG } from "./drumSVG.tsx";
import TransportBar from "./components/TransportBar.jsx";
import PatternBank from "./components/PatternBank.jsx";
import TrackRow from "./components/TrackRow.jsx";
import LooperPanel from "./components/LooperPanel.jsx";
import { useAppState } from "./hooks/useAppState.js";
import { SEQUENCER_TEMPLATES } from "./sequencerTemplates.ts";
import { EUCLID_TEMPLATES, type EuclidTemplate } from "./euclidTemplates.ts";

// ── TypeScript types ─────────────────────────────────────────────────────────
/** All built-in drum track IDs plus any custom track string. */
type TrackId = "kick" | "snare" | "hihat" | "clap" | "tom" | "ride" | "crash" | "perc" | string;

/** Pattern data: each key is a TrackId, value is an array of 0/1 step states. */
type StepMap = Record<TrackId, number[]>;

/** Per-track FX + synthesis shape configuration object. */
type FxConfig = {
  vol: number; pan: number; pitch: number; onPitch: boolean;
  fType: string; cut: number; res: number;
  drive: number; onDrive: boolean;
  crush: number; cThr: number; cRat: number; onComp: boolean;
  rMix: number; rDecay: number; onReverb: boolean;
  dMix: number; dTime: number; dSync: boolean; dDiv: string; onDelay: boolean;
  onFilter: boolean;
  sDec: number; sTune: number; sPunch: number; sSnap: number; sBody: number; sTone: number;
  [key: string]: unknown;
};

/** Resolved theme object (dark or daylight). */
type Theme = typeof THEMES.dark;
// ────────────────────────────────────────────────────────────────────────────

const TIME_SIGS=[
  {label:"4/4",beats:4,steps:16,groups:[4,4,4,4],accents:[0],stepDiv:4},
  {label:"4/4 ×2",beats:8,steps:32,groups:[4,4,4,4,4,4,4,4],accents:[0,4],stepDiv:4},
  {label:"3/4",beats:3,steps:12,groups:[4,4,4],accents:[0],stepDiv:4},
  {label:"6/8",beats:2,steps:12,groups:[6,6],accents:[0],stepDiv:4,subDiv:2},
  {label:"12/8",beats:4,steps:24,groups:[6,6,6,6],accents:[0],stepDiv:4,subDiv:2},
  {label:"5/4",beats:5,steps:20,groups:[4,4,4,4,4],accents:[0,3],stepDiv:4},
  {label:"5/8",beats:2,steps:10,groups:[6,4],groupOptions:[[6,4,"3+2"],[4,6,"2+3"]],accents:[0],stepDiv:4},
  {label:"7/8",beats:3,steps:14,groups:[4,4,6],groupOptions:[[4,4,6,"2+2+3"],[6,4,4,"3+2+2"],[4,6,4,"2+3+2"]],accents:[0],stepDiv:4},
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
const DEFAULT_KEY_MAP={kick:"q",snare:"s",hihat:"d",clap:"f",tom:"g",ride:"h",crash:"j",perc:"k"};
const DEFAULT_MIDI_NOTES={kick:36,snare:38,hihat:42,clap:39,tom:45,ride:51,crash:49,perc:47,__play__:246,__rec__:247,__tap__:null,__bpm__:null,__swing__:null}; // CC = value+128 (__play__=CC118 __rec__=CC119)
const NOTE_NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const midiNoteName=n=>n==null?"—":n>=128?`CC${n-128}`:NOTE_NAMES[n%12]+(Math.floor(n/12)-1);
const MAX_PAT=8,NR=50;
const SEC_COL=["#FF2D55","#FF9500","#30D158","#5E5CE6","#BF5AF2","#64D2FF","#FFD60A","#FF375F"];
const mkE=s=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(0)]));
const mkN=s=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(0)]));
const mkV=s=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(100)]));
const mkP=s=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(100)]));
const mkR=s=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(1)]));


const DEFAULT_FX = Object.freeze({
  pitch:0,fType:"lowpass",cut:20000,res:0,drive:0,crush:0,cThr:-24,cRat:1,
  rMix:0,rDecay:1.5,dMix:0,dTime:0.25,dSync:false,dDiv:"1/4",vol:80,pan:0,
  onPitch:true,onFilter:true,onDrive:true,onComp:true,onReverb:false,onDelay:false,
  // SHAPE — synthesis timbre params (multipliers around 1.0)
  sDec:1.0,  // decay length ×
  sTune:1.0, // body frequency ×
  sPunch:1.0,// transient/attack amplitude ×
  sSnap:1.0, // noise/snap amount ×
  sBody:1.0, // sine body amplitude ×
  sTone:1.0, // brightness/high-freq ×
});

// ── Drum Kits — real samples + synthesis fallback ─────────────────────────────
// samples: partial map of track-id → local URL (kick/snare/hihat from pre-loaded packs)
// shape:   _syn multipliers applied when no real sample is available, OR pre-rendered if ctx ready
const DRUM_KITS=[
  {id:"808",      name:"808 Classic",  icon:"🔴",
   samples:{} as Record<string,string>,
   shape:{sDec:1,   sTune:1,    sPunch:1,   sSnap:1,   sBody:1,   sTone:1   }},
  {id:"trap",     name:"Trap",         icon:"⬡",
   samples:{} as Record<string,string>,
   shape:{sDec:2.8, sTune:0.52, sPunch:2.2, sSnap:0.3, sBody:2,   sTone:0.75}},
  {id:"jazz",     name:"Jazz Kit",     icon:"🎷",
   samples:{kick:`${import.meta.env.BASE_URL}samples/kit3/kick.mp3`,snare:`${import.meta.env.BASE_URL}samples/kit3/snare.mp3`,hihat:`${import.meta.env.BASE_URL}samples/kit3/hihat.mp3`},
   shape:{sDec:2.2, sTune:1.1,  sPunch:0.5, sSnap:2.5, sBody:0.65,sTone:0.85}},
  {id:"lofi",     name:"Lo-Fi",        icon:"📼",
   samples:{kick:`${import.meta.env.BASE_URL}samples/cr78/kick.mp3`,snare:`${import.meta.env.BASE_URL}samples/cr78/snare.mp3`,hihat:`${import.meta.env.BASE_URL}samples/cr78/hihat.mp3`},
   shape:{sDec:0.8, sTune:0.9,  sPunch:0.7, sSnap:0.5, sBody:1.15,sTone:0.65}},
  {id:"electro",  name:"Electronic",   icon:"⚡",
   samples:{} as Record<string,string>,
   shape:{sDec:0.3, sTune:1.5,  sPunch:2.8, sSnap:2.8, sBody:0.7, sTone:1.7 }},
  {id:"acoustic", name:"Acoustic",     icon:"🥁",
   samples:{kick:`${import.meta.env.BASE_URL}samples/kit8/kick.mp3`,snare:`${import.meta.env.BASE_URL}samples/kit8/snare.mp3`,hihat:`${import.meta.env.BASE_URL}samples/kit8/hihat.mp3`},
   shape:{sDec:1.5, sTune:1.08, sPunch:0.85,sSnap:1.6, sBody:1.5, sTone:1   }},
  {id:"afrobeat", name:"Afrobeat",     icon:"🌍",
   samples:{} as Record<string,string>,
   shape:{sDec:0.6, sTune:1.05, sPunch:1.4, sSnap:2.0, sBody:1.1, sTone:1.3 }},
  {id:"latin",    name:"Latin",        icon:"🔥",
   samples:{} as Record<string,string>,
   shape:{sDec:0.45,sTune:1.25, sPunch:1.6, sSnap:2.3, sBody:0.75,sTone:1.5 }},
];
type DrumKit=typeof DRUM_KITS[number];

// Template → kit mapping (no need to modify template files)
const TEMPLATE_KITS:Record<string,string>={
  classic_808:"808",boom_bap:"808",reggae:"808",
  trap:"trap",
  jazz_swing:"jazz",
  lofi:"lofi",
  house:"electro",techno_909:"electro",dnb:"electro",uk_garage:"electro",
  funk:"acoustic",gospel:"acoustic",
  bossa_nova:"latin",samba:"latin",
  afrobeat:"afrobeat",
  // Euclid
  tresillo:"latin",cinquillo:"latin",son_clave:"latin",bossa_bell:"latin",
  west_african_bell:"afrobeat",kpanlogo:"afrobeat",venda:"afrobeat",
  ruchenitza:"acoustic",aksak:"acoustic",nawakhat:"acoustic",hemiola_4_3:"jazz",
  reich_phase:"electro",
};

const DELAY_DIVS=["1/4","1/8","1/16","1/4d","1/8d","1/4t","1/8t"];
const divToSec=(div,bpm)=>{const b=60/bpm;const m={"1/4":b,"1/8":b/2,"1/16":b/4,"1/4d":b*1.5,"1/8d":b*0.75,"1/4t":b*2/3,"1/8t":b/3};return m[div]||b;};

// ── CP-B: WAV encoder (pure) ──────────────────────────────────────────────────
function encodeWAV(buffer:AudioBuffer):ArrayBuffer{
  const numCh=buffer.numberOfChannels,sr=buffer.sampleRate;
  const samples=buffer.length,bps=16;
  const ba=numCh*bps/8,byr=sr*ba,ds=samples*ba;
  const ab=new ArrayBuffer(44+ds);
  const v=new DataView(ab);
  const ws=(o:number,s:string)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  ws(0,"RIFF");v.setUint32(4,36+ds,true);
  ws(8,"WAVE");ws(12,"fmt ");
  v.setUint32(16,16,true);v.setUint16(20,1,true);
  v.setUint16(22,numCh,true);v.setUint32(24,sr,true);
  v.setUint32(28,byr,true);v.setUint16(32,ba,true);
  v.setUint16(34,bps,true);ws(36,"data");
  v.setUint32(40,ds,true);
  let off=44;
  for(let i=0;i<samples;i++)
    for(let ch=0;ch<numCh;ch++){
      const s=Math.max(-1,Math.min(1,buffer.getChannelData(ch)[i]));
      v.setInt16(off,s<0?s*0x8000:s*0x7FFF,true);off+=2;
    }
  return ab;
}

// ── Per-track Euclidean rhythm presets (single-track, used in the track dropdown) ──
// Format: { name, region, N, hits: step-indices[], desc }
const EUCLID_RHYTHMS=[
  // Africa
  {name:"Tresillo",   region:"Africa",     N:8,  hits:[0,3,6],           desc:"E(3,8) — racine universelle"},
  {name:"Fume Fume",  region:"Africa",     N:12, hits:[0,2,4,7,9],       desc:"E(5,12) — Ghana (Ewe)"},
  {name:"Bembé",      region:"Africa",     N:12, hits:[0,2,3,5,7,8,10],  desc:"E(7,12) — cœur de l'Afro-jazz"},
  {name:"Shiko",      region:"Africa",     N:16, hits:[0,4,6,10,12],     desc:"E(5,16) — Nigeria (Ewe)"},
  {name:"Soukous",    region:"Africa",     N:12, hits:[0,2,4,6,9,11],    desc:"Clave Congolaise"},
  // Afro-Cuban
  {name:"Habanera",   region:"Afro-Cuban", N:8,  hits:[0,3,5,7],         desc:"Base du danzón et tango"},
  {name:"Cinquillo",  region:"Afro-Cuban", N:8,  hits:[0,2,3,5,6],       desc:"E(5,8) — son & guaracha"},
  {name:"Clave 3-2",  region:"Afro-Cuban", N:16, hits:[0,3,6,10,12],     desc:"Épine dorsale de la musique cubaine"},
  {name:"Clave 2-3",  region:"Afro-Cuban", N:16, hits:[2,4,8,11,14],     desc:"Clave inversée"},
  {name:"Rumba Clave",region:"Afro-Cuban", N:16, hits:[0,3,7,10,12],     desc:"Rumba — 3e beat décalé"},
  {name:"Guaguancó",  region:"Afro-Cuban", N:12, hits:[0,3,4,6,10],      desc:"Rumba urbaine de La Havane"},
  // Brazil
  {name:"Baião",      region:"Brazil",     N:16, hits:[0,3,8,11],        desc:"Zabumba du sertão"},
  {name:"Maracatu",   region:"Brazil",     N:16, hits:[0,6,10,12],       desc:"Rythme royal africain"},
  {name:"Bossa Nova", region:"Brazil",     N:16, hits:[0,3,6,8,11,14],   desc:"Guitare de João Gilberto"},
  {name:"Surdo",      region:"Brazil",     N:16, hits:[0,8],             desc:"Puls profond de la batucada"},
  {name:"Caixa",      region:"Brazil",     N:16, hits:[0,2,4,6,8,10,12,14],desc:"Caisse samba en croches"},
  {name:"Xote",       region:"Brazil",     N:8,  hits:[0,2,5,7],         desc:"Forró — quadrilha"},
  // Balkan / World
  {name:"Ruchenitza", region:"Balkan",     N:7,  hits:[0,2,4,6],         desc:"E(4,7) — Bulgarie 7/8"},
  {name:"Aksak",      region:"Balkan",     N:9,  hits:[0,2,4,6,8],       desc:"E(5,9) — Turquie 9/8"},
  {name:"Nawakhat",   region:"Arabic",     N:7,  hits:[0,2,3,5,6],       desc:"E(5,7) — Maqam arabe"},
];
// ── FX send bus list (used in per-track send selectors) ──
const FX_SECS=[
  {sec:"reverb",label:"REV",color:"#64D2FF"},
  {sec:"delay", label:"DLY",color:"#30D158"},
  {sec:"filter",label:"FLT",color:"#FF9500"},
  {sec:"comp",  label:"CMP",color:"#5E5CE6"},
  {sec:"drive", label:"DRV",color:"#FF6B35"},
];

const EUCLID_REGIONS=["Africa","Afro-Cuban","Brazil","Balkan","Arabic"];
const EUCLID_RCOL={"Africa":"#FFD60A","Afro-Cuban":"#FF9500","Brazil":"#30D158","Balkan":"#BF5AF2","Arabic":"#64D2FF"};

// Euclidean rhythm generator (Bjorklund)
function euclidRhythm(hits,steps){
  if(hits<=0)return Array(steps).fill(0);
  hits=Math.min(hits,steps);
  if(hits===steps)return Array(steps).fill(1);
  const arr=Array(steps).fill(0);
  for(let i=0;i<hits;i++)arr[Math.floor(i*steps/hits)]=1;
  return arr;
}


// ═══ Audio Engine ═══
class Eng{
  constructor(){this.ctx=null;this.mg=null;this.buf={};this.rv=null;this.ch={};this._c={};this._resumeP=null;}
  init(){if(this.ctx)return;this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.mg=this.ctx.createGain();this.mg.gain.value=0.8;
    // Global FX chain: mg → drive → comp → makeup → filter(×2 24dB/oct) → out
    this.gDrv=this.ctx.createWaveShaper();this.gDrv.oversample="4x";this.gDrv.curve=this._cv(0);
    this.gCmp=this.ctx.createDynamicsCompressor();
    this.gCmp.threshold.value=0;this.gCmp.ratio.value=1;
    this.gCmp.knee.value=6;           // 6dB knee: punchy, not too hard
    this.gCmp.attack.value=0.005;     // 5ms attack: lets transients through
    this.gCmp.release.value=0.08;     // 80ms release: fast enough for drums
    this.gCmpMakeup=this.ctx.createGain();this.gCmpMakeup.gain.value=1; // auto makeup
    this.gFlt=this.ctx.createBiquadFilter();this.gFlt.type="lowpass";this.gFlt.frequency.value=20000;
    this.gFlt2=this.ctx.createBiquadFilter();this.gFlt2.type="lowpass";this.gFlt2.frequency.value=20000; // 2nd pole → 24dB/oct
    this.gOut=this.ctx.createGain();this.gOut.gain.value=1;
    this.mg.connect(this.gDrv);this.gDrv.connect(this.gCmp);this.gCmp.connect(this.gCmpMakeup);this.gCmpMakeup.connect(this.gFlt);this.gFlt.connect(this.gFlt2);this.gFlt2.connect(this.gOut);this.gOut.connect(this.ctx.destination);
    // Global reverb bus
    this.gRvBus=this.ctx.createGain();this.gRvConv=this.ctx.createConvolver();
    this.gRvBus.connect(this.gRvConv);this.gRvConv.connect(this.gOut);
    // Global delay bus (LP filter in feedback for natural echo darkening)
    this.gDlBus=this.ctx.createGain();this.gDl=this.ctx.createDelay(2);this.gDl.delayTime.value=0.25;
    this.gDlFb=this.ctx.createGain();this.gDlFb.gain.value=0.35;
    this.gDlLpf=this.ctx.createBiquadFilter();this.gDlLpf.type="lowpass";this.gDlLpf.frequency.value=4500;
    this.gDlBus.connect(this.gDl);this.gDl.connect(this.gDlFb);this.gDlFb.connect(this.gDlLpf);this.gDlLpf.connect(this.gDl);this.gDl.connect(this.gOut);
    this._mkRv();TRACKS.forEach(t=>this._build(t.id));this._loadDefaults();}
  async _loadDefaults(){
    // Pre-render all 808 sounds into AudioBuffers for playback-quality output
    const durs={kick:1.2,snare:0.28,hihat:0.1,clap:0.28,tom:0.65,ride:0.45,crash:1.6,perc:0.65};
    for(const [id,dur] of Object.entries(durs)){
      try{
        const sr=this.ctx.sampleRate;
        const oCtx=new OfflineAudioContext(1,Math.ceil(sr*dur),sr);
        this._syn(id,0,1,oCtx.destination,oCtx);
        this.buf[id]=await oCtx.startRendering();
      }catch(e){console.warn("808 prerender failed:",id,e);}
    }
    this.onReady?.();
  }
  async ensureRunning(){
    if(!this.ctx)this.init();
    if(this.ctx.state==='suspended'){
      if(!this._resumeP)this._resumeP=this.ctx.resume().finally(()=>{this._resumeP=null;});
      await this._resumeP;
    }
  }
  _mkRv(decay,size){
    const d=Math.max(0.1,decay||2);const s=Math.max(0,Math.min(1,size??0.5));
    const sr=this.ctx.sampleRate;
    const pre=0.005+s*0.035; // pre-delay 5ms→40ms (room size)
    const l=Math.ceil(sr*(Math.min(6,d)+pre));
    const b=this.ctx.createBuffer(2,l,sr);
    const erMults=[1,1.6,2.3,3.1,4.0,5.2,6.5];
    const erGains=[0.72,0.58,0.52,0.42,0.36,0.28,0.21];
    for(let ch=0;ch<2;ch++){
      const data=b.getChannelData(ch);
      const chOff=ch===1?(1+s*0.12):1; // stereo spread with size
      for(let t=0;t<erMults.length;t++){
        const idx=Math.floor(pre*erMults[t]*chOff*sr);
        if(idx<l)data[idx]+=erGains[t]*(0.75+Math.random()*0.5);
      }
      const tailStart=Math.floor(pre*sr);
      const density=0.25+s*0.55;  // bigger=denser tail
      const hfRate=3-s*1.5;       // bigger=slower HF loss (brighter)
      let sm1=0,sm2=0;
      for(let i=tailStart;i<l;i++){
        const tt=(i-tailStart)/sr;
        const env=Math.exp(-tt*3/d);
        const hf=Math.exp(-tt*hfRate/d);
        const noise=Math.random()*2-1;
        sm1=sm1*0.45+noise*env*hf*density*0.55;
        sm2=sm2*0.30+sm1*0.70; // 2-pole LP for smooth tail
        data[i]+=sm2;
      }
    }
    this.rv=b;
  }
  updateReverb(decay,size){this._mkRv(decay,size);if(this.gRvConv){try{this.gRvConv.buffer=this.rv;}catch(e){}}}
  setSerialOrder(order:string[]){
    if(!this.ctx||!this.gDrv)return;
    // All 5 effects as serial blocks: in = entry node, o = exit node
    // delay/reverb: tracks still feed gDlBus/gRvBus via sends; their OUTPUTS chain serially
    const B:Record<string,{i:AudioNode,o:AudioNode}>={
      filter:{i:this.gFlt,   o:this.gFlt2},
      comp:  {i:this.gCmp,   o:this.gCmpMakeup},
      drive: {i:this.gDrv,   o:this.gDrv},
      delay: {i:this.gDlBus, o:this.gDl},
      reverb:{i:this.gRvBus, o:this.gRvConv},
    };
    // ─── 1. Disconnect all exit connections ───
    [this.mg,this.gFlt2,this.gCmpMakeup,this.gDrv,this.gRvConv].forEach(n=>{try{n.disconnect();}catch(e){}});
    try{this.gDl.disconnect();}catch(e){}
    // ─── 2. Restore intra-block connections ───
    try{this.gDl.connect(this.gDlFb);}catch(e){}  // delay feedback loop
    // gCmp→gCmpMakeup and gFlt→gFlt2 and gDlBus→gDl and gRvBus→gRvConv
    // are set in init() and not touched above — they persist
    // ─── 3. Chain all blocks in the specified order: mg → B[0] → B[1] → … → gOut ───
    let prev:AudioNode=this.mg;
    order.filter(s=>B[s]).forEach(s=>{prev.connect(B[s].i);prev=B[s].o;});
    prev.connect(this.gOut);
  }
  _build(id){
    const c={};
    c.in=this.ctx.createGain();
    c.vol=this.ctx.createGain();c.vol.gain.value=0.8;
    c.pan=this.ctx.createStereoPanner?this.ctx.createStereoPanner():this.ctx.createGain();
    c.dry=this.ctx.createGain();c.dry.gain.value=1;
    c.rvSend=this.ctx.createGain();c.rvSend.gain.value=0;
    c.dlSend=this.ctx.createGain();c.dlSend.gain.value=0;
    c.in.connect(c.vol);c.vol.connect(c.pan);
    c.pan.connect(c.dry);c.dry.connect(this.mg);
    c.pan.connect(c.rvSend);c.rvSend.connect(this.gRvBus);
    c.pan.connect(c.dlSend);c.dlSend.connect(this.gDlBus);
    this.ch[id]=c;
  }
  uGfx(gfx){
    if(!this.ctx||!this.gDrv)return;const t=this.ctx.currentTime;
    this.gDrv.curve=gfx.drive.on?this._cv(gfx.drive.amt/100):this._cv(0);
    // Comp + auto makeup gain
    const cThr=gfx.comp.on?(gfx.comp.thr??-12):0;
    const cRatio=gfx.comp.on?Math.max(1,gfx.comp.ratio??4):1;
    this.gCmp.threshold.setTargetAtTime(cThr,t,0.02);
    this.gCmp.ratio.setTargetAtTime(cRatio,t,0.02);
    if(this.gCmpMakeup){const mkDb=gfx.comp.on?Math.max(0,-cThr*(1-1/cRatio)*0.5):0;this.gCmpMakeup.gain.setTargetAtTime(Math.min(6,Math.pow(10,mkDb/20)),t,0.05);}
    // 2-stage filter: both poles track same freq/Q for 24dB/oct slope
    const fType=gfx.filter.on?(gfx.filter.type||"lowpass"):"lowpass";
    const fCut=gfx.filter.on?Math.max(20,gfx.filter.cut||18000):20000;
    const fQ=gfx.filter.on?(gfx.filter.res||0):0;
    this.gFlt.type=fType;this.gFlt.frequency.setTargetAtTime(fCut,t,0.02);this.gFlt.Q.setTargetAtTime(fQ,t,0.02);
    if(this.gFlt2){this.gFlt2.type=fType;this.gFlt2.frequency.setTargetAtTime(fCut,t,0.02);this.gFlt2.Q.setTargetAtTime(fQ,t,0.02);}
    if(this.gDl)this.gDl.delayTime.setTargetAtTime(Math.min(1.9,gfx.delay.time||0.25),t,0.02);
    if(this.gDlFb)this.gDlFb.gain.setTargetAtTime((gfx.delay.fdbk||35)/100,t,0.02);
    if(this.gDlLpf)this.gDlLpf.frequency.setTargetAtTime(gfx.delay.on?4500:20000,t,0.05);
    Object.keys(this.ch).forEach(id=>{
      const c=this.ch[id];if(!c)return;
      const rvAmt=(gfx.reverb.sends[id]||0);const rvOn=gfx.reverb.on&&rvAmt>0;
      const dlAmt=(gfx.delay.sends[id]||0);const dlOn=gfx.delay.on&&dlAmt>0;
      if(c.rvSend)c.rvSend.gain.setTargetAtTime(rvOn?rvAmt/100*0.9:0,t,0.02);
      if(c.dlSend)c.dlSend.gain.setTargetAtTime(dlOn?dlAmt/100*0.9:0,t,0.02);
      // Slow dry restore (0.6s TC) so reverb/delay tails ring out naturally before dry gain compensates
      if(c.dry)c.dry.gain.setTargetAtTime(rvOn&&dlOn?0.3:rvOn||dlOn?0.6:1,t,0.6);
    });
  }
  _cv(d){
    const k=Math.round(d*100);if(this._c[k])return this._c[k];
    const n=8192,a=new Float32Array(n);
    if(d===0){for(let i=0;i<n;i++)a[i]=i*2/n-1;}
    else{
      const v=d*6; // drive gain 0..6
      const norm=Math.tanh(1+v); // normalizer so full-scale in = full-scale out
      for(let i=0;i<n;i++){
        const x=i*2/n-1;
        const sat=Math.tanh(x*(1+v))/norm; // tanh saturation (tube odd harmonics)
        a[i]=sat-0.05*sat*sat; // slight asymmetry → 2nd harmonic warmth
      }
    }
    this._c[k]=a;return a;
  }
  uFx(id,f){
    const c=this.ch[id];if(!c||!this.ctx)return;const t=this.ctx.currentTime;
    c.vol.gain.setTargetAtTime((f?.vol??80)/100,t,0.02);
    if(c.pan.pan)c.pan.pan.setTargetAtTime((f?.pan??0)/100,t,0.02);
  }
  async load(id,file){this.init();if(!this.ch[id])this._build(id);try{const a=await file.arrayBuffer();this.buf[id]=await this.ctx.decodeAudioData(a);return true;}catch(e){return false;}}
  async loadUrl(id,url){
    this.init();if(!this.ch[id])this._build(id);
    try{
      const resp=await fetch(url);if(!resp.ok)throw new Error(`HTTP ${resp.status}`);
      const ab=await resp.arrayBuffer();
      this.buf[id]=await this.ctx.decodeAudioData(ab);
      return true;
    }catch(e){console.warn('[Kit] loadUrl failed',id,url,e);return false;}
  }
  play(id,vel=1,dMs=0,f=null,at=null){
    if(!this.ctx)this.init();if(!this.ch[id])this._build(id);const c=this.ch[id];if(!c)return;
    if(this.ctx.state==='suspended'){this.ctx.resume().catch(e=>console.warn('[Audio] ctx.resume() failed:',e));}
    const raw=at!==null?(at+dMs/1000):(this.ctx.currentTime+Math.max(0,dMs)/1000);
    const t=Math.max(this.ctx.currentTime+0.001,raw);
    if(f)this.uFx(id,f);const r=Math.pow(2,((f?.onPitch?f.pitch:0)||0)/12);
    // H.1c: mobile — if no buffer yet, trigger async render then bail
    if(this.isMobile&&!this.buf[id]){this.renderShape(id,f).catch(()=>{});return;}
    if(this.buf[id]){const s=this.ctx.createBufferSource();s.buffer=this.buf[id];s.playbackRate.setValueAtTime(r,t);const g=this.ctx.createGain();g.gain.setValueAtTime(vel,t);s.connect(g);g.connect(c.in);s.start(t);s.stop(t+s.buffer.duration/r+0.1);s.onended=()=>{s.disconnect();g.disconnect();};} // H.1d
    else{
      // Pass shape params from fx object so _syn respects kit timbre even before buffer exists
      const sh=f?{sDec:f.sDec??1,sTune:f.sTune??1,sPunch:f.sPunch??1,sSnap:f.sSnap??1,sBody:f.sBody??1,sTone:f.sTone??1}:undefined;
      this._syn(id,t,vel,c.in,undefined,sh);
    }
  }
  _syn(id,t,v,d,octx,sh){
    // ── TR-808 synthesis with SHAPE params ─────────────────────────────────
    const ctx=octx||this.ctx;
    const sDec=sh?.sDec??1, sTune=sh?.sTune??1, sPunch=sh?.sPunch??1, sSnap=sh?.sSnap??1, sBody=sh?.sBody??1, sTone=sh?.sTone??1;
    const noise=(dur)=>{const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*dur),ctx.sampleRate),dd=b.getChannelData(0);for(let i=0;i<dd.length;i++)dd[i]=Math.random()*2-1;const s=ctx.createBufferSource();s.buffer=b;return s;};
    const osc=(type,freq)=>{const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(freq,t);return o;};
    const gain=(val)=>{const g=ctx.createGain();g.gain.setValueAtTime(val,t);return g;};
    const filt=(type,freq,q=0)=>{const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;return f;};
    const S={
      kick:()=>{
        const click=noise(0.005);const cg=gain(v*0.6*sPunch);cg.gain.exponentialRampToValueAtTime(0.001,t+0.006);const chp=filt("highpass",100);click.connect(chp);chp.connect(cg);cg.connect(d);click.start(t);click.stop(t+0.007);
        const o=osc("sine",180*sTune);o.frequency.exponentialRampToValueAtTime(Math.max(20,28*sTune),t+0.9*sDec);const g=gain(v*1.5*sBody);g.gain.exponentialRampToValueAtTime(0.001,t+1.1*sDec);o.connect(g);g.connect(d);o.start(t);o.stop(t+1.15*sDec);
      },
      snare:()=>{
        const o=osc("sine",200*sTune);o.frequency.exponentialRampToValueAtTime(150*sTune,t+0.06*sDec);const og=gain(v*0.6*sBody);og.gain.exponentialRampToValueAtTime(0.001,t+0.14*sDec);o.connect(og);og.connect(d);o.start(t);o.stop(t+0.15*sDec);
        const ns=noise(0.22*sDec);const bp=filt("bandpass",2400*sTone,0.6);const ng=gain(v*0.85*sSnap);ng.gain.exponentialRampToValueAtTime(0.001,t+0.22*sDec);ns.connect(bp);bp.connect(ng);ng.connect(d);ns.start(t);ns.stop(t+0.23*sDec);
      },
      hihat:()=>{
        const decay=0.045*sDec;const mg=gain(1);mg.connect(d);
        [80,119,167,219,273,329].map(f=>f*sTone).forEach(f=>{const o=osc("square",f);const og=gain(v*0.06);og.gain.exponentialRampToValueAtTime(0.001,t+decay);o.connect(og);og.connect(mg);o.start(t);o.stop(t+decay+0.001);});
        const ns=noise(decay);const hp=filt("highpass",8000*sTone);const ng=gain(v*0.18*sSnap);ng.gain.exponentialRampToValueAtTime(0.001,t+decay);ns.connect(hp);hp.connect(ng);ng.connect(d);ns.start(t);ns.stop(t+decay+0.001);
      },
      clap:()=>{
        [0,0.009,0.018,0.028].map(off=>off*sSnap).forEach(off=>{const ns=noise(0.012);const bp=filt("bandpass",1200,1.5);const g=gain(v*0.55*sPunch);g.gain.setValueAtTime(0,t);g.gain.setValueAtTime(v*0.55*sPunch,t+Math.max(0.0001,off));g.gain.exponentialRampToValueAtTime(0.001,t+Math.max(0.001,off)+0.012);ns.connect(bp);bp.connect(g);g.connect(d);ns.start(t+Math.max(0,off));ns.stop(t+Math.max(0,off)+0.015);});
        const tailDur=0.2*sDec;const tail=noise(tailDur);const bp2=filt("bandpass",1000,0.8);const tg=gain(v*0.45*sBody);tg.gain.setValueAtTime(0,t);tg.gain.setValueAtTime(v*0.45*sBody,t+0.04);tg.gain.exponentialRampToValueAtTime(0.001,t+tailDur);tail.connect(bp2);bp2.connect(tg);tg.connect(d);tail.start(t+0.04);tail.stop(t+tailDur+0.01);
      },
      tom:()=>{
        const dur=0.55*sDec;const o=osc("sine",200*sTune);o.frequency.exponentialRampToValueAtTime(Math.max(20,65*sTune),t+0.45*sDec);const g=gain(v*1.0*sBody);g.gain.exponentialRampToValueAtTime(0.001,t+dur);o.connect(g);g.connect(d);o.start(t);o.stop(t+dur+0.01);
        const click=noise(0.005);const cg=gain(v*0.3*sPunch);cg.gain.exponentialRampToValueAtTime(0.001,t+0.007);click.connect(cg);cg.connect(d);click.start(t);click.stop(t+0.008);
      },
      ride:()=>{
        const dur=0.35*sDec;const mg=gain(1);mg.connect(d);[5500,7280].map(f=>f*sTone).forEach(f=>{const o=osc("square",f);const og=gain(v*0.07);og.gain.exponentialRampToValueAtTime(0.001,t+dur);o.connect(og);og.connect(mg);o.start(t);o.stop(t+dur+0.01);});
        const ns=noise(dur);const bp=filt("bandpass",5200*sTone,1.2);const ng=gain(v*0.15*sSnap);ng.gain.exponentialRampToValueAtTime(0.001,t+dur);ns.connect(bp);bp.connect(ng);ng.connect(d);ns.start(t);ns.stop(t+dur+0.01);
      },
      crash:()=>{
        const dur=1.4*sDec;const ns=noise(dur);const hp=filt("highpass",2800*sTone);const bp=filt("bandpass",7000*sTone,0.5);const g=gain(v*0.5);g.gain.exponentialRampToValueAtTime(0.001,t+dur);ns.connect(hp);hp.connect(bp);bp.connect(g);g.connect(d);ns.start(t);ns.stop(t+dur+0.01);
      },
      perc:()=>{
        const dur=0.5*sDec;const mg=gain(1);mg.connect(d);
        [562,845].map(f=>f*sTune).forEach(f=>{const o=osc("square",f);const bp=filt("bandpass",f,6);const og=gain(v*0.25*sBody);og.gain.exponentialRampToValueAtTime(0.001,t+dur);o.connect(bp);bp.connect(og);og.connect(mg);o.start(t);o.stop(t+dur+0.01);});
      },
    };
    if(!S[id]){
      const dur=0.55*sDec;const mg=gain(1);mg.connect(d);const shift=id.charCodeAt(3)%5;
      [[520,800],[562,845],[600,900],[480,760],[640,960]][shift].map(([a,b])=>[a*sTune,b*sTune]).forEach(([a,b])=>{[a,b].forEach(f=>{const o=osc("square",f);const bp=filt("bandpass",f,6);const og=gain(v*0.28*sBody);og.gain.exponentialRampToValueAtTime(0.001,t+dur);o.connect(bp);bp.connect(og);og.connect(mg);o.start(t);o.stop(t+dur+0.01);});});
      return;
    }
    S[id]();
  }
  async renderShape(id,fxObj,silent=false){
    if(!this.ctx)return;
    const sh={sDec:fxObj?.sDec??1,sTune:fxObj?.sTune??1,sPunch:fxObj?.sPunch??1,sSnap:fxObj?.sSnap??1,sBody:fxObj?.sBody??1,sTone:fxObj?.sTone??1};
    const baseDur={kick:1.2,snare:0.28,hihat:0.1,clap:0.28,tom:0.65,ride:0.45,crash:1.6,perc:0.65};
    const dur=Math.min(6,(baseDur[id]||0.65)*Math.max(0.25,sh.sDec));
    try{
      const sr=this.ctx.sampleRate;
      const oCtx=new OfflineAudioContext(1,Math.ceil(sr*dur),sr);
      this._syn(id,0,1,oCtx.destination,oCtx,sh);
      this.buf[id]=await oCtx.startRendering();
      if(!silent)this.play(id,0.7,0,fxObj);
    }catch(e){console.warn("renderShape failed",id,e);}
  }
}
const engine=new Eng();

// ═══ Global FX Rack ═══
const SYNC_DIVS=[{l:"1/1",b:4},{l:"1/2",b:2},{l:"1/4",b:1},{l:"1/8",b:0.5},{l:"1/16",b:0.25},{l:"1/4.",b:1.5},{l:"1/8.",b:0.75},{l:"1/4t",b:2/3},{l:"1/8t",b:1/3}];
const syncDivTime=(div,bpmV)=>{const d=SYNC_DIVS.find(x=>x.l===div)||SYNC_DIVS[2];return Math.min(1.9,d.b*(60/Math.max(30,bpmV)));};

const FX_PRESETS=[
  {id:"clean",name:"Clean",color:"#8E8E93",gfx:{reverb:{on:false,decay:1.5,size:0.5,sends:{}},delay:{on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:"1/4"},filter:{on:false,type:"lowpass",cut:18000,res:0},comp:{on:false,thr:-12,ratio:4},drive:{on:false,amt:0}}},
  {id:"room",name:"Room",color:"#64D2FF",gfx:{reverb:{on:true,decay:0.8,size:0.4,sends:{}},delay:{on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:"1/4"},filter:{on:false,type:"lowpass",cut:18000,res:0},comp:{on:false,thr:-12,ratio:4},drive:{on:false,amt:0}}},
  {id:"hall",name:"Hall",color:"#64D2FF",gfx:{reverb:{on:true,decay:3.5,size:0.82,sends:{}},delay:{on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:"1/4"},filter:{on:false,type:"lowpass",cut:18000,res:0},comp:{on:true,thr:-18,ratio:3},drive:{on:false,amt:0}}},
  {id:"tape_echo",name:"Tape Echo",color:"#30D158",gfx:{reverb:{on:false,decay:1.5,size:0.5,sends:{}},delay:{on:true,time:0.375,fdbk:55,sends:{},sync:false,syncDiv:"1/4"},filter:{on:true,type:"lowpass",cut:9000,res:1},comp:{on:false,thr:-12,ratio:4},drive:{on:true,amt:12}}},
  {id:"slap",name:"Slap",color:"#30D158",gfx:{reverb:{on:false,decay:1.5,size:0.5,sends:{}},delay:{on:true,time:0.08,fdbk:18,sends:{},sync:false,syncDiv:"1/8"},filter:{on:false,type:"lowpass",cut:18000,res:0},comp:{on:false,thr:-12,ratio:4},drive:{on:false,amt:0}}},
  {id:"lofi",name:"Lo-Fi",color:"#FF9500",gfx:{reverb:{on:false,decay:1.5,size:0.5,sends:{}},delay:{on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:"1/4"},filter:{on:true,type:"lowpass",cut:4000,res:2},comp:{on:true,thr:-18,ratio:4},drive:{on:true,amt:22}}},
  {id:"warmth",name:"Warmth",color:"#FF6B35",gfx:{reverb:{on:false,decay:1.5,size:0.5,sends:{}},delay:{on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:"1/4"},filter:{on:true,type:"lowpass",cut:12000,res:0},comp:{on:true,thr:-12,ratio:3},drive:{on:true,amt:25}}},
  {id:"stadium",name:"Stadium",color:"#BF5AF2",gfx:{reverb:{on:true,decay:4.2,size:0.9,sends:{}},delay:{on:true,time:0.5,fdbk:35,sends:{},sync:false,syncDiv:"1/2"},filter:{on:false,type:"lowpass",cut:18000,res:0},comp:{on:true,thr:-16,ratio:4},drive:{on:false,amt:0}}},
  {id:"dark",name:"Dark",color:"#8E8E93",gfx:{reverb:{on:true,decay:1.8,size:0.6,sends:{}},delay:{on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:"1/4"},filter:{on:true,type:"lowpass",cut:3500,res:1},comp:{on:true,thr:-14,ratio:5},drive:{on:false,amt:0}}},
  {id:"pumping",name:"Pumping",color:"#5E5CE6",gfx:{reverb:{on:false,decay:1.5,size:0.5,sends:{}},delay:{on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:"1/4"},filter:{on:false,type:"lowpass",cut:18000,res:0},comp:{on:true,thr:-28,ratio:14},drive:{on:true,amt:8}}},
];

// Per-FX static metadata (label, color, type)
const FX_CHAIN_DEF:{sec:string,label:string,color:string,type:"serial"|"send"}[]=[
  {sec:"filter",label:"FILTER",color:"#FF9500",type:"serial"},
  {sec:"comp",  label:"COMP",  color:"#5E5CE6",type:"serial"},
  {sec:"drive", label:"DRIVE", color:"#FF6B35",type:"serial"},
  {sec:"delay", label:"DELAY", color:"#30D158",type:"send"},
  {sec:"reverb",label:"REVERB",color:"#64D2FF",type:"send"},
];

function FXRack({gfx,setGfx,tracks,themeName="dark",bpm=120,midiLM=false,MidiTag=()=>null,isPortrait=false,fxChainOrder=[],setFxChainOrder=(_o:string[])=>{},onChainOrderChange=(_o:string[])=>{}}){
  const th=THEMES[themeName]||THEMES.dark;
  const [open,setOpen]=useState(false);
  const [showPresets,setShowPresets]=useState(false);
  const [dragSec,setDragSec]=useState<string|null>(null);
  const [dragOverSec,setDragOverSec]=useState<string|null>(null);
  const upSec=(sec:string,k:string,v:any)=>setGfx((p:any)=>({...p,[sec]:{...p[sec],[k]:v}}));
  const upSend=(sec:string,tid:string,v:any)=>setGfx((p:any)=>({...p,[sec]:{...p[sec],sends:{...p[sec].sends,[tid]:v}}}));
  const loadPreset=(preset)=>{
    setGfx(p=>{
      const sends_rv=p.reverb?.sends||{};const sends_dl=p.delay?.sends||{};
      const ng=JSON.parse(JSON.stringify(preset.gfx));
      ng.reverb={...ng.reverb,sends:sends_rv};
      ng.delay={...ng.delay,sends:sends_dl};
      if(engine.ctx)setTimeout(()=>engine.uGfx(ng),20);
      return ng;
    });
    setShowPresets(false);
  };

  // SVG circular knob (drag up/down)
  const Knob=({label,value,min,max,color,onChange,fmt,unit,size=48})=>{
    const norm=Math.max(0,Math.min(1,(value-min)/(max-min)));
    const angleDeg=-135+norm*270;
    const rad=angleDeg*Math.PI/180;
    const cx=size/2,cy=size/2,r=size/2-5;
    const ix=cx+(r-5)*Math.sin(rad),iy=cy-(r-5)*Math.cos(rad);
    const arcPath=(fromD,toD)=>{
      const f2=fromD*Math.PI/180,t2=toD*Math.PI/180;
      const x1=cx+r*Math.sin(f2),y1=cy-r*Math.cos(f2);
      const x2=cx+r*Math.sin(t2),y2=cy-r*Math.cos(t2);
      const large=Math.abs(toD-fromD)>180?1:0;
      return`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    };
    const onStart=e=>{
      e.preventDefault();
      const startY=e.touches?e.touches[0].clientY:e.clientY,startVal=value;
      const mv=me=>{const dy=startY-(me.touches?me.touches[0].clientY:me.clientY);onChange(Math.max(min,Math.min(max,startVal+dy*(max-min)/120)));};
      const up=()=>{window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);window.removeEventListener("touchmove",mv);window.removeEventListener("touchend",up);};
      window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);
      window.addEventListener("touchmove",mv,{passive:false});window.addEventListener("touchend",up);
    };
    const disp=fmt?fmt(value):(typeof value==="number"?(Math.abs(value)<10?value.toFixed(2):Math.round(value)):value);
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
        <span style={{fontSize:7,fontWeight:700,color:th.dim,whiteSpace:"nowrap",letterSpacing:"0.05em"}}>{label}</span>
        <svg width={size} height={size} style={{display:"block",cursor:"ns-resize",touchAction:"none",userSelect:"none"}} onMouseDown={onStart} onTouchStart={onStart}>
          <path d={arcPath(-135,135)} fill="none" stroke={th.btn} strokeWidth={2.5} strokeLinecap="round"/>
          {norm>0.01&&<path d={arcPath(-135,angleDeg)} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" opacity={0.9}/>}
          <circle cx={cx} cy={cy} r={r-8} fill={th.surface} stroke={color+"33"} strokeWidth={1.5}/>
          <line x1={cx} y1={cy} x2={ix} y2={iy} stroke={color} strokeWidth={2} strokeLinecap="round"/>
          <circle cx={ix} cy={iy} r={2.5} fill={color}/>
        </svg>
        <span style={{fontSize:7,fontWeight:800,color,fontFamily:"monospace"}}>{disp}{unit||""}</span>
      </div>
    );
  };

  const Sep=()=><div style={{width:1,background:th.sBorder,alignSelf:"stretch",margin:"0 6px",flexShrink:0}}/>;
  const SecLabel=({label,color,active,onToggle,midiId})=>(
    <div onClick={onToggle} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",marginBottom:8,paddingBottom:4,borderBottom:`1px solid ${active?color+"55":th.btn}`}}>
      <div style={{width:7,height:7,borderRadius:"50%",background:active?color:th.faint,flexShrink:0,boxShadow:active?`0 0 6px ${color}`:undefined}}/>
      <span style={{fontSize:8,fontWeight:800,color:active?color:th.faint,letterSpacing:"0.1em"}}>{label}</span>
      {midiId&&<MidiTag id={midiId}/>}
    </div>
  );
  // ── SendRing — circular send bus selector ──────────────────────────────────
  // Destinations: MASTER + all active tracks. Drag ring or use ◀ ▶ arrows to move
  // cursor; click dot or toggle button to activate/deactivate that destination.
  const SendRing=({sec,color})=>{
    const [cursor,setCursor]=useState(0);
    const dests=[{id:"_master",label:"MST"},...tracks.map(t=>({id:t.id,label:(t.label||t.id).slice(0,3).toUpperCase()}))];
    const n=dests.length;
    const R=20,SZ=52,cx=SZ/2,cy=SZ/2;
    const isOn=id=>!!gfx[sec].sends[id];
    const tog=id=>upSend(sec,id,!gfx[sec].sends[id]);
    const prev=()=>setCursor(c=>(c-1+n)%n);
    const next=()=>setCursor(c=>(c+1)%n);
    const curDest=dests[cursor];
    const arw={padding:"1px 5px",borderRadius:4,border:"1px solid rgba(255,255,255,0.12)",
      background:"transparent",color:"rgba(255,255,255,0.4)",fontSize:8,cursor:"pointer",
      fontFamily:"inherit",lineHeight:1.2,flexShrink:0};
    const onMouseDown=e=>{
      e.preventDefault();
      const rect=e.currentTarget.getBoundingClientRect();
      const mv=ev=>{
        const dx=ev.clientX-(rect.left+cx),dy=ev.clientY-(rect.top+cy);
        const ang=((Math.atan2(dy,dx)+Math.PI/2)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
        setCursor(Math.round(ang/(2*Math.PI)*n)%n);
      };
      const up=()=>{window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);};
      window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);
    };
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,marginTop:8,paddingTop:6,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
        <span style={{fontSize:5.5,color:"rgba(255,255,255,0.22)",letterSpacing:"0.1em",fontWeight:700}}>SEND BUS</span>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <button onClick={prev} style={arw}>◀</button>
          <svg width={SZ} height={SZ} onMouseDown={onMouseDown} style={{cursor:"grab",display:"block",touchAction:"none"}}>
            {/* Background ring */}
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6}/>
            {/* Active blobs on ring */}
            {dests.map((d,i)=>{
              if(!isOn(d.id))return null;
              const a=(i/n)*2*Math.PI-Math.PI/2;
              return<circle key={i} cx={cx+R*Math.cos(a)} cy={cy+R*Math.sin(a)} r={4.5} fill={color} opacity={0.85}/>;
            })}
            {/* Cursor spoke */}
            {(()=>{const a=(cursor/n)*2*Math.PI-Math.PI/2;return<line x1={cx} y1={cy} x2={cx+(R-2)*Math.cos(a)} y2={cy+(R-2)*Math.sin(a)} stroke={color+"70"} strokeWidth={1.5} strokeDasharray="2,2"/>;})()}
            {/* Destination dots */}
            {dests.map((d,i)=>{
              const a=(i/n)*2*Math.PI-Math.PI/2;
              const dx=cx+R*Math.cos(a),dy=cy+R*Math.sin(a);
              const focused=i===cursor,active=isOn(d.id);
              return(
                <g key={i} onClick={()=>tog(d.id)} style={{cursor:"pointer"}}>
                  <circle cx={dx} cy={dy} r={focused?5.5:3.2}
                    fill={active?color:"rgba(255,255,255,0.09)"}
                    stroke={focused?color:"none"} strokeWidth={1.5} opacity={focused?1:active?0.9:0.5}/>
                </g>
              );
            })}
            {/* Center */}
            <circle cx={cx} cy={cy} r={10} fill={isOn(curDest.id)?color+"18":"rgba(255,255,255,0.03)"} stroke={isOn(curDest.id)?color+"50":"rgba(255,255,255,0.07)"} strokeWidth={1}/>
            <text x={cx} y={cy+2.5} textAnchor="middle" fontSize={5.5} fontFamily="monospace" fill={isOn(curDest.id)?color:"rgba(255,255,255,0.35)"} fontWeight="bold">{curDest.label}</text>
          </svg>
          <button onClick={next} style={arw}>▶</button>
        </div>
        <button onClick={()=>tog(curDest.id)} style={{
          padding:"2px 10px",borderRadius:4,fontFamily:"inherit",fontSize:6.5,fontWeight:800,cursor:"pointer",letterSpacing:"0.08em",
          border:`1px solid ${isOn(curDest.id)?color+"80":"rgba(255,255,255,0.1)"}`,
          background:isOn(curDest.id)?color+"1a":"transparent",
          color:isOn(curDest.id)?color:"rgba(255,255,255,0.3)",
        }}>{isOn(curDest.id)?"● SEND ON":"○ ADD SEND"}</button>
      </div>
    );
  };

  const activeCount=["reverb","delay","filter","comp","drive"].filter(s=>gfx[s].on).length;
  return(
    <div style={{marginBottom:8,borderRadius:10,background:th.surface,border:`1px solid ${open?"rgba(191,90,242,0.3)":th.sBorder}`,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",userSelect:"none"}}>
        <div onClick={()=>setOpen(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,flex:1,cursor:"pointer"}}>
          <span style={{fontSize:8,fontWeight:800,color:"#BF5AF2",letterSpacing:"0.14em"}}>FX RACK</span>
          <span style={{fontSize:9,color:th.dim}}>{open?"▲":"▼"}</span>
          {activeCount>0&&<span style={{fontSize:7,padding:"1px 6px",borderRadius:3,background:"rgba(191,90,242,0.12)",color:"#BF5AF2",fontWeight:700}}>{activeCount} active</span>}
          {["reverb","delay","filter","comp","drive"].filter(s=>gfx[s].on).map(s=>(
            <span key={s} style={{fontSize:7,padding:"1px 5px",borderRadius:3,background:`rgba(${s==="reverb"?"100,210,255":s==="delay"?"48,209,88":s==="filter"?"255,149,0":s==="comp"?"94,92,230":"255,149,0"},0.12)`,color:s==="reverb"?"#64D2FF":s==="delay"?"#30D158":s==="filter"?"#FF9500":s==="comp"?"#5E5CE6":"#FF9500",fontWeight:700,letterSpacing:"0.08em"}}>{s.slice(0,3).toUpperCase()}</span>
          ))}
        </div>
        <button
          onClick={e=>{e.stopPropagation();setShowPresets(p=>!p);if(!open)setOpen(false);}}
          style={{padding:"2px 8px",borderRadius:5,border:`1px solid ${showPresets?"#BF5AF255":th.sBorder}`,background:showPresets?"rgba(191,90,242,0.12)":"transparent",color:showPresets?"#BF5AF2":th.dim,fontSize:7,fontWeight:showPresets?800:400,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em",flexShrink:0}}
        >PRESETS</button>
      </div>
      {showPresets&&(
        <div style={{padding:"0 14px 10px",borderTop:`1px solid ${th.sBorder}`}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,paddingTop:8}}>
            {FX_PRESETS.map(preset=>(
              <button key={preset.id} onClick={()=>loadPreset(preset)}
                style={{padding:"3px 9px",borderRadius:5,border:`1px solid ${preset.color}44`,background:`${preset.color}12`,color:preset.color,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em",transition:"all 0.1s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=`${preset.color}28`;e.currentTarget.style.borderColor=`${preset.color}88`;}}
                onMouseLeave={e=>{e.currentTarget.style.background=`${preset.color}12`;e.currentTarget.style.borderColor=`${preset.color}44`;}}
              >{preset.name}</button>
            ))}
          </div>
          <p style={{margin:"6px 0 0",fontSize:7,color:th.dim,letterSpacing:"0.04em"}}>Les sends par piste sont préservés au changement de preset</p>
        </div>
      )}
      {open&&(
        <div style={{padding:"6px 10px 12px",overflowX:"auto"}}>
          {/* ── Drag-reorder FX chain ── */}
          <div style={{display:"flex",alignItems:"stretch",gap:0,minWidth:"max-content"}}>
            {(fxChainOrder.length?fxChainOrder:["filter","comp","drive","delay","reverb"]).map((sec,i)=>{
              const def=FX_CHAIN_DEF.find(f=>f.sec===sec);
              if(!def)return null;
              const {color,label,type}=def;
              const isOver=dragOverSec===sec&&dragSec!==sec;
              const isDragging=dragSec===sec;
              const active=(gfx as any)[sec]?.on;
              return(
                <div key={sec} style={{display:"flex",alignItems:"center",gap:0}}>
                  {i>0&&(
                    <div style={{display:"flex",alignItems:"center",padding:"0 4px",color:isOver?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.15)",fontSize:12,userSelect:"none",flexShrink:0,transition:"color 0.1s"}}>→</div>
                  )}
                  <div
                    draggable
                    onDragStart={e=>{e.dataTransfer.effectAllowed="move";setDragSec(sec);}}
                    onDragEnd={()=>{setDragSec(null);setDragOverSec(null);}}
                    onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";setDragOverSec(sec);}}
                    onDragLeave={()=>setDragOverSec(null)}
                    onDrop={e=>{
                      e.preventDefault();
                      if(!dragSec||dragSec===sec)return;
                      const o=[...(fxChainOrder.length?fxChainOrder:["filter","comp","drive","delay","reverb"])];
                      const from=o.indexOf(dragSec),to=o.indexOf(sec);
                      if(from<0||to<0)return;
                      o.splice(from,1);o.splice(to,0,dragSec);
                      setFxChainOrder(o);onChainOrderChange(o);
                      setDragSec(null);setDragOverSec(null);
                    }}
                    style={{
                      borderRadius:8,
                      border:`1px solid ${isOver?color:isDragging?color+"55":active?color+"44":color+"22"}`,
                      background:isOver?`${color}12`:isDragging?`${color}06`:`${color}06`,
                      padding:"6px 10px 8px",
                      minWidth:type==="send"?120:90,
                      flexShrink:0,
                      cursor:"grab",
                      opacity:isDragging?0.45:1,
                      transition:"border-color 0.12s,opacity 0.12s,background 0.12s",
                      position:"relative",
                      userSelect:"none",
                    }}
                  >
                    {/* Drag handle + type badge */}
                    <div style={{position:"absolute",top:3,right:5,display:"flex",gap:3,alignItems:"center"}}>
                      {type==="send"&&<span style={{fontSize:5,fontWeight:800,color:color+"88",letterSpacing:"0.08em",background:`${color}15`,borderRadius:2,padding:"0 3px",lineHeight:"10px"}}>SEND</span>}
                      <span style={{fontSize:8,color:"rgba(255,255,255,0.15)",pointerEvents:"none"}}>⠿</span>
                    </div>
                    {/* ON/OFF toggle header */}
                    <SecLabel label={label} color={color} active={active} onToggle={()=>upSec(sec,"on",!active)} midiId={`__${sec.slice(0,3)}_on__`}/>
                    {/* FX-specific controls */}
                    {sec==="reverb"&&(
                      <div style={{display:"flex",gap:6,opacity:active?1:0.3,pointerEvents:active?"auto":"none"}}>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><Knob label="DECAY" value={gfx.reverb.decay} min={0.1} max={6} color={color} unit="s" fmt={(v:number)=>v.toFixed(1)} onChange={(v:number)=>{upSec("reverb","decay",v);if(engine.ctx)engine.updateReverb(v,gfx.reverb.size);}}/><MidiTag id="__rev_decay__"/></div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><Knob label="SIZE" value={gfx.reverb.size} min={0} max={1} color={color} fmt={(v:number)=>(v*100).toFixed(0)} unit="%" onChange={(v:number)=>{upSec("reverb","size",v);if(engine.ctx)engine.updateReverb(gfx.reverb.decay,v);}}/><MidiTag id="__rev_size__"/></div>
                      </div>
                    )}
                    {sec==="delay"&&(
                      <div style={{opacity:active?1:0.3,pointerEvents:active?"auto":"none"}}>
                        <div style={{display:"flex",alignItems:"center",marginBottom:4}}>
                          <button onClick={()=>{const ns=!gfx.delay.sync;const t=ns?syncDivTime(gfx.delay.syncDiv,bpm):gfx.delay.time;setGfx((p:any)=>({...p,delay:{...p.delay,sync:ns,time:t}}));}} style={{marginLeft:"auto",padding:"1px 5px",borderRadius:3,border:`1px solid ${gfx.delay.sync?color:"rgba(48,209,88,0.25)"}`,background:gfx.delay.sync?"rgba(48,209,88,0.15)":"transparent",color:gfx.delay.sync?color:"rgba(48,209,88,0.4)",fontSize:6,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>SYNC</button>
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          {gfx.delay.sync?(
                            <div>
                              <div style={{display:"flex",flexWrap:"wrap",gap:2,marginBottom:3,maxWidth:100}}>
                                {["1/4","1/8","1/16","1/4.","1/8.","1/4t"].map(d=>(
                                  <button key={d} onClick={()=>setGfx((p:any)=>({...p,delay:{...p.delay,syncDiv:d,time:syncDivTime(d,bpm)}}))} style={{padding:"1px 3px",borderRadius:2,border:`1px solid ${gfx.delay.syncDiv===d?color:"rgba(48,209,88,0.15)"}`,background:gfx.delay.syncDiv===d?"rgba(48,209,88,0.12)":"transparent",color:gfx.delay.syncDiv===d?color:th.faint,fontSize:5.5,cursor:"pointer",fontFamily:"inherit"}}>{d}</button>
                                ))}
                              </div>
                              <div style={{fontSize:6,color,fontWeight:700,textAlign:"center"}}>{gfx.delay.time.toFixed(3)}s</div>
                            </div>
                          ):(
                            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><Knob label="TIME" value={gfx.delay.time} min={0.01} max={1.9} color={color} unit="s" fmt={(v:number)=>v.toFixed(2)} onChange={(v:number)=>upSec("delay","time",v)}/><MidiTag id="__dly_time__"/></div>
                          )}
                          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><Knob label="FDBK" value={gfx.delay.fdbk} min={0} max={95} color={color} fmt={(v:number)=>Math.round(v)} unit="%" onChange={(v:number)=>upSec("delay","fdbk",v)}/><MidiTag id="__dly_fdbk__"/></div>
                        </div>
                      </div>
                    )}
                    {sec==="filter"&&(
                      <div style={{opacity:active?1:0.3,pointerEvents:active?"auto":"none"}}>
                        <div style={{display:"flex",gap:2,marginBottom:5}}>
                          {["lowpass","highpass","bandpass"].map(ft=>(
                            <button key={ft} onClick={()=>upSec("filter","type",ft)} style={{flex:1,padding:"2px 0",borderRadius:3,border:`1px solid ${gfx.filter.type===ft?color:"transparent"}`,background:gfx.filter.type===ft?`${color}18`:"transparent",color:gfx.filter.type===ft?color:th.faint,fontSize:6,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{ft==="lowpass"?"LP":ft==="highpass"?"HP":"BP"}</button>
                          ))}
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><Knob label="CUT" value={gfx.filter.cut} min={20} max={20000} color={color} fmt={(v:number)=>v>=1000?(v/1000).toFixed(1)+"k":Math.round(v)+"Hz"} onChange={(v:number)=>upSec("filter","cut",v)}/><MidiTag id="__flt_cut__"/></div>
                          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><Knob label="RES" value={gfx.filter.res} min={0} max={25} color={color} fmt={(v:number)=>v.toFixed(1)} onChange={(v:number)=>upSec("filter","res",v)}/><MidiTag id="__flt_res__"/></div>
                        </div>
                      </div>
                    )}
                    {sec==="comp"&&(
                      <div style={{opacity:active?1:0.3,pointerEvents:active?"auto":"none"}}>
                        <div style={{display:"flex",gap:6}}>
                          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><Knob label="THR" value={gfx.comp.thr} min={-60} max={0} color={color} unit="dB" fmt={(v:number)=>Math.round(v)} onChange={(v:number)=>upSec("comp","thr",v)}/><MidiTag id="__cmp_thr__"/></div>
                          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><Knob label="RATIO" value={gfx.comp.ratio} min={1} max={20} color={color} unit=":1" fmt={(v:number)=>v.toFixed(1)} onChange={(v:number)=>upSec("comp","ratio",v)}/><MidiTag id="__cmp_rat__"/></div>
                        </div>
                        <div style={{fontSize:6,color:`${color}66`,marginTop:3,textAlign:"center",letterSpacing:"0.07em"}}>auto makeup</div>
                      </div>
                    )}
                    {sec==="drive"&&(
                      <div style={{opacity:active?1:0.3,pointerEvents:active?"auto":"none"}}>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><Knob label="AMT" value={gfx.drive.amt} min={0} max={100} color={color} fmt={(v:number)=>Math.round(v)} unit="%" onChange={(v:number)=>upSec("drive","amt",v)}/><MidiTag id="__drv_amt__"/></div>
                        <div style={{fontSize:6,color:`${color}66`,marginTop:3,textAlign:"center",letterSpacing:"0.07em"}}>tanh sat</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Main ═══
export default function KickAndSnare(){
  const appState=useAppState();
  const {state:appSt,setLaunched,markTipShown,addUsageTime}=appState;
  const [overlayVisible,setOverlayVisible]=useState(!appSt.launched);
  const [showCheatSheet,setShowCheatSheet]=useState(false);
  const [themeName,setThemeName]=useState("dark");
  const th=THEMES[themeName];
  const [tSig,setTSig]=useState(TIME_SIGS[0]);
  const [grpIdx,setGrpIdx]=useState(0);
  const aGrp=tSig.groupOptions?tSig.groupOptions[grpIdx]?.slice(0,-1)||tSig.groups:tSig.groups;
  const sig={...tSig,groups:aGrp};const STEPS=sig.steps;
  const gInfo=s=>{let a=0;for(let g=0;g<sig.groups.length;g++){if(s<a+sig.groups[g])return{gi:g,first:s===a,pos:s-a};a+=sig.groups[g];}return{gi:0,first:false,pos:0};};

  const [pBank,setPBank]=useState([mkE(16)]);const [cPat,setCPat]=useState(0);
  const pat=pBank[cPat]||mkE(STEPS);
  const trackSteps=pBank[cPat]?._steps||{};
  const setPat=u=>setPBank(p=>{const n=[...p];n[cPat]=typeof u==="function"?u(n[cPat]):u;return n;});

  const resize=ns=>{
    const resizeArr=(obj,def)=>Object.fromEntries(ALL_TRACKS.map(t=>{const o=obj[t.id]||[];return[t.id,Array(ns).fill(def).map((_,i)=>o[i]!==undefined?o[i]:def)];}));
    setPBank(pb=>pb.map(p=>Object.fromEntries(ALL_TRACKS.map(t=>{const o=p[t.id]||[];return[t.id,Array(ns).fill(0).map((_,i)=>o[i]||0)];}))));
    setStNudge(sn=>resizeArr(sn,0));
    setStVel(sv=>resizeArr(sv,100));
    setStProb(sp=>resizeArr(sp,100));
    setStRatch(sr=>resizeArr(sr,1));
  };
  const chSig=s=>{setTSig(s);setGrpIdx(0);resize(s.steps);};

  const [isAudioReady,setIsAudioReady]=useState(false);
  // ── CP-B: Export WAV ──
  const [exportState,setExportState]=useState<"idle"|"rendering">("idle");
  const [exportBars,setExportBars]=useState<1|2|4>(1);
  // ── CP-B: Looper export ──
  const [loopExportState,setLoopExportState]=useState<"idle"|"rendering">("idle");
  const [loopExportReps,setLoopExportReps]=useState<1|2|4>(1);
  // ── H.1a: Mobile detection ──
  const isMobile=useMemo(()=>/Android|iPhone|iPad/i.test(navigator.userAgent)||window.innerWidth<768,[]);
  const isMobileRef=useRef(isMobile);
  // ── H.2a: Portrait detection ──
  const [isPortrait,setIsPortrait]=useState(()=>window.innerHeight>window.innerWidth);
  // ── H.3: REC pads fade-out ──
  const [recPadsVisible,setRecPadsVisible]=useState(false);

  const [bpm,setBpm]=useState(90);const [playing,setPlaying]=useState(false);const [cStep,setCStep]=useState(-1);
  const [swing,setSwing]=useState(0);const [muted,setMuted]=useState({});const [soloed,setSoloed]=useState(null);
  const [view,setView]=useState("sequencer");const [act,setAct]=useState(DEFAULT_ACTIVE);const [showAdd,setShowAdd]=useState(false);
  const [customTracks,setCustomTracks]=useState([]);
  const [newTrackName,setNewTrackName]=useState("");const [showCustomInput,setShowCustomInput]=useState(false);
  const [euclidParams,setEuclidParams]=useState({});
  const [smpN,setSmpN]=useState({kick:"808 Bass Drum (synth)",snare:"808 Snare (synth)",hihat:"808 Closed Hi-Hat (synth)",clap:"808 Clap (synth)",tom:"808 Low Tom (synth)",ride:"808 Ride (synth)",crash:"808 Crash (synth)",perc:"808 Cowbell (synth)"});
  const [fx,setFx]=useState(Object.fromEntries(TRACKS.map(t=>[t.id,{...DEFAULT_FX}])));
  const [kitIdx,setKitIdx]=useState(0);
  const [gfx,setGfx]=useState({reverb:{on:false,decay:1.5,size:0.5,sends:{}},delay:{on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:"1/4"},filter:{on:false,type:"lowpass",cut:18000,res:0,sends:{}},comp:{on:false,thr:-12,ratio:4,sends:{}},drive:{on:false,amt:0,sends:{}}});
  // Per-track send cursor: index into FX_SECS (0=reverb … 4=drive)
  const [trackSendCursor,setTrackSendCursor]=useState<{[tid:string]:number}>({});
  const upSend=(sec:string,tid:string,v:number)=>setGfx((p:any)=>({...p,[sec]:{...p[sec],sends:{...p[sec].sends,[tid]:v}}}));
  const [fxChainOrder,setFxChainOrder]=useState<string[]>(["filter","comp","drive","delay","reverb"]);
  useEffect(()=>{
    engine.onReady=()=>setIsAudioReady(true);
    engine.isMobile=isMobileRef.current;
  },[]);
  // ── H.2a: Portrait orientation listener ──
  useEffect(()=>{
    const h=()=>setIsPortrait(window.innerHeight>window.innerWidth);
    window.addEventListener('resize',h);
    screen.orientation?.addEventListener('change',h);
    return()=>{window.removeEventListener('resize',h);screen.orientation?.removeEventListener('change',h);};
  },[]);
  useEffect(()=>{if(engine.ctx)engine.uGfx(gfx);},[gfx]);
  // BPM sync for delay
  useEffect(()=>{
    if(gfx.delay.sync){const t=syncDivTime(gfx.delay.syncDiv,bpm);setGfx(p=>({...p,delay:{...p.delay,time:t}}));}
  },[bpm,gfx.delay.sync,gfx.delay.syncDiv]);
  const [stNudge,setStNudge]=useState(mkN(16));
  const [stVel,setStVel]=useState(mkV(16));
  const [stProb,setStProb]=useState(mkP(16));
  const [stRatch,setStRatch]=useState(mkR(16));
  // Song arranger
  const [songChain,setSongChain]=useState([0]);
  const [songMode,setSongMode]=useState(false);
  const [showSong,setShowSong]=useState(false);
  const songPosRef=useRef(0);

  // ── Per-view independent snapshots ──
  // Each view (sequencer / euclid) owns its own pBank + cPat + song state.
  // Switching saves the outgoing state and restores the incoming state — no copy.
  const seqSnap=useRef<{pBank:any[],cPat:number,songChain:number[],songMode:boolean}>({
    pBank:[mkE(16)], cPat:0, songChain:[0], songMode:false,
  });
  const euclidSnap=useRef<{pBank:any[],cPat:number}>({
    pBank:[mkE(16)], cPat:0,
  });

  const switchView=(nextView:string)=>{
    if(view===nextView)return; // already there — noop
    if(R.playing){clearTimeout(schRef.current);setPlaying(false);setCStep(-1);R.step=-1;}

    if(nextView==="euclid"){
      // Save sequencer state
      seqSnap.current={pBank,cPat,songChain,songMode};
      // Restore euclid state
      setPBank(euclidSnap.current.pBank);
      setCPat(euclidSnap.current.cPat);
      // Euclid has no song arranger
      setSongMode(false);setSongChain([0]);songPosRef.current=0;
    } else if(nextView==="sequencer"){
      // Save euclid state
      euclidSnap.current={pBank,cPat};
      // Restore sequencer state
      setPBank(seqSnap.current.pBank);
      setCPat(seqSnap.current.cPat);
      setSongMode(seqSnap.current.songMode);
      setSongChain(seqSnap.current.songChain);
      songPosRef.current=0;
    }
    setView(nextView);
  };
  // Session
  // UI
  const [rec,setRec]=useState(false);const [kMap,setKMap]=useState({...DEFAULT_KEY_MAP});const [showK,setShowK]=useState(false);
  // ── H.3: recPadsVisible with 150ms fade-out ──
  useEffect(()=>{
    if(rec&&playing)setRecPadsVisible(true);
    else{const t=setTimeout(()=>setRecPadsVisible(false),150);return()=>clearTimeout(t);}
  },[rec,playing]);
  const [showTS,setShowTS]=useState(false);
  const [flashing,setFlashing]=useState<Set<string>>(()=>new Set());
  const flashTimers=useRef<Record<string,ReturnType<typeof setTimeout>>>({});
  const [velPicker,setVelPicker]=useState(null);
  // ── CP-I states ──
  const [euclidEditMode,setEuclidEditMode]=useState(false);
  const [euclidTouchFeedback,setEuclidTouchFeedback]=useState<{tid:string,step:number}|null>(null);
  const [swipeToast,setSwipeToast]=useState<string|null>(null);
  const [masterVol,setMasterVol]=useState(()=>appState.state.masterVol??80);
  const [patNameEdit,setPatNameEdit]=useState<number|null>(null);
  // ── CP-F states ──
  const [showLooper,setShowLooper]=useState(false);
  const [recCountdown,setRecCountdown]=useState(false);
  const [recFeedback,setRecFeedback]=useState<{step:number,tid:string,color:string,label:string}|null>(null);
  const [loopMetro,setLoopMetro]=useState(false);
  // masterVol → engine gain + localStorage (0d)
  useEffect(()=>{
    if(engine.ctx)engine.mg.gain.setTargetAtTime(masterVol/100,engine.ctx.currentTime,0.02);
    appState.setMasterVol(masterVol);
  },[masterVol]);
  const [probPopover,setProbPopover]=useState(null);
  const [metro,setMetro]=useState(false);
  const [metroVol,setMetroVol]=useState(10);
  const [dragInfo,setDragInfo]=useState(null);
  const [metroSub,setMetroSub]=useState("off");
  // Activating looper countdown → automatically enable transport metro
  useEffect(()=>{if(loopMetro)setMetro(true);},[loopMetro]);
  // Android WebView / PWA compat
  const [ctxSuspended,setCtxSuspended]=useState(false);
  const hasMidiApi=typeof navigator!=='undefined'&&typeof navigator.requestMIDIAccess==='function';
  const [hasLinkApi,setHasLinkApi]=useState(true);
  const lastTickRef=useRef(null);
  const midiRef=useRef({access:null,ins:[]});
  // MIDI Note Input (independent of clock sync)
  const [midiNoteMap,setMidiNoteMap]=useState({});
  const [midiLearnTrack,setMidiLearnTrack]=useState(null);
  const [midiLM,setMidiLM]=useState(false);
  const [midiNotes,setMidiNotes]=useState(false);
  const [midiErr,setMidiErr]=useState(null); // null|'noapi'|'blocked'|'denied'
  const [midiInsVer,setMidiInsVer]=useState(0); // bumped whenever port list changes
  // Ableton Link Bridge (WebSocket)
  const [linkUrl,setLinkUrl]=useState('ws://localhost:9898');
  const [linkConnected,setLinkConnected]=useState(false);
  const [linkPeers,setLinkPeers]=useState(0);
  const [showLink,setShowLink]=useState(false);
  const [linkSyncPlay,setLinkSyncPlay]=useState(false);
  const [linkStatus,setLinkStatus]=useState('idle'); // 'idle'|'connecting'|'connected'|'failed'
  const linkWsRef=useRef(null);
  const linkBpmRef=useRef(null);
  // ── Undo / Redo ──
  const histRef=useRef({past:[],future:[]});
  const [histLen,setHistLen]=useState({past:0,future:0});
  const _pbRef=useRef(null);const _epRef=useRef(null);const _svRef=useRef(null);const _snRef=useRef(null);const _spRef=useRef(null);const _srRef=useRef(null);
  const linkBpmSentAt=useRef(0); // timestamp of last BPM we sent to Carabiner
  // Euclid polyrhythm — independent per-track clocks
  const euclidClockR=useRef({});
  const [euclidCur,setEuclidCur]=useState({});
  const euclidMetroR=useRef({nextTime:null,beat:0});
  // ── Looper ──
  const [loopBars,setLoopBars]=useState(1);
  const [loopRec,setLoopRec]=useState(false);
  const [loopPlaying,setLoopPlaying]=useState(false);
  const [loopDisp,setLoopDisp]=useState([]); // [{tid,tOff,vel}] for display only
  const [loopPlayhead,setLoopPlayhead]=useState(0); // 0..1
  const loopRef=useRef({events:[],lengthMs:2000,perfStart:null,audioStart:null,schTimer:null,scheduled:new Set(),passId:0});
  const loopPhRef=useRef(null);
  const [autoQ,setAutoQ]=useState(false);
  const autoQRef=useRef(false);
  useEffect(()=>{autoQRef.current=autoQ;},[autoQ]);

  const allT=[...ALL_TRACKS,...customTracks];
  const atO=act.map(id=>allT.find(t=>t.id===id)).filter(Boolean);
  const inact=ALL_TRACKS.filter(t=>!act.includes(t.id));

  /**
   * R — mutable ref bus shared between the scheduler, MIDI handler, and looper.
   *
   * Each property lives on R (rather than in a useState) because the scheduler
   * runs inside a setInterval closure captured at mount time.  If state values
   * were closed over directly they would be stale on every tick.  Instead, R is
   * a stable object reference (useRef.current) whose properties are updated on
   * every render, so closures always read the live value without re-subscribing.
   *
   * Convention: R.<shortKey> = <stateName>   (assigned below on every render)
   */
  const R=useRef({step:-1}).current;
  const tapTimesRef=useRef([]);
  const touchSwipeRef=useRef<{x:number,y:number,target:EventTarget|null}>({x:0,y:0,target:null});

  R.pat=pat;          // current pattern — scheduler reads per-track step arrays
  R.mut=muted;        // muted track map — scheduler skips muted tracks
  R.sol=soloed;       // soloed track id — scheduler enforces solo
  R.fx=fx;            // per-track FX config — passed to engine.play() on each hit
  R.sn=stNudge;       // nudge offsets — scheduler shifts step timing by ±ms
  R.vel=stVel;        // velocity per step — scheduler scales engine gain (0–100)
  R.at=act;           // active track IDs — scheduler and MIDI iterate this list
  R.pb=pBank;         // full pattern bank — song arranger reads all patterns
  R.playing=playing;  // playback state — avoids stale closure on play/stop toggle
  R.cp=cPat;          // current pattern index — scheduler reads for song chain
  R.bpm=bpm;          // BPM — scheduler derives step duration each tick
  R.sw=swing;         // swing % — scheduler applies even/odd step offset
  R.rec=rec;          // record mode — trigPad writes live hits into pattern
  R.km=kMap;          // keyboard map {trackId:key} — keydown handler lookup
  R.sig=sig;          // time signature — scheduler derives groups/step count
  R.metro=metro;      // metronome on/off — scheduler fires click on beat 0
  R.mVol=metroVol;    // metronome volume — passed to engine for click gain
  R.mSub=metroSub;    // metronome subdivision — adds sub-beat clicks
  R.prob=stProb;      // step probability 0–100 — scheduler gates steps randomly
  R.ratch=stRatch;    // ratchet count per step — scheduler sub-divides the step
  R.view=view;        // current view ("sequencer"|"pads"|"euclid") — REC routing
  R.songMode=songMode;     // song chain active — scheduler advances pattern list
  R.songChain=songChain;   // ordered pattern indices — song mode iteration
  R.ts=trackSteps;         // per-track step count overrides — scheduler wrap point
  R.lkSync=linkSyncPlay;   // Ableton Link sync-on-play — start on beat boundary
  R.loopRec=loopRec;       // looper recording active — trigPad appends timed events
  R.loopBars=loopBars;     // number of bars in loop — used for auto-Q snap calculation
  R.mnMap=midiNoteMap;     // MIDI note→trackId map — MIDI handler lookup table
  R.mLearn=midiLearnTrack; // MIDI learn target id — incoming note assigns to this
  R.mNotes=midiNotes;      // MIDI notes mode active — enables note-on triggering
  R.sGfx=setGfx;  // setGfx setter — MIDI CC handler updates global FX rack state
  R.sFx=setFx;    // setFx setter — MIDI CC handler updates per-track FX state
  R.isPortrait=isPortrait; // H.2a — portrait flag for scheduler / components
  R.isMobile=isMobileRef.current; // H.1a — mobile flag for scheduler
  R.euclidEdit=euclidEditMode; // I.1d — edit mode flag
  R.masterVol=masterVol; // I.2b — master volume 0-100
  // Tap tempo
  const handleTap=()=>{
    const now=Date.now();const times=tapTimesRef.current;
    if(times.length>0&&now-times[times.length-1]>2000)times.length=0;
    times.push(now);if(times.length>4)times.shift();
    if(times.length>1){const ivs=[];for(let i=1;i<times.length;i++)ivs.push(times[i]-times[i-1]);const avg=ivs.reduce((a,b)=>a+b,0)/ivs.length;setBpm(Math.max(30,Math.min(300,Math.round(60000/avg))));}
  };
  R.htap=handleTap;R.setBpmR=setBpm;R.setSwingR=setSwing;

  // MIDI note-only handler
  const onMidiAll=useCallback(ev=>{
    const b=ev.data[0];const status=b&0xF0;
    const byte1=ev.data[1];const byte2=ev.data[2];
    // CC messages (transport buttons, knobs…)
    if(status===0xB0){
      const addr=128+byte1; // CC0-127 stored as 128-255
      if(R.mLearn&&byte2>0){setMidiNoteMap(prev=>({...prev,[R.mLearn]:addr}));setMidiLearnTrack(null);return;}
      const mapped=Object.entries(R.mnMap).find(([,n])=>n===addr)?.[0];
      if(mapped==='__play__'&&byte2>0){R.ss?.current?.();return;}
      if(mapped==='__rec__'&&byte2>0){R.setRec?.(p=>!p);return;}
      if(mapped==='__tap__'&&byte2>0){R.htap?.();return;}
      if(mapped==='__bpm__'){R.setBpmR?.(Math.max(30,Math.min(300,30+Math.round(byte2/127*270))));return;}
      if(mapped==='__swing__'){R.setSwingR?.(Math.round(byte2/127*100));return;}
      // ── FX Rack CC ──
      if(mapped==='__rev_decay__'){R.sGfx?.(p=>({...p,reverb:{...p.reverb,decay:+(0.1+byte2/127*5.9).toFixed(2)}}));return;}
      if(mapped==='__rev_size__'){R.sGfx?.(p=>({...p,reverb:{...p.reverb,size:+(byte2/127).toFixed(3)}}));return;}
      if(mapped==='__dly_time__'){R.sGfx?.(p=>({...p,delay:{...p.delay,time:+(0.01+byte2/127*1.89).toFixed(3)}}));return;}
      if(mapped==='__dly_fdbk__'){R.sGfx?.(p=>({...p,delay:{...p.delay,fdbk:Math.round(byte2/127*95)}}));return;}
      if(mapped==='__flt_cut__'){R.sGfx?.(p=>({...p,filter:{...p.filter,cut:Math.round(20+Math.pow(byte2/127,2)*19980)}}));return;}
      if(mapped==='__flt_res__'){R.sGfx?.(p=>({...p,filter:{...p.filter,res:+(byte2/127*25).toFixed(1)}}));return;}
      if(mapped==='__cmp_thr__'){R.sGfx?.(p=>({...p,comp:{...p.comp,thr:Math.round(-60+byte2/127*60)}}));return;}
      if(mapped==='__cmp_rat__'){R.sGfx?.(p=>({...p,comp:{...p.comp,ratio:+(1+byte2/127*19).toFixed(1)}}));return;}
      if(mapped==='__drv_amt__'){R.sGfx?.(p=>({...p,drive:{...p.drive,amt:Math.round(byte2/127*100)}}));return;}
      // ── FX on/off CC (any non-zero value toggles) ──
      if(mapped==='__rev_on__'&&byte2>0){R.sGfx?.(p=>({...p,reverb:{...p.reverb,on:!p.reverb.on}}));return;}
      if(mapped==='__dly_on__'&&byte2>0){R.sGfx?.(p=>({...p,delay:{...p.delay,on:!p.delay.on}}));return;}
      if(mapped==='__flt_on__'&&byte2>0){R.sGfx?.(p=>({...p,filter:{...p.filter,on:!p.filter.on}}));return;}
      if(mapped==='__cmp_on__'&&byte2>0){R.sGfx?.(p=>({...p,comp:{...p.comp,on:!p.comp.on}}));return;}
      if(mapped==='__drv_on__'&&byte2>0){R.sGfx?.(p=>({...p,drive:{...p.drive,on:!p.drive.on}}));return;}
      // ── Vol/Pan per track CC ──
      if(mapped?.startsWith('vol_')){const tid=mapped.slice(4);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{vol:80,pan:0}),vol:Math.round(byte2/127*100)}}));return;}
      if(mapped?.startsWith('pan_')){const tid=mapped.slice(4);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{vol:80,pan:0}),pan:Math.round(byte2/127*200-100)}}));return;}
      return;
    }
    // Note messages (pads, keys)
    if(status===0x90||status===0x80){
      const noteOn=status===0x90&&byte2>0;
      if(!noteOn)return;
      if(R.mLearn){setMidiNoteMap(prev=>({...prev,[R.mLearn]:byte1}));setMidiLearnTrack(null);return;}
      const mapped=Object.entries(R.mnMap).find(([,n])=>n===byte1)?.[0];
      if(mapped==='__play__'){R.ss?.current?.();return;}
      if(mapped==='__rec__'){R.setRec?.(p=>!p);return;}
      if(mapped==='__tap__'){R.htap?.();return;}
      if(mapped&&R.at.includes(mapped)){R.trigPad?.(mapped,byte2/127);}
    }
  },[]);
  const initMidi=async()=>{
    const mr=midiRef.current;if(mr.access)return true;
    if(!navigator.requestMIDIAccess){setMidiErr('noapi');return false;}
    try{
      const acc=await navigator.requestMIDIAccess({sysex:false});mr.access=acc;
      const upd=()=>{mr.ins=[...acc.inputs.values()];setMidiInsVer(v=>v+1);};
      upd();acc.onstatechange=upd;mr.upd=upd;setMidiErr(null);return true;
    }catch(e){
      const blocked=e?.name==='SecurityError'||e?.name==='NotAllowedError'||e?.name==='NotSupportedError';
      setMidiErr(blocked?'blocked':'denied');return false;
    }
  };
  useEffect(()=>{
    const mr=midiRef.current;if(!mr.access)return;
    mr.ins.forEach(p=>{p.onmidimessage=midiNotes?onMidiAll:null;});
    return()=>{mr.ins.forEach(p=>{p.onmidimessage=null;});};
  },[midiNotes,onMidiAll,midiInsVer]);


  // Ableton Link Bridge — connect / disconnect
  const linkConnect=()=>{
    if(linkWsRef.current)linkWsRef.current.close();
    setLinkStatus('connecting');setLinkConnected(false);
    let ws;
    try{ws=new WebSocket(linkUrl.trim());}catch(e){setLinkStatus('failed');return;}
    const timeout=setTimeout(()=>{
      if(ws.readyState!==1){ws.close();setLinkStatus('failed');}
    },5000);
    ws.onopen=()=>{clearTimeout(timeout);setLinkConnected(true);setLinkStatus('connected');};
    ws.onclose=()=>{clearTimeout(timeout);setLinkConnected(false);setLinkPeers(0);linkWsRef.current=null;
      setLinkStatus(s=>s==='connected'?'idle':'failed');};
    ws.onerror=()=>{clearTimeout(timeout);setLinkStatus('failed');};
    ws.onmessage=e=>{
      try{
        const msg=JSON.parse(e.data);
        if(msg.peers!==undefined)setLinkPeers(msg.peers);
        if(msg.bpm!=null&&Math.abs(msg.bpm-R.bpm)>0.09&&Date.now()-linkBpmSentAt.current>3000){
          linkBpmRef.current=Math.round(msg.bpm);setBpm(Math.round(msg.bpm));
        }
        if(R.lkSync&&msg.playing!==undefined&&msg.playing!==R.playing)ssRef.current?.();
      }catch{}
    };
    linkWsRef.current=ws;
  };
  const linkDisconnect=()=>{
    if(linkWsRef.current){linkWsRef.current.close();linkWsRef.current=null;}
    setLinkConnected(false);setLinkPeers(0);setLinkStatus('idle');
  };
  // Sync BPM changes to bridge (skip echo from bridge)
  useEffect(()=>{
    if(!linkConnected||!linkWsRef.current)return;
    if(linkBpmRef.current===bpm){linkBpmRef.current=null;return;}
    if(linkWsRef.current.readyState===1){
      linkBpmSentAt.current=Date.now();
      linkWsRef.current.send(JSON.stringify({type:'setBpm',bpm}));
    }
  },[bpm,linkConnected]);
  // Sync play state to bridge
  useEffect(()=>{
    if(!linkConnected||!linkSyncPlay||!linkWsRef.current)return;
    if(linkWsRef.current.readyState===1)linkWsRef.current.send(JSON.stringify({type:'setPlaying',playing}));
  },[playing,linkConnected,linkSyncPlay]);
  // Cleanup
  useEffect(()=>()=>{if(linkWsRef.current)linkWsRef.current.close();},[]);


  // Keyboard shortcuts
  const trigPad=useCallback(async(tid,vel=1)=>{
    await engine.ensureRunning();engine.play(tid,vel,0,R.fx[tid]||{...DEFAULT_FX});
    if(navigator.vibrate)navigator.vibrate(15);
    if(flashTimers.current[tid])clearTimeout(flashTimers.current[tid]);
    setFlashing(s=>{const n=new Set(s);n.add(tid);return n;});
    flashTimers.current[tid]=setTimeout(()=>{setFlashing(s=>{const n=new Set(s);n.delete(tid);return n;});delete flashTimers.current[tid];},130);
    // Looper recording — use audio clock (ctx.currentTime) to stay in the same
    // time domain as the scheduler. performance.now() has a capture-order bias
    // vs audioStart (set one line earlier) that makes hits sound slightly early.
    if(R.loopRec&&loopRef.current.audioStart!==null&&engine.ctx){
      const L=loopRef.current;
      // Subtract output + base latency so the hit aligns with the heard beat,
      // not with the moment the user's finger touched the screen.
      const latSec=(engine.ctx.outputLatency||0)+(engine.ctx.baseLatency||0.02);
      const rawSec=engine.ctx.currentTime-L.audioStart-latSec;
      let tOff=((rawSec*1000)%L.lengthMs+L.lengthMs)%L.lengthMs;
      // AUTO-Q: snap to nearest subdivision on capture
      if(autoQRef.current&&L.lengthMs>0){
        const snapMs=L.lengthMs/(R.loopBars*16);
        tOff=Math.max(0,Math.min(L.lengthMs-snapMs,Math.round(tOff/snapMs)*snapMs));
      }
      const evId=`${Date.now()}-${Math.random()}`;
      const ev={id:evId,tid,tOff,vel,pass:L.passId};
      L.events.push(ev);
      setLoopDisp(d=>[...d,{tid,tOff,vel}]);
    }
    // F.1b: REC mode with quantization snap + timing feedback + retap erase
    if(R.rec&&R.step>=0&&engine.ctx){
      const gSt=R.sig?.steps||16;
      const tSt=R.view==="euclid"?(R.ts?.[tid]||gSt):([gSt,gSt*2].includes(R.ts?.[tid])?R.ts[tid]:gSt);
      const ratio=Math.max(1,Math.round(tSt/gSt));
      // F.1b: quantization snap
      const stepDur=(60/R.bpm)*R.sig.beats/R.sig.steps;
      const elapsed=engine.ctx.currentTime-(nxtRef.current-stepDur);
      const snapRatio=Math.max(0,Math.min(1,elapsed/stepDur));
      const qStep=snapRatio>0.5?(R.step+1)%gSt:R.step;
      const targetStep=ratio>1?qStep*ratio:qStep%tSt;
      // F.1c: timing feedback color
      const fbColor=snapRatio>=0.35&&snapRatio<=0.65?"#30D158":snapRatio>=0.2&&snapRatio<=0.8?"#FF9500":"#FF2D55";
      const fbLabel=snapRatio>=0.35&&snapRatio<=0.65?"✓":snapRatio>=0.2&&snapRatio<=0.8?"~":"!";
      setRecFeedback({step:targetStep,tid,color:fbColor,label:fbLabel});
      setTimeout(()=>setRecFeedback(null),400);
      const v100=Math.max(1,Math.round(vel*100));
      // F.1d: retap erases
      setPBank(pb=>{const n=[...pb];const p={...n[R.cp]};p[tid]=[...p[tid]];p[tid][targetStep]=p[tid][targetStep]?0:1;n[R.cp]=p;return n;});
      if(R.pat?.[tid]?.[targetStep]!==0)setStVel(sv=>({...sv,[tid]:{...(sv[tid]||{}),[targetStep]:v100}}));
    }
  },[]);
  R.trigPad=trigPad;
  const ssRef=useRef(null);const playRef=useRef(false);
  R.ss=ssRef;R.setRec=setRec;
  useEffect(()=>{playRef.current=playing;},[playing]);
  useEffect(()=>{
    const down=e=>{if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"&&!e.shiftKey){e.preventDefault();R.undo?.();return;}
      if((e.ctrlKey||e.metaKey)&&(e.key.toLowerCase()==="y"||(e.key.toLowerCase()==="z"&&e.shiftKey))){e.preventDefault();R.redo?.();return;}
      if(e.code==="Space"){e.preventDefault();if(R.view==="pads"){R.toggleLoopRec?.();}else{ssRef.current?.();}return;}
      if(e.key==="Alt"){e.preventDefault();if(playRef.current)setRec(p=>!p);return;}
      if(e.key==="?"){setShowK(p=>!p);return;}
      if(e.key==="ArrowLeft"){e.preventDefault();setBpm(p=>Math.max(30,p-1));return;}
      if(e.key==="ArrowRight"){e.preventDefault();setBpm(p=>Math.min(300,p+1));return;}
      if(e.key==="ArrowUp"){e.preventDefault();setBpm(p=>Math.min(300,p+5));return;}
      if(e.key==="ArrowDown"){e.preventDefault();setBpm(p=>Math.max(30,p-5));return;}
      if(e.key==="t"||e.key==="T"){handleTap();return;}
      const k=e.key.toLowerCase();const tid=Object.keys(R.km).find(id=>R.km[id]===k);if(tid&&R.at.includes(tid)){e.preventDefault();trigPad(tid);}
    };window.addEventListener("keydown",down);return()=>window.removeEventListener("keydown",down);
  },[trigPad]);

  // Metronome click
  const playClk=(time,level)=>{
    if(!engine.ctx)return;const ctx=engine.ctx;const mv=R.mVol/100;
    if(level==="sub"&&R.mSub==="off")return;
    const subVol=R.mSub==="light"?0.2:R.mSub==="full"?0.6:0;
    const vol=level==="accent"?1.0:level==="beat"?0.7:subVol;
    const freq=level==="accent"?2200:level==="beat"?1600:1000;
    const fDrop=level==="accent"?1100:level==="beat"?800:500;
    if(vol*mv<0.01)return;
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type="sine";o.frequency.setValueAtTime(freq,time);o.frequency.exponentialRampToValueAtTime(fDrop,time+0.015);
    g.gain.setValueAtTime(vol*mv,time);g.gain.setValueAtTime(vol*mv*0.6,time+0.005);g.gain.exponentialRampToValueAtTime(0.001,time+(level==="sub"?0.03:0.06));
    o.connect(g);g.connect(engine.mg);o.start(time);o.stop(time+0.08);
    if(level!=="sub"){const nb=ctx.createBuffer(1,ctx.sampleRate*0.004,ctx.sampleRate);const dd=nb.getChannelData(0);for(let i=0;i<dd.length;i++)dd[i]=(Math.random()*2-1)*Math.exp(-i*4/dd.length);const ns=ctx.createBufferSource();ns.buffer=nb;const ng=ctx.createGain();ng.gain.setValueAtTime(vol*mv*0.6,time);ns.connect(ng);ng.connect(engine.mg);ns.start(time);}
  };
  const isGS=(step,groups,accents=[0])=>{let a=0;for(let g=0;g<groups.length;g++){if(step===a)return{y:true,f:accents.includes(g)};a+=groups[g];}return{y:false,f:false};};

  const nxtRef=useRef(0);const schRef=useRef(null);
  const schSt=useCallback((sn,time)=>{
    const p=R.pat,m=R.mut,s=R.sol,f=R.fx,nudge=R.sn,vel=R.vel,at=R.at;
    const prob=R.prob,ratch=R.ratch,cs=R.sig;
    const bd=(60/R.bpm)*(cs.beats||(cs.groups?.length||4))/cs.steps;
    const playTrStep=(tr,psn,ptime)=>{
      const stepProb=prob[tr.id]?.[psn]??100;
      if(Math.random()*100>=stepProb)return;
      if(p?.[tr.id]?.[psn]){
        const v=(vel[tr.id]?.[psn]??100)/100;
        const r=ratch[tr.id]?.[psn]||1;
        for(let ri=0;ri<r;ri++)engine.play(tr.id,v*(ri===0?1:0.65),(ri===0?(nudge[tr.id]?.[psn]||0):0),f[tr.id]||{...DEFAULT_FX},ptime+ri*(bd/r));
      }
    };
    ALL_TRACKS.forEach(tr=>{
      if(!at.includes(tr.id))return;if(s&&s!==tr.id)return;if(m[tr.id])return;
      const gSt=R.sig?.steps||16;
      if(R.view==="euclid"){
        // Distribute N Euclid steps evenly across gSt global ticks.
        // For N<=gSt: step i fires at tick round(i*gSt/N). Invert to find
        //   which steps fire at tick sn → range [ceil((2sn-1)N/2gSt), ceil((2sn+1)N/2gSt))
        // For N>gSt:  steps floor(sn*N/gSt)..floor((sn+1)*N/gSt)-1 fire at tick sn.
        const N=R.pb[R.cp]?._steps?.[tr.id]||gSt;
        let startI,endI;
        if(N<=gSt){
          startI=Math.max(0,Math.ceil((2*sn-1)*N/(2*gSt)));
          endI=Math.min(N,Math.ceil((2*sn+1)*N/(2*gSt)));
        }else{
          startI=Math.floor(sn*N/gSt);
          endI=Math.min(N,Math.floor((sn+1)*N/gSt));
        }
        const cnt=endI-startI;
        for(let j=startI;j<endI;j++){playTrStep(tr,j,cnt>1?time+(j-startI)*bd/cnt:time);}
      }else{
        const tSteps=[gSt,gSt*2].includes(R.pb[R.cp]?._steps?.[tr.id])?R.pb[R.cp]._steps[tr.id]:gSt;
        const ratio=Math.max(1,Math.round(tSteps/gSt));
        if(ratio>1){for(let i=0;i<ratio;i++)playTrStep(tr,sn*ratio+i,time+i*bd/ratio);}
        else{playTrStep(tr,sn%tSteps,time);}
      }
    });
  },[]);

  const schLoop=useCallback(()=>{
    if(!engine.ctx)return;const ct=engine.ctx.currentTime;
    // H.1a: adaptive look-ahead + tick interval for mobile
    const LA=engine.isMobile?0.18:0.1;
    const schDelay=engine.isMobile?20:25;
    if(R.view==="euclid"){
      // ── Euclid: independent per-track polyrhythm clock ──
      // Fixed step = 1/16th note — each track's cycle duration is N × (1/16th).
      // N=16 → 1 bar, N=7 → 7/16 bar (faster), N=24 → 1.5 bars (slower).
      // This gives genuinely different angular speeds per ring.
      const sixteenth=(60/R.bpm)/4;
      const at=R.at;const m=R.mut;const s=R.sol;
      let dirty=false;
      ALL_TRACKS.forEach(tr=>{
        if(!at.includes(tr.id))return;if(s&&s!==tr.id)return;if(m[tr.id])return;
        const N=R.pb[R.cp]?._steps?.[tr.id]||16;
        const stepDur=sixteenth;
        if(!euclidClockR.current[tr.id]||euclidClockR.current[tr.id].nextTime<ct-0.5){euclidClockR.current[tr.id]={step:0,nextTime:ct+0.05};}
        const ec=euclidClockR.current[tr.id];
        while(ec.nextTime<ct+LA){
          const si=ec.step;
          if(R.pat?.[tr.id]?.[si]){
            const sp=R.prob[tr.id]?.[si]??100;
            if(Math.random()*100<sp){
              const v=(R.vel[tr.id]?.[si]??100)/100;
              const r=R.ratch[tr.id]?.[si]||1;
              const nd=R.sn[tr.id]?.[si]||0;
              for(let ri=0;ri<r;ri++)engine.play(tr.id,v*(ri===0?1:0.65),(ri===0?nd:0),R.fx[tr.id]||{...DEFAULT_FX},ec.nextTime+ri*(stepDur/r));
            }
          }
          ec.curStep=si;ec.step=(ec.step+1)%N;ec.nextTime+=stepDur;dirty=true;
        }
      });
      if(dirty){const cur={};ALL_TRACKS.forEach(tr=>{if(euclidClockR.current[tr.id]!=null)cur[tr.id]=euclidClockR.current[tr.id].curStep??-1;});setEuclidCur(cur);}
      // Metro in Euclid: 1/16th-note pulse (the Euclid grid step), accent every 4th (quarter note)
      if(R.metro){
        const sxt=(60/R.bpm)/4; // sixteenth note
        const em=euclidMetroR.current;
        if(!em.nextTime||em.nextTime<ct-0.5){em.nextTime=ct+0.05;em.beat=0;}
        while(em.nextTime<ct+0.1){
          playClk(em.nextTime,em.beat===0?"accent":em.beat%2===0?"beat":"sub");
          em.beat=(em.beat+1)%4;em.nextTime+=sxt;
        }
      }
      {const now=performance.now();const drift=lastTickRef.current!==null?(now-lastTickRef.current)-schDelay:0;lastTickRef.current=now;schRef.current=setTimeout(schLoop,Math.max(5,schDelay-drift));}
      return;
    }
    // ── Linear / Pads: global step scheduler ──
    const cs=R.sig;const gr=cs.groups||[cs.steps];
    if(nxtRef.current<ct-0.05)nxtRef.current=ct+0.02; // resync if stale (e.g. switching from Euclid)
    while(nxtRef.current<ct+LA){
      const prevStep=R.step;
      R.step=(R.step+1)%cs.steps;
      // Song mode: advance pattern on cycle wrap
      if(R.step===0&&prevStep>=0&&R.songMode&&R.songChain.length>0){
        songPosRef.current=(songPosRef.current+1)%R.songChain.length;
        const nextPat=R.songChain[songPosRef.current];
        if(nextPat!==R.cp){R.cp=nextPat;setCPat(nextPat);}
      }
      const st=nxtRef.current;schSt(R.step,st);
      if(R.metro){const gs=isGS(R.step,gr,cs.accents||[0]);const sd=cs.subDiv||1;if(gs.y)playClk(st,gs.f?"accent":"beat");else if(R.step%sd===0)playClk(st,"sub");}
      const bd=cs.stepDiv?(60/R.bpm)/cs.stepDiv:(60/R.bpm)*cs.beats/cs.steps;
      const sw=bd*(R.sw/100);nxtRef.current+=R.step%2===0?(bd-sw):(bd+sw);
    }
    setCStep(R.step);
    {const now=performance.now();const drift=lastTickRef.current!==null?(now-lastTickRef.current)-schDelay:0;lastTickRef.current=now;schRef.current=setTimeout(schLoop,Math.max(5,schDelay-drift));}
  },[schSt]);

  const startStop=async()=>{
    await engine.ensureRunning();
    // Android WebView: AudioContext may be suspended after ensureRunning on older browsers
    if(engine.ctx.state==='suspended'){
      engine.ctx.onstatechange=()=>{if(engine.ctx.state==='running')setCtxSuspended(false);};
      setCtxSuspended(true);
      return;
    }
    if(playing){
      clearTimeout(schRef.current);setPlaying(false);setCStep(-1);R.step=-1;setRec(false);
      euclidClockR.current={};setEuclidCur({});euclidMetroR.current={nextTime:null,beat:0};
    }else{
      R.step=-1;songPosRef.current=0;nxtRef.current=engine.ctx.currentTime+0.05;
      // Song arranger: reset to first pattern in chain so display + playback are in sync
      if(R.songMode&&R.songChain.length>0){const fp=R.songChain[0];setCPat(fp);R.cp=fp;}
      euclidClockR.current={};setEuclidCur({});euclidMetroR.current={nextTime:null,beat:0};
      schLoop();setPlaying(true);
    }
  };
  ssRef.current=startStop;

  // CP-E: First launch — load Boom Bap + auto-start + mark launched
  useEffect(()=>{
    if(!appSt.launched){
      const bb=SEQUENCER_TEMPLATES.find(t=>t.name==="Boom Bap");
      if(bb){
        setBpm(bb.bpm);
        setPBank(pb=>{const n=[...pb];const cp={...n[0]};
          if(bb.steps?.kick)cp.kick=[...bb.steps.kick];
          if(bb.steps?.snare)cp.snare=[...bb.steps.snare];
          if(bb.steps?.hihat)cp.hihat=[...bb.steps.hihat];
          n[0]=cp;return n;
        });
        setAct(a=>[...new Set([...a,"kick","snare","hihat"])]);
      }
      setTimeout(()=>engine.ensureRunning().then(()=>{if(!R.playing)ssRef.current?.();}),800);
      setLaunched();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // CP-E: Usage time tracking
  useEffect(()=>{
    const iv=setInterval(()=>addUsageTime(1),1000);
    return()=>clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // F.1a: REC without playback — countdown 1 bar then auto-start
  // ── CP-B: Export WAV ─────────────────────────────────────────────────────────
  const exportWAV=async()=>{
    await engine.ensureRunning();
    setExportState("rendering");
    try{
      const dur=(60/bpm)*sig.beats*exportBars;
      const sr=engine.ctx.sampleRate;
      const offCtx=new OfflineAudioContext(2,Math.ceil(sr*dur),sr);

      // ── Helper: schedule one hit at time t ──────────────────────────────────
      const schedHit=(tid:string,stepIdx:number,t:number,fo:any)=>{
        const vel=(stVel[tid]?.[stepIdx]??100)/100;
        if(!(pat[tid]?.[stepIdx]))return;
        const dst=offCtx.createGain();dst.gain.value=vel;dst.connect(offCtx.destination);
        if(engine.buf[tid]){
          const src=offCtx.createBufferSource();src.buffer=engine.buf[tid];
          const r=Math.pow(2,((fo.onPitch?fo.pitch:0)||0)/12);
          src.playbackRate.value=r;src.connect(dst);src.start(t);
        }else{
          engine._syn(tid,t,vel,dst,offCtx,
            {sDec:fo.sDec??1,sTune:fo.sTune??1,
             sPunch:fo.sPunch??1,sSnap:fo.sSnap??1,
             sBody:fo.sBody??1,sTone:fo.sTone??1});
        }
      };

      if(view==="euclid"){
        // ── Euclid: each track steps at 1/16th, loops its own N ──────────────
        const sixteenth=(60/bpm)/4;
        const totalSteps=Math.floor(dur/sixteenth);
        atO.forEach(tr=>{
          if(muted[tr.id])return;if(soloed&&soloed!==tr.id)return;
          const N=trackSteps[tr.id]||sig.steps;
          const fo=fx[tr.id]||{...DEFAULT_FX};
          for(let s=0;s<totalSteps;s++){
            const stepIdx=s%N;
            if(!pat[tr.id]?.[stepIdx])continue;
            const nm=stNudge[tr.id]?.[stepIdx]||0;
            const t=Math.max(0.001,s*sixteenth+nm/1000);
            schedHit(tr.id,stepIdx,t,fo);
          }
        });
      }else{
        // ── Sequencer / Pads: one pass through sig.steps ─────────────────────
        const sd=dur/sig.steps;
        atO.forEach(tr=>{
          if(muted[tr.id])return;if(soloed&&soloed!==tr.id)return;
          const fo=fx[tr.id]||{...DEFAULT_FX};
          for(let s=0;s<sig.steps;s++){
            if(!pat[tr.id]?.[s])continue;
            const nm=stNudge[tr.id]?.[s]||0;
            const t=Math.max(0.001,s*sd+nm/1000);
            schedHit(tr.id,s,t,fo);
          }
        });
      }

      const rd=await offCtx.startRendering();
      const wav=encodeWAV(rd);
      const blob=new Blob([wav],{type:"audio/wav"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      const pName=(pBank[cPat] as any)?._name||`PAT${cPat+1}`;
      const viewTag=view==="euclid"?"euclid":view==="pads"?"pads":"seq";
      a.download=`ks-${pName}-${bpm}bpm-${sig.label}-${exportBars}bar-${viewTag}.wav`;
      a.click();URL.revokeObjectURL(url);
    }catch(e){console.error("Export WAV error",e);}
    setExportState("idle");
  };

  // ── CP-B: Export Looper WAV ───────────────────────────────────────────────────
  const exportLooperWAV=async()=>{
    const L=loopRef.current;
    if(!L.events.length)return;
    await engine.ensureRunning();
    setLoopExportState("rendering");
    try{
      const loopDur=L.lengthMs/1000;
      const totalDur=loopDur*loopExportReps;
      const sr=engine.ctx.sampleRate;
      const offCtx=new OfflineAudioContext(2,Math.ceil(sr*totalDur),sr);
      for(let rep=0;rep<loopExportReps;rep++){
        L.events.forEach(ev=>{
          const t=Math.max(0.001,ev.tOff/1000+rep*loopDur);
          const fo=(fx as any)[ev.tid]||{...DEFAULT_FX};
          const dst=offCtx.createGain();dst.gain.value=ev.vel;dst.connect(offCtx.destination);
          if(engine.buf[ev.tid]){
            const src=offCtx.createBufferSource();src.buffer=engine.buf[ev.tid];
            const r=Math.pow(2,((fo.onPitch?fo.pitch:0)||0)/12);
            src.playbackRate.value=r;src.connect(dst);src.start(t);
          }else{
            engine._syn(ev.tid,t,ev.vel,dst,offCtx,
              {sDec:fo.sDec??1,sTune:fo.sTune??1,
               sPunch:fo.sPunch??1,sSnap:fo.sSnap??1,
               sBody:fo.sBody??1,sTone:fo.sTone??1});
          }
        });
      }
      const rd=await offCtx.startRendering();
      const wav=encodeWAV(rd);
      const blob=new Blob([wav],{type:"audio/wav"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=`ks-looper-${bpm}bpm-${loopBars}bar${loopExportReps>1?`x${loopExportReps}`:""}.wav`;
      a.click();URL.revokeObjectURL(url);
    }catch(e){console.error("Looper export error",e);}
    setLoopExportState("idle");
  };

  const onRecClick=()=>{
    if(playing){setRec(p=>!p);return;}
    // Click REC while stopped → countdown 1 bar → start + rec
    setRecCountdown(true);
    const barMs=(60000/Math.max(30,bpm))*sig.beats;
    setTimeout(async()=>{
      setRecCountdown(false);
      await engine.ensureRunning();
      R.step=-1;songPosRef.current=0;if(engine.ctx)nxtRef.current=engine.ctx.currentTime+0.05;
      if(R.songMode&&R.songChain.length>0){const fp=R.songChain[0];setCPat(fp);R.cp=fp;}
      euclidClockR.current={};setEuclidCur({});euclidMetroR.current={nextTime:null,beat:0};
      schLoop();setPlaying(true);setRec(true);
    },barMs);
  };
  useEffect(()=>()=>clearTimeout(schRef.current),[]);
  // Probe Ableton Link WebSocket — hide button if localhost refuses immediately (Android WebView)
  useEffect(()=>{
    if(typeof WebSocket==='undefined'){setHasLinkApi(false);return;}
    let gone=false;
    try{
      const probe=new WebSocket('ws://localhost:9898');
      const t=setTimeout(()=>{if(!gone){gone=true;probe.close();}},800);
      probe.onopen=()=>{clearTimeout(t);gone=true;probe.close();setHasLinkApi(true);};
      probe.onerror=()=>{if(!gone){clearTimeout(t);gone=true;setHasLinkApi(false);}};
      probe.onclose=(e)=>{if(!gone){clearTimeout(t);gone=true;if(e.code===1006)setHasLinkApi(false);}};
    }catch(e){setHasLinkApi(false);}
  },[]);

  // ── Looper engine ──
  const loopSchedFn=()=>{
    const L=loopRef.current;const ctx=engine.ctx;
    if(!ctx||L.audioStart===null)return;
    const now=ctx.currentTime;const ahead=0.12;
    const lenSec=L.lengthMs/1000;
    const elapsed=now-L.audioStart;
    const loopN=Math.floor(elapsed/lenSec);
    L.events.forEach(ev=>{
      const tSec=ev.tOff/1000;
      for(let n=Math.max(0,loopN-1);n<=loopN+2;n++){
        const evTime=L.audioStart+n*lenSec+tSec;
        const key=`${ev.id}:${n}`;
        if(evTime>=now-0.01&&evTime<=now+ahead&&!L.scheduled.has(key)){
          L.scheduled.add(key);
          const delay=Math.max(0,evTime-now);
          engine.play(ev.tid,ev.vel,delay,R.fx[ev.tid]||{...DEFAULT_FX});
          setTimeout(()=>L.scheduled.delete(key),(delay+1)*1000);
        }
      }
    });
    // Metro clicks anchored to L.audioStart so beat 0 = loop start = accent
    if(R.metro){
      const beatSec=60/Math.max(30,R.bpm);
      const sigBeats=R.sig?.beats||4;
      const loopElapsed=now-L.audioStart;
      const firstBeatIdx=Math.ceil((loopElapsed-0.005)/beatSec);
      for(let bn=Math.max(0,firstBeatIdx);L.audioStart+bn*beatSec<now+ahead;bn++){
        const bt=L.audioStart+bn*beatSec;
        const bKey=`lm:${bn}`;
        if(!L.scheduled.has(bKey)){
          L.scheduled.add(bKey);
          const bInBar=bn%sigBeats;
          playClk(bt,bInBar===0?"accent":"beat");
          setTimeout(()=>L.scheduled.delete(bKey),(bt-now+1.5)*1000);
        }
      }
    }
    L.schTimer=setTimeout(loopSchedFn,25);
  };
  const startLooper=async(isRec=false)=>{
    await engine.ensureRunning();
    const L=loopRef.current;
    L.lengthMs=(60000/Math.max(30,R.bpm))*4*loopBars;
    // Fix silence: when replaying existing events, shift audioStart back so first event fires immediately
    const minToff=(!isRec&&L.events.length>0)?Math.min(...L.events.map(e=>e.tOff)):0;
    L.audioStart=engine.ctx.currentTime-minToff/1000;
    L.perfStart=performance.now()-minToff;
    L.scheduled=new Set();
    loopSchedFn();
    // RAF playhead
    const animate=()=>{
      const LL=loopRef.current;
      if(LL.audioStart===null||!engine.ctx)return;
      const el=engine.ctx.currentTime-LL.audioStart;
      const lenS=LL.lengthMs/1000;
      setLoopPlayhead((el%lenS)/lenS);
      loopPhRef.current=requestAnimationFrame(animate);
    };
    cancelAnimationFrame(loopPhRef.current);
    loopPhRef.current=requestAnimationFrame(animate);
    setLoopPlaying(true);
  };
  const stopLooper=()=>{
    clearTimeout(loopRef.current.schTimer);
    cancelAnimationFrame(loopPhRef.current);
    loopRef.current.audioStart=null;
    setLoopPlaying(false);setLoopRec(false);setLoopPlayhead(0);
  };
  const _armLoopRec=async()=>{
    const L=loopRef.current;L.passId++;L.events=[];setLoopDisp([]);
    setLoopRec(true);await startLooper(true);
  };
  const toggleLoopRec=()=>{
    if(!loopPlaying){
      if(loopMetro&&engine.ctx){
        // Metro countdown: 1 bar of clicks then arm+start
        const barMs=(60000/Math.max(30,R.bpm))*sig.beats;
        const beatMs=barMs/sig.beats;
        setRecCountdown(true);
        for(let i=0;i<sig.beats;i++){
          setTimeout(()=>{if(engine.ctx)playClk(engine.ctx.currentTime,i===0?"accent":"beat");},i*beatMs);
        }
        setTimeout(()=>{setRecCountdown(false);_armLoopRec();},barMs);
      }else{
        _armLoopRec();
      }
    }else if(!loopRec){
      // Playing but not recording → overdub: add new pass over existing loop
      loopRef.current.passId++;setLoopRec(true);
    }else{
      // Stop recording, keep playing
      setLoopRec(false);
    }
  };
  R.toggleLoopRec=toggleLoopRec;
  const undoLoopPass=()=>{
    const L=loopRef.current;
    if(!L.passId)return;
    L.events=L.events.filter(e=>e.pass<L.passId);
    L.passId=Math.max(0,L.passId-1);
    setLoopDisp([...L.events]);
  };
  const clearLooper=()=>{
    stopLooper();
    loopRef.current.events=[];loopRef.current.passId=0;
    setLoopDisp([]);
  };
  const freshRecLooper=async()=>{
    // Stop playback + wipe events, then immediately arm a fresh recording
    clearLooper();
    await new Promise(r=>setTimeout(r,0)); // flush React state
    await _armLoopRec();
  };


  // Step interactions
  // Keep snapshot refs always current (assigned during render)
  _pbRef.current=pBank;_epRef.current=euclidParams;_svRef.current=stVel;_snRef.current=stNudge;_spRef.current=stProb;_srRef.current=stRatch;
  const _snap=()=>({pBank:JSON.parse(JSON.stringify(_pbRef.current)),euclidParams:JSON.parse(JSON.stringify(_epRef.current)),stVel:JSON.parse(JSON.stringify(_svRef.current)),stNudge:JSON.parse(JSON.stringify(_snRef.current)),stProb:JSON.parse(JSON.stringify(_spRef.current)),stRatch:JSON.parse(JSON.stringify(_srRef.current))});
  const _updHL=()=>setHistLen({past:histRef.current.past.length,future:histRef.current.future.length});
  const pushHistory=()=>{histRef.current.past.push(_snap());if(histRef.current.past.length>60)histRef.current.past.shift();histRef.current.future=[];_updHL();};
  const undo=()=>{const h=histRef.current;if(!h.past.length)return;h.future.push(_snap());const s=h.past.pop();setPBank(s.pBank);setEuclidParams(s.euclidParams);setStVel(s.stVel);setStNudge(s.stNudge);setStProb(s.stProb);setStRatch(s.stRatch);_updHL();};
  const redo=()=>{const h=histRef.current;if(!h.future.length)return;h.past.push(_snap());const s=h.future.pop();setPBank(s.pBank);setEuclidParams(s.euclidParams);setStVel(s.stVel);setStNudge(s.stNudge);setStProb(s.stProb);setStRatch(s.stRatch);_updHL();};
  R.undo=undo;R.redo=redo;R.pushHistory=pushHistory;

  // ── Kit applier ─────────────────────────────────────────────────────────────
  const applyKit=(kit:typeof DRUM_KITS[number])=>{
    const idx=DRUM_KITS.findIndex(k=>k.id===kit.id);
    setKitIdx(Math.max(0,idx));
    const kitSamples=kit.samples as Record<string,string>;
    // Build updated fx map locally (needed before React state batch)
    // Compute new fx synchronously — use R.fx (ref) to avoid stale closure on `fx`
    const prevFx=R.fx as typeof fx;
    const nextFx={...prevFx};
    Object.keys(nextFx).forEach(tid=>{nextFx[tid]={...nextFx[tid],...kit.shape};});
    setFx(nextFx);
    // Audio: clear old buffers immediately so _syn uses new shape params right away,
    // then re-render or load real samples asynchronously
    const allTids=Object.keys(nextFx);
    allTids.forEach(tid=>{
      const newFx=nextFx[tid];
      if(kitSamples[tid]){
        // Real sample: clear buffer so synthesis plays with new params while loading
        delete (engine.buf as any)[tid];
        engine.loadUrl(tid,kitSamples[tid]).then(ok=>{
          if(!ok&&engine.ctx)engine.renderShape(tid,newFx,true).catch(()=>{});
        });
      } else {
        // Synthesis: clear old buffer first (instant sonic change via _syn), then re-render
        delete (engine.buf as any)[tid];
        if(engine.ctx)engine.renderShape(tid,newFx,true).catch(()=>{});
      }
    });
    // Update display labels
    setSmpN(prev=>{
      const next={...prev};
      ALL_TRACKS.forEach(tr=>{
        next[tr.id]=kitSamples[tr.id]
          ?`${tr.label} · ${kit.name} [sample]`
          :`${tr.label} · ${kit.name}`;
      });
      return next;
    });
  };

  const loadTemplate=(tpl:typeof SEQUENCER_TEMPLATES[0],variant:"16"|"32"="16")=>{
    pushHistory();
    const use32=variant==="32"&&!!tpl.steps32;
    const stepsMap=use32?tpl.steps32!:tpl.steps;
    const velMap=use32?(tpl.vel32??tpl.vel):tpl.vel;
    const ns=use32?32:16;
    // Resize to target step count via time sig change
    const targetSig=use32
      ?TIME_SIGS.find(s=>s.steps===32)??TIME_SIGS[0]
      :TIME_SIGS.find(s=>s.label==="4/4")??TIME_SIGS[0];
    chSig(targetSig);
    // Apply steps to current pattern (runs after resize batch)
    const allIds=[...ALL_TRACKS.map(t=>t.id),...customTracks.map(t=>t.id)];
    setPBank(pb=>{
      const n=[...pb];const curr={...n[cPat]};
      allIds.forEach(id=>{if(Array.isArray(curr[id]))curr[id]=Array(ns).fill(0);});
      Object.entries(stepsMap).forEach(([tid,steps])=>{curr[tid]=[...(steps as number[])];});
      curr._name=tpl.name;n[cPat]=curr;return n;
    });
    // Apply humanized velocities
    const tplIds=Object.keys(stepsMap);
    if(velMap){
      setStVel(p=>{const n={...p};tplIds.forEach(id=>{const v=(velMap as any)[id];n[id]=v?[...(v as number[])]:Array(ns).fill(100);});return n;});
    }
    setStNudge(p=>{const n={...p};tplIds.forEach(id=>{n[id]=Array(ns).fill(0);});return n;});
    setStProb(p=>{const n={...p};tplIds.forEach(id=>{n[id]=Array(ns).fill(100);});return n;});
    setStRatch(p=>{const n={...p};tplIds.forEach(id=>{n[id]=Array(ns).fill(1);});return n;});
    // Activate all tracks used in this template
    setAct(prev=>{const next=[...prev];tplIds.forEach(id=>{if(!next.includes(id))next.push(id);});return next;});
    if(tpl.bpm)setBpm(tpl.bpm);
    // Apply default kit for this template
    const kitId=TEMPLATE_KITS[tpl.id];
    if(kitId){const kit=DRUM_KITS.find(k=>k.id===kitId);if(kit)applyKit(kit);}
    setSwipeToast(`${(tpl as any).icon||"✓"} ${tpl.name} · ${ns} steps`);
    setTimeout(()=>setSwipeToast(null),1200);
  };

  // ── Euclid template loader ─────────────────────────────────────────────────
  const loadEuclidTemplate=(tpl:EuclidTemplate)=>{
    pushHistory();
    const paramEntries=Object.entries(tpl.params) as [string,{N:number,hits:number,rot?:number}][];
    const newTids=paramEntries.map(([tid])=>tid);
    // ── 1. Reset euclidParams to ONLY the new preset's tracks ──
    setEuclidParams(()=>{
      const next:{[k:string]:any}={};
      paramEntries.forEach(([tid,p])=>{
        next[tid]={N:p.N,hits:p.hits,rot:p.rot??0,tpl:tpl.name,fold:false};
      });
      return next;
    });
    // ── 2. Clear the current pattern entirely, then write new preset ──
    setPBank(pb=>{
      const n=[...pb];
      // Start with a blank slate for this slot: zero out ALL tracks' steps + _steps
      const cp:any={_steps:{}};
      [...ALL_TRACKS,...customTracks].forEach(t=>{cp[t.id]=[];});
      // Write the new preset's Euclidean rhythms
      paramEntries.forEach(([tid,p])=>{
        const N=p.N;const hits=p.hits;const rot=p.rot??0;
        const raw=euclidRhythm(hits,N);
        const r2=((rot%Math.max(N,1))+Math.max(N,1))%Math.max(N,1);
        const rotated=[...raw.slice(r2),...raw.slice(0,r2)].map(v=>v?100:0);
        cp._steps[tid]=N;
        cp[tid]=[...rotated];
      });
      n[cPat]=cp;
      return n;
    });
    // ── 3. Activate ONLY the tracks in this preset ──
    setAct(newTids);
    if(tpl.bpm)setBpm(tpl.bpm);
    // Apply default kit for this euclid preset
    const kitId=TEMPLATE_KITS[tpl.id];
    if(kitId){const kit=DRUM_KITS.find(k=>k.id===kitId);if(kit)applyKit(kit);}
    setSwipeToast(`${tpl.icon} ${tpl.name} · Euclidean`);
    setTimeout(()=>setSwipeToast(null),1400);
  };

  const handleClick=(tid,step)=>{pushHistory();setPat(p=>{const r=[...(p[tid]||[])];r[step]=r[step]?0:1;return{...p,[tid]:r};});};
  const didDragRef=useRef(false);
  const startDrag=(tid,step,e)=>{
    e.preventDefault();
    const ac=!!pat[tid]?.[step];
    // Pointer Events API: single entry point for mouse, touch and pen — no double-fire
    const isTouch=e.pointerType==="touch"||e.pointerType==="pen";
    const el=e.currentTarget as HTMLElement;
    const pointerId=e.pointerId;
    const rect=el.getBoundingClientRect();
    el.setPointerCapture(pointerId);
    const startX=e.clientX,startY=e.clientY;
    const startNudge=stNudge[tid]?.[step]||0;const startVel=stVel[tid]?.[step]??100;
    // Wider dead-zone on touch to absorb natural finger jitter
    const moveThr=isTouch?10:5;
    let axis=null;let moved=false;let longPressed=false;let toggledEarly=false;
    didDragRef.current=false;
    // Immediate toggle for inactive steps (pointer events guarantee no double-fire)
    if(!ac){pushHistory();setPat(p=>{const r=[...(p[tid]||[])];r[step]=1;return{...p,[tid]:r};});toggledEarly=true;}
    else setDragInfo({tid,step,axis:null});
    const mv=(ev:PointerEvent)=>{
      if(!ac||longPressed)return;
      const dx=ev.clientX-startX,dy=ev.clientY-startY;
      if(!axis&&(Math.abs(dx)>moveThr||Math.abs(dy)>moveThr)){clearTimeout(longTimer);axis=Math.abs(dx)>Math.abs(dy)?"h":"v";moved=true;didDragRef.current=true;setDragInfo({tid,step,axis});}
      if(axis==="h"){const nv=Math.round((startNudge+dx*0.5)/5)*5;setStNudge(p=>{const n={...p};const src=n[tid];const a=Array.isArray(src)?[...src]:Array(STEPS).fill(0);a[step]=Math.max(-NR,Math.min(NR,nv));n[tid]=a;return n;});}
      else if(axis==="v"){const nv=Math.round(startVel-dy*0.8);setStVel(p=>{const n={...p};const src=n[tid];const a=Array.isArray(src)?[...src]:Array(STEPS).fill(100);a[step]=Math.max(5,Math.min(100,nv));n[tid]=a;return n;});}
    };
    const up=()=>{
      clearTimeout(longTimer);setDragInfo(null);
      el.removeEventListener("pointermove",mv);el.removeEventListener("pointerup",up);el.removeEventListener("pointercancel",up);
      // toggledEarly: step already activated at pointer-down → skip double-toggle
      if(!longPressed&&!moved&&!toggledEarly){dblTap(tid,step);setTimeout(()=>{if(!didDragRef.current)handleClick(tid,step);},10);}
    };
    // Long-press (600ms mouse / 650ms touch on active steps only) → probability popover
    const longTimer=ac?setTimeout(()=>{
      longPressed=true;moved=true;setDragInfo(null);el.removeEventListener("pointermove",mv);
      const px=Math.min(Math.max(rect.left+rect.width/2-70,8),window.innerWidth-160);
      const py=Math.min(Math.max(rect.top-120,8),window.innerHeight-170);
      setProbPopover({tid,step,x:px,y:py});
    },isTouch?650:600):null;
    el.addEventListener("pointermove",mv);el.addEventListener("pointerup",up,{once:true});el.addEventListener("pointercancel",up,{once:true});
  };
  const lastTap=useRef({});
  const dblTap=(tid,step)=>{
    const key=`${tid}-${step}`;const now=Date.now();
    if(lastTap.current[key]&&now-lastTap.current[key]<450){
      setStNudge(p=>{const n={...p};const src=n[tid];const a=Array.isArray(src)?[...src]:Array(STEPS).fill(0);a[step]=0;n[tid]=a;return n;});
      setStVel(p=>{const n={...p};const src=n[tid];const a=Array.isArray(src)?[...src]:Array(STEPS).fill(100);a[step]=100;n[tid]=a;return n;});
      didDragRef.current=true;lastTap.current[key]=0;
    }else lastTap.current[key]=now;
  };

  // Shift-click: cycle probability 100→75→50→25→100
  const handleShiftClick=(tid,step,e)=>{
    if(!e.shiftKey)return false;
    if(!pat[tid]?.[step])return true;
    pushHistory();
    const cur=stProb[tid]?.[step]??100;
    const presets=[100,75,50,25];const idx=presets.indexOf(cur);
    const next=presets[(idx+1)%presets.length];
    setStProb(p=>{const n={...p};const src=n[tid];const a=Array.isArray(src)?[...src]:Array(STEPS).fill(100);a[step]=next;n[tid]=a;return n;});
    return true;
  };


  const fileRef=useRef(null);const ldRef=useRef(null);
  const ldFile=tid=>{ldRef.current=tid;if(fileRef.current){fileRef.current.value="";fileRef.current.click();}};
  const onFile=async e=>{const f=e.target.files?.[0];const tid=ldRef.current;if(!f||!tid)return;engine.init();const ok=await engine.load(tid,f);if(ok){setSmpN(p=>({...p,[tid]:f.name}));engine.play(tid,1,0,R.fx[tid]);}ldRef.current=null;};

  const pill=(on,c)=>({padding:"5px 11px",border:`1px solid ${on?c+"55":th.sBorder}`,borderRadius:6,background:on?c+"18":"transparent",color:on?c:th.dim,fontSize:9,fontWeight:700,cursor:"pointer",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"inherit"});

  const CUST_ICONS=["◉","◈","⬟","⬡","◳","⬢","◙","⟡"];
  const addCustomTrack=()=>{
    const name=newTrackName.trim();if(!name)return;
    const id=`ct_${Date.now()}`;const N=STEPS;
    const usedCols=customTracks.map(c=>c.color);const custCol=SEC_COL.find(c=>!usedCols.includes(c))||SEC_COL[customTracks.length%SEC_COL.length];
    const t={id,label:name.toUpperCase().slice(0,10),icon:CUST_ICONS[customTracks.length%CUST_ICONS.length],color:custCol};
    setCustomTracks(p=>[...p,t]);
    setPBank(pb=>pb.map(pat=>({...pat,[id]:Array(N).fill(0),_steps:{...(pat._steps||{}),[id]:N}})));
    setStVel(p=>({...p,[id]:Array(N).fill(100)}));
    setStNudge(p=>({...p,[id]:Array(N).fill(0)}));
    setStProb(p=>({...p,[id]:Array(N).fill(100)}));
    setStRatch(p=>({...p,[id]:Array(N).fill(1)}));
    setFx(p=>({...p,[id]:{...DEFAULT_FX}}));
    setAct(a=>[...a,id]);
    setNewTrackName("");setShowCustomInput(false);setShowAdd(false);
    // Pre-render 808 cowbell for this custom track, then play a preview
    setSmpN(p=>({...p,[id]:"808 Cowbell (synth)"}));
    engine.init();
    if(!engine.ch[id])engine._build(id);
    (async()=>{
      try{
        const sr=engine.ctx.sampleRate;
        const oCtx=new OfflineAudioContext(1,Math.ceil(sr*0.65),sr);
        engine._syn(id,0,1,oCtx.destination,oCtx);
        engine.buf[id]=await oCtx.startRendering();
      }catch(e){console.warn("Custom 808 prerender failed",e);}
      engine.play(id,0.7,0,{...DEFAULT_FX});
    })();
  };

  // Shared custom track input UI (used in sequencer + euclid add panels)
  const CustomTrackInput=()=>showCustomInput?(
    <div style={{display:"flex",gap:4,alignItems:"center",width:"100%",marginTop:4}}>
      <input autoFocus value={newTrackName} onChange={e=>setNewTrackName(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter")addCustomTrack();if(e.key==="Escape"){setShowCustomInput(false);setNewTrackName("");}}}
        placeholder="Track name…" maxLength={10}
        style={{flex:1,height:26,borderRadius:5,border:`1px solid ${th.sBorder}`,background:"transparent",color:th.text,fontSize:10,fontWeight:700,padding:"0 8px",fontFamily:"inherit",outline:"none"}}/>
      <button onClick={addCustomTrack} style={{padding:"4px 10px",borderRadius:5,border:"1px solid rgba(48,209,88,0.4)",background:"rgba(48,209,88,0.1)",color:"#30D158",fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>ADD</button>
      <button onClick={()=>{setShowCustomInput(false);setNewTrackName("");}} style={{width:22,height:26,borderRadius:5,border:"none",background:"transparent",color:th.dim,fontSize:11,cursor:"pointer",lineHeight:1}}>✕</button>
    </div>
  ):(
    <button onClick={()=>setShowCustomInput(true)} style={{padding:"4px 10px",borderRadius:6,border:`1px dashed ${th.sBorder}`,background:"transparent",color:th.dim,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ CUSTOM</button>
  );

  // ── MIDI Learn inline badge ──
  const MidiTag=({id})=>{
    const n=midiNoteMap[id]??null; // treat undefined as null
    const learning=midiLearnTrack===id;
    // Only visible during MIDI learn mode
    if(!midiLM)return null;
    const handleClick=async e=>{
      e.stopPropagation();
      // If MIDI not yet active, initialize first
      if(!midiNotes){const ok=await initMidi();if(!ok)return;setMidiNotes(true);}
      // Enter learn mode + target this param
      setMidiLM(true);
      setMidiLearnTrack(learning?null:id);
    };
    return(
      <span
        onClick={handleClick}
        title={n!==null?`MIDI: ${midiNoteName(n)} — click to remap`:"Click to map MIDI"}
        style={{display:"inline-flex",alignItems:"center",fontSize:7,fontWeight:800,borderRadius:3,
          padding:"1px 4px",cursor:"pointer",flexShrink:0,userSelect:"none",
          letterSpacing:"0.04em",transition:"all 0.15s",
          background:learning?"rgba(255,45,85,0.2)":n!==null?"rgba(255,149,0,0.15)":"rgba(255,149,0,0.06)",
          border:`1px solid ${learning?"rgba(255,45,85,0.5)":n!==null?"rgba(255,149,0,0.45)":"rgba(255,149,0,0.2)"}`,
          color:learning?"#FF2D55":"#FF9500",
          animation:learning?"rb 0.6s infinite":"none"}}
      >{learning?"● LEARN":n!==null?midiNoteName(n):"MAP"}</span>
    );
  };

  // CP-E: Tip badge helper
  const TipBadge=({id,text,color="#FFD60A"}:{id:string;text:string;color?:string})=>{
    if(appSt.tipsShown.includes(id))return null;
    return(
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:8,background:`${color}14`,border:`1px solid ${color}44`,margin:"4px 0 8px",position:"relative"}}>
        <span style={{fontSize:10}}>{color==="#FFD60A"?"💡":color==="#30D158"?"🎵":"💡"}</span>
        <span style={{fontSize:9,color,fontWeight:700,letterSpacing:"0.03em",flex:1}}>{text}</span>
        <button onClick={()=>markTipShown(id)} style={{background:"transparent",border:"none",color,fontSize:11,cursor:"pointer",padding:"0 2px",lineHeight:1,flexShrink:0}}>✕</button>
      </div>
    );
  };

  return(<>
    <div style={{minHeight:"100vh",background:th.bg,color:th.text,fontFamily:"'JetBrains Mono','SF Mono','Fira Code',monospace",overflow:"auto"}}>
      <input type="file" accept="audio/*" ref={fileRef} onChange={onFile} style={{display:"none"}}/>
      {/* keyframes migrated to src/styles/animations.css (imported in App.tsx at CP-F) */}
      {!isAudioReady&&<div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,height:2,background:"rgba(0,0,0,0.25)"}}>
        <div style={{height:"100%",background:"linear-gradient(90deg,#FF2D55,#FF9500)",animation:"audioload 0.5s ease-out forwards",willChange:"width"}}/>
      </div>}
      <div style={{maxWidth:960,margin:"0 auto",padding:"16px 12px"}}>

        {/* ── Header ── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,padding:"10px 0",borderBottom:`1px solid ${th.sBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#FF2D55,#FF9500)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"#fff",animation:playing&&gInfo(cStep).first?"logoThump 0.18s ease-out 1":"none",boxShadow:"0 0 20px rgba(255,45,85,0.3)"}}>K</div>
            <div>
              <div className="gradientShift" style={{fontSize:24,fontWeight:900,letterSpacing:"0.08em",background:"linear-gradient(90deg,#FF2D55,#FF9500,#FFD60A,#30D158,#5E5CE6)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"gradientShift 4s linear infinite"}}>KICK & SNARE</div>
              <div className="subtitleAnim" style={{fontSize:9,letterSpacing:"0.4em",color:th.dim}}>DRUM EXPERIENCE</div>
            </div>
          </div>
          {/* Animated drummer mascot + kit selector + UNDO/REDO */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
          {/* ── Kit selector ◀ [icon · NAME] ▶ ── */}
          {(()=>{
            const curKit=DRUM_KITS[kitIdx]||DRUM_KITS[0];
            const arrowBtn=(label,onClick,title)=>(
              <button onClick={onClick} title={title} style={{
                width:22,height:22,border:"1px solid rgba(255,149,0,0.28)",
                borderRadius:6,background:"rgba(255,149,0,0.07)",
                color:"#FF9500",fontSize:11,fontWeight:900,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"inherit",padding:0,lineHeight:1,
                transition:"background 0.12s,border-color 0.12s,transform 0.08s",
                flexShrink:0,
              }}
              onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(255,149,0,0.18)";(e.currentTarget as HTMLButtonElement).style.borderColor="rgba(255,149,0,0.55)";}}
              onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(255,149,0,0.07)";(e.currentTarget as HTMLButtonElement).style.borderColor="rgba(255,149,0,0.28)";}}
              onMouseDown={e=>{(e.currentTarget as HTMLButtonElement).style.transform="scale(0.88)";}}
              onMouseUp={e=>{(e.currentTarget as HTMLButtonElement).style.transform="scale(1)";}}
              >{label}</button>
            );
            return(
              <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                {arrowBtn("‹",()=>{const ni=(kitIdx-1+DRUM_KITS.length)%DRUM_KITS.length;applyKit(DRUM_KITS[ni]);},"Previous kit")}
                <div style={{
                  display:"flex",flexDirection:"column",alignItems:"center",
                  minWidth:66,padding:"3px 7px 4px",borderRadius:7,
                  background:"linear-gradient(160deg,rgba(255,149,0,0.13) 0%,rgba(255,45,85,0.09) 100%)",
                  border:"1px solid rgba(255,149,0,0.22)",
                  boxShadow:"0 0 10px rgba(255,149,0,0.08) inset",
                  cursor:"default",userSelect:"none",position:"relative",overflow:"hidden",
                }}>
                  <div style={{position:"absolute",bottom:0,left:0,right:0,height:1.5,background:"linear-gradient(90deg,transparent,#FF9500,#FF2D55,transparent)",opacity:0.7}}/>
                  <span style={{fontSize:14,lineHeight:1.1,filter:"drop-shadow(0 0 4px rgba(255,149,0,0.5))"}}>{curKit.icon}</span>
                  <span style={{fontSize:6,fontWeight:800,color:"#FF9500",letterSpacing:"0.1em",textTransform:"uppercase",marginTop:1,whiteSpace:"nowrap"}}>{curKit.name}</span>
                </div>
                {arrowBtn("›",()=>{const ni=(kitIdx+1)%DRUM_KITS.length;applyKit(DRUM_KITS[ni]);},"Next kit")}
              </div>
            );
          })()}
          {(()=>{
            const isAct=id=>act.includes(id)&&!muted[id];
            const eHit=tid=>view==="euclid"?!!pat[tid]?.[euclidCur[tid]]:!!pat[tid]?.[cStep];
            const hK=(playing&&isAct("kick")&&eHit("kick"))||flashing.has("kick");
            const hS=(playing&&isAct("snare")&&eHit("snare"))||flashing.has("snare");
            const hH=(playing&&isAct("hihat")&&eHit("hihat"))||flashing.has("hihat");
            const hRide=(playing&&isAct("ride")&&eHit("ride"))||flashing.has("ride");
            const hCrash=(playing&&isAct("crash")&&eHit("crash"))||flashing.has("crash");
            const hT=(playing&&isAct("tom")&&eHit("tom"))||flashing.has("tom");
            const hC=(playing&&isAct("clap")&&eHit("clap"))||flashing.has("clap");
            const hPerc=(playing&&isAct("perc")&&eHit("perc"))||flashing.has("perc");
            const lHit=hS||hH||hC||hPerc||hCrash;const rHit=hRide||hT;
            const lA=hS?-55:hH?-30:hCrash?-18:(hC||hPerc)?-45:5;const rA=hRide?-60:hT?-30:5;
            const anyHit=hK||hS||hH||hRide||hCrash||hT||hC||hPerc;
            const ac=(playing||anyHit)?"#FF9500":"#bbb";const hi="#FF2D55";
            const aHH=act.includes("hihat");const aS=act.includes("snare");const aK=act.includes("kick");
            const aT=act.includes("tom");const aRide=act.includes("ride");const aCrash=act.includes("crash");
            const aClap=act.includes("clap");const aPerc=act.includes("perc");
            return(
              <svg viewBox="0 0 130 52" width="130" height="52" style={{flexShrink:0,overflow:"visible",willChange:"contents",filter:playing?(anyHit?"drop-shadow(0 0 8px rgba(255,45,85,0.7))":"drop-shadow(0 0 4px rgba(255,149,0,0.45))"):"none",transition:"filter 0.08s"}}>
                {/* Hi-hat */}
                {aHH&&<g>
                  <line x1="14" y1="16" x2="14" y2="50" stroke="#ccc" strokeWidth="0.7"/>
                  <ellipse cx="14" cy="16" rx="7" ry="1.8" fill={hH?"#fff5e0":"none"} stroke={hH?hi:"#ccc"} strokeWidth={hH?1.5:0.7}/>
                  <ellipse cx="14" cy={hH?"14.5":"15"} rx="7" ry="1.8" fill="none" stroke={hH?hi:"#ccc"} strokeWidth={hH?1.5:0.7}/>
                  {hH&&<><line x1="10" y1="12" x2="8" y2="8" stroke={hi} strokeWidth="0.8" opacity="0.5"/><line x1="18" y1="12" x2="20" y2="8" stroke={hi} strokeWidth="0.8" opacity="0.5"/></>}
                </g>}
                {/* Snare */}
                {aS&&<g>
                  <rect x="22" y="30" width="16" height="7" rx="3" fill={hS?"#fff0e8":"none"} stroke={hS?hi:"#ccc"} strokeWidth={hS?1.5:0.7}/>
                  <line x1="24" y1="31" x2="24" y2="36" stroke="#ddd" strokeWidth="0.4"/><line x1="28" y1="31" x2="28" y2="36" stroke="#ddd" strokeWidth="0.4"/>
                  <line x1="32" y1="31" x2="32" y2="36" stroke="#ddd" strokeWidth="0.4"/><line x1="36" y1="31" x2="36" y2="36" stroke="#ddd" strokeWidth="0.4"/>
                  {hS&&<><line x1="22" y1="28" x2="19" y2="25" stroke={hi} strokeWidth="1" opacity="0.6"/><line x1="38" y1="28" x2="41" y2="25" stroke={hi} strokeWidth="1" opacity="0.6"/></>}
                </g>}
                {/* Kick drum */}
                {aK&&<g>
                  <ellipse cx="55" cy="42" rx="12" ry="8" fill={hK?"#ffe8e8":"none"} stroke={hK?hi:"#ccc"} strokeWidth={hK?1.8:0.7}/>
                  <ellipse cx="55" cy="42" rx="6" ry="4" fill="none" stroke={hK?hi:"#ddd"} strokeWidth="0.5"/>
                  {hK&&<><line x1="55" y1="32" x2="55" y2="28" stroke={hi} strokeWidth="1" opacity="0.5"/><line x1="48" y1="35" x2="45" y2="33" stroke={hi} strokeWidth="0.8" opacity="0.4"/><line x1="62" y1="35" x2="65" y2="33" stroke={hi} strokeWidth="0.8" opacity="0.4"/></>}
                </g>}
                {/* Tom */}
                {aT&&<g>
                  <ellipse cx="52" cy="25" rx="7" ry="3" fill={hT?"#fff0e8":"none"} stroke={hT?hi:"#ccc"} strokeWidth={hT?1.2:0.6}/>
                </g>}
                {/* Ride cymbal — flat, right side, bras droit */}
                {aRide&&<g>
                  <line x1="68" y1="13" x2="68" y2="50" stroke="#ccc" strokeWidth="0.7"/>
                  <ellipse cx="68" cy="13" rx="9" ry="2" fill={hRide?"#fffbe8":"none"} stroke={hRide?"#FFD60A":"#ccc"} strokeWidth={hRide?1.5:0.7}/>
                  {hRide&&<><line x1="64" y1="10" x2="62" y2="6" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/><line x1="72" y1="10" x2="74" y2="6" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/><line x1="68" y1="10" x2="68" y2="5" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/></>}
                </g>}
                {/* Crash cymbal — large tilted, upper right, bras gauche */}
                {aCrash&&<g>
                  <line x1="103" y1="8" x2="100" y2="50" stroke="#ccc" strokeWidth="0.7"/>
                  <ellipse cx="103" cy="8" rx="11" ry="2.8" fill={hCrash?"#fff5cc":"none"} stroke={hCrash?"#FFD60A":"#ccc"} strokeWidth={hCrash?1.8:0.7} transform="rotate(-8,103,8)"/>
                  {hCrash&&<><line x1="97" y1="4" x2="94" y2="0" stroke="#FFD60A" strokeWidth="1" opacity="0.7"/><line x1="109" y1="4" x2="112" y2="0" stroke="#FFD60A" strokeWidth="1" opacity="0.7"/><line x1="103" y1="3" x2="103" y2="-2" stroke="#FFD60A" strokeWidth="1" opacity="0.7"/></>}
                </g>}
                {/* Perc — bongo pair, close to set */}
                {aPerc&&<g>
                  <ellipse cx="81" cy="41" rx="5.5" ry="7.5" fill={hPerc?"#BF5AF222":"none"} stroke={hPerc?"#BF5AF2":"#bbb"} strokeWidth={hPerc?1.4:0.7}/>
                  <ellipse cx="81" cy="33.5" rx="5.5" ry="2" fill={hPerc?"#BF5AF222":"none"} stroke={hPerc?"#BF5AF2":"#bbb"} strokeWidth={hPerc?1.1:0.6}/>
                  <ellipse cx="89" cy="43" rx="4.5" ry="6.5" fill={hPerc?"#BF5AF222":"none"} stroke={hPerc?"#BF5AF2":"#bbb"} strokeWidth={hPerc?1.4:0.7}/>
                  <ellipse cx="89" cy="36.5" rx="4.5" ry="1.8" fill={hPerc?"#BF5AF222":"none"} stroke={hPerc?"#BF5AF2":"#bbb"} strokeWidth={hPerc?1.1:0.6}/>
                  {hPerc&&<><line x1="78" y1="31" x2="76" y2="27" stroke="#BF5AF2" strokeWidth="0.8" opacity="0.7"/><line x1="84" y1="31" x2="86" y2="27" stroke="#BF5AF2" strokeWidth="0.8" opacity="0.7"/></>}
                </g>}
                {/* Electronic pads — 1 per custom track, rack-mounted right side */}
                {customTracks.length>0&&(()=>{
                  const total=customTracks.length;const padW=7;const gap=2;const startX=130-(total*(padW+gap)-gap);
                  return(<g>
                    <line x1={startX-1} y1="18" x2={130-(gap)} y2="18" stroke="#888" strokeWidth="0.6" opacity="0.5"/>
                    {customTracks.map((ct,i)=>{
                      const px=startX+i*(padW+gap);
                      const hit=eHit(ct.id)&&playing&&act.includes(ct.id);
                      return(<g key={ct.id}>
                        <rect x={px} y="12" width={padW} height="5.5" rx="1.2" fill={hit?ct.color+"44":"none"} stroke={hit?ct.color:ct.color+"66"} strokeWidth={hit?1.2:0.6}/>
                        {hit&&<ellipse cx={px+padW/2} cy="14.75" rx="1.5" ry="1" fill={ct.color} opacity="0.7"/>}
                      </g>);
                    })}
                  </g>);
                })()}
                {/* Clap — maracas shaker near musician */}
                {aClap&&<g>
                  <ellipse cx="8" cy="28" rx="4" ry="5.5" fill={hC?"#5E5CE622":"none"} stroke={hC?"#5E5CE6":"#bbb"} strokeWidth={hC?1.3:0.7}/>
                  <line x1="8" y1="33" x2="8" y2="45" stroke={hC?"#5E5CE6":"#bbb"} strokeWidth={hC?1.2:0.7}/>
                  {hC&&<><line x1="4" y1="25" x2="2" y2="21" stroke="#5E5CE6" strokeWidth="0.8" opacity="0.6"/><line x1="12" y1="25" x2="14" y2="21" stroke="#5E5CE6" strokeWidth="0.8" opacity="0.6"/></>}
                </g>}
                <g style={{animation:playing?"mbob 0.45s ease-in-out infinite":anyHit?"none":"none",transformBox:"fill-box"}}>
                  <ellipse cx="44" cy="38" rx="6" ry="2" fill="none" stroke="#bbb" strokeWidth="0.8"/>
                  <line x1="38" y1="38" x2="36" y2="50" stroke="#bbb" strokeWidth="0.7"/><line x1="50" y1="38" x2="52" y2="50" stroke="#bbb" strokeWidth="0.7"/>
                  <path d="M41,37 Q37,43 33,49" fill="none" stroke={ac} strokeWidth="2" strokeLinecap="round"/>
                  <g style={{transform:`rotate(${hK?-10:0}deg)`,transformOrigin:"47px 37px",transition:"transform 0.04s"}}>
                    <path d="M47,37 Q51,43 55,49" fill="none" stroke={hK?hi:ac} strokeWidth={hK?2.5:2} strokeLinecap="round"/>
                    <line x1="55" y1="49" x2="60" y2="48" stroke={hK?hi:ac} strokeWidth={hK?2.5:2} strokeLinecap="round"/>
                  </g>
                  <path d="M44,18 Q43,28 44,36" fill="none" stroke={ac} strokeWidth="2.2" strokeLinecap="round"/>
                  <g style={{transformOrigin:"44px 20px",animation:lHit?"none":"marm-l 0.8s ease-in-out infinite alternate",transform:lHit?`rotate(${lA}deg)`:"",transition:lHit?"transform 0.04s ease-out":"none"}}>
                    <path d="M44,20 Q38,24 30,28" fill="none" stroke={lHit?hi:ac} strokeWidth={lHit?2.5:2} strokeLinecap="round"/>
                    <line x1="30" y1="28" x2="19" y2="22" stroke={lHit?hi:ac} strokeWidth={lHit?2.2:1.5} strokeLinecap="round"/>
                    {lHit&&<circle cx="19" cy="22" r="2" fill={hi} opacity="0.6"/>}
                  </g>
                  <g style={{transformOrigin:"44px 20px",animation:rHit?"none":"marm-r 0.8s ease-in-out infinite alternate",transform:rHit?`rotate(${-rA}deg)`:"",transition:rHit?"transform 0.04s ease-out":"none"}}>
                    <path d="M44,20 Q50,24 58,28" fill="none" stroke={rHit?hi:ac} strokeWidth={rHit?2.5:2} strokeLinecap="round"/>
                    <line x1="58" y1="28" x2="69" y2="22" stroke={rHit?hi:ac} strokeWidth={rHit?2.2:1.5} strokeLinecap="round"/>
                    {rHit&&<circle cx="69" cy="22" r="2" fill={hi} opacity="0.6"/>}
                  </g>
                  <g style={{animation:playing?"mhead 0.9s ease-in-out infinite":"none",transformOrigin:"44px 10px",transformBox:"fill-box"}}>
                    <circle cx="44" cy="10" r="6" fill="none" stroke={ac} strokeWidth="2"/>
                    <line x1="39" y1="9" x2="49" y2="9" stroke={ac} strokeWidth="1.2"/>
                    <rect x="39" y="8" width="4" height="3" rx="1" fill={playing?"#333":"#aaa"}/>
                    <rect x="45" y="8" width="4" height="3" rx="1" fill={playing?"#333":"#aaa"}/>
                    {playing&&<path d="M41,13 Q44,15 47,13" fill="none" stroke={ac} strokeWidth="0.8"/>}
                    <path d="M38,6 Q44,0 50,6" fill="none" stroke={ac} strokeWidth="1.5" strokeLinecap="round"/>
                    <rect x="36" y="5" width="3" height="5" rx="1.5" fill={ac} opacity="0.5"/>
                    <rect x="49" y="5" width="3" height="5" rx="1.5" fill={ac} opacity="0.5"/>
                  </g>
                </g>
              </svg>
            );
          })()}
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            <button onClick={undo} disabled={histLen.past===0} title={`Undo (Ctrl+Z)${histLen.past?" — "+histLen.past+" step"+(histLen.past>1?"s":"")+" back":""}`} style={{width:28,height:28,border:`1px solid ${histLen.past?"rgba(100,210,255,0.35)":th.sBorder+"22"}`,borderRadius:6,background:histLen.past?"rgba(100,210,255,0.06)":"transparent",color:histLen.past?"#64D2FF":th.faint,fontSize:16,cursor:histLen.past?"pointer":"default",fontFamily:"inherit",opacity:histLen.past?1:0.3,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0}}>↺</button>
            <button onClick={redo} disabled={histLen.future===0} title={`Redo (Ctrl+Y)${histLen.future?" — "+histLen.future+" step"+(histLen.future>1?"s":"")+" forward":""}`} style={{width:28,height:28,border:`1px solid ${histLen.future?"rgba(100,210,255,0.35)":th.sBorder+"22"}`,borderRadius:6,background:histLen.future?"rgba(100,210,255,0.06)":"transparent",color:histLen.future?"#64D2FF":th.faint,fontSize:16,cursor:histLen.future?"pointer":"default",fontFamily:"inherit",opacity:histLen.future?1:0.3,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0}}>↻</button>
          </div>
          </div>
          <div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
            <button onClick={()=>setThemeName(p=>p==="dark"?"daylight":"dark")} style={pill(false,th.dim)}>THEME</button>
            <button onClick={()=>{if(R.playing&&view==="euclid"){clearTimeout(schRef.current);setPlaying(false);setCStep(-1);R.step=-1;}setView("pads");}} style={pill(view==="pads","#5E5CE6")}>LIVE PADS</button>
            {/* ── SEQUENCER + EUCLID grouped block ── */}
            <div style={{display:"flex",border:`1px solid ${view==="sequencer"?"#FF2D5555":view==="euclid"?"#FFD60A55":th.sBorder}`,borderRadius:6,overflow:"hidden",transition:"border-color 0.15s",}}>

              <button onClick={()=>view!=="sequencer"&&switchView("sequencer")} style={{padding:"5px 11px",border:"none",borderRight:`1px solid ${th.sBorder}`,borderRadius:0,background:view==="sequencer"?"#FF2D5518":"transparent",color:view==="sequencer"?"#FF2D55":th.dim,fontSize:9,fontWeight:700,cursor:view==="sequencer"?"default":"pointer",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"inherit"}}>SEQUENCER</button>
              <button onClick={()=>view!=="euclid"&&switchView("euclid")} style={{padding:"5px 11px",border:"none",borderRight:`1px solid ${th.sBorder}`,borderRadius:0,background:view==="euclid"?"#FFD60A18":"transparent",color:view==="euclid"?"#FFD60A":th.dim,fontSize:9,fontWeight:700,cursor:view==="euclid"?"default":"pointer",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"inherit"}}>⬡ EUCLID</button>
            </div>
          </div>
        </div>

        {/* ── Transport ── */}
        <TransportBar
          themeName={themeName} bpm={bpm} setBpm={setBpm} playing={playing} startStop={startStop}
          rec={rec} setRec={setRec} handleTap={handleTap}
          swing={swing} setSwing={setSwing} metro={metro} setMetro={setMetro}
          metroVol={metroVol} setMetroVol={setMetroVol} metroSub={metroSub} setMetroSub={setMetroSub}
          midiLM={midiLM} setMidiLM={setMidiLM} linkConnected={linkConnected} linkPeers={linkPeers}
          showLink={showLink} setShowLink={setShowLink} MidiTag={MidiTag}
          view={view} sig={sig} showTS={showTS} setShowTS={setShowTS} showK={showK} setShowK={setShowK}
          hasMidiApi={hasMidiApi} hasLinkApi={hasLinkApi}
          midiNotes={midiNotes} setMidiNotes={setMidiNotes} initMidi={initMidi}
          midiLearnTrack={midiLearnTrack} setMidiLearnTrack={setMidiLearnTrack}
          isPortrait={isPortrait} isAudioReady={isAudioReady}
          masterVol={masterVol} setMasterVol={setMasterVol}
          cPat={cPat} pBank={pBank} SEC_COL={SEC_COL} setShowSong={setShowSong}
          onClear={()=>{setPat(p=>{const n={};Object.keys(p).forEach(k=>{n[k]=Array.isArray(p[k])?p[k].map(()=>0):p[k];});return n;});setPBank(pb=>{const n=[...pb];const cp={...n[cPat]};ALL_TRACKS.forEach(t=>{if(Array.isArray(cp[t.id]))cp[t.id]=Array(cp[t.id].length||STEPS).fill(0);});customTracks.forEach(t=>{if(Array.isArray(cp[t.id]))cp[t.id]=Array(cp[t.id].length||STEPS).fill(0);});n[cPat]=cp;return n;});}}
        />

        {/* ── Time Signature ── */}
        {showTS&&view!=="euclid"&&(<div style={{marginBottom:10,padding:10,borderRadius:10,background:th.surface,border:`1px solid ${th.sBorder}`}}>
          <div style={{fontSize:9,fontWeight:700,color:"#30D158",marginBottom:8}}>TIME SIGNATURE</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
            {TIME_SIGS.map(s=>(<button key={s.label} onClick={()=>chSig(s)} style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${tSig.label===s.label?"rgba(48,209,88,0.4)":th.sBorder}`,background:tSig.label===s.label?"rgba(48,209,88,0.1)":"transparent",color:tSig.label===s.label?"#30D158":th.dim,fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>{s.label}</button>))}
          </div>
          {tSig.groupOptions&&(<div style={{marginBottom:8}}><div style={{fontSize:8,color:th.dim,marginBottom:4}}>BEAT GROUPING</div><div style={{display:"flex",gap:4}}>{tSig.groupOptions.map((o,i)=>(<button key={i} onClick={()=>setGrpIdx(i)} style={{padding:"5px 12px",borderRadius:5,border:`1px solid ${grpIdx===i?"rgba(48,209,88,0.4)":th.sBorder}`,background:grpIdx===i?"rgba(48,209,88,0.1)":"transparent",color:grpIdx===i?"#30D158":th.dim,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{o[o.length-1]}</button>))}</div></div>)}
        </div>)}

        {/* ── Keyboard Shortcut Cheat Sheet ── */}
        {showK&&(<div style={{marginBottom:10,padding:12,borderRadius:10,background:th.surface,border:`1px solid ${th.sBorder}`}}>
          <div style={{fontSize:9,fontWeight:700,color:"#FFD60A",marginBottom:8,letterSpacing:"0.1em"}}>KEYBOARD SHORTCUTS</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,marginBottom:10,fontSize:8}}>
            {[["Space","Play / Stop"],["Alt","Toggle Record"],["T","Tap Tempo"],["? ","Show / Hide This"],["← →","BPM ±1"],["↑ ↓","BPM ±5"],["Pad keys","Trigger / record drums"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",gap:6,alignItems:"center"}}>
                <kbd style={{padding:"2px 6px",borderRadius:4,border:`1px solid ${th.sBorder}`,background:th.btn,color:"#FFD60A",fontSize:9,fontWeight:700,fontFamily:"inherit",minWidth:28,textAlign:"center"}}>{k}</kbd>
                <span style={{color:th.dim}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{fontSize:9,fontWeight:700,color:"#FF9500",marginBottom:6}}>STEP INTERACTIONS</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:4,fontSize:8}}>
            {[["Click","Toggle step on/off"],["Drag ↔","Nudge timing (ms)"],["Drag ↑↓","Set velocity"],["Double-tap","Reset nudge + velocity"],["Hold (active step)","Set probability (popover)"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",gap:6,alignItems:"flex-start"}}>
                <span style={{color:"#FF9500",fontWeight:700,minWidth:80,fontSize:7}}>{k}</span>
                <span style={{color:th.dim}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,fontSize:9,fontWeight:700,color:"#5E5CE6",marginBottom:6}}>PAD KEYS</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {atO.map((tr)=>(<div key={tr.id} style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:9,color:tr.color,fontWeight:700}}>{tr.icon}{tr.label}</span>
              <input value={kMap[tr.id]||""} onChange={e=>{const v=e.target.value.slice(-1).toLowerCase();setKMap(p=>({...p,[tr.id]:v}));}} style={{width:28,height:24,textAlign:"center",borderRadius:4,border:`1px solid ${th.sBorder}`,background:"transparent",color:"#FFD60A",fontSize:12,fontWeight:800,fontFamily:"inherit"}}/>
            </div>))}
          </div>
        </div>)}

        {/* ── MIDI Learn Banner ── */}
        {midiLM&&(<div style={{marginBottom:8,padding:"7px 12px",borderRadius:8,background:"rgba(255,149,0,0.07)",border:"1px solid rgba(255,149,0,0.35)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:8,color:"#FF9500",fontWeight:800}}>🎹 MIDI LEARN</span>
          <span style={{fontSize:8,color:th.dim,flex:1}}>{midiLearnTrack?"● Play a note / move a knob on your device…":"Click any highlighted control to map it"}</span>
          {midiErr&&<span style={{fontSize:8,color:"#FF9500",fontWeight:700}}>{midiErr==="blocked"||midiErr==="noapi"?"⚠ MIDI blocked":"✕ Permission denied"}</span>}
          <button onClick={()=>{setMidiNoteMap({...DEFAULT_MIDI_NOTES});setMidiLearnTrack(null);}} style={{padding:"2px 8px",borderRadius:4,border:"1px solid rgba(255,149,0,0.3)",background:"transparent",color:"#FF9500",fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>RESET GM</button>
          <button onClick={()=>{setMidiLM(false);setMidiLearnTrack(null);}} style={{width:20,height:20,borderRadius:4,border:"1px solid rgba(255,149,0,0.3)",background:"transparent",color:"#FF9500",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>×</button>
        </div>)}

        {/* ── Ableton Link Panel ── */}
        {showLink&&(<div style={{marginBottom:10,padding:12,borderRadius:10,background:th.surface,border:`1px solid ${linkConnected?"#BF5AF2":th.sBorder}`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:9,fontWeight:800,color:"#BF5AF2",letterSpacing:"0.12em"}}>🔗 ABLETON LINK BRIDGE</span>
            {linkConnected&&<span style={{fontSize:9,fontWeight:700,color:"#30D158"}}>● {linkPeers} peer{linkPeers!==1?"s":""} connected</span>}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
            <input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&linkStatus!=='connecting'&&!linkConnected)linkConnect();}}
              disabled={linkConnected||linkStatus==='connecting'}
              style={{flex:1,background:"transparent",border:`1px solid ${linkStatus==='failed'?"rgba(255,45,85,0.5)":th.sBorder}`,borderRadius:5,padding:"5px 8px",color:th.text,fontSize:10,fontFamily:"inherit",opacity:linkConnected||linkStatus==='connecting'?0.5:1}}
              placeholder="ws://localhost:9898"/>
            <button onClick={linkConnected?linkDisconnect:linkStatus==='connecting'?undefined:linkConnect}
              disabled={linkStatus==='connecting'}
              style={{padding:"5px 14px",borderRadius:5,border:`1px solid ${linkConnected?"rgba(255,45,85,0.3)":linkStatus==='failed'?"rgba(255,149,0,0.4)":"rgba(191,90,242,0.4)"}`,background:linkConnected?"rgba(255,45,85,0.1)":linkStatus==='failed'?"rgba(255,149,0,0.1)":"rgba(191,90,242,0.15)",color:linkConnected?"#FF375F":linkStatus==='failed'?"#FF9500":"#BF5AF2",fontSize:9,fontWeight:700,cursor:linkStatus==='connecting'?"default":"pointer",fontFamily:"inherit",whiteSpace:"nowrap",opacity:linkStatus==='connecting'?0.6:1}}>
              {linkConnected?"DISCONNECT":linkStatus==='connecting'?"...":"CONNECT"}
            </button>
          </div>
          {/* Status row */}
          <div style={{marginBottom:6,padding:"6px 8px",borderRadius:5,background:
            linkStatus==='connected'?"rgba(48,209,88,0.08)":
            linkStatus==='failed'?"rgba(255,149,0,0.08)":
            linkStatus==='connecting'?"rgba(191,90,242,0.08)":"transparent",
            border:`1px solid ${linkStatus==='connected'?"rgba(48,209,88,0.2)":linkStatus==='failed'?"rgba(255,149,0,0.2)":linkStatus==='connecting'?"rgba(191,90,242,0.2)":"transparent"}`}}>
            <span style={{fontSize:8,color:
              linkStatus==='connected'?"#30D158":linkStatus==='failed'?"#FF9500":linkStatus==='connecting'?"#BF5AF2":th.dim}}>
              {linkStatus==='connected'&&`● ${linkPeers} peer${linkPeers!==1?"s":""} — BPM synced with Ableton Link`}
              {linkStatus==='connecting'&&"⏳ Connecting..."}
              {linkStatus==='failed'&&"⚠ Failed — is the bridge running? (node bridge.js in link-bridge/)"}
              {linkStatus==='idle'&&"Run the bridge: cd link-bridge && npm i && node bridge.js"}
            </span>
          </div>
          <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
            <label style={{display:"flex",gap:5,alignItems:"center",cursor:"pointer"}}>
              <input type="checkbox" checked={linkSyncPlay} onChange={e=>setLinkSyncPlay(e.target.checked)} style={{accentColor:"#BF5AF2"}}/>
              <span style={{fontSize:8,color:th.dim,whiteSpace:"nowrap"}}>Sync Play/Stop</span>
            </label>
          </div>
        </div>)}

        {/* ── Global FX Rack ── */}
        <FXRack gfx={gfx} setGfx={setGfx} tracks={atO} themeName={themeName} bpm={bpm} midiLM={midiLM} MidiTag={MidiTag} isPortrait={isPortrait} fxChainOrder={fxChainOrder} setFxChainOrder={setFxChainOrder} onChainOrderChange={(o:string[])=>{engine.setSerialOrder(o);}} />

        {/* ── Pattern Bank + Song Arranger ── */}
        {view!=="pads"&&<PatternBank
          themeName={themeName} pBank={pBank} setPBank={setPBank} cPat={cPat} setCPat={setCPat}
          songChain={songChain} setSongChain={setSongChain} songMode={songMode} setSongMode={setSongMode}
          showSong={showSong} setShowSong={setShowSong} playing={playing} songPosRef={songPosRef}
          STEPS={STEPS} MAX_PAT={MAX_PAT} SEC_COL={SEC_COL} mkE={mkE} R={R} isPortrait={isPortrait}
          patNameEdit={patNameEdit} setPatNameEdit={setPatNameEdit}
          onLoadTemplate={loadTemplate} onLoadEuclidTemplate={loadEuclidTemplate} view={view}
        />}

        {/* ── SEQUENCER ── */}
        {view==="sequencer"&&(<>
          <TipBadge id="seq_steps" text="Tape sur une case pour activer un son · Double-tape pour reset · Long-press = probabilité" color="#FF2D55"/>
          <div style={{display:"flex",flexDirection:"column",gap:0,position:"relative"}}
            onTouchStart={e=>{touchSwipeRef.current={x:e.touches[0].clientX,y:e.touches[0].clientY,target:e.target};}}
            onTouchEnd={e=>{
              const dx=e.changedTouches[0].clientX-touchSwipeRef.current.x;
              const dy=Math.abs(e.changedTouches[0].clientY-touchSwipeRef.current.y);
              if(Math.abs(dx)>60&&dy<30&&!(touchSwipeRef.current.target as HTMLElement)?.dataset?.step){
                if(dx<0){undo();setSwipeToast('↺ Annulé');}
                else{redo();setSwipeToast('↻ Rétabli');}
                setTimeout(()=>setSwipeToast(null),300);
              }
            }}>
            {swipeToast&&<div style={{position:"absolute",top:"40%",left:"50%",transform:"translate(-50%,-50%)",background:"rgba(0,0,0,0.82)",color:"#fff",padding:"6px 18px",borderRadius:10,fontSize:16,fontWeight:800,zIndex:200,pointerEvents:"none",letterSpacing:"0.05em"}}>{swipeToast}</div>}
            {recFeedback&&<div style={{position:"absolute",top:"30%",left:"50%",transform:"translate(-50%,-50%)",background:"rgba(0,0,0,0.85)",color:recFeedback.color,padding:"5px 16px",borderRadius:8,fontSize:20,fontWeight:900,zIndex:201,pointerEvents:"none",border:`1px solid ${recFeedback.color}`,letterSpacing:"0.05em"}}>{recFeedback.label}</div>}
            {atO.map((track)=>{
              const isM=!!muted[track.id];
              const isS=soloed===track.id;
              const aud=soloed?isS:!isM;
              const tsOpts=[STEPS,STEPS*2];
              const tSteps=tsOpts.includes(trackSteps[track.id])?trackSteps[track.id]:STEPS;
              return(
                <TrackRow
                  key={track.id}
                  track={track}
                  tSteps={tSteps}
                  STEPS={STEPS}
                  pat={pat[track.id]}
                  cStep={cStep}
                  stVel={stVel[track.id]}
                  stNudge={stNudge[track.id]}
                  stProb={stProb[track.id]}
                  stRatch={stRatch[track.id]}
                  dragInfo={dragInfo}
                  fx={fx[track.id]||{...DEFAULT_FX}}
                  flash={flashing.has(track.id)}
                  aud={aud}
                  smpN={smpN[track.id]}
                  MidiTag={MidiTag}
                  actLength={act.length}
                  themeName={themeName}
                  gInfo={gInfo}
                  isMuted={isM}
                  isSoloed={isS}
                  isPortrait={isPortrait}
                  sendCursor={trackSendCursor[track.id]??0}
                  fxSecs={FX_SECS}
                  gfxSends={FX_SECS.map(f=>(gfx[f.sec]?.sends[track.id]||0))}
                  onStepDown={(step,e)=>{if(e.shiftKey&&handleShiftClick(track.id,step,e))return;startDrag(track.id,step,e);}}
                  onContextMenu={(step,e)=>e.preventDefault()}
                  onMuteToggle={()=>setMuted(p=>({...p,[track.id]:!p[track.id]}))}
                  onSoloToggle={()=>setSoloed(p=>p===track.id?null:track.id)}
                  onLoadSample={()=>ldFile(track.id)}
                  onRemove={()=>{setAct(p=>p.filter(x=>x!==track.id));if(track.id.startsWith("ct_"))setCustomTracks(p=>p.filter(x=>x.id!==track.id));}}
                  onFxChange={(k,v)=>{setFx(prev=>{const nf={...(prev[track.id]||{...DEFAULT_FX}),[k]:v};engine.uFx(track.id,nf);return{...prev,[track.id]:nf};});}}
                  onSendCursorChange={(dir)=>setTrackSendCursor(p=>({...p,[track.id]:((p[track.id]??0)+dir+FX_SECS.length)%FX_SECS.length}))}
                  onSendAmtChange={(amt)=>{const idx=trackSendCursor[track.id]??0;const sec=FX_SECS[idx].sec;upSend(sec,track.id,amt);}}
                  onStepCountChange={(nt)=>{const remap=(arr,from,to)=>{const r=Array(to).fill(0);(arr||Array(from).fill(0)).forEach((v,i)=>{if(v){const d=Math.min(to-1,Math.round(i*to/from));r[d]=Math.max(r[d],v);}});return r;};setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[track.id]:nt}};cp[track.id]=remap(cp[track.id],tSteps,nt);n[cPat]=cp;return n;});}}
                  onClear={()=>{setPBank(pb=>{const n=[...pb];const cp={...n[cPat]};const s={...(cp._steps||{})};delete s[track.id];cp._steps=s;cp[track.id]=Array(STEPS).fill(0);n[cPat]=cp;return n;});setEuclidParams(p=>{const n={...p};delete n[track.id];return n;});}}
                />
              );
            })}
          </div>
          {/* ── H.3: REC pads — appear when rec+playing in sequencer view ── */}
          {recPadsVisible&&(<div style={{marginTop:8,borderRadius:10,background:"rgba(255,45,85,0.06)",border:"1px solid rgba(255,45,85,0.28)",padding:"8px 10px",animation:"slideDown 0.18s ease-out",opacity:rec&&playing?1:0,transition:"opacity 0.15s",pointerEvents:rec&&playing?"auto":"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7,background:"rgba(255,45,85,0.12)",padding:"5px 8px",borderRadius:6,border:"1px solid #FF2D55"}}>
              <span style={{fontSize:7,fontWeight:800,color:"#FF2D55",letterSpacing:"0.15em",animation:"rb 0.8s infinite"}}>●</span>
              <span style={{fontSize:7,fontWeight:800,color:"#FF2D55",letterSpacing:"0.1em"}}>REC — Joue les pads · les hits tombent dans la grille</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:isPortrait?`repeat(2,1fr)`:`repeat(${Math.min(4,atO.length)},1fr)`,gap:6}}>
              {atO.map(tr=>(
                <button key={tr.id} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);trigPad(tr.id,e.pointerType==="mouse"?1:110/127);}}
                  style={{height:52,borderRadius:10,background:flashing.has(tr.id)?tr.color+"44":`linear-gradient(145deg,${tr.color}1a,${tr.color}06)`,border:`1.5px solid ${flashing.has(tr.id)?tr.color:tr.color+"33"}`,color:tr.color,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,cursor:"pointer",fontFamily:"inherit",boxShadow:flashing.has(tr.id)?`0 0 24px ${tr.color}55`:"none",transition:"all 0.06s",transform:flashing.has(tr.id)?"scale(0.94)":"scale(1)",touchAction:"none",userSelect:"none"}}>
                  <DrumSVG id={tr.id} color={tr.color} hit={flashing.has(tr.id)} sz={18}/>
                  <span style={{fontSize:8,fontWeight:700,letterSpacing:"0.06em"}}>{tr.label}</span>
                </button>
              ))}
            </div>
          </div>)}
          <div style={{marginTop:6}}>
            {!showAdd?<button onClick={()=>{setShowAdd(true);setShowCustomInput(false);setNewTrackName("");}} style={{width:"100%",padding:"8px",border:`1px dashed ${th.sBorder}`,borderRadius:8,background:"transparent",color:th.dim,fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>+ ADD TRACK</button>:(
              <div style={{padding:"8px 10px",borderRadius:8,background:th.surface,border:`1px solid ${th.sBorder}`,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                {inact.map(t=>(<button key={t.id} onClick={()=>{setAct(p=>[...p,t.id]);setShowAdd(false);}} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.color}33`,background:t.color+"10",color:t.color,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{t.icon} {t.label}</button>))}
                {CustomTrackInput()}
                <button onClick={()=>{setShowAdd(false);setShowCustomInput(false);setNewTrackName("");}} style={{marginLeft:"auto",padding:"4px 8px",border:"none",borderRadius:4,background:"rgba(255,55,95,0.1)",color:"#FF375F",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>CANCEL</button>
              </div>)}
          </div>
        </>)}

        {/* ── LIVE PADS ── */}
        {view==="pads"&&(<div style={{padding:"12px 0"}}>
          <TipBadge id="pads_tap" text="Joue en live ! Appuie sur un pad pour déclencher un son · REC pour enregistrer un loop" color="#5E5CE6"/>
          {/* ── Looper banner (foldable) ── */}
          <div style={{marginBottom:10,borderRadius:10,border:`1px solid ${showLooper||loopRec||loopPlaying?"rgba(191,90,242,0.35)":"rgba(191,90,242,0.15)"}`,overflow:"hidden",background:th.surface}}>
            <button onClick={()=>setShowLooper(p=>!p)} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"8px 12px",border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
              <span style={{fontSize:10,color:"#BF5AF2"}}>⊙</span>
              <span style={{fontSize:9,fontWeight:800,color:"#BF5AF2",letterSpacing:"0.08em"}}>LOOPER</span>
              {loopRec&&<span style={{fontSize:7,fontWeight:800,color:"#FF2D55",animation:"rb 0.8s infinite"}}>● REC</span>}
              {loopPlaying&&!loopRec&&<span style={{fontSize:7,fontWeight:800,color:"#30D158"}}>▶ PLAY</span>}
              {recCountdown&&<span style={{fontSize:7,fontWeight:800,color:"#FF9500",animation:"rb 0.5s infinite"}}>DÉCOMPTE…</span>}
              <span style={{marginLeft:"auto",fontSize:10,color:th.dim}}>{showLooper?"▲":"▼"}</span>
            </button>
            {showLooper&&(
              <div style={{padding:"0 12px 12px"}}>
                {recCountdown&&(
                  <div style={{position:"relative",marginBottom:8,padding:"7px 10px",borderRadius:7,background:"rgba(255,149,0,0.06)",border:"1px solid rgba(255,149,0,0.35)",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:0,left:0,height:"100%",background:"rgba(255,149,0,0.12)",animation:`recCountBar ${((60000/Math.max(30,bpm))*sig.beats/1000).toFixed(2)}s linear forwards`}}/>
                    <span style={{position:"relative",fontSize:8,fontWeight:800,color:"#FF9500",letterSpacing:"0.08em"}}>🎵 DÉCOMPTE — REC dans 1 barre…</span>
                  </div>
                )}
                <LooperPanel
                  loopBars={loopBars} setLoopBars={setLoopBars}
                  loopRec={loopRec} loopPlaying={loopPlaying} loopPlayhead={loopPlayhead}
                  loopDisp={loopDisp}
                  loopMetro={loopMetro} setLoopMetro={setLoopMetro}
                  onToggleRec={toggleLoopRec} onFreshRec={freshRecLooper} onTogglePlay={loopPlaying?stopLooper:()=>startLooper(false)} onUndo={undoLoopPass} onClear={clearLooper}
                  themeName={themeName} isPortrait={isPortrait}
                  bpm={bpm} tracks={atO}
                  onMoveHit={(idx,newTOff)=>{
                    const L=loopRef.current;
                    if(!L.events[idx])return;
                    L.events[idx]={...L.events[idx],tOff:Math.max(0,newTOff)};
                    setLoopDisp([...L.events]);
                  }}
                  onQuantize={(div)=>{
                    const L=loopRef.current;
                    if(!L.events||!L.events.length)return;
                    const loopDurMs=loopBars*4*(60000/Math.max(30,bpm));
                    const snapMs=loopDurMs/(loopBars*div);
                    L.events=L.events.map(ev=>({
                      ...ev,
                      tOff:Math.max(0,Math.min(loopDurMs-snapMs,Math.round(ev.tOff/snapMs)*snapMs)),
                    }));
                    setLoopDisp([...L.events]);
                  }}
                  autoQ={autoQ} setAutoQ={setAutoQ}
                />
              </div>
            )}
          </div>
          {/* ─ Pads grid ─ */}
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(4,atO.length)},1fr)`,gap:12,touchAction:"none"}}>
            {atO.map((track)=>(
              <div key={track.id} style={{position:"relative"}}>
                <button
                  onPointerDown={e=>{
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    trigPad(track.id,e.pointerType==="mouse"?1:110/127);
                  }}
                  style={{width:"100%",aspectRatio:"1",borderRadius:16,background:flashing.has(track.id)?track.color+"55":`linear-gradient(145deg,${track.color}28,${track.color}08)`,border:`2px solid ${flashing.has(track.id)?track.color:track.color+"44"}`,color:track.color,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",fontFamily:"inherit",boxShadow:flashing.has(track.id)?`0 0 40px ${track.color}66`:`0 0 16px ${track.color}11`,transition:"all 0.06s",transform:flashing.has(track.id)?"scale(0.95)":"scale(1)",touchAction:"none",userSelect:"none"}}>
                  <DrumSVG id={track.id} color={track.color} hit={flashing.has(track.id)} sz={44} />
                  <span style={{fontSize:13,fontWeight:700,letterSpacing:"0.1em"}}>{track.label}</span>
                  <span style={{fontSize:10,color:th.dim,border:`1px solid ${th.sBorder}`,borderRadius:4,padding:"2px 8px"}}>{kMap[track.id]?.toUpperCase()||""}</span>
                </button>
                {midiLM&&<div style={{position:"absolute",top:6,right:6}}><MidiTag id={track.id}/></div>}
              </div>
            ))}
          </div>
          <div style={{marginTop:10}}>
            {!showAdd?<button onClick={()=>{setShowAdd(true);setShowCustomInput(false);setNewTrackName("");}} style={{width:"100%",padding:"8px",border:`1px dashed ${th.sBorder}`,borderRadius:8,background:"transparent",color:th.dim,fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>+ ADD TRACK</button>:(
              <div style={{padding:"8px 10px",borderRadius:8,background:th.surface,border:`1px solid ${th.sBorder}`,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                {inact.map(t=>(<button key={t.id} onClick={()=>{setAct(p=>[...p,t.id]);setShowAdd(false);}} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.color}33`,background:t.color+"10",color:t.color,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{t.icon} {t.label}</button>))}
                {CustomTrackInput()}
                <button onClick={()=>{setShowAdd(false);setShowCustomInput(false);setNewTrackName("");}} style={{marginLeft:"auto",padding:"4px 8px",border:"none",borderRadius:4,background:"rgba(255,55,95,0.1)",color:"#FF375F",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>CANCEL</button>
              </div>)}
          </div>
        </div>)}

        {/* ── EUCLID VIEW ── */}
        {view==="euclid"&&(()=>{
          const CX=190,CY=190;
          const R_OUT=162,R_IN=atO.length>1?38:148;
          // E: Euclid tips rendered below the SVG (inside the IIFE so we can include them)

          const ringGap=atO.length>1?(R_OUT-R_IN)/(atO.length-1):0;
          const getP=tid=>{const ep=euclidParams[tid]||{};const N=trackSteps[tid]||STEPS;return{N,hits:Math.min(ep.hits||0,N),rot:(ep.rot||0)%Math.max(N,1),tpl:ep.tpl||"",fold:ep.fold||false};};
          const writeP=(tid,up)=>setEuclidParams(p=>({...p,[tid]:{...getP(tid),...up}}));
          const applyE=(tid,N,hits,rot,baseArr=null)=>{
            const raw=baseArr||euclidRhythm(hits,N);
            const r2=((rot%Math.max(N,1))+Math.max(N,1))%Math.max(N,1);
            const rotated=[...raw.slice(r2),...raw.slice(0,r2)].map(v=>v?100:0);
            setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[tid]:N}};cp[tid]=[...rotated];n[cPat]=cp;return n;});
          };
          const clearTrack=(tid)=>{const N=getP(tid).N;writeP(tid,{hits:0,rot:0,tpl:""});setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[tid]:N}};cp[tid]=Array(N).fill(0);n[cPat]=cp;return n;});};
          const chN=(tid,newN)=>{
            const p=getP(tid);
            const h=Math.min(p.hits,newN);
            const r=((p.rot%Math.max(newN,1))+Math.max(newN,1))%Math.max(newN,1);
            // Detect manual overrides: steps ON in current pattern that Euclid didn't place
            const curPat=pBank[cPat][tid]||[];
            const oldN=p.N||STEPS;
            const oldEucl=euclidRhythm(p.hits||0,oldN);
            const oldR2=((p.rot%Math.max(oldN,1))+Math.max(oldN,1))%Math.max(oldN,1);
            const oldRotated=[...oldEucl.slice(oldR2),...oldEucl.slice(0,oldR2)];
            const manualOn=new Set<number>();
            for(let i=0;i<oldN;i++){if((curPat[i]||0)>0&&!oldRotated[i])manualOn.add(i);}
            // Build new Euclidean pattern
            const raw=euclidRhythm(h,newN);
            const r2=((r%Math.max(newN,1))+Math.max(newN,1))%Math.max(newN,1);
            const merged=[...raw.slice(r2),...raw.slice(0,r2)].map(v=>v?100:0);
            // Re-apply manual overrides that still fit within the new length
            manualOn.forEach(i=>{if(i<newN)merged[i]=curPat[i]||100;});
            writeP(tid,{N:newN,hits:h,rot:r});
            setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[tid]:newN}};cp[tid]=[...merged];n[cPat]=cp;return n;});
          };
          const chH=(tid,h)=>{const p=getP(tid);writeP(tid,{hits:h,tpl:""});applyE(tid,p.N,h,p.rot);};
          const chR=(tid,r)=>{
            const p=getP(tid);writeP(tid,{rot:r});
            // Only use a fixed base for per-track EUCLID_RHYTHMS templates (non-euclidean hit positions)
            let base=null;
            if(p.tpl){const t=EUCLID_RHYTHMS.find(x=>x.name===p.tpl);if(t&&t.N===p.N){base=Array(t.N).fill(0);t.hits.forEach(h=>{base[h]=1;});}}
            applyE(tid,p.N,p.hits,r,base);
          };
          const applyTplTo=(tid,t)=>{
            writeP(tid,{N:t.N,hits:t.hits.length,rot:0,tpl:t.name});
            const pp=Array(t.N).fill(0);t.hits.forEach(h=>{pp[h]=100;});
            setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[tid]:t.N}};cp[tid]=[...pp];n[cPat]=cp;return n;});
          };
          const selStyle={width:"100%",background:th.surface,border:`1px solid ${th.sBorder}`,borderRadius:5,color:th.text,fontSize:9,fontFamily:"inherit",padding:"4px 6px",cursor:"pointer",colorScheme:themeName==="dark"?"dark":"light"};
          const mkDrag=(initVal,min,max,cb)=>e=>{
            e.preventDefault();const sy=e.clientY;let cv=initVal;
            const mv=me=>{const nv=Math.max(min,Math.min(max,initVal+Math.round((sy-me.clientY)/6)));if(nv!==cv){cv=nv;cb(nv);}};
            const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);};
            window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);
          };
          const mkVelDrag=(tid,step,isOn,initVelPct)=>e=>{
            e.preventDefault();e.stopPropagation();
            const el=e.currentTarget;
            el.setPointerCapture(e.pointerId);
            const sx=e.clientX,sy=e.clientY;
            let timerFired=false;
            let moved=false;
            // I.1b: immediate touch feedback
            setEuclidTouchFeedback({tid,step});
            const longPressMs=R.euclidEdit?600:400;
            const timer=setTimeout(()=>{
              timerFired=true;
              setEuclidTouchFeedback(null);
              el.releasePointerCapture(e.pointerId);
              el.removeEventListener('pointermove',onMove);
              el.removeEventListener('pointerup',onUp);
              el.removeEventListener('pointercancel',onUp);
              const px=Math.min(Math.max(sx-70,8),window.innerWidth-160);
              const py=Math.min(Math.max(sy-160,8),window.innerHeight-240);
              setVelPicker({tid,step,x:px,y:py,velPct:isOn?initVelPct:100,probPct:R.prob[tid]?.[step]??100});
            },longPressMs);
            const onMove=me=>{
              const dx=me.clientX-sx,dy=me.clientY-sy;
              // I.1c: more tolerant movement threshold 8→14
              if(Math.abs(dx)>14||Math.abs(dy)>14){moved=true;clearTimeout(timer);}
            };
            const onUp=()=>{
              clearTimeout(timer);
              setEuclidTouchFeedback(null);
              el.removeEventListener('pointermove',onMove);
              el.removeEventListener('pointerup',onUp);
              el.removeEventListener('pointercancel',onUp);
              if(!timerFired&&!moved){
                setPBank(pb=>{const n=[...pb];const cp={...n[cPat]};cp[tid]=[...cp[tid]];cp[tid][step]=cp[tid][step]>0?0:100;n[cPat]=cp;return n;});
              }
            };
            el.addEventListener('pointermove',onMove);
            el.addEventListener('pointerup',onUp,{once:true});
            el.addEventListener('pointercancel',onUp,{once:true});
          };
          const btnSm={height:32,minWidth:32,border:`1px solid ${th.sBorder}`,borderRadius:4,background:"transparent",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"0 4px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"};
          const arw={width:26,height:26,border:`1px solid ${th.sBorder}`,borderRadius:4,background:"transparent",color:th.dim,fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:0,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0};
          const lbl0={fontSize:6.5,color:th.dim,fontWeight:700,letterSpacing:"0.07em",flexShrink:0};
          const val0={fontSize:11,fontWeight:800,cursor:"ns-resize",userSelect:"none",touchAction:"none",minWidth:22,textAlign:"center",flexShrink:0};
          const sep0={fontSize:10,color:th.faint,flexShrink:0};
          return(
            <div style={{padding:"8px 0",overflowX:isPortrait?"visible":"auto"}}>
              <TipBadge id="euclid_n" text="N = nombre de steps · HITS = nombre de sons · Tourne la roue pour créer des rythmes" color="#FFD60A"/>
              <TipBadge id="euclid_edit" text="Appuie sur EDIT pour placer facilement tes sons sur la grille euclidienne" color="#30D158"/>
              <div style={{display:"flex",flexDirection:isPortrait?"column":"row",gap:16,alignItems:"flex-start",minWidth:isPortrait?undefined:820}}>
                {/* ── LEFT: Track controls ── */}
                <div style={{display:"flex",flexDirection:"column",gap:6,width:380,flexShrink:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                    <div style={{fontSize:8,fontWeight:800,color:th.dim,letterSpacing:"0.12em"}}>EUCLIDEAN TRACKS</div>
                    <button onClick={()=>setEuclidEditMode(p=>!p)} style={{padding:"2px 8px",borderRadius:10,border:`1px solid ${euclidEditMode?"#30D158":"#FFD60A"}`,background:euclidEditMode?"#30D15818":"#FFD60A18",color:euclidEditMode?"#30D158":"#FFD60A",fontSize:7,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em",flexShrink:0}}>{euclidEditMode?"DONE":"EDIT"}</button>
                  </div>
                  {atO.map((tr)=>{
                    const p=getP(tr.id);const cnt=(pat[tr.id]||[]).filter(v=>v>0).length;
                    const isM=!!muted[tr.id];const isS=soloed===tr.id;const aud=soloed?isS:!isM;
                    return(
                      <div key={tr.id} style={{borderRadius:8,border:`1px solid ${tr.color}${aud?"44":"22"}`,background:tr.color+(aud?"0a":"05"),padding:"6px 10px",display:"flex",flexDirection:"column",gap:5,transition:"opacity 0.1s",opacity:aud?1:0.65}}>
                        {/* ── Header: label row + knobs + dropdown ── */}
                        {(()=>{
                          const f=fx[tr.id]||{...DEFAULT_FX};
                          const vol=f.vol??80;const pan=f.pan??0;
                          const uFxL=(k,v)=>{setFx(prev=>{const nf={...(prev[tr.id]||{...DEFAULT_FX}),[k]:v};engine.uFx(tr.id,nf);return{...prev,[tr.id]:nf};});};
                          const rk=9;const circ=2*Math.PI*rk;
                          const volPD=e=>{e.preventDefault();const el=e.currentTarget;el.setPointerCapture(e.pointerId);let sY=e.clientY,sV=vol;const mv=pe=>{const dy=sY-pe.clientY;uFxL("vol",Math.max(0,Math.min(100,Math.round(sV-dy*1.2))));};const up=()=>{el.removeEventListener("pointermove",mv);};el.addEventListener("pointermove",mv);el.addEventListener("pointerup",up,{once:true});el.addEventListener("pointercancel",up,{once:true});};
                          const panPD=e=>{e.preventDefault();const el=e.currentTarget;el.setPointerCapture(e.pointerId);let sY=e.clientY,sV=pan;const mv=pe=>{const dy=sY-pe.clientY;uFxL("pan",Math.max(-100,Math.min(100,Math.round(sV-dy*2.5))));};const up=()=>{el.removeEventListener("pointermove",mv);};el.addEventListener("pointermove",mv);el.addEventListener("pointerup",up,{once:true});el.addEventListener("pointercancel",up,{once:true});};
                          const vDisp=`${vol}`;
                          const pDisp=pan===0?"C":pan<0?`L${Math.abs(pan)}`:`R${pan}`;
                          const panArc=pan===0?null:(()=>{const toRad=d=>d*Math.PI/180;const sa=-90;const ea=sa+(pan/100)*180;const x1=11+rk*Math.cos(toRad(sa));const y1=11+rk*Math.sin(toRad(sa));const x2=11+rk*Math.cos(toRad(ea));const y2=11+rk*Math.sin(toRad(ea));return`M${x1.toFixed(2)},${y1.toFixed(2)} A${rk},${rk} 0 0 ${pan>0?1:0} ${x2.toFixed(2)},${y2.toFixed(2)}`;})();
                          return(
                            <div style={{display:"flex",flexDirection:"column",gap:4}}>
                              {/* Row 1: [icon+label+cnt fixed-width] · M · S · ♪ · MIDI · CLR · × */}
                              <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,flexWrap:"nowrap"}}>
                                {/* Fixed-width left block so M is always aligned */}
                                <div onClick={()=>writeP(tr.id,{fold:!p.fold})} style={{display:"flex",alignItems:"center",gap:3,width:92,flexShrink:0,cursor:"pointer",overflow:"hidden"}}>
                                  <span style={{flexShrink:0,opacity:aud?1:0.4}}><DrumSVG id={tr.id} color={tr.color} hit={flashing.has(tr.id)} sz={18} /></span>
                                  <span title={p.fold?"Expand":"Collapse"} style={{fontSize:9,fontWeight:800,color:aud?tr.color:th.dim,letterSpacing:"0.07em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,userSelect:"none"}}>{tr.label}</span>
                                  {cnt>0&&<span style={{background:tr.color+"33",color:tr.color,borderRadius:4,padding:"1px 3px",fontSize:6,fontWeight:700,flexShrink:0}}>{cnt}h</span>}
                                </div>
                                <button onClick={()=>setMuted(m=>({...m,[tr.id]:!m[tr.id]}))} style={{...btnSm,color:isM?"#FF375F":th.faint,border:`1px solid ${isM?"rgba(255,55,95,0.4)":th.sBorder}`,background:isM?"rgba(255,55,95,0.12)":"transparent"}}>M</button>
                                <button onClick={()=>setSoloed(s=>s===tr.id?null:tr.id)} style={{...btnSm,color:isS?"#FFD60A":th.faint,border:`1px solid ${isS?"rgba(255,214,10,0.4)":th.sBorder}`,background:isS?"rgba(255,214,10,0.12)":"transparent"}}>S</button>
                                {(()=>{const hasSmp=!!smpN[tr.id];return(<button onClick={()=>ldFile(tr.id)} title={hasSmp?smpN[tr.id]:"Load sample"} style={{...btnSm,color:hasSmp?"#FF9500":th.faint,border:`1px solid ${hasSmp?"rgba(255,149,0,0.4)":th.sBorder}`,background:hasSmp?"rgba(255,149,0,0.15)":"transparent"}}>♪</button>);})()}
                                <MidiTag id={tr.id}/>
                                <button onClick={()=>clearTrack(tr.id)} title="Clear hits" style={{...btnSm,color:"#FF2D55",border:"1px solid rgba(255,45,85,0.3)",fontSize:7}}>CLR</button>
                                {act.length>1&&<button onClick={()=>{setAct(a=>a.filter(x=>x!==tr.id));if(tr.id.startsWith("ct_"))setCustomTracks(p=>p.filter(x=>x.id!==tr.id));}} style={{...btnSm,color:"#FF375F",border:"1px solid rgba(255,55,95,0.3)"}}>×</button>}
                              </div>
                              {/* Row 2: VOL knob + PAN knob + template dropdown — hidden when folded */}
                              <div style={{display:p.fold?"none":"flex",alignItems:"center",gap:6}}>
                                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,flexShrink:0}}>
                                  <div onPointerDown={volPD} onDoubleClick={()=>uFxL("vol",80)} title={`VOL: ${vDisp} — drag ↕`} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,cursor:"ns-resize",userSelect:"none",touchAction:"none"}}>
                                    <div style={{position:"relative",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                      <svg width="22" height="22" style={{position:"absolute",top:0,left:0,transform:"rotate(-90deg)"}} viewBox="0 0 22 22">
                                        <circle cx="11" cy="11" r={rk} fill="none" stroke={tr.color+"22"} strokeWidth="2.5"/>
                                        <circle cx="11" cy="11" r={rk} fill="none" stroke={tr.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${circ*vol/100} ${circ}`}/>
                                      </svg>
                                      <span style={{fontSize:6,fontWeight:900,color:tr.color,zIndex:1,pointerEvents:"none"}}>VOL</span>
                                    </div>
                                    <span style={{fontSize:6,color:tr.color,fontWeight:700,fontFamily:"monospace",lineHeight:1}}>{vDisp}</span>
                                  </div>
                                  <MidiTag id={`vol_${tr.id}`}/>
                                </div>
                                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,flexShrink:0}}>
                                  <div onPointerDown={panPD} onDoubleClick={()=>uFxL("pan",0)} title={`PAN: ${pDisp} — drag ↕`} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,cursor:"ns-resize",userSelect:"none",touchAction:"none"}}>
                                    <div style={{position:"relative",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                      <svg width="22" height="22" style={{position:"absolute",top:0,left:0}} viewBox="0 0 22 22">
                                        <circle cx="11" cy="11" r={rk} fill="none" stroke={tr.color+"22"} strokeWidth="2.5"/>
                                        {panArc&&<path d={panArc} fill="none" stroke={tr.color} strokeWidth="2.5" strokeLinecap="round"/>}
                                        <circle cx="11" cy="11" r="1.5" fill={tr.color}/>
                                      </svg>
                                      <span style={{fontSize:6,fontWeight:900,color:tr.color,zIndex:1,pointerEvents:"none"}}>PAN</span>
                                    </div>
                                    <span style={{fontSize:6,color:tr.color,fontWeight:700,fontFamily:"monospace",lineHeight:1}}>{pDisp}</span>
                                  </div>
                                  <MidiTag id={`pan_${tr.id}`}/>
                                </div>
                                <select value={p.tpl||""} onChange={e=>{const t=EUCLID_RHYTHMS.find(x=>x.name===e.target.value);if(t)applyTplTo(tr.id,t);}} style={{...selStyle,flex:1,fontSize:8}}>
                                  <option value="">— Template —</option>
                                  {EUCLID_REGIONS.map(reg=>(
                                    <optgroup key={reg} label={reg}>
                                      {EUCLID_RHYTHMS.filter(t=>t.region===reg).map(t=>(
                                        <option key={t.name} value={t.name}>{t.name} · {t.N}st</option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })()}
                        {/* ── Body (unfolded): N · HITS · ROT on one line ── */}
                        {!p.fold&&(
                          <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"nowrap"}}>
                            <span style={lbl0}>N</span>
                            <button onMouseDown={e=>{e.preventDefault();chN(tr.id,Math.max(3,p.N-1));}} style={arw}>‹</button>
                            <span onPointerDown={mkDrag(p.N,3,32,v=>chN(tr.id,v))} title="Drag ↕" style={{...val0,color:tr.color}}>{p.N}</span>
                            <button onMouseDown={e=>{e.preventDefault();chN(tr.id,Math.min(32,p.N+1));}} style={arw}>›</button>
                            <span style={sep0}>·</span>
                            <span style={lbl0}>HITS</span>
                            <button onMouseDown={e=>{e.preventDefault();chH(tr.id,Math.max(0,p.hits-1));}} style={arw}>‹</button>
                            <span onPointerDown={mkDrag(p.hits,0,p.N,v=>chH(tr.id,v))} title="Drag ↕" style={{...val0,color:tr.color}}>{p.hits}<span style={{fontSize:7,color:th.faint,fontWeight:400}}>/{p.N}</span></span>
                            <button onMouseDown={e=>{e.preventDefault();chH(tr.id,Math.min(p.N,p.hits+1));}} style={arw}>›</button>
                            <span style={sep0}>·</span>
                            <span style={lbl0}>ROT</span>
                            <button onMouseDown={e=>{e.preventDefault();chR(tr.id,((p.rot-1+p.N)%Math.max(p.N,1)));}} style={arw}>‹</button>
                            <span onPointerDown={mkDrag(p.rot,0,Math.max(p.N-1,0),v=>chR(tr.id,v))} title="Drag ↕" style={{...val0,color:tr.color}}>+{p.rot}</span>
                            <button onMouseDown={e=>{e.preventDefault();chR(tr.id,(p.rot+1)%Math.max(p.N,1));}} style={arw}>›</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* ── Add track ── */}
                  {!showAdd
                    ?<button onClick={()=>{setShowAdd(true);setShowCustomInput(false);setNewTrackName("");}} style={{padding:"7px",borderRadius:7,border:`1px dashed ${th.sBorder}`,background:"transparent",color:th.dim,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.05em"}}>+ ADD TRACK</button>
                    :<div style={{borderRadius:7,border:`1px dashed ${th.sBorder}`,padding:"7px 8px"}}>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:5}}>
                        {inact.map(t=>(<button key={t.id} onClick={()=>{
                          const defN=STEPS;
                          setEuclidParams(p=>({...p,[t.id]:{N:defN,hits:0,rot:0,tpl:"",fold:false}}));
                          setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[t.id]:defN}};cp[t.id]=Array(defN).fill(0);n[cPat]=cp;return n;});
                          setAct(a=>[...a,t.id]);setShowAdd(false);
                        }} style={{padding:"4px 10px",borderRadius:5,border:`1px solid ${t.color}44`,background:t.color+"14",color:t.color,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{t.icon} {t.label}</button>))}
                        {CustomTrackInput()}
                      </div>
                      <button onClick={()=>{setShowAdd(false);setShowCustomInput(false);setNewTrackName("");}} style={{fontSize:8,color:th.dim,background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit"}}>✕ cancel</button>
                    </div>
                  }
                </div>

                {/* ── RIGHT: Concentric rings SVG ── */}
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,flex:1}}>
                  <svg width={isPortrait?320:380} height={isPortrait?320:380} style={{display:"block",overflow:"visible"}}>
                    <circle cx={CX} cy={CY} r={R_OUT+20} fill={th.surface} stroke={th.sBorder} strokeWidth={1} opacity={0.6}/>
                    {atO.map((tr,ti)=>{
                      const R=R_OUT-ti*ringGap;
                      const p=getP(tr.id);const N=p.N;
                      const curS=playing&&euclidCur[tr.id]!=null?euclidCur[tr.id]:-1;
                      const headA=curS>=0?(2*Math.PI*curS/N)-Math.PI/2:-Math.PI/2;
                      const dotR=Math.max(3,Math.min(8,R*0.22));
                      const isM=!!muted[tr.id];const isS=soloed===tr.id;const aud=soloed?isS:!isM;
                      return(
                        <g key={tr.id} opacity={aud?1:0.3}>
                          <circle cx={CX} cy={CY} r={R} fill="none" stroke={tr.color} strokeWidth={0.5} strokeDasharray="2 4" opacity={0.25}/>
                          {playing&&curS>=0&&<line x1={CX} y1={CY} x2={CX+R*Math.cos(headA)} y2={CY+R*Math.sin(headA)} stroke={tr.color} strokeWidth={1.5} strokeLinecap="round" opacity={0.7}/>}
                          {Array.from({length:N},(_,i)=>{
                            const a=(2*Math.PI*i/N)-Math.PI/2;
                            const vx=CX+R*Math.cos(a),vy=CY+R*Math.sin(a);
                            const on=(pat[tr.id]||[])[i]>0;const cur=i===curS;
                            const velPct=on?(stVel[tr.id]?.[i]??100):0;
                            // I.1d: EDIT mode increases dot size 40%
                            const baseR=(cur?dotR+2:dotR)+(on?Math.round((velPct/100)*3):0);
                            const rv=euclidEditMode?Math.round(baseR*1.4):baseR;
                            const vOp=on?0.3+(velPct/100)*0.7:0.45;
                            const hasFeedback=euclidTouchFeedback?.tid===tr.id&&euclidTouchFeedback?.step===i;
                            return(
                              <g key={i} style={{cursor:on?"ns-resize":"pointer",userSelect:"none",touchAction:"none",WebkitTouchCallout:"none"}}>
                                {/* I.1a: transparent tap zone for easier touch */}
                                <circle cx={vx} cy={vy} r={Math.max(28,rv+20)} fill="transparent"
                                  style={{cursor:"pointer",touchAction:"none"}}
                                  onPointerDown={mkVelDrag(tr.id,i,on,velPct)}/>
                                {on&&<circle cx={vx} cy={vy} r={rv+12} fill={tr.color} opacity={0.15} style={{animation:"haloRing 0.6s ease-in-out infinite",pointerEvents:"none"}}/>}
                                {cur&&<circle cx={vx} cy={vy} r={rv+7} fill={tr.color+(on?"28":"11")} style={{pointerEvents:"none"}}/>}
                                {/* I.1b: feedback flash circle */}
                                {hasFeedback&&<circle cx={vx} cy={vy} r={rv+12} fill={tr.color} opacity={0.35} style={{pointerEvents:"none"}}/>}
                                <circle cx={vx} cy={vy} r={rv}
                                  fill={on?tr.color:(cur?tr.color+"33":th.stepOff)}
                                  stroke={on?tr.color:th.sBorder}
                                  strokeWidth={on?0:0.5}
                                  opacity={on?vOp:0.45}
                                  style={{pointerEvents:"none"}}/>
                                {on&&velPct<80&&<circle cx={vx} cy={vy} r={rv*0.4} fill="#000" opacity={0.2} style={{pointerEvents:"none"}}/>}
                                {N<=20&&<text x={vx} y={vy+rv+8} textAnchor="middle" fontSize={5} fill={on?tr.color:th.faint} fontFamily="monospace" opacity={0.7} style={{pointerEvents:"none"}}>{i+1}</text>}
                              </g>
                            );
                          })}
                          <text x={CX+R+11} y={CY+4} textAnchor="start" fontSize={8} fill={tr.color} fontFamily="monospace" fontWeight={700} opacity={0.9}>{tr.icon}</text>
                        </g>
                      );
                    })}
                    <circle cx={CX} cy={CY} r={16} fill={th.surface} stroke={th.sBorder} strokeWidth={1}/>
                    <text x={CX} y={CY+4} textAnchor="middle" fontSize={9} fill={playing?"#30D158":th.faint} fontFamily="monospace" fontWeight={700}>{playing?"▶":"■"}</text>
                  </svg>
                  <div style={{fontSize:7,color:th.faint,letterSpacing:"0.08em",textAlign:"center"}}>
                    {atO.length} track{atO.length>1?"s":""} · {atO.reduce((a,tr)=>a+(pat[tr.id]||[]).filter(v=>v>0).length,0)} hits · tap = toggle · long-press = velocity
                  </div>
                </div>
              </div>
            </div>
          );
        })()}


        {(()=>{
          const anyStep=atO.some(tr=>(pat[tr.id]||[]).some(v=>v>0));
          const msg=!anyStep
            ?"Tape sur une case pour placer un son"
            :!playing
              ?"Lance la lecture pour entendre"
              :appSt.usageSeconds<120
                ?"Drag ↕ sur un step = vélocité · Hold = probabilité"
                :null;
          return(
            <div style={{textAlign:"center",marginTop:14,padding:"8px 0 20px 0",borderTop:`1px solid ${th.sBorder}`,display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
              {msg&&<span style={{fontSize:8,color:th.faint,letterSpacing:"0.04em"}}>{msg}</span>}
              <button onClick={()=>setShowCheatSheet(true)} style={{fontSize:9,fontWeight:700,color:th.dim,background:"transparent",border:`1px solid ${th.sBorder}`,borderRadius:12,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>?</button>
            </div>
          );
        })()}
      </div>

      {/* ── Velocity picker popup (Euclid long-press) ── */}
      {/* ── Probability popover (step sequencer long-press) ── */}
      {probPopover&&(()=>{
        const {tid,step,x,y}=probPopover;
        const trk=allT.find(t=>t.id===tid);
        const col=trk?.color||"#FF9500";
        const cur=stProb[tid]?.[step]??100;
        const applyProb=v=>{pushHistory();setStProb(p=>{const n={...p};const src=n[tid];const a=Array.isArray(src)?[...src]:Array(STEPS).fill(100);a[step]=v;n[tid]=a;return n;});setProbPopover(null);};
        return(
          <>
            <div style={{position:"fixed",inset:0,zIndex:9998}} onPointerDown={()=>setProbPopover(null)}/>
            <div style={{position:"fixed",left:x,top:y,zIndex:9999,background:th.surface,border:`1px solid ${col}55`,borderRadius:10,padding:"12px 14px",boxShadow:`0 8px 32px rgba(0,0,0,0.6),0 0 0 1px ${col}22`,minWidth:155,userSelect:"none"}}>
              <div style={{fontSize:6.5,color:th.faint,fontWeight:700,letterSpacing:"0.1em",marginBottom:8}}>STEP {step+1} — PROBABILITÉ</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:10}}>
                {[100,75,50,25].map(v=>(
                  <button key={v} onPointerDown={e=>{e.stopPropagation();applyProb(v);}}
                    style={{padding:"8px 0",borderRadius:6,border:`1px solid ${cur===v?"#FF9500":th.sBorder}`,background:cur===v?"rgba(255,149,0,0.22)":"transparent",color:cur===v?"#FF9500":th.dim,fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:"inherit",transition:"all 0.1s"}}>{v}%</button>
                ))}
              </div>
              <button onPointerDown={e=>{e.stopPropagation();setProbPopover(null);}}
                style={{width:"100%",padding:"5px 0",borderRadius:6,border:`1px solid ${th.sBorder}`,background:"transparent",color:th.faint,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕ ANNULER</button>
            </div>
          </>
        );
      })()}
      {velPicker&&(()=>{
        const {tid,step,x,y}=velPicker;
        const trk=allT.find(t=>t.id===tid);
        const col=trk?.color||"#FF2D55";
        const cur=velPicker.velPct;
        const curProb=velPicker.probPct??100;
        const apply=v=>{
          setStVel(sv=>{const ns={...sv};ns[tid]=[...(Array.isArray(ns[tid])?ns[tid]:Array(32).fill(100))];ns[tid][step]=v;return ns;});
          setPBank(pb=>{const n=[...pb];const cp={...n[cPat]};if(!(cp[tid]?.[step]>0)){const a=[...(cp[tid]||[])];a[step]=100;cp[tid]=a;}n[cPat]=cp;return n;});
          setStProb(sp=>{const ns={...sp};ns[tid]=[...(Array.isArray(ns[tid])?ns[tid]:Array(32).fill(100))];ns[tid][step]=curProb;return ns;});
          setVelPicker(null);
        };
        return(
          <>
            <div style={{position:"fixed",inset:0,zIndex:9998}} onPointerDown={()=>setVelPicker(null)}/>
            <div style={{position:"fixed",left:x,top:y,zIndex:9999,background:th.surface,border:`1px solid ${col}55`,borderRadius:10,padding:"10px 12px",boxShadow:`0 8px 32px rgba(0,0,0,0.6),0 0 0 1px ${col}22`,minWidth:150,userSelect:"none"}}>
              <div style={{fontSize:6.5,color:th.faint,fontWeight:700,letterSpacing:"0.1em",textAlign:"center",marginBottom:4}}>STEP {step+1} — VÉLOCITÉ</div>
              <div style={{fontSize:28,fontWeight:800,color:col,textAlign:"center",marginBottom:8,lineHeight:1}}>{cur}<span style={{fontSize:12,fontWeight:600,color:th.faint}}>%</span></div>
              {/* Horizontal slider */}
              <div style={{position:"relative",height:16,borderRadius:8,background:th.sBorder,cursor:"pointer",marginBottom:10,touchAction:"none"}}
                onPointerDown={e=>{e.preventDefault();e.stopPropagation();const ref=e.currentTarget;ref.setPointerCapture(e.pointerId);const go=cx=>{const r=ref.getBoundingClientRect();setVelPicker(p=>({...p,velPct:Math.round(Math.max(1,Math.min(100,(cx-r.left)/r.width*100)))}));};go(e.clientX);const mv=pe=>{pe.preventDefault();go(pe.clientX);};const up=()=>ref.removeEventListener("pointermove",mv);ref.addEventListener("pointermove",mv);ref.addEventListener("pointerup",up,{once:true});ref.addEventListener("pointercancel",up,{once:true});}}>
                <div style={{height:"100%",width:`${cur}%`,borderRadius:8,background:`linear-gradient(90deg,${col}88,${col})`}}/>
                <div style={{position:"absolute",top:"50%",left:`${cur}%`,width:16,height:16,borderRadius:"50%",background:col,transform:"translate(-50%,-50%)",boxShadow:`0 0 0 3px ${col}44`,pointerEvents:"none"}}/>
              </div>
              {/* Velocity presets */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3,marginBottom:10}}>
                {[25,50,75,100].map(v=>(
                  <button key={v} onPointerDown={e=>{e.stopPropagation();setVelPicker(p=>({...p,velPct:v}));}} style={{padding:"4px 0",borderRadius:5,border:`1px solid ${Math.abs(cur-v)<13?col:th.sBorder}`,background:Math.abs(cur-v)<13?col+"22":"transparent",color:Math.abs(cur-v)<13?col:th.dim,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{v}%</button>
                ))}
              </div>
              {/* Probability row */}
              <div style={{borderTop:`1px solid ${th.sBorder}`,paddingTop:8,marginBottom:8}}>
                <div style={{fontSize:6.5,color:th.faint,fontWeight:700,letterSpacing:"0.1em",marginBottom:5}}>PROBABILITÉ</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3}}>
                  {[100,75,50,25].map(v=>(
                    <button key={v} onPointerDown={e=>{e.stopPropagation();setVelPicker(p=>({...p,probPct:v}));}} style={{padding:"5px 0",borderRadius:5,border:`1px solid ${curProb===v?"#FF9500":th.sBorder}`,background:curProb===v?"rgba(255,149,0,0.2)":"transparent",color:curProb===v?"#FF9500":th.dim,fontSize:8,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>{v}%</button>
                  ))}
                </div>
              </div>
              {/* OK / Cancel */}
              <div style={{display:"flex",gap:4}}>
                <button onPointerDown={e=>{e.stopPropagation();setVelPicker(null);}} style={{flex:1,padding:"5px 0",borderRadius:6,border:`1px solid ${th.sBorder}`,background:"transparent",color:th.faint,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕ ANNULER</button>
                <button onPointerDown={e=>{e.stopPropagation();apply(cur);}} style={{flex:1,padding:"5px 0",borderRadius:6,border:"none",background:col,color:"#000",fontSize:8,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>✓ OK</button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
    {/* Fix 1: AudioContext suspended overlay (Android WebView autoplay policy) */}
    {ctxSuspended&&(
      <div onClick={async()=>{await engine.ctx?.resume();setCtxSuspended(false);}} style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,0.85)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20,cursor:"pointer",userSelect:"none"}}>
        <div style={{width:80,height:80,borderRadius:"50%",background:"rgba(255,149,0,0.15)",border:"2px solid rgba(255,149,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:36,marginLeft:6}}>▶</span>
        </div>
        <div style={{fontSize:22,fontWeight:800,color:"#fff",letterSpacing:"0.18em"}}>TAP TO START</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",letterSpacing:"0.06em"}}>Audio requires interaction to start</div>
      </div>
    )}

    {/* ── CP-E: Onboarding Overlay ── */}
    {overlayVisible&&(
      <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,transition:"opacity 0.3s",opacity:overlayVisible?1:0}}>
        <div style={{maxWidth:460,width:"100%",borderRadius:18,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",padding:"36px 28px",display:"flex",flexDirection:"column",alignItems:"center",gap:20,backdropFilter:"blur(20px)"}}>
          <div style={{fontSize:28,fontWeight:900,letterSpacing:"0.08em",background:"linear-gradient(90deg,#FF2D55,#FF9500,#FFD60A,#30D158,#5E5CE6)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"gradientShift 4s linear infinite",textAlign:"center"}}>KICK &amp; SNARE</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",letterSpacing:"0.3em",textAlign:"center",marginTop:-12}}>DRUM EXPERIENCE</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.8)",textAlign:"center",lineHeight:1.6,fontWeight:500}}>Ton séquenceur de batterie TR-808 dans le navigateur. Crée des grooves, enregistre des loops, explore les rythmes euclidiens.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%"}}>
            {[
              {icon:"◆",label:"Séquenceur",desc:"Place tes sons\nstep by step",col:"#FF2D55"},
              {icon:"⬡",label:"Euclid",desc:"Rythmes\nalgorithmiques",col:"#FFD60A"},
              {icon:"⊙",label:"Looper",desc:"Enregistre\nen live",col:"#BF5AF2"},
              {icon:"⊞",label:"Live Pads",desc:"Joue\nen temps réel",col:"#5E5CE6"},
            ].map(({icon,label,desc,col})=>(
              <div key={label} style={{padding:"12px 10px",borderRadius:10,background:`${col}0A`,border:`1px solid ${col}33`,display:"flex",flexDirection:"column",gap:4}}>
                <div style={{fontSize:18,color:col}}>{icon}</div>
                <div style={{fontSize:10,fontWeight:800,color:col,letterSpacing:"0.06em"}}>{label}</div>
                <div style={{fontSize:8,color:"rgba(255,255,255,0.45)",whiteSpace:"pre-line",lineHeight:1.5}}>{desc}</div>
              </div>
            ))}
          </div>
          <button onClick={()=>{setLaunched();setOverlayVisible(false);}} style={{width:"100%",padding:"14px 0",borderRadius:12,border:"none",background:"linear-gradient(90deg,#FF2D55,#FF9500)",color:"#fff",fontSize:14,fontWeight:900,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em"}}>C&apos;est parti !</button>
          <button onClick={()=>{setLaunched();setOverlayVisible(false);}} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.35)",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>Je connais déjà →</button>
        </div>
      </div>
    )}

    {/* ── CP-E: Cheat-sheet popup ── */}
    {showCheatSheet&&(
      <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.75)"}} onClick={()=>setShowCheatSheet(false)}>
        <div onClick={e=>e.stopPropagation()} style={{position:"fixed",bottom:60,left:"50%",transform:"translateX(-50%)",width:"min(440px,96vw)",borderRadius:14,background:th.surface,border:`1px solid ${th.sBorder}`,padding:"20px 18px",boxShadow:"0 8px 40px rgba(0,0,0,0.7)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:900,color:th.text,letterSpacing:"0.12em"}}>CHEAT SHEET</div>
            <button onClick={()=>setShowCheatSheet(false)} style={{background:"transparent",border:"none",color:th.dim,fontSize:13,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 18px"}}>
            {[
              ["Espace","Lecture / Stop"],
              ["Tap","Activer un step"],
              ["Drag ↕ step","Vélocité"],
              ["Drag ↔ step","Nudge timing"],
              ["Long-press step","Probabilité"],
              ["Double-tap step","Reset"],
              ["Swipe ← / →","Undo / Redo"],
              ["Long-press PAT","Nommer le pattern"],
              ["Vue EUCLID → EDIT","Placer les sons visuellement"],
              ["VOL MASTER","Drag ↕ en jaune (transport)"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",flexDirection:"column",padding:"4px 0",borderBottom:`1px solid ${th.sBorder}`}}>
                <span style={{fontSize:8,fontWeight:800,color:"#FF9500"}}>{k}</span>
                <span style={{fontSize:8,color:th.dim}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
  </>);
}

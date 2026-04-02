import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { DEFAULT_SAMPLES, b64toAB } from "./defaultSamples";
import { THEMES } from "./theme.js";
import { DrumSVG } from "./drumSVG.tsx";
import TransportBar from "./components/TransportBar.jsx";
import PatternBank from "./components/PatternBank.jsx";
import TrackRow from "./components/TrackRow.jsx";
import LooperPanel from "./components/LooperPanel.jsx";
import TutorialOverlay from "./components/TutorialOverlay.tsx";
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
  // Transient shaper
  onTransient:false,
  tsAttack:0,   // dB -12..+12
  tsSustain:0,  // dB -12..+12
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
   samples:{kick:`${import.meta.env.BASE_URL}samples/acoustic/kick.wav`,snare:`${import.meta.env.BASE_URL}samples/acoustic/snare.wav`,hihat:`${import.meta.env.BASE_URL}samples/acoustic/hihat.wav`,clap:`${import.meta.env.BASE_URL}samples/acoustic/clap.wav`,tom:`${import.meta.env.BASE_URL}samples/acoustic/tom.wav`,ride:`${import.meta.env.BASE_URL}samples/acoustic/ride.wav`,crash:`${import.meta.env.BASE_URL}samples/acoustic/crash.wav`,perc:`${import.meta.env.BASE_URL}samples/acoustic/perc.wav`},
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
  constructor(){this.ctx=null;this.mg=null;this.buf={};this.rv=null;this.ch={};this._c={};this._resumeP=null;this._chainOrder=['drive','comp','filter'];this._sendPositions={};
    this._isMobile=/Android|iPhone|iPad/i.test(typeof navigator!=='undefined'?navigator.userAgent:'');
  }
  init(){
    if(this.ctx)return;
    this.ctx=new(window.AudioContext||window.webkitAudioContext)(
      this._isMobile?{latencyHint:'playback',sampleRate:44100}:{}
    );
    // ── Master input gain ──
    this.mg=this.ctx.createGain();this.mg.gain.value=0.8;
    // ── Drive (WaveShaper) ──
    this.gDrv=this.ctx.createWaveShaper();this.gDrv.oversample='4x';
    this.gDrv.curve=this._buildCurve('tanh',0);
    // ── Comp + auto-makeup ──
    this.gCmp=this.ctx.createDynamicsCompressor();
    this.gCmp.threshold.value=0;this.gCmp.ratio.value=1;
    this.gCmp.knee.value=6;this.gCmp.attack.value=0.005;this.gCmp.release.value=0.08;
    this.gCmpMakeup=this.ctx.createGain();this.gCmpMakeup.gain.value=1;
    this.gCmp.connect(this.gCmpMakeup); // internal block connection
    // ── Filter 2×12dB = 24dB/oct ──
    this.gFlt=this.ctx.createBiquadFilter();this.gFlt.type='lowpass';this.gFlt.frequency.value=20000;
    this.gFlt2=this.ctx.createBiquadFilter();this.gFlt2.type='lowpass';this.gFlt2.frequency.value=20000;
    this.gFlt.connect(this.gFlt2); // internal block connection
    // ── Master output ──
    this.gOut=this.ctx.createGain();this.gOut.gain.value=1;
    this.gOut.connect(this.ctx.destination);
    // ── Resume context when tab becomes visible again (Android/iOS) ──
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'&&this.ctx?.state==='suspended'){
        this.ctx.resume();
      }
    });
    // ── Filter LFO ──
    this.gFltLfo=this.ctx.createOscillator();this.gFltLfo.type='sine';this.gFltLfo.frequency.value=1.0;
    this.gFltLfoDepth=this.ctx.createGain();this.gFltLfoDepth.gain.value=0;
    this.gFltLfo.connect(this.gFltLfoDepth);
    this.gFltLfoDepth.connect(this.gFlt.frequency);
    this.gFltLfoDepth.connect(this.gFlt2.frequency);
    this.gFltLfo.start();
    // ── Reverb bus ──
    this.gRvBus=this.ctx.createGain();this.gRvConv=this.ctx.createConvolver();
    this.gRvBus.connect(this.gRvConv);this.gRvConv.connect(this.gOut);
    // ── Delay bus ──
    this.gDlBus=this.ctx.createGain();this.gDl=this.ctx.createDelay(2);this.gDl.delayTime.value=0.25;
    this.gDlFb=this.ctx.createGain();this.gDlFb.gain.value=0.35;
    this.gDlLpf=this.ctx.createBiquadFilter();this.gDlLpf.type='lowpass';this.gDlLpf.frequency.value=4500;
    this.gDlBus.connect(this.gDl);this.gDl.connect(this.gDlFb);this.gDlFb.connect(this.gDlLpf);this.gDlLpf.connect(this.gDl);this.gDl.connect(this.gOut);
    // ── Chorus bus ──
    this.gChoBus=this.ctx.createGain();this.gChoBus.gain.value=0;
    this.gChoDlL=this.ctx.createDelay(0.05);this.gChoDlR=this.ctx.createDelay(0.05);
    this.gChoDlL.delayTime.value=0.020;this.gChoDlR.delayTime.value=0.023;
    this.gChoLfo=this.ctx.createOscillator();this.gChoLfo.type='sine';this.gChoLfo.frequency.value=0.8;
    this.gChoDepthL=this.ctx.createGain();this.gChoDepthL.gain.value=0.003;
    this.gChoDepthR=this.ctx.createGain();this.gChoDepthR.gain.value=-0.003;
    this.gChoMerge=this.ctx.createChannelMerger(2);
    this.gChoLfo.connect(this.gChoDepthL);this.gChoLfo.connect(this.gChoDepthR);
    this.gChoDepthL.connect(this.gChoDlL.delayTime);this.gChoDepthR.connect(this.gChoDlR.delayTime);
    this.gChoBus.connect(this.gChoDlL);this.gChoBus.connect(this.gChoDlR);
    this.gChoDlL.connect(this.gChoMerge,0,0);this.gChoDlR.connect(this.gChoMerge,0,1);
    this.gChoMerge.connect(this.gOut);this.gChoLfo.start();
    // ── Chorus master feed (mg → gChoFeed → gChoBus, managed by rebuildChain) ──
    this.gChoFeed=this.ctx.createGain();this.gChoFeed.gain.value=0;
    this.gChoFeed.connect(this.gChoBus);
    // ── Flanger bus ──
    this.gFlaBus=this.ctx.createGain();this.gFlaBus.gain.value=0;
    this.gFlaDl=this.ctx.createDelay(0.02);this.gFlaDl.delayTime.value=0.003;
    this.gFlaFb=this.ctx.createGain();this.gFlaFb.gain.value=0.6;
    this.gFlaLfo=this.ctx.createOscillator();this.gFlaLfo.type='sine';this.gFlaLfo.frequency.value=0.3;
    this.gFlaDepth=this.ctx.createGain();this.gFlaDepth.gain.value=0.002;
    this.gFlaWet=this.ctx.createGain();this.gFlaWet.gain.value=0.7;
    this.gFlaLfo.connect(this.gFlaDepth);this.gFlaDepth.connect(this.gFlaDl.delayTime);
    this.gFlaBus.connect(this.gFlaDl);this.gFlaDl.connect(this.gFlaFb);this.gFlaFb.connect(this.gFlaDl);
    this.gFlaDl.connect(this.gFlaWet);this.gFlaWet.connect(this.gOut);this.gFlaLfo.start();
    // ── Flanger master feed ──
    this.gFlaFeed=this.ctx.createGain();this.gFlaFeed.gain.value=0;
    this.gFlaFeed.connect(this.gFlaBus);
    // ── Ping-Pong Delay bus ──
    this.gPpBus=this.ctx.createGain();this.gPpBus.gain.value=0;
    this.gPpDlL=this.ctx.createDelay(2.0);this.gPpDlR=this.ctx.createDelay(2.0);
    this.gPpDlL.delayTime.value=0.25;this.gPpDlR.delayTime.value=0.25;
    this.gPpPanL=this.ctx.createStereoPanner?this.ctx.createStereoPanner():this.ctx.createGain();
    this.gPpPanR=this.ctx.createStereoPanner?this.ctx.createStereoPanner():this.ctx.createGain();
    if(this.gPpPanL.pan)this.gPpPanL.pan.value=-0.9;
    if(this.gPpPanR.pan)this.gPpPanR.pan.value=0.9;
    this.gPpFbLR=this.ctx.createGain();this.gPpFbLR.gain.value=0.5;
    this.gPpFbRL=this.ctx.createGain();this.gPpFbRL.gain.value=0.5;
    this.gPpLpf=this.ctx.createBiquadFilter();this.gPpLpf.type='lowpass';this.gPpLpf.frequency.value=5000;
    this.gPpBus.connect(this.gPpDlL);this.gPpBus.connect(this.gPpDlR);
    this.gPpDlL.connect(this.gPpFbLR);this.gPpFbLR.connect(this.gPpLpf);this.gPpLpf.connect(this.gPpDlR);
    this.gPpDlR.connect(this.gPpFbRL);this.gPpFbRL.connect(this.gPpDlL);
    this.gPpDlL.connect(this.gPpPanL);this.gPpDlR.connect(this.gPpPanR);
    this.gPpPanL.connect(this.gOut);this.gPpPanR.connect(this.gOut);
    // ── Spectrum Analyser ──
    this.gAnalyser=this.ctx.createAnalyser();
    this.gAnalyser.fftSize=512;this.gAnalyser.smoothingTimeConstant=0.8;
    this.gOut.connect(this.gAnalyser);
    // ── Build reverb IR + track channels ──
    this._mkRv(2,0.5,'room');
    TRACKS.forEach(t=>this._build(t.id));this._loadDefaults();
    // ── Initial serial chain ──
    this._chainOrder=['drive','comp','filter'];this._sendPositions={};
    this.rebuildChain(this._chainOrder,this._sendPositions);
  }
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
  _mkRv(decay=2,size=0.5,type='room'){
    const sr=this.ctx.sampleRate;
    const scale=sr/44100;
    const cfgs={
      plate:{roomSize:0.52,damp:0.82,preDelay:0.002},
      room: {roomSize:0.50+size*0.3,damp:0.5+size*0.3,preDelay:0.01+size*0.02},
      hall: {roomSize:0.75+size*0.2,damp:0.3+size*0.2,preDelay:0.025+size*0.04},
    };
    const cfg=cfgs[type]||cfgs.room;
    const{roomSize,damp}=cfg;
    const preDelaySamples=Math.floor(cfg.preDelay*sr);
    const totalSamples=Math.ceil(sr*(Math.min(8,decay)+cfg.preDelay+0.1));
    const buf=this.ctx.createBuffer(2,totalSamples,sr);
    const combDelaysL=[1116,1188,1277,1356,1422,1491,1557,1617].map(d=>Math.floor(d*scale));
    const combDelaysR=combDelaysL.map(d=>d+23);
    const apDelays=[556,441,341,225].map(d=>Math.floor(d*scale));
    for(let ch=0;ch<2;ch++){
      const data=buf.getChannelData(ch);
      const combDelays=ch===0?combDelaysL:combDelaysR;
      const combBufs=combDelays.map(d=>new Float32Array(d));
      const combPos=new Int32Array(combDelays.length);
      const combFilt=new Float32Array(combDelays.length);
      const apBufs=apDelays.map(d=>new Float32Array(d));
      const apPos=new Int32Array(apDelays.length);
      for(let i=0;i<totalSamples;i++){
        const input=(i===preDelaySamples)?1.0:0.0;
        let combOut=0;
        for(let c=0;c<combBufs.length;c++){
          const b=combBufs[c],pos=combPos[c];
          const delayed=b[pos];
          combFilt[c]=delayed*(1-damp)+combFilt[c]*damp;
          b[pos]=input+combFilt[c]*roomSize;
          combPos[c]=(pos+1)%b.length;
          combOut+=delayed;
        }
        combOut*=0.015;
        let apOut=combOut;
        for(let a=0;a<apBufs.length;a++){
          const b=apBufs[a],pos=apPos[a];
          const delayed=b[pos];
          const w=apOut+delayed*0.5;
          b[pos]=w;
          apPos[a]=(pos+1)%b.length;
          apOut=delayed-0.5*w;
        }
        data[i]=apOut;
      }
    }
    this.rv=buf;
  }
  updateReverb(decay,size,type='room'){this._mkRv(decay,size,type);if(this.gRvConv){try{this.gRvConv.buffer=this.rv;}catch(e){}}}
  rebuildChain(order=['drive','comp','filter'],sendPositions={}){
    if(!this.ctx)return;
    const seriesIn={drive:this.gDrv,comp:this.gCmp,filter:this.gFlt};
    const seriesOut={drive:this.gDrv,comp:this.gCmpMakeup,filter:this.gFlt2};
    const safeDisc=node=>{try{node.disconnect();}catch(e){}};
    safeDisc(this.mg);safeDisc(this.gDrv);safeDisc(this.gCmpMakeup);safeDisc(this.gFlt2);
    const chain=order.filter(id=>seriesIn[id]);
    if(chain.length===0){
      this.mg.connect(this.gOut);
    }else{
      this.mg.connect(seriesIn[chain[0]]);
      for(let i=0;i<chain.length-1;i++)seriesOut[chain[i]].connect(seriesIn[chain[i+1]]);
      seriesOut[chain[chain.length-1]].connect(this.gOut);
    }
    // chorus/flanger use per-track sends — no master feed to re-attach
    this._chainOrder=chain;this._sendPositions=sendPositions;
  }
  setSerialOrder(order:string[]){this.rebuildChain(order,this._sendPositions);}
  _build(id){
    const c={};
    c.in=this.ctx.createGain();
    c.tsAtk=this.ctx.createGain();c.tsAtk.gain.value=1;
    c.vol=this.ctx.createGain();c.vol.gain.value=0.8;
    c.pan=this.ctx.createStereoPanner?this.ctx.createStereoPanner():this.ctx.createGain();
    c.dry=this.ctx.createGain();c.dry.gain.value=1;
    c.rvSend=this.ctx.createGain();c.rvSend.gain.value=0;
    c.dlSend=this.ctx.createGain();c.dlSend.gain.value=0;
    c.choSend=this.ctx.createGain();c.choSend.gain.value=0;
    c.flaSend=this.ctx.createGain();c.flaSend.gain.value=0;
    c.ppSend=this.ctx.createGain();c.ppSend.gain.value=0;
    c.in.connect(c.tsAtk);c.tsAtk.connect(c.vol);c.vol.connect(c.pan);
    c.pan.connect(c.dry);c.dry.connect(this.mg);
    c.pan.connect(c.rvSend);c.rvSend.connect(this.gRvBus);
    c.pan.connect(c.dlSend);c.dlSend.connect(this.gDlBus);
    c.pan.connect(c.choSend);c.choSend.connect(this.gChoBus);
    c.pan.connect(c.flaSend);c.flaSend.connect(this.gFlaBus);
    c.pan.connect(c.ppSend);c.ppSend.connect(this.gPpBus);
    this.ch[id]=c;
  }
  uGfx(gfx){
    if(!this.ctx||!this.gDrv)return;
    const t=this.ctx.currentTime;
    // ── Drive ──
    const driveMode=gfx.drive?.mode||'tanh';
    const driveAmt=gfx.drive?.on?(gfx.drive.amt/100):0;
    this.gDrv.curve=this._buildCurve(driveMode,driveAmt);
    // ── Comp ──
    const cThr=gfx.comp?.on?(gfx.comp.thr??-12):0;
    const cRatio=gfx.comp?.on?Math.max(1,gfx.comp.ratio??4):1;
    this.gCmp.threshold.setTargetAtTime(cThr,t,0.008);
    this.gCmp.ratio.setTargetAtTime(cRatio,t,0.008);
    if(gfx.comp?.on){
      const att=Math.max(0.001,Math.min(0.1,(gfx.comp.attack??5)/1000));
      const rel=Math.max(0.02,Math.min(0.5,(gfx.comp.release??80)/1000));
      this.gCmp.attack.setTargetAtTime(att,t,0.008);
      this.gCmp.release.setTargetAtTime(rel,t,0.008);
    }else{
      this.gCmp.attack.setTargetAtTime(0.005,t,0.008);
      this.gCmp.release.setTargetAtTime(0.08,t,0.008);
    }
    if(this.gCmpMakeup){
      const mkDb=gfx.comp?.on?Math.max(0,-cThr*(1-1/cRatio)*0.5):0;
      this.gCmpMakeup.gain.setTargetAtTime(Math.min(6,Math.pow(10,mkDb/20)),t,0.01);
    }
    // ── Filter ──
    const fType=gfx.filter?.on?(gfx.filter.type||'lowpass'):'lowpass';
    const fCut=gfx.filter?.on?Math.max(20,gfx.filter.cut||18000):20000;
    const fQ=gfx.filter?.on?(gfx.filter.res||0):0;
    this.gFlt.type=fType;this.gFlt2.type=fType;
    this.gFlt.frequency.setTargetAtTime(fCut,t,0.004);this.gFlt2.frequency.setTargetAtTime(fCut,t,0.004);
    this.gFlt.Q.setTargetAtTime(fQ,t,0.004);this.gFlt2.Q.setTargetAtTime(fQ,t,0.004);
    // Filter LFO
    const fltLfoOn=gfx.filter?.on&&(gfx.filter?.lfo??false);
    if(this.gFltLfo){
      const shape=gfx.filter?.lfoShape||'sine';
      if(this.gFltLfo.type!==shape)this.gFltLfo.type=shape;
      this.gFltLfo.frequency.setTargetAtTime(Math.max(0.05,gfx.filter?.lfoRate??1.0),t,0.02);
    }
    if(this.gFltLfoDepth){
      const depth=fltLfoOn?(gfx.filter?.lfoDepth??0)/100*8000:0;
      this.gFltLfoDepth.gain.setTargetAtTime(depth,t,0.02);
    }
    // ── Delay ──
    if(this.gDl)this.gDl.delayTime.setTargetAtTime(Math.min(1.9,gfx.delay?.time||0.25),t,0.01);
    if(this.gDlFb)this.gDlFb.gain.setTargetAtTime((gfx.delay?.fdbk||35)/100,t,0.01);
    if(this.gDlLpf)this.gDlLpf.frequency.setTargetAtTime(gfx.delay?.on?4500:20000,t,0.01);
    // ── Chorus — per-track sends (same model as reverb/delay) ──
    const choOn=gfx.chorus?.on??false;
    if(this.gChoBus)this.gChoBus.gain.setTargetAtTime(choOn?1:0,t,0.01);
    if(this.gChoFeed)this.gChoFeed.gain.setTargetAtTime(0,t,0.01); // master feed disabled
    if(this.gChoLfo)this.gChoLfo.frequency.setTargetAtTime(Math.max(0.1,gfx.chorus?.rate??0.8),t,0.01);
    if(this.gChoDepthL&&this.gChoDepthR){
      const depth=(gfx.chorus?.depth??30)/100*0.007;
      this.gChoDepthL.gain.setTargetAtTime(choOn?depth:0,t,0.01);
      this.gChoDepthR.gain.setTargetAtTime(choOn?-depth:0,t,0.01);
    }
    // ── Flanger — per-track sends (same model as reverb/delay) ──
    const flaOn=gfx.flanger?.on??false;
    if(this.gFlaBus)this.gFlaBus.gain.setTargetAtTime(flaOn?1:0,t,0.01);
    if(this.gFlaFeed)this.gFlaFeed.gain.setTargetAtTime(0,t,0.01); // master feed disabled
    if(this.gFlaLfo)this.gFlaLfo.frequency.setTargetAtTime(Math.max(0.05,gfx.flanger?.rate??0.3),t,0.01);
    if(this.gFlaDepth){const depth=(gfx.flanger?.depth??50)/100*0.004;this.gFlaDepth.gain.setTargetAtTime(flaOn?depth:0,t,0.01);}
    if(this.gFlaFb)this.gFlaFb.gain.setTargetAtTime(flaOn?Math.min(0.9,(gfx.flanger?.feedback??60)/100):0,t,0.01);
    // ── Ping-Pong ──
    const ppOn=gfx.pingpong?.on??false;
    if(this.gPpBus)this.gPpBus.gain.setTargetAtTime(ppOn?1:0,t,0.01);
    if(this.gPpDlL&&this.gPpDlR){
      // Use the pre-computed time stored in gfx (kept in sync with BPM by the React useEffect).
      // Do NOT recompute from syncDiv here — that path used hardcoded 120 BPM.
      const ppTime=gfx.pingpong?.time??0.25;
      this.gPpDlL.delayTime.setTargetAtTime(Math.min(1.9,ppTime),t,0.01);
      this.gPpDlR.delayTime.setTargetAtTime(Math.min(1.9,ppTime),t,0.01);
    }
    if(this.gPpFbLR&&this.gPpFbRL){
      const fb=Math.min(0.85,(gfx.pingpong?.fdbk??50)/100);
      this.gPpFbLR.gain.setTargetAtTime(fb,t,0.01);this.gPpFbRL.gain.setTargetAtTime(fb,t,0.01);
    }
    if(this.gPpLpf)this.gPpLpf.frequency.setTargetAtTime(ppOn?5000:20000,t,0.01);
    // ── Sends per track ──
    Object.keys(this.ch).forEach(id=>{
      const c=this.ch[id];if(!c)return;
      const rvOn=gfx.reverb?.on&&!!gfx.reverb?.sends?.[id];
      const dlOn=gfx.delay?.on&&!!gfx.delay?.sends?.[id];
      const ppS=ppOn&&!!gfx.pingpong?.sends?.[id];
      const choS=choOn&&!!gfx.chorus?.sends?.[id];
      const flaS=flaOn&&!!gfx.flanger?.sends?.[id];
      if(c.rvSend)c.rvSend.gain.setTargetAtTime(rvOn?0.85:0,t,0.01);
      if(c.dlSend)c.dlSend.gain.setTargetAtTime(dlOn?0.85:0,t,0.01);
      if(c.choSend)c.choSend.gain.setTargetAtTime(choS?0.85:0,t,0.01);
      if(c.flaSend)c.flaSend.gain.setTargetAtTime(flaS?0.85:0,t,0.01);
      if(c.ppSend)c.ppSend.gain.setTargetAtTime(ppS?0.70:0,t,0.01);
      const anySend=rvOn||dlOn||choS||flaS||ppS;
      const manySend=[rvOn,dlOn,choS,flaS,ppS].filter(Boolean).length>1;
      if(c.dry)c.dry.gain.setTargetAtTime(manySend?0.3:anySend?0.6:1,t,0.3);
    });
  }
  _buildCurve(mode='tanh',amt=0){
    const key=mode+'_'+Math.round(amt*100);
    if(this._c[key])return this._c[key];
    const n=8192,a=new Float32Array(n),d=amt;
    for(let i=0;i<n;i++){
      const x=i*2/n-1;
      if(mode==='tanh'){
        const v=d*6,norm=v>0?Math.tanh(1+v):1;
        const sat=v>0?Math.tanh(x*(1+v))/norm:x;
        a[i]=sat-0.05*sat*sat;
      }else if(mode==='tape'){
        const v=d*3;
        a[i]=Math.max(-0.95,Math.min(0.95,x*(1+v)/(1+v*Math.abs(x))));
      }else if(mode==='tube'){
        const v=d*4,norm=Math.tanh(1+v);
        const sat=Math.tanh(x*(1+v))/norm;
        a[i]=x>=0?sat:sat*(1-d*0.4);
      }else if(mode==='bit'){
        const bits=Math.max(2,Math.round(12-d*10));
        const steps=Math.pow(2,bits-1);
        const srDiv=Math.max(1,Math.round(d*8));
        const idx=Math.floor(i/srDiv)*srDiv;
        const xSrc=idx*2/n-1;
        a[i]=Math.round(xSrc*steps)/steps;
      }else{
        a[i]=x;
      }
    }
    this._c[key]=a;return a;
  }
  uFx(id,f,noteTime?:number){
    const c=this.ch[id];if(!c||!this.ctx)return;const ct=this.ctx.currentTime;
    // vol/pan: apply at current time (persistent settings)
    const transTime=this._isMobile?0.08:0.02;
    c.vol.gain.setTargetAtTime((f?.vol??80)/100,ct,transTime);
    if(c.pan?.pan)c.pan.pan.setTargetAtTime((f?.pan??0)/100,ct,transTime);
    // Transient shaper: per-note envelope anchored at the note's scheduled time
    if(c.tsAtk){
      // nt = the moment the note starts (or now for immediate pads)
      const nt=noteTime!=null&&noteTime>ct?noteTime:ct;
      if(f?.onTransient&&(f.tsAttack!==0||f.tsSustain!==0)){
        const atkGain=Math.pow(10,(f.tsAttack||0)/20);
        const susGain=Math.pow(10,(f.tsSustain||0)/20);
        // Cancel any pending automation so curves don't accumulate
        c.tsAtk.gain.cancelScheduledValues(nt);
        // Instant attack boost/cut exactly at note start
        c.tsAtk.gain.setValueAtTime(atkGain,nt);
        // Smooth sustain transition 10ms after note start
        c.tsAtk.gain.setTargetAtTime(susGain,nt+0.01,0.04);
      }else{
        // Transient off — silently cancel and hold at 1
        c.tsAtk.gain.cancelScheduledValues(ct);
        c.tsAtk.gain.setTargetAtTime(1,ct,0.008);
      }
    }
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
    if(f)this.uFx(id,f,t);const r=Math.pow(2,((f?.onPitch?f.pitch:0)||0)/12);
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

const CHAIN_META:{[k:string]:{label:string,color:string,short:string}}={
  drive: {label:'DRIVE',  color:'#FF6B35', short:'DRV'},
  comp:  {label:'COMP',   color:'#5E5CE6', short:'CMP'},
  filter:{label:'FILTER', color:'#FF9500', short:'FLT'},
};

const GFX_DRY={
  reverb:{on:false,decay:1.5,size:0.5,type:'room',sends:{}},
  delay:{on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:'1/4'},
  filter:{on:false,type:'lowpass',cut:18000,res:0,lfo:false,lfoShape:'sine',lfoRate:1.0,lfoDepth:0,sends:{}},
  comp:{on:false,thr:-12,ratio:4,attack:5,release:80,sends:{}},
  drive:{on:false,amt:0,mode:'tanh',sends:{}},
  chorus:{on:false,rate:0.8,depth:30,sends:{}},
  flanger:{on:false,rate:0.3,depth:50,feedback:60,sends:{}},
  pingpong:{on:false,time:0.25,fdbk:50,sync:false,syncDiv:'1/4',sends:{}},
};

const FX_PRESETS=[
  {name:'DRY',color:'#8E8E93',gfx:GFX_DRY},
  {name:'Trap',color:'#FF2D55',gfx:{
    reverb: {on:true, decay:0.8,size:0.3,type:'plate',sends:{snare:true,clap:true}},
    delay:  {on:true, time:0.25,fdbk:25,sends:{hihat:true},sync:true,syncDiv:'1/8'},
    filter: {on:false,type:'lowpass',cut:18000,res:0,lfo:false,lfoRate:1,lfoDepth:0,lfoShape:'sine'},
    comp:   {on:true, thr:-18,ratio:6,attack:3,release:60},
    drive:  {on:true, amt:15,mode:'tanh'},
    chorus: {on:false,rate:0.8,depth:30,sends:{}},
    flanger:{on:true, rate:0.5,depth:60,feedback:70,sends:{kick:true,snare:true}},
    pingpong:{on:false,time:0.25,fdbk:50,sync:false,syncDiv:'1/4',sends:{}},
  }},
  {name:'Boom Bap',color:'#FF9500',gfx:{
    reverb: {on:true, decay:1.2,size:0.4,type:'room',sends:{snare:true}},
    delay:  {on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:'1/4'},
    filter: {on:false,type:'lowpass',cut:18000,res:0,lfo:false,lfoRate:1,lfoDepth:0,lfoShape:'sine'},
    comp:   {on:true, thr:-12,ratio:4,attack:8,release:100},
    drive:  {on:true, amt:8,mode:'tape'},
    chorus: {on:true, rate:0.5,depth:20,sends:{kick:true,snare:true}},
    flanger:{on:false,rate:0.3,depth:50,feedback:60,sends:{}},
    pingpong:{on:false,time:0.25,fdbk:50,sync:false,syncDiv:'1/4',sends:{}},
  }},
  {name:'Techno',color:'#64D2FF',gfx:{
    reverb: {on:true, decay:2.0,size:0.6,type:'hall',sends:{crash:true,ride:true}},
    delay:  {on:true, time:0.25,fdbk:40,sends:{hihat:true},sync:true,syncDiv:'1/4'},
    filter: {on:true, type:'highpass',cut:80,res:0,lfo:false,lfoRate:1,lfoDepth:0,lfoShape:'sine'},
    comp:   {on:true, thr:-8,ratio:8,attack:2,release:50},
    drive:  {on:false,amt:0,mode:'tanh'},
    chorus: {on:false,rate:0.8,depth:30,sends:{}},
    flanger:{on:false,rate:0.3,depth:50,feedback:60,sends:{}},
    pingpong:{on:true,time:0.25,fdbk:40,sync:true,syncDiv:'1/4',sends:{kick:true}},
  }},
  {name:'Lo-Fi',color:'#BF5AF2',gfx:{
    reverb: {on:true, decay:0.6,size:0.2,type:'room',sends:{snare:true,hihat:true}},
    delay:  {on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:'1/4'},
    filter: {on:true, type:'lowpass',cut:8000,res:2,lfo:false,lfoRate:1,lfoDepth:0,lfoShape:'sine'},
    comp:   {on:true, thr:-6,ratio:3,attack:15,release:200},
    drive:  {on:true, amt:35,mode:'bit'},
    chorus: {on:true, rate:1.2,depth:60,sends:{snare:true,hihat:true}},
    flanger:{on:false,rate:0.3,depth:50,feedback:60,sends:{}},
    pingpong:{on:false,time:0.25,fdbk:50,sync:false,syncDiv:'1/4',sends:{}},
  }},
  {name:'Afro',color:'#30D158',gfx:{
    reverb: {on:true, decay:1.0,size:0.4,type:'room',sends:{perc:true,clap:true}},
    delay:  {on:true, time:0.375,fdbk:30,sends:{hihat:true},sync:true,syncDiv:'1/8'},
    filter: {on:false,type:'lowpass',cut:18000,res:0,lfo:false,lfoRate:1,lfoDepth:0,lfoShape:'sine'},
    comp:   {on:true, thr:-14,ratio:3,attack:10,release:120},
    drive:  {on:false,amt:0,mode:'tanh'},
    chorus: {on:false,rate:0.8,depth:30,sends:{}},
    flanger:{on:false,rate:0.3,depth:50,feedback:60,sends:{}},
    pingpong:{on:true,time:0.188,fdbk:35,sync:true,syncDiv:'1/8',sends:{perc:true,clap:true}},
  }},
  {name:'Stadium',color:'#BF5AF2',gfx:{
    reverb: {on:true, decay:4.2,size:0.9,type:'hall',sends:{snare:true,clap:true,crash:true}},
    delay:  {on:true, time:0.5,fdbk:35,sends:{},sync:false,syncDiv:'1/2'},
    filter: {on:false,type:'lowpass',cut:18000,res:0,lfo:false,lfoRate:1,lfoDepth:0,lfoShape:'sine'},
    comp:   {on:true, thr:-16,ratio:4,attack:5,release:80},
    drive:  {on:false,amt:0,mode:'tanh'},
    chorus: {on:false,rate:0.8,depth:30,sends:{}},
    flanger:{on:false,rate:0.3,depth:50,feedback:60,sends:{}},
    pingpong:{on:false,time:0.25,fdbk:50,sync:false,syncDiv:'1/4',sends:{}},
  }},
  {name:'Pumping',color:'#5E5CE6',gfx:{
    reverb: {on:false,decay:1.5,size:0.5,type:'room',sends:{}},
    delay:  {on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:'1/4'},
    filter: {on:false,type:'lowpass',cut:18000,res:0,lfo:false,lfoRate:1,lfoDepth:0,lfoShape:'sine'},
    comp:   {on:true, thr:-28,ratio:14,attack:2,release:40},
    drive:  {on:true, amt:8,mode:'tanh'},
    chorus: {on:false,rate:0.8,depth:30,sends:{}},
    flanger:{on:false,rate:0.3,depth:50,feedback:60,sends:{}},
    pingpong:{on:false,time:0.25,fdbk:50,sync:false,syncDiv:'1/4',sends:{}},
  }},
];

const FX_CHAIN_DEF:{sec:string,label:string,color:string,type:"serial"|"send"}[]=[
  {sec:"filter",label:"FILTER",color:"#FF9500",type:"serial"},
  {sec:"comp",  label:"COMP",  color:"#5E5CE6",type:"serial"},
  {sec:"drive", label:"DRIVE", color:"#FF6B35",type:"serial"},
  {sec:"delay", label:"DELAY", color:"#30D158",type:"send"},
  {sec:"reverb",label:"REVERB",color:"#64D2FF",type:"send"},
];

function FXRack({gfx,setGfx,tracks,themeName="dark",bpm=120,midiLM=false,MidiTag=()=>null,isPortrait=false,fxChainOrder=[],setFxChainOrder=(_o:string[])=>{},onChainOrderChange=(_o:string[])=>{},fxSendPos={reverb:'post',delay:'post',chorus:'post',flanger:'post',pingpong:'post'},setFxSendPos=(_p:any)=>{},trackFx={},onTrackFxChange=(_id:string,_k:string,_v:any)=>{}}){
  const th=THEMES[themeName]||THEMES.dark;
  const [open,setOpen]=useState(false);
  const [showPresets,setShowPresets]=useState(false);
  const [dragIdx,setDragIdx]=useState<number|null>(null);
  const [dragOverIdx,setDragOverIdx]=useState<number|null>(null);
  const [grDb,setGrDb]=useState(0);
  const specRef=useRef(null);
  const rafRef=useRef(null);
  const [screenW,setScreenW]=useState(typeof window!=='undefined'?window.innerWidth:1024);
  useEffect(()=>{const h=()=>setScreenW(window.innerWidth);window.addEventListener('resize',h);return()=>window.removeEventListener('resize',h);},[]);
  const useArrows=screenW<600;
  useEffect(()=>{
    if(!gfx.comp.on||!engine.ctx){setGrDb(0);return;}
    const id=setInterval(()=>{if(engine.gCmp)setGrDb(Math.abs(engine.gCmp.reduction)||0);},80);
    return()=>clearInterval(id);
  },[gfx.comp.on]);
  useEffect(()=>{
    if(!open||!engine.ctx||!engine.gAnalyser)return;
    const analyser=engine.gAnalyser;
    const data=new Uint8Array(analyser.frequencyBinCount);
    const draw=()=>{
      analyser.getByteFrequencyData(data);
      const svg=specRef.current;if(!svg)return;
      while(svg.firstChild)svg.removeChild(svg.firstChild);
      const W=200,H=40,N=64,step=Math.floor(data.length/N);
      for(let i=0;i<N;i++){
        const val=data[i*step]/255,h=Math.max(1,val*H),hue=220-val*160;
        const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
        rect.setAttribute('x',String(i*(W/N)));rect.setAttribute('y',String(H-h));
        rect.setAttribute('width',String((W/N)-1));rect.setAttribute('height',String(h));
        rect.setAttribute('fill',`hsl(${hue},80%,${40+val*30}%)`);rect.setAttribute('opacity','0.8');
        svg.appendChild(rect);
      }
      rafRef.current=requestAnimationFrame(draw);
    };
    draw();return()=>cancelAnimationFrame(rafRef.current);
  },[open]);
  const upSec=(sec:string,k:string,v:any)=>setGfx((p:any)=>({...p,[sec]:{...p[sec],[k]:v}}));
  const upSend=(sec:string,tid:string,v:any)=>setGfx((p:any)=>({...p,[sec]:{...p[sec],sends:{...p[sec].sends,[tid]:v}}}));
  const handleDragStart=(idx:number)=>setDragIdx(idx);
  const handleDragOver=(idx:number)=>{if(dragIdx===null||dragIdx===idx)return;setDragOverIdx(idx);};
  const handleDrop=(targetIdx:number)=>{
    if(dragIdx===null||dragIdx===targetIdx){setDragIdx(null);setDragOverIdx(null);return;}
    const n=[...fxChainOrder];const[moved]=n.splice(dragIdx,1);n.splice(targetIdx,0,moved);
    setFxChainOrder(n);onChainOrderChange(n);setDragIdx(null);setDragOverIdx(null);
  };
  const handleMoveLeft=(idx:number)=>{if(idx===0)return;const n=[...fxChainOrder];[n[idx-1],n[idx]]=[n[idx],n[idx-1]];setFxChainOrder(n);onChainOrderChange(n);};
  const handleMoveRight=(idx:number)=>{if(idx===fxChainOrder.length-1)return;const n=[...fxChainOrder];[n[idx],n[idx+1]]=[n[idx+1],n[idx]];setFxChainOrder(n);onChainOrderChange(n);};
  const loadPreset=(preset:any)=>{
    const ng=JSON.parse(JSON.stringify(preset.gfx));
    setGfx(ng);
    setShowPresets(false);
    setOpen(true);
    if(engine.ctx){
      engine.uGfx(ng);
      engine.updateReverb(ng.reverb.decay,ng.reverb.size,ng.reverb.type||'room');
    }
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
  const SecLabel=({label,color,active,onToggle,midiId,hint}:{label:string,color:string,active:boolean,onToggle:()=>void,midiId?:string,hint?:string})=>(
    <div data-hint={hint||(active?`${label} active · Click to disable`:`${label} inactive · Click to activate`)} onClick={onToggle} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",marginBottom:8,paddingBottom:4,borderBottom:`1px solid ${active?color+"55":th.btn}`}}>
      <div style={{width:7,height:7,borderRadius:"50%",background:active?color:th.faint,flexShrink:0,boxShadow:active?`0 0 6px ${color}`:undefined}}/>
      <span style={{fontSize:8,fontWeight:800,color:active?color:th.faint,letterSpacing:"0.1em"}}>{label}</span>
      {midiId&&<MidiTag id={midiId}/>}
    </div>
  );
  const SendRow=({sec,color}:{sec:string,color:string})=>(
    <div style={{marginTop:6,paddingTop:5,borderTop:'1px solid rgba(255,255,255,0.05)',display:'flex',flexWrap:'wrap',gap:3}}>
      <span style={{fontSize:5,color:'rgba(255,255,255,0.25)',letterSpacing:'0.08em',fontWeight:700,alignSelf:'center'}}>SEND:</span>
      {tracks.map(t=>{
        const on=!!(gfx[sec]?.sends?.[t.id]);
        return(
          <button key={t.id} onClick={()=>upSend(sec,t.id,!on)}
            style={{padding:'1px 4px',borderRadius:3,border:`1px solid ${on?color:color+'30'}`,
              background:on?color+'22':'transparent',color:on?color:th.faint,
              fontSize:6,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
            {(t.label||t.id).slice(0,3).toUpperCase()}
          </button>
        );
      })}
    </div>
  );

  const ChainSlot=({id,index,total}:{id:string,index:number,total:number})=>{
    const meta=CHAIN_META[id];if(!meta)return null;
    return(
      <div data-chainidx={index} draggable={!useArrows}
        onDragStart={!useArrows?()=>handleDragStart(index):undefined}
        onDragOver={!useArrows?e=>{e.preventDefault();handleDragOver(index);}:undefined}
        onDrop={!useArrows?e=>{e.preventDefault();handleDrop(index);}:undefined}
        onDragEnd={!useArrows?()=>{setDragIdx(null);setDragOverIdx(null);}:undefined}
        style={{display:'flex',alignItems:'center',gap:4,padding:'4px 8px',borderRadius:6,
          border:`1px solid ${dragOverIdx===index?meta.color:meta.color+'44'}`,
          background:dragOverIdx===index?meta.color+'22':meta.color+'0a',
          cursor:useArrows?'default':'grab',userSelect:'none',touchAction:'none',
          transition:'all 0.15s',transform:dragOverIdx===index?'scale(1.04)':'scale(1)'}}>
        <span style={{fontSize:7,fontWeight:800,color:meta.color,opacity:0.5,minWidth:10}}>{index+1}</span>
        <span style={{fontSize:8,fontWeight:800,color:meta.color,letterSpacing:'0.06em'}}>{meta.short}</span>
        {useArrows&&(
          <div style={{display:'flex',gap:2,marginLeft:2}}>
            <button onClick={()=>handleMoveLeft(index)} disabled={index===0}
              style={{width:14,height:14,border:'none',borderRadius:3,cursor:index===0?'default':'pointer',
                background:'transparent',color:index===0?th.faint:meta.color,fontSize:9,padding:0,lineHeight:1,
                display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
            <button onClick={()=>handleMoveRight(index)} disabled={index===total-1}
              style={{width:14,height:14,border:'none',borderRadius:3,cursor:index===total-1?'default':'pointer',
                background:'transparent',color:index===total-1?th.faint:meta.color,fontSize:9,padding:0,lineHeight:1,
                display:'flex',alignItems:'center',justifyContent:'center'}}>→</button>
          </div>
        )}
        {!useArrows&&<span style={{fontSize:9,color:meta.color,opacity:0.4,marginLeft:2,letterSpacing:'-2px'}}>⠿</span>}
      </div>
    );
  };

  const chain=fxChainOrder.length?fxChainOrder:['drive','comp','filter'];
  const activeCount=['reverb','delay','filter','comp','drive','chorus','flanger','pingpong'].filter(s=>gfx[s]?.on).length;
  return(
    <div style={{marginBottom:8,borderRadius:10,background:th.surface,border:`1px solid ${open?'rgba(191,90,242,0.3)':th.sBorder}`,overflow:'hidden'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 14px',userSelect:'none'}}>
        <div data-hint="FX Rack · Reverb, Delay, Chorus, Flanger, Ping-Pong, Filter, Compressor, Drive · Configurable Master Bus chain" onClick={()=>setOpen(p=>!p)} style={{display:'flex',alignItems:'center',gap:6,flex:1,cursor:'pointer'}}>
          <span style={{fontSize:8,fontWeight:800,color:'#BF5AF2',letterSpacing:'0.14em'}}>FX RACK</span>
          <span style={{fontSize:9,color:th.dim}}>{open?'▲':'▼'}</span>
          {activeCount>0&&<span style={{fontSize:7,padding:'1px 6px',borderRadius:3,background:'rgba(191,90,242,0.12)',color:'#BF5AF2',fontWeight:700}}>{activeCount} active</span>}
          {(['reverb','delay','filter','comp','drive','chorus','flanger','pingpong'] as const).filter(s=>gfx[s]?.on).map(s=>{
            const cols:Record<string,string>={reverb:'#64D2FF',delay:'#30D158',filter:'#FF9500',comp:'#5E5CE6',drive:'#FF6B35',chorus:'#5E5CE6',flanger:'#FF375F',pingpong:'#FFD60A'};
            const c=cols[s]||'#fff';
            return<span key={s} style={{fontSize:7,padding:'1px 5px',borderRadius:3,background:c+'1a',color:c,fontWeight:700,letterSpacing:'0.08em'}}>{s==='pingpong'?'P-P':s.slice(0,3).toUpperCase()}</span>;
          })}
        </div>
        {/* Spectrum analyser mini */}
        {open&&<svg ref={specRef} width={80} height={20} style={{flexShrink:0,borderRadius:3,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}/>}
        {/* BYPASS ALL — one-click mute of every global FX */}
        <button data-hint={activeCount===0?"BYPASS · All global effects are disabled · Click to restore last preset":"BYPASS ALL · Disable all global effects in one click · Useful for comparing dry/wet"}
          onClick={e=>{
            e.stopPropagation();
            setGfx(p=>{
              // If any FX is active: bypass all (store snapshot for future restore via DRY preset)
              const anyOn=['reverb','delay','filter','comp','drive','chorus','flanger','pingpong'].some(k=>p[k]?.on);
              if(!anyOn)return p; // already bypassed
              const ng=JSON.parse(JSON.stringify(p));
              ['reverb','delay','filter','comp','drive','chorus','flanger','pingpong'].forEach(k=>{if(ng[k])ng[k].on=false;});
              return ng;
            });
          }}
          style={{padding:'2px 8px',borderRadius:5,border:`1px solid ${activeCount>0?'rgba(255,45,85,0.4)':th.sBorder}`,
            background:activeCount>0?'rgba(255,45,85,0.08)':'transparent',
            color:activeCount>0?'#FF2D55':th.faint,
            fontSize:7,fontWeight:activeCount>0?800:400,cursor:activeCount>0?'pointer':'default',
            fontFamily:'inherit',letterSpacing:'0.08em',flexShrink:0,opacity:activeCount>0?1:0.4}}>
          BYPASS
        </button>
        <button data-hint={showPresets?"Close FX presets · Select a preset to reconfigure the entire FX Rack in one click":"PRESETS FX · Load a complete effects configuration in one click: DRY, Trap, Lo-Fi, Techno, Afro, Stadium…"} onClick={e=>{e.stopPropagation();setShowPresets(p=>!p);}}
          style={{padding:'2px 8px',borderRadius:5,border:`1px solid ${showPresets?'#BF5AF255':th.sBorder}`,background:showPresets?'rgba(191,90,242,0.12)':'transparent',color:showPresets?'#BF5AF2':th.dim,fontSize:7,fontWeight:showPresets?800:400,cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.08em',flexShrink:0}}>
          PRESETS
        </button>
      </div>

      {/* Presets panel */}
      {showPresets&&(
        <div style={{padding:'6px 14px 10px',borderTop:`1px solid ${th.sBorder}`,display:'flex',gap:4,flexWrap:'wrap'}}>
          {FX_PRESETS.map(p=>(
            <button key={p.name} data-hint={`Preset "${p.name}" · Loads a complete effects configuration · Replaces current FX Rack settings`} onClick={()=>loadPreset(p)}
              style={{padding:'3px 9px',borderRadius:5,border:`1px solid ${p.color}44`,background:p.color+'14',color:p.color,fontSize:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.06em'}}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {open&&(<>
        {/* Chain order + Send PRE/POST */}
        <div style={{padding:'6px 14px 8px',borderBottom:`1px solid ${th.sBorder}`,display:'flex',flexDirection:'column',gap:6}}>
          <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
            <span style={{fontSize:6,fontWeight:800,color:th.faint,letterSpacing:'0.1em',minWidth:36}}>CHAIN</span>
            <span style={{fontSize:6,color:th.faint,padding:'2px 5px',borderRadius:3,border:`1px solid ${th.sBorder}`}}>IN</span>
            <span style={{fontSize:8,color:th.faint}}>→</span>
            {chain.map((id,index)=>(
              <React.Fragment key={id}>
                <ChainSlot id={id} index={index} total={chain.length}/>
                {index<chain.length-1&&<span style={{fontSize:8,color:th.faint,flexShrink:0}}>→</span>}
              </React.Fragment>
            ))}
            <span style={{fontSize:8,color:th.faint}}>→</span>
            <span style={{fontSize:6,color:th.faint,padding:'2px 5px',borderRadius:3,border:`1px solid ${th.sBorder}`}}>OUT</span>
            <button data-hint="RESET FX chain · Restores default order Drive → Comp → Filter · Order affects the final sound of the master bus" onClick={()=>{setFxChainOrder(['drive','comp','filter']);onChainOrderChange(['drive','comp','filter']);}}
              style={{marginLeft:'auto',padding:'1px 6px',borderRadius:3,border:`1px solid ${th.sBorder}`,background:'transparent',color:th.faint,fontSize:5,cursor:'pointer',fontFamily:'inherit'}}>RESET</button>
          </div>
          {/* PRE/POST sends */}
          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            <span style={{fontSize:6,fontWeight:800,color:th.faint,letterSpacing:'0.1em',minWidth:36}}>SENDS</span>
            {([{id:'reverb',label:'RV',name:'Reverb',color:'#64D2FF'},{id:'delay',label:'DL',name:'Delay',color:'#30D158'},{id:'chorus',label:'CH',name:'Chorus',color:'#5E5CE6'},{id:'flanger',label:'FL',name:'Flanger',color:'#FF375F'},{id:'pingpong',label:'PP',name:'Ping-Pong',color:'#FFD60A'}] as const).map(({id,label,name,color})=>(
              <div key={id} style={{display:'flex',alignItems:'center',gap:2}}>
                <span style={{fontSize:6,fontWeight:700,color}}>{label}</span>
                <button data-hint={fxSendPos[id]==='pre'?`${name} PRE · Send before the master chain (Drive/Comp/Filter) · Click to switch to POST`:`${name} POST · Send after the master chain · Click to switch to PRE`} onClick={()=>setFxSendPos((p:any)=>({...p,[id]:p[id]==='pre'?'post':'pre'}))}
                  style={{padding:'1px 4px',borderRadius:3,fontSize:5,fontWeight:800,cursor:'pointer',fontFamily:'inherit',
                    border:`1px solid ${fxSendPos[id]==='pre'?color:color+'44'}`,
                    background:fxSendPos[id]==='pre'?color+'22':'transparent',
                    color:fxSendPos[id]==='pre'?color:th.faint}}>
                  {fxSendPos[id]==='pre'?'PRE':'POST'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* FX sections — scrollable */}
        <div style={{padding:'8px 14px 14px',display:'flex',gap:10,alignItems:'flex-start',overflowX:'auto'}}>

          {/* ═════ SEND FX ═════ */}
          <div style={{display:'flex',flexDirection:'column',gap:4,flexShrink:0}}>
            <span style={{fontSize:6,fontWeight:800,color:'rgba(100,210,255,0.5)',letterSpacing:'0.12em',paddingLeft:2}}>SEND FX</span>
            <div style={{display:'flex',gap:0,alignItems:'flex-start',borderRadius:7,border:'1px solid rgba(100,210,255,0.12)',padding:'6px 6px 8px',background:'rgba(100,210,255,0.03)'}}>

              {/* REVERB */}
              <div style={{minWidth:120,flexShrink:0,paddingRight:6}}>
                <SecLabel label="REVERB" color="#64D2FF" active={gfx.reverb.on} onToggle={()=>upSec('reverb','on',!gfx.reverb.on)} midiId="__rev_on__" hint={gfx.reverb.on?`REVERB active · Decay: ${gfx.reverb.decay?.toFixed(1)}s · Size: ${Math.round((gfx.reverb.size??0.5)*100)}% · Click to disable`:"REVERB · Convolution reverb (Plate/Room/Hall) · Adjust Decay and Size · MIDI assignable"}/>
                <div style={{display:'flex',gap:3,marginBottom:6}}>
                  {(['plate','room','hall'] as const).map(tp=>(
                    <button key={tp} onClick={()=>{upSec('reverb','type',tp);if(engine.ctx)engine.updateReverb(gfx.reverb.decay,gfx.reverb.size,tp);}}
                      style={{flex:1,padding:'2px 0',borderRadius:3,border:`1px solid ${(gfx.reverb as any).type===tp?'#64D2FF':'transparent'}`,background:(gfx.reverb as any).type===tp?'rgba(100,210,255,0.1)':'transparent',color:(gfx.reverb as any).type===tp?'#64D2FF':th.faint,fontSize:6,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                      {tp==='plate'?'PLT':tp==='room'?'RM':'HLL'}
                    </button>
                  ))}
                </div>
                <div style={{display:'flex',gap:8,opacity:gfx.reverb.on?1:0.3,pointerEvents:gfx.reverb.on?'auto':'none'}}>
                  <Knob label="DECAY" value={gfx.reverb.decay} min={0.1} max={6} color="#64D2FF" unit="s" fmt={(v:number)=>v.toFixed(1)} onChange={(v:number)=>{upSec('reverb','decay',v);if(engine.ctx)engine.updateReverb(v,gfx.reverb.size,(gfx.reverb as any).type||'room');}}/>
                  <Knob label="SIZE" value={gfx.reverb.size} min={0} max={1} color="#64D2FF" fmt={(v:number)=>(v*100).toFixed(0)} unit="%" onChange={(v:number)=>{upSec('reverb','size',v);if(engine.ctx)engine.updateReverb(gfx.reverb.decay,v,(gfx.reverb as any).type||'room');}}/>
                </div>
                <SendRow sec="reverb" color="#64D2FF"/>
              </div>

              <Sep/>

              {/* DELAY */}
              <div style={{minWidth:130,flexShrink:0,paddingLeft:6,paddingRight:6}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                  <SecLabel label="DELAY" color="#30D158" active={gfx.delay.on} onToggle={()=>upSec('delay','on',!gfx.delay.on)} midiId="__dly_on__" hint={gfx.delay.on?`DELAY active · ${gfx.delay.sync?`Sync: ${gfx.delay.syncDiv}`:`Time: ${gfx.delay.time?.toFixed(2)}s`} · Feedback: ${gfx.delay.fdbk??35}% · Click to disable`:"DELAY · BPM-syncable echo · Adjust time, feedback and mix · MIDI assignable"}/>
                  <button onClick={()=>{const ns=!gfx.delay.sync;const tt=ns?syncDivTime(gfx.delay.syncDiv,bpm):gfx.delay.time;setGfx((p:any)=>({...p,delay:{...p.delay,sync:ns,time:tt}}));}}
                    style={{marginLeft:'auto',padding:'1px 6px',borderRadius:3,fontSize:6,fontWeight:800,cursor:'pointer',fontFamily:'inherit',border:`1px solid ${gfx.delay.sync?'#30D158':'rgba(48,209,88,0.3)'}`,background:gfx.delay.sync?'rgba(48,209,88,0.15)':'transparent',color:gfx.delay.sync?'#30D158':'rgba(48,209,88,0.5)'}}>SYNC</button>
                </div>
                <div style={{display:'flex',gap:8,opacity:gfx.delay.on?1:0.3,pointerEvents:gfx.delay.on?'auto':'none'}}>
                  {gfx.delay.sync?(
                    <div style={{flex:1}}>
                      <div style={{display:'flex',flexWrap:'wrap',gap:2,marginBottom:4}}>
                        {['1/1','1/2','1/4','1/8','1/16','1/4.','1/8.','1/4t','1/8t'].map(d=>(
                          <button key={d} onClick={()=>setGfx((p:any)=>({...p,delay:{...p.delay,syncDiv:d,time:syncDivTime(d,bpm)}}))}
                            style={{padding:'2px 4px',borderRadius:3,fontSize:6,fontWeight:700,cursor:'pointer',fontFamily:'inherit',border:`1px solid ${gfx.delay.syncDiv===d?'#30D158':'rgba(48,209,88,0.2)'}`,background:gfx.delay.syncDiv===d?'rgba(48,209,88,0.15)':'transparent',color:gfx.delay.syncDiv===d?'#30D158':th.faint}}>{d}</button>
                        ))}
                      </div>
                      <div style={{fontSize:7,color:'#30D158',fontWeight:700,textAlign:'center'}}>{gfx.delay.time.toFixed(3)}s</div>
                    </div>
                  ):(
                    <Knob label="TIME" value={gfx.delay.time} min={0.01} max={1.9} color="#30D158" unit="s" fmt={(v:number)=>v.toFixed(2)} onChange={(v:number)=>upSec('delay','time',v)}/>
                  )}
                  <Knob label="FDBK" value={gfx.delay.fdbk} min={0} max={95} color="#30D158" fmt={(v:number)=>Math.round(v)} unit="%" onChange={(v:number)=>upSec('delay','fdbk',v)}/>
                </div>
                <SendRow sec="delay" color="#30D158"/>
              </div>

              <Sep/>

              {/* CHORUS — per-track sends */}
              <div style={{minWidth:150,flexShrink:0,paddingLeft:6,paddingRight:6}}>
                <SecLabel label="CHORUS" color="#5E5CE6" active={gfx.chorus?.on??false} onToggle={()=>upSec('chorus','on',!(gfx.chorus?.on??false))} hint={(gfx.chorus?.on??false)?"CHORUS active · Stereo pitch modulation via send · Click to disable":"CHORUS · Stereo widening via dual-delay LFO · Per-track send routing"}/>
                <div style={{display:'flex',gap:8,opacity:(gfx.chorus?.on??false)?1:0.3,pointerEvents:(gfx.chorus?.on??false)?'auto':'none'}}>
                  <Knob label="RATE" value={gfx.chorus?.rate??0.8} min={0.1} max={5} color="#5E5CE6" unit="Hz" fmt={(v:number)=>v.toFixed(1)} onChange={(v:number)=>upSec('chorus','rate',v)}/>
                  <Knob label="DEPTH" value={gfx.chorus?.depth??30} min={0} max={100} color="#5E5CE6" unit="%" fmt={(v:number)=>Math.round(v)} onChange={(v:number)=>upSec('chorus','depth',v)}/>
                </div>
                <SendRow sec="chorus" color="#5E5CE6"/>
              </div>

              <Sep/>

              {/* FLANGER — per-track sends */}
              <div style={{minWidth:165,flexShrink:0,paddingLeft:6,paddingRight:6}}>
                <SecLabel label="FLANGER" color="#FF375F" active={gfx.flanger?.on??false} onToggle={()=>upSec('flanger','on',!(gfx.flanger?.on??false))} hint={(gfx.flanger?.on??false)?"FLANGER active · Jet-plane effect via send · Click to disable":"FLANGER · Modulated feedback phase shift — per-track send routing"}/>
                <div style={{display:'flex',gap:8,opacity:(gfx.flanger?.on??false)?1:0.3,pointerEvents:(gfx.flanger?.on??false)?'auto':'none'}}>
                  <Knob label="RATE" value={gfx.flanger?.rate??0.3} min={0.05} max={3} color="#FF375F" unit="Hz" fmt={(v:number)=>v.toFixed(2)} onChange={(v:number)=>upSec('flanger','rate',v)}/>
                  <Knob label="DEPTH" value={gfx.flanger?.depth??50} min={0} max={100} color="#FF375F" unit="%" fmt={(v:number)=>Math.round(v)} onChange={(v:number)=>upSec('flanger','depth',v)}/>
                  <Knob label="FDBK" value={gfx.flanger?.feedback??60} min={0} max={90} color="#FF375F" unit="%" fmt={(v:number)=>Math.round(v)} onChange={(v:number)=>upSec('flanger','feedback',v)}/>
                </div>
                <SendRow sec="flanger" color="#FF375F"/>
              </div>

              <Sep/>

              {/* PING-PONG */}
              <div style={{minWidth:140,flexShrink:0,paddingLeft:6}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                  <SecLabel label="PING-PONG" color="#FFD60A" active={gfx.pingpong?.on??false} onToggle={()=>upSec('pingpong','on',!(gfx.pingpong?.on??false))} hint={(gfx.pingpong?.on??false)?"PING-PONG DELAY active · Stereo left-right bounce · Click to disable":"PING-PONG DELAY · Stereo echo bouncing left to right · BPM-syncable"}/>
                  <button onClick={()=>{const ns=!(gfx.pingpong?.sync??false);const tt=ns?syncDivTime(gfx.pingpong?.syncDiv??'1/4',bpm):gfx.pingpong?.time??0.25;setGfx((p:any)=>({...p,pingpong:{...p.pingpong,sync:ns,time:tt}}));}}
                    style={{marginLeft:'auto',padding:'1px 6px',borderRadius:3,fontSize:6,fontWeight:800,cursor:'pointer',fontFamily:'inherit',border:`1px solid ${gfx.pingpong?.sync?'#FFD60A':'rgba(255,214,10,0.3)'}`,background:gfx.pingpong?.sync?'rgba(255,214,10,0.15)':'transparent',color:gfx.pingpong?.sync?'#FFD60A':'rgba(255,214,10,0.5)'}}>SYNC</button>
                </div>
                <div style={{display:'flex',gap:8,opacity:(gfx.pingpong?.on??false)?1:0.3,pointerEvents:(gfx.pingpong?.on??false)?'auto':'none'}}>
                  {gfx.pingpong?.sync?(
                    <div style={{flex:1}}>
                      <div style={{display:'flex',flexWrap:'wrap',gap:2,marginBottom:4}}>
                        {['1/1','1/2','1/4','1/8','1/16'].map(d=>(
                          <button key={d} onClick={()=>setGfx((p:any)=>({...p,pingpong:{...p.pingpong,syncDiv:d,time:syncDivTime(d,bpm)}}))}
                            style={{padding:'2px 4px',borderRadius:3,fontSize:6,fontWeight:700,cursor:'pointer',fontFamily:'inherit',border:`1px solid ${gfx.pingpong?.syncDiv===d?'#FFD60A':'rgba(255,214,10,0.2)'}`,background:gfx.pingpong?.syncDiv===d?'rgba(255,214,10,0.15)':'transparent',color:gfx.pingpong?.syncDiv===d?'#FFD60A':th.faint}}>{d}</button>
                        ))}
                      </div>
                      <div style={{fontSize:7,color:'#FFD60A',fontWeight:700,textAlign:'center'}}>{(gfx.pingpong?.time??0.25).toFixed(3)}s L⟷R</div>
                    </div>
                  ):(
                    <Knob label="TIME" value={gfx.pingpong?.time??0.25} min={0.05} max={1.9} color="#FFD60A" unit="s" fmt={(v:number)=>v.toFixed(2)} onChange={(v:number)=>upSec('pingpong','time',v)}/>
                  )}
                  <Knob label="FDBK" value={gfx.pingpong?.fdbk??50} min={0} max={85} color="#FFD60A" unit="%" fmt={(v:number)=>Math.round(v)} onChange={(v:number)=>upSec('pingpong','fdbk',v)}/>
                </div>
                <SendRow sec="pingpong" color="#FFD60A"/>
              </div>

            </div>
          </div>

          {/* Separator */}
          <div style={{width:1,alignSelf:'stretch',background:'linear-gradient(to bottom,transparent,rgba(255,255,255,0.08),transparent)',flexShrink:0,margin:'4px 0'}}/>

          {/* ═════ MASTER BUS ═════ */}
          <div style={{display:'flex',flexDirection:'column',gap:4,flexShrink:0}}>
            <span style={{fontSize:6,fontWeight:800,color:'rgba(255,149,0,0.5)',letterSpacing:'0.12em',paddingLeft:2}}>MASTER BUS</span>
            <div style={{display:'flex',gap:0,alignItems:'flex-start',borderRadius:7,border:'1px solid rgba(255,149,0,0.12)',padding:'6px 6px 8px',background:'rgba(255,149,0,0.03)'}}>

              {/* FILTER + LFO */}
              <div style={{minWidth:110,flexShrink:0,paddingRight:6}}>
                <SecLabel label="FILTER" color="#FF9500" active={gfx.filter.on} onToggle={()=>upSec('filter','on',!gfx.filter.on)} midiId="__flt_on__" hint={gfx.filter.on?`FILTER active · ${gfx.filter.type?.toUpperCase()||'LP'} · Cutoff: ${gfx.filter.cut>=1000?`${(gfx.filter.cut/1000).toFixed(1)}kHz`:`${Math.round(gfx.filter.cut)}Hz`} · LFO: ${(gfx.filter as any).lfo?'ON':'OFF'} · Click to disable`:"FILTER Master Bus · LP/HP/BP with LFO modulator · Shape the global timbre · MIDI assignable"}/>
                <div style={{display:'flex',gap:3,marginBottom:6}}>
                  {(['lowpass','highpass','bandpass'] as const).map(ft=>(
                    <button key={ft} onClick={()=>upSec('filter','type',ft)}
                      style={{flex:1,padding:'2px 0',borderRadius:3,border:`1px solid ${gfx.filter.type===ft?'#FF9500':'transparent'}`,background:gfx.filter.type===ft?'rgba(255,149,0,0.1)':'transparent',color:gfx.filter.type===ft?'#FF9500':th.faint,fontSize:6,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                      {ft==='lowpass'?'LP':ft==='highpass'?'HP':'BP'}
                    </button>
                  ))}
                </div>
                <div style={{display:'flex',gap:8,opacity:gfx.filter.on?1:0.3,pointerEvents:gfx.filter.on?'auto':'none'}}>
                  <Knob label="CUT" value={gfx.filter.cut} min={20} max={20000} color="#FF9500" fmt={(v:number)=>v>=1000?(v/1000).toFixed(1)+'k':Math.round(v)+'Hz'} onChange={(v:number)=>upSec('filter','cut',v)}/>
                  <Knob label="RES" value={gfx.filter.res} min={0} max={25} color="#FF9500" fmt={(v:number)=>v.toFixed(1)} onChange={(v:number)=>upSec('filter','res',v)}/>
                </div>
                {/* LFO */}
                <div style={{marginTop:6,display:'flex',alignItems:'center',gap:4}}>
                  <button onClick={()=>upSec('filter','lfo',!(gfx.filter as any).lfo)}
                    style={{padding:'1px 6px',borderRadius:3,fontSize:6,fontWeight:800,cursor:'pointer',fontFamily:'inherit',border:`1px solid ${(gfx.filter as any).lfo?'#FF9500':'rgba(255,149,0,0.3)'}`,background:(gfx.filter as any).lfo?'rgba(255,149,0,0.15)':'transparent',color:(gfx.filter as any).lfo?'#FF9500':'rgba(255,149,0,0.5)'}}>
                    LFO {(gfx.filter as any).lfo?'ON':'OFF'}
                  </button>
                  {(gfx.filter as any).lfo&&(['sine','triangle','square'] as const).map(sh=>(
                    <button key={sh} onClick={()=>upSec('filter','lfoShape',sh)}
                      style={{padding:'1px 4px',borderRadius:3,fontSize:7,fontWeight:700,cursor:'pointer',fontFamily:'inherit',border:`1px solid ${(gfx.filter as any).lfoShape===sh?'#FF9500':'transparent'}`,background:(gfx.filter as any).lfoShape===sh?'rgba(255,149,0,0.1)':'transparent',color:(gfx.filter as any).lfoShape===sh?'#FF9500':th.faint}}>
                      {sh==='sine'?'∿':sh==='triangle'?'△':'□'}
                    </button>
                  ))}
                </div>
                {(gfx.filter as any).lfo&&(
                  <div style={{display:'flex',gap:8,marginTop:4,opacity:gfx.filter.on?1:0.3,pointerEvents:gfx.filter.on?'auto':'none'}}>
                    <Knob label="L.RATE" value={(gfx.filter as any).lfoRate??1.0} min={0.05} max={8} color="#FF9500" unit="Hz" fmt={(v:number)=>v.toFixed(2)} onChange={(v:number)=>upSec('filter','lfoRate',v)}/>
                    <Knob label="L.DEPTH" value={(gfx.filter as any).lfoDepth??0} min={0} max={100} color="#FF9500" unit="%" fmt={(v:number)=>Math.round(v)} onChange={(v:number)=>upSec('filter','lfoDepth',v)}/>
                  </div>
                )}
              </div>

              <Sep/>

              {/* COMP */}
              <div style={{minWidth:90,flexShrink:0,paddingLeft:6,paddingRight:6}}>
                <SecLabel label="COMP" color="#5E5CE6" active={gfx.comp.on} onToggle={()=>upSec('comp','on',!gfx.comp.on)} midiId="__cmp_on__" hint={gfx.comp.on?`COMP active · Threshold: ${gfx.comp.thr}dB · Ratio: ${gfx.comp.ratio?.toFixed(1)}:1 · Tightens and glues the master bus · Click to disable`:"COMP · Master Bus Compressor · Threshold, Ratio, Attack, Release · Controls global dynamics · MIDI assignable"}/>
                <div style={{display:'flex',gap:8,opacity:gfx.comp.on?1:0.3,pointerEvents:gfx.comp.on?'auto':'none'}}>
                  <Knob label="THR" value={gfx.comp.thr} min={-60} max={0} color="#5E5CE6" unit="dB" fmt={(v:number)=>Math.round(v)} onChange={(v:number)=>upSec('comp','thr',v)}/>
                  <Knob label="RATIO" value={gfx.comp.ratio} min={1} max={20} color="#5E5CE6" unit=":1" fmt={(v:number)=>v.toFixed(1)} onChange={(v:number)=>upSec('comp','ratio',v)}/>
                </div>
                <div style={{display:'flex',gap:8,marginTop:4,opacity:gfx.comp.on?1:0.3,pointerEvents:gfx.comp.on?'auto':'none'}}>
                  <Knob label="ATT" value={(gfx.comp as any).attack??5} min={1} max={100} color="#5E5CE6" unit="ms" fmt={(v:number)=>Math.round(v)} onChange={(v:number)=>upSec('comp','attack',v)}/>
                  <Knob label="REL" value={(gfx.comp as any).release??80} min={20} max={500} color="#5E5CE6" unit="ms" fmt={(v:number)=>Math.round(v)} onChange={(v:number)=>upSec('comp','release',v)}/>
                </div>
                {/* GR meter */}
                <div style={{marginTop:4,display:'flex',alignItems:'center',gap:4}}>
                  <div style={{flex:1,height:3,borderRadius:2,background:th.sBorder,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${Math.min(100,(grDb/20)*100)}%`,background:grDb>6?'#FF2D55':grDb>3?'#FF9500':'#5E5CE6',transition:'width 0.08s',borderRadius:2}}/>
                  </div>
                  <span style={{fontSize:6,color:'#5E5CE6',fontFamily:'monospace',minWidth:24,textAlign:'right'}}>{grDb>0.1?`-${grDb.toFixed(1)}`:' 0.0'}dB</span>
                </div>
              </div>

              <Sep/>

              {/* DRIVE multi-mode */}
              <div style={{minWidth:90,flexShrink:0,paddingLeft:6,paddingRight:6}}>
                <SecLabel label="DRIVE" color="#FF6B35" active={gfx.drive.on} onToggle={()=>upSec('drive','on',!gfx.drive.on)} midiId="__drv_on__" hint={gfx.drive.on?`DRIVE active · Saturation ${((gfx.drive as any).mode||'tanh').toUpperCase()} · Amount: ${(gfx.drive as any).amt??50}% · Click to disable`:"DRIVE · Master Bus Saturation / Distortion · Modes: Soft Clip, Hard Clip, Tanh, Fold · MIDI assignable"}/>
                <div style={{display:'flex',gap:2,marginBottom:4}}>
                  {([{k:'tanh',l:'TUBE'},{k:'tape',l:'TAPE'},{k:'tube',l:'TRI'},{k:'bit',l:'BIT'}] as const).map(({k,l})=>(
                    <button key={k} onClick={()=>upSec('drive','mode',k)}
                      style={{flex:1,padding:'2px 0',borderRadius:3,border:`1px solid ${(gfx.drive as any).mode===k?'#FF6B35':'transparent'}`,background:(gfx.drive as any).mode===k?'rgba(255,107,53,0.1)':'transparent',color:(gfx.drive as any).mode===k?'#FF6B35':th.faint,fontSize:5,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>{l}</button>
                  ))}
                </div>
                <div style={{opacity:gfx.drive.on?1:0.3,pointerEvents:gfx.drive.on?'auto':'none'}}>
                  <Knob label="AMT" value={gfx.drive.amt} min={0} max={100} color="#FF6B35" fmt={(v:number)=>Math.round(v)} unit="%" onChange={(v:number)=>upSec('drive','amt',v)}/>
                </div>
                <div style={{fontSize:6,color:'rgba(255,107,53,0.5)',marginTop:4,textAlign:'center',letterSpacing:'0.08em'}}>{(gfx.drive as any).mode||'tanh'} sat</div>
              </div>

              <Sep/>

              {/* TRANSIENT shaper per track */}
              <div style={{minWidth:120,flexShrink:0,paddingLeft:6}}>
                <div style={{fontSize:8,fontWeight:800,color:'#30D158',marginBottom:8,paddingBottom:4,borderBottom:'1px solid rgba(48,209,88,0.2)'}}>TRANSIENT</div>
                <div style={{fontSize:6,color:th.faint,marginBottom:4,letterSpacing:'0.06em'}}>ATK/SUS PER TRACK</div>
                {tracks.slice(0,6).map(tr=>{
                  const tFx=trackFx?.[tr.id]||{};
                  return(
                    <div key={tr.id} style={{display:'flex',alignItems:'center',gap:4,marginBottom:3}}>
                      <span style={{fontSize:6,color:tr.color,minWidth:24,fontWeight:700}}>{(tr.label||tr.id).slice(0,3).toUpperCase()}</span>
                      <button onClick={()=>onTrackFxChange(tr.id,'onTransient',!tFx.onTransient)}
                        style={{padding:'0 4px',borderRadius:3,border:`1px solid ${tFx.onTransient?'#30D158':'rgba(48,209,88,0.3)'}`,background:tFx.onTransient?'rgba(48,209,88,0.15)':'transparent',color:tFx.onTransient?'#30D158':th.faint,fontSize:5,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>
                        {tFx.onTransient?'ON':'OFF'}
                      </button>
                      {tFx.onTransient&&(
                        <>
                          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:0}}>
                            <span style={{fontSize:5,color:th.faint}}>A</span>
                            <input type="range" min={-12} max={12} step={1} value={tFx.tsAttack||0}
                              onChange={e=>onTrackFxChange(tr.id,'tsAttack',+e.target.value)}
                              style={{width:40,accentColor:'#30D158'}}/>
                          </div>
                          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:0}}>
                            <span style={{fontSize:5,color:th.faint}}>S</span>
                            <input type="range" min={-12} max={12} step={1} value={tFx.tsSustain||0}
                              onChange={e=>onTrackFxChange(tr.id,'tsSustain',+e.target.value)}
                              style={{width:40,accentColor:'#30D158'}}/>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

        </div>
      </>)}
    </div>
  );
}

// ═══ Main ═══
export default function KickAndSnare(){
  const appState=useAppState();
  const {state:appSt,setLaunched,markTipShown,addUsageTime}=appState;
  const [overlayVisible,setOverlayVisible]=useState(!appSt.launched);
  const [showCheatSheet,setShowCheatSheet]=useState(false);
  const [showInfo,setShowInfo]=useState(false);
  const [showTour,setShowTour]=useState(false);
  const [hoverMsg,setHoverMsg]=useState<string|null>(null);
  useEffect(()=>{
    const onOver=(e:MouseEvent)=>{
      const el=(e.target as HTMLElement).closest('[data-hint]') as HTMLElement|null;
      setHoverMsg(el?el.dataset.hint??null:null);
    };
    document.addEventListener('mouseover',onOver);
    return()=>document.removeEventListener('mouseover',onOver);
  },[]);
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
  const isMobile=useMemo(()=>
    /Android|iPhone|iPad/i.test(navigator.userAgent)||
    window.innerWidth<768||
    (navigator.maxTouchPoints>1&&/Mac/i.test(navigator.userAgent))|| // iPadOS 13+ reports as Mac
    (navigator.maxTouchPoints>0&&window.innerWidth<1200) // Android tablets in landscape
  ,[]);
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
  const [gfx,setGfx]=useState({
    reverb:{on:false,decay:1.5,size:0.5,type:'room',sends:{}},
    delay:{on:false,time:0.25,fdbk:35,sends:{},sync:false,syncDiv:'1/4'},
    filter:{on:false,type:'lowpass',cut:18000,res:0,lfo:false,lfoShape:'sine',lfoRate:1.0,lfoDepth:0,sends:{}},
    comp:{on:false,thr:-12,ratio:4,attack:5,release:80,sends:{}},
    drive:{on:false,amt:0,mode:'tanh',sends:{}},
    chorus:{on:false,rate:0.8,depth:30,sends:{}},
    flanger:{on:false,rate:0.3,depth:50,feedback:60,sends:{}},
    pingpong:{on:false,time:0.25,fdbk:50,sync:false,syncDiv:'1/4',sends:{}},
  });
  const [fxChainOrder,setFxChainOrder]=useState<string[]>(['drive','comp','filter']);
  const [fxSendPos,setFxSendPos]=useState<Record<string,string>>({reverb:'post',delay:'post',chorus:'post',flanger:'post',pingpong:'post'});
  const [trackFx,setTrackFx]=useState<Record<string,any>>({});
  const onTrackFxChange=(id:string,k:string,v:any)=>setTrackFx(p=>({...p,[id]:{...p[id],[k]:v}}));
  // Per-track send cursor: index into FX_SECS (0=reverb … 4=drive)
  const [trackSendCursor,setTrackSendCursor]=useState<{[tid:string]:number}>({});
  const upSend=(sec:string,tid:string,v:number)=>setGfx((p:any)=>({...p,[sec]:{...p[sec],sends:{...p[sec].sends,[tid]:v}}}));
  useEffect(()=>{
    engine.onReady=()=>setIsAudioReady(true);
    engine.isMobile=isMobileRef.current;
  },[]);
  useEffect(()=>{
    if(engine.ctx&&engine.rebuildChain)engine.rebuildChain(fxChainOrder,fxSendPos);
  },[fxChainOrder,fxSendPos]);
  // ── H.2a: Portrait orientation listener ──
  useEffect(()=>{
    const h=()=>setIsPortrait(window.innerHeight>window.innerWidth);
    window.addEventListener('resize',h);
    screen.orientation?.addEventListener('change',h);
    return()=>{window.removeEventListener('resize',h);screen.orientation?.removeEventListener('change',h);};
  },[]);
  useEffect(()=>{if(engine.ctx)engine.uGfx(gfx);},[gfx]);
  // Apply gfx the moment the audio engine first becomes ready (e.g. preset loaded before first play)
  const gfxRef=useRef(gfx);
  useEffect(()=>{gfxRef.current=gfx;},[gfx]);
  useEffect(()=>{
    if(isAudioReady&&engine.ctx){
      engine.uGfx(gfxRef.current);
      engine.updateReverb(gfxRef.current.reverb?.decay??1.5,gfxRef.current.reverb?.size??0.5,gfxRef.current.reverb?.type||'room');
    }
  },[isAudioReady]);
  // BPM sync for delay and ping-pong — recalculate time when BPM or syncDiv changes
  useEffect(()=>{
    setGfx(p=>{
      let nd={...p};
      if(p.delay.sync){nd={...nd,delay:{...p.delay,time:syncDivTime(p.delay.syncDiv,bpm)}};}
      if(p.pingpong?.sync){nd={...nd,pingpong:{...p.pingpong,time:syncDivTime(p.pingpong.syncDiv??'1/4',bpm)}};}
      return nd;
    });
  },[bpm]);
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
      // Ensure at least 4 tracks active for Euclidian view
      const euclidDefault=["kick","snare","hihat","clap"];
      setAct(a=>{const next=[...a];euclidDefault.forEach(id=>{if(!next.includes(id))next.push(id);});return next;});
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
  const loopRef=useRef({events:[],lengthMs:2000,perfStart:null,audioStart:null,schTimer:null,scheduled:new Set(),passId:0,loopBpm:0});
  const loopPhRef=useRef(null);
  const wakeLockRef=useRef<any>(null); // Screen Wake Lock — prevents screen sleep during playback
  const [captureReady,setCaptureReady]=useState(false); // true after first full loop bar recorded
  const captureReadyRef=useRef(false); // ref mirror — safe to read inside RAF closure
  const captureBarRef=useRef(0); // last loopN at which QUANTISE was triggered (prevents instant re-show)
  const [autoQ,setAutoQ]=useState(false);
  // Free-play capture buffer — accumulates hits WITHOUT activating REC
  const freeCaptureRef=useRef<{tid:string;t:number;vel:number}[]>([]);
  const freeCaptureStartRef=useRef<number|null>(null);
  const [freeCaptureCount,setFreeCaptureCount]=useState(0);
  const [freeBpm,setFreeBpm]=useState<number|null>(null);
  // Undo / redo for looper — snapshot-based (covers rec passes, overdub, add, move, remove, quantize)
  const loopHistRef=useRef<{past:any[][];future:any[][]}>({past:[],future:[]});
  const [loopCanUndo,setLoopCanUndo]=useState(false);
  const [loopCanRedo,setLoopCanRedo]=useState(false);
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
      // Subtract only real measured latency; avoid aggressive fallbacks that push
      // hits exactly on the downbeat to negative rawSec → wrap to end of loop.
      const latSec=(engine.ctx.outputLatency||0)+(engine.ctx.baseLatency||0);
      const rawSec=engine.ctx.currentTime-L.audioStart-latSec;
      let tOff=((rawSec*1000)%L.lengthMs+L.lengthMs)%L.lengthMs;
      // Near-boundary wrap: if the hit lands within 60ms of loop end it's almost
      // certainly beat 0 of the next pass (user tapped right on the downbeat).
      if(tOff>L.lengthMs-60)tOff=0;
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
    // Free-capture — records timestamps WITHOUT activating REC, for BPM detection
    // Uses audio clock (ctx.currentTime) to stay in the same time domain as the scheduler
    if(R.view==='pads'&&!R.loopRec&&engine.ctx){
      const now=engine.ctx.currentTime;
      if(freeCaptureStartRef.current===null){
        freeCaptureStartRef.current=now;
        freeCaptureRef.current=[{tid,t:0,vel}];
      }else{
        freeCaptureRef.current.push({tid,t:(now-freeCaptureStartRef.current)*1000,vel});
      }
      const buf=freeCaptureRef.current;
      setFreeCaptureCount(buf.length);
      if(buf.length>=4){
        // Grid-alignment BPM detection (same principle as MPC "Detect Tempo" / Ableton)
        // For each candidate BPM, compute how well hits align to the beat grid.
        // Normalized error = avg_distance_to_nearest_beat / beatMs
        // This prevents slower BPMs from winning simply because they have larger grids.
        const ts=buf.map(h=>h.t);
        let bestBpm:number|null=null,bestScore=Infinity;
        for(let cBpm=40;cBpm<=240;cBpm++){
          const beatMs=60000/cBpm;
          let err=0;
          ts.forEach(t=>{const ph=t%beatMs;err+=Math.min(ph,beatMs-ph);});
          const score=(err/ts.length)/beatMs; // normalized: fraction of a beat
          if(score<bestScore){bestScore=score;bestBpm=cBpm;}
        }
        if(bestBpm!==null)setFreeBpm(bestBpm);
      }
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
  // Reset free-capture buffer whenever the user leaves Live Pads
  useEffect(()=>{
    freeCaptureRef.current=[];freeCaptureStartRef.current=null;
    setFreeCaptureCount(0);setFreeBpm(null);
  },[view]);
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
      // Swing: AND notes arrive late (shuffle feel). Range ×0.5 so 67%≈triplet, 100%=dotted.
      const sw=bd*(R.sw/100)*0.5;nxtRef.current+=R.step%2===0?(bd+sw):(bd-sw);
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

  // FIX 4 — visibilitychange: resume AudioContext + restart schedulers on foreground return
  // Note: loopSchedFn reads only from refs so any captured version works — [] deps is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{
    const onVis=async()=>{
      if(document.visibilityState==='visible'&&engine.ctx){
        if(engine.ctx.state==='suspended'){
          try{await engine.ctx.resume();setCtxSuspended(false);}
          catch{setCtxSuspended(true);}
        }
        if(R.playing&&!schRef.current){
          nxtRef.current=engine.ctx.currentTime+0.05;
          schLoop();
        }
        if(loopRef.current.audioStart!==null&&!loopRef.current.schTimer){
          loopSchedFn();
        }
        if('wakeLock' in navigator&&(R.playing||loopRef.current.audioStart!==null)){
          try{wakeLockRef.current=await (navigator as any).wakeLock.request('screen');}
          catch{/* denied or unsupported — fail silently */}
        }
      }
      if(document.visibilityState==='hidden'){
        // Never stop schedulers while looper is recording — a brief hide (OS notification,
        // iframe blur, etc.) must not kill an in-progress recording pass.
        if(R.playing&&!R.loopRec){clearTimeout(schRef.current);schRef.current=null;}
        if(loopRef.current.audioStart!==null&&!R.loopRec){
          clearTimeout(loopRef.current.schTimer);loopRef.current.schTimer=null;
        }
      }
    };
    document.addEventListener('visibilitychange',onVis);
    return()=>document.removeEventListener('visibilitychange',onVis);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[schLoop]);

  // FIX 5 — Wake Lock: keep screen on during playback (fails silently on Safari)
  useEffect(()=>{
    const acquire=async()=>{
      if('wakeLock' in navigator&&(playing||loopPlaying)){
        try{wakeLockRef.current=await (navigator as any).wakeLock.request('screen');}
        catch{/* not available or denied */}
      }else if(wakeLockRef.current){
        try{await wakeLockRef.current.release();}catch{}
        wakeLockRef.current=null;
      }
    };
    acquire();
  },[playing,loopPlaying]);

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
    if(ctx.state==='suspended'){
      ctx.resume().catch(()=>{});
      L.schTimer=setTimeout(loopSchedFn,100);
      return;
    }
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
          engine.play(ev.tid,ev.vel,0,R.fx[ev.tid]||{...DEFAULT_FX},evTime);
          // Flash mascot/UI at the audio-scheduled moment (not capture time)
          const flashDelay=Math.max(0,evTime-now);
          setTimeout(()=>{
            setFlashing(s=>{const n=new Set(s);n.add(ev.tid);return n;});
            setTimeout(()=>setFlashing(s=>{const nn=new Set(s);nn.delete(ev.tid);return nn;}),120);
          },Math.max(0,flashDelay*1000-10));
          setTimeout(()=>L.scheduled.delete(key),(flashDelay+1)*1000);
        }
      }
    });
    // Metro clicks anchored to L.audioStart — skipped when sequencer is already running
    // (sequencer has its own metro via schLoop; two independent metros drift against each other)
    if(R.metro&&!R.playing){
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
  const startLooper=async(isRec=false,forcedStart?:number)=>{
    await engine.ensureRunning();
    const L=loopRef.current;
    // Use actual time-sig beats so loop length matches metro period exactly (prevents drift)
    // Guard: if captureFromFreePlay pre-set L.lengthMs, honour it
    // (startLooper is called immediately after — React hasn't batched setBpm/setLoopBars yet)
    if(!L.lengthMs||L.lengthMs<=0){
      L.lengthMs=(60000/Math.max(30,R.bpm))*R.sig.beats*loopBars;
    }
    L.loopBpm=R.bpm; // anchor — used by BPM-rescale effect
    // Always anchor audioStart to now (or forcedStart for countdown).
    // The minToff trick (shifting audioStart back so the first hit fires immediately)
    // caused the playhead to start mid-loop on pass 1 — pass 2 felt like "beat 1"
    // but pass 1 did not. Now every pass starts at position 0 (beat 1).
    L.audioStart=forcedStart!==undefined?forcedStart:engine.ctx.currentTime;
    L.perfStart=performance.now();
    L.scheduled=new Set();
    loopSchedFn();
    // RAF playhead
    const animate=()=>{
      const LL=loopRef.current;
      if(LL.audioStart===null||!engine.ctx)return;
      const el=engine.ctx.currentTime-LL.audioStart;
      const lenS=LL.lengthMs/1000;
      setLoopPlayhead((el%lenS)/lenS);
      // Show QUANTISE after each new full bar (tracks which bar QUANTISE was last shown)
      const loopN=Math.floor(el/lenS);
      if(!captureReadyRef.current&&loopN>captureBarRef.current){
        captureReadyRef.current=true;
        setCaptureReady(true);
      }
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
    R.loopRec=false; // immediate ref — stop capturing before next render
    captureReadyRef.current=false;captureBarRef.current=0;setCaptureReady(false);
    setLoopPlaying(false);setLoopRec(false);setLoopPlayhead(0);
  };

  // ── BPM → looper speed: rescale events + length + re-anchor phase on every BPM change ──
  // Mirrors how Ableton stretches a loop when the project tempo changes.
  // ratio = oldBpm/newBpm  →  slower BPM = longer loop, tOff values scale up proportionally.
  useEffect(()=>{
    const L=loopRef.current;
    if(!loopPlaying||!L.loopBpm||L.audioStart===null||!engine.ctx)return;
    const oldBpm=L.loopBpm;
    const newBpm=bpm;
    if(oldBpm===newBpm)return;
    const ratio=oldBpm/newBpm; // <1 = faster playback, >1 = slower
    const now=engine.ctx.currentTime;
    // Preserve phase: find where we are in the current loop, scale to new loop length
    const oldLenSec=L.lengthMs/1000;
    const oldPhase=(now-L.audioStart)%oldLenSec;
    const newPhase=oldPhase*ratio;
    // Rescale all event offsets and loop length
    L.events=L.events.map(ev=>({...ev,tOff:ev.tOff*ratio}));
    L.lengthMs=L.lengthMs*ratio;
    // Re-anchor so the current beat position is preserved (no audible jump)
    L.audioStart=now-newPhase;
    L.loopBpm=newBpm;
    // Clear already-scheduled keys so loopSchedFn re-fires with new timings
    L.scheduled=new Set();
    setLoopDisp([...L.events]);
  },[bpm]); // eslint-disable-line react-hooks/exhaustive-deps

  const _armLoopRec=async(forcedStart?:number)=>{
    pushLoopSnapshot(); // snapshot before wiping events so REC start is undoable
    const L=loopRef.current;L.passId++;L.events=[];setLoopDisp([]);
    L.lengthMs=(60000/Math.max(30,R.bpm))*R.sig.beats*loopBars;
    // Open the capture gate SYNCHRONOUSLY if ctx is already live, so we never
    // miss beat 1 (which arrives during the ensureRunning microtask tick).
    // If ctx is not yet created or still suspended we fall back to the safe path below.
    const ctxReady=engine.ctx&&engine.ctx.state==='running';
    if(ctxReady){
      L.audioStart=forcedStart!==undefined?forcedStart:engine.ctx!.currentTime;
      R.loopRec=true;
    }
    await engine.ensureRunning();
    if(engine.ctx&&engine.ctx.state==='suspended'){
      try{await engine.ctx.resume();}catch{/* fail silently */}
    }
    // Fallback: ctx was suspended on click — set audioStart now (first-use only)
    if(!R.loopRec){
      L.audioStart=forcedStart!==undefined?forcedStart:engine.ctx!.currentTime;
      R.loopRec=true;
    }
    setLoopRec(true);
    // Pass L.audioStart as forcedStart so startLooper never overrides it
    await startLooper(true,L.audioStart);
  };
  const toggleLoopRec=()=>{
    setShowLooper(true); // auto-open looper panel so user can see timeline + CAPTURE button
    if(!loopPlaying){
      if(loopMetro){
        // Pre-schedule ALL countdown beats as precise WebAudio events (no JS-timer jitter)
        // Check engine.ctx AFTER ensureRunning so it works even on first use (ctx null before first gesture)
        (async()=>{
          await engine.ensureRunning();
          const ctx=engine.ctx;if(!ctx)return;
          const beatSec=60/Math.max(30,R.bpm);
          const t0=ctx.currentTime+0.05; // tiny look-ahead before first click
          for(let i=0;i<sig.beats;i++)playClk(t0+i*beatSec,i===0?"accent":"beat");
          // recStart = exact audio time of beat 0 of the recording (= t0 + 1 bar)
          const recStart=t0+sig.beats*beatSec;
          // Also pre-schedule the downbeat of RECORDING — the user must hear beat 1 of the loop
          playClk(recStart,"accent");
          setRecCountdown(true);
          // JS timer fires slightly after recStart; we pass the pre-calculated audio anchor
          setTimeout(()=>{setRecCountdown(false);_armLoopRec(recStart);},
            (recStart-ctx.currentTime)*1000+8);
        })();
      }else{
        _armLoopRec();
      }
    }else if(!loopRec){
      // Playing but not recording → overdub: add new pass over existing loop
      pushLoopSnapshot(); // snapshot before overdub so it's undoable
      loopRef.current.passId++;R.loopRec=true;setLoopRec(true);
    }else{
      // Stop recording, keep playing
      R.loopRec=false; // immediate ref — stop capturing before next render
      setLoopRec(false);
    }
  };
  R.toggleLoopRec=toggleLoopRec;
  // Push a deep snapshot of L.events before any mutation (rec, overdub, add, move-start, remove, quantize)
  const pushLoopSnapshot=()=>{
    const H=loopHistRef.current;
    H.past.push(loopRef.current.events.map(e=>({...e})));
    if(H.past.length>60)H.past.shift();
    H.future=[];
    setLoopCanUndo(true);setLoopCanRedo(false);
  };
  const undoLoop=()=>{
    const L=loopRef.current;const H=loopHistRef.current;
    if(!H.past.length)return;
    H.future.push(L.events.map(e=>({...e})));
    L.events=H.past.pop()!;
    setLoopDisp([...L.events]);
    setLoopCanUndo(H.past.length>0);setLoopCanRedo(true);
  };
  const redoLoop=()=>{
    const L=loopRef.current;const H=loopHistRef.current;
    if(!H.future.length)return;
    H.past.push(L.events.map(e=>({...e})));
    L.events=H.future.pop()!;
    setLoopDisp([...L.events]);
    setLoopCanUndo(true);setLoopCanRedo(H.future.length>0);
  };
  const clearLooper=()=>{
    stopLooper();
    loopRef.current.events=[];loopRef.current.passId=0;
    loopHistRef.current={past:[],future:[]};
    setLoopDisp([]);setLoopCanUndo(false);setLoopCanRedo(false);
  };
  // ── CAPTURE MODE ──
  // Smart-quantize looper hits IN PLACE — stays in Live Pads, updates looper timeline.
  const captureToLooper=()=>{
    const L=loopRef.current;
    if(!L.events||L.events.length===0)return;
    const loopDurMs=L.lengthMs>0?L.lengthMs:loopBars*sig.beats*(60000/Math.max(30,bpm));
    const beatMs=60000/Math.max(30,bpm);
    // Available subdivisions (ms): 1/4, 1/8, 1/16, 1/32
    const subdivMs=[beatMs,beatMs/2,beatMs/4,beatMs/8];
    // Snapshot for looper undo before modifying events
    pushLoopSnapshot();
    // Snap each event to nearest subdivision — minimum-distance detection
    L.events=L.events.map(ev=>{
      let bestSnapMs=subdivMs[0];let bestDist=Infinity;
      subdivMs.forEach(sub=>{
        const snapped=Math.round(ev.tOff/sub)*sub;
        const dist=Math.abs(ev.tOff-snapped);
        if(dist<bestDist){bestDist=dist;bestSnapMs=sub;}
      });
      const snappedMs=Math.max(0,Math.min(loopDurMs-1,Math.round(ev.tOff/bestSnapMs)*bestSnapMs));
      return {...ev,tOff:snappedMs};
    });
    // Sort by time then deduplicate same-track same-tOff (keep loudest)
    L.events.sort((a,b)=>a.tOff-b.tOff);
    const seen=new Map<string,typeof L.events[0]>();
    L.events.forEach(ev=>{
      const key=`${ev.tid}:${ev.tOff}`;
      if(!seen.has(key)||ev.vel>(seen.get(key)!.vel||0))seen.set(key,ev);
    });
    L.events=[...seen.values()].sort((a,b)=>a.tOff-b.tOff);
    // Force scheduler to reschedule at new tOff positions on the next tick
    L.scheduled=new Set();
    // Update display
    setLoopDisp([...L.events]);
    // Hide QUANTISE — reappears automatically after the next full bar
    const ctx=engine.ctx;
    const curLoopN=ctx&&loopRef.current.audioStart!==null
      ?Math.floor((ctx.currentTime-loopRef.current.audioStart)/(loopRef.current.lengthMs/1000))
      :captureBarRef.current;
    captureBarRef.current=curLoopN;
    captureReadyRef.current=false;setCaptureReady(false);
  };

  const clearFreeCapture=()=>{
    freeCaptureRef.current=[];freeCaptureStartRef.current=null;
    setFreeCaptureCount(0);setFreeBpm(null);
  };

  const captureFromFreePlay=async()=>{
    const buf=freeCaptureRef.current;
    if(buf.length<2)return;
    // Re-run grid-alignment BPM detection on the full buffer for maximum accuracy
    const ts=buf.map(h=>h.t);
    let gridBpm:number|null=null,gridBest=Infinity;
    for(let cBpm=40;cBpm<=240;cBpm++){
      const bMs=60000/cBpm;
      let err=0;ts.forEach(t=>{const ph=t%bMs;err+=Math.min(ph,bMs-ph);});
      const score=(err/ts.length)/bMs;
      if(score<gridBest){gridBest=score;gridBpm=cBpm;}
    }
    const finalBpm=Math.max(40,Math.min(240,gridBpm??freeBpm??bpm));
    setBpm(finalBpm);
    R.bpm=finalBpm; // sync ref immediately — React batching means startLooper would otherwise read old bpm
    const beatMs=60000/finalBpm;
    const barMs=beatMs*sig.beats;
    const totalMs=buf[buf.length-1].t;
    // Snap to nearest power-of-2 bar count (2, 4, 8, 16…) — standard looper behaviour
    const rawBars=Math.round((totalMs+barMs*0.125)/barMs);
    const numBars=Math.pow(2,Math.max(1,Math.round(Math.log2(Math.max(1,rawBars)))));
    const rawDurMs=rawBars*barMs;
    const loopDurMs=numBars*barMs;
    // Quantize hits to nearest note subdivision (grid based on BPM, not loop length)
    // 1/4=beatMs, 1/8=beatMs/2, 1/16=beatMs/4, 1/32=beatMs/8
    const snapHit=(tMs:number)=>{
      let best=tMs,bestDist=Infinity;
      [beatMs,beatMs/2,beatMs/4,beatMs/8].forEach(sMs=>{
        const snapped=Math.round(tMs/sMs)*sMs;
        const d=Math.abs(tMs-snapped);
        if(d<bestDist){bestDist=d;best=Math.max(0,Math.min(rawDurMs-sMs,snapped));}
      });
      return best;
    };
    const looperEvents=buf.map((h,i)=>({
      id:`fcp_${h.tid}_${i}_${Date.now()}`,
      tid:h.tid,tOff:snapHit(h.t),vel:h.vel,pass:1,
    }));
    // Dedup same-track same-tOff within raw content (keep loudest)
    const seen=new Map<string,typeof looperEvents[0]>();
    looperEvents.forEach(ev=>{
      const k=`${ev.tid}:${ev.tOff}`;
      if(!seen.has(k)||ev.vel>(seen.get(k)!.vel||0))seen.set(k,ev);
    });
    const baseEvents=[...seen.values()].sort((a,b)=>a.tOff-b.tOff);
    // Tile base pattern to fill the power-of-2 extended duration
    // e.g. rawBars=1 → numBars=2: copy bar 1 into bar 2
    // e.g. rawBars=3 → numBars=4: tile bars 1-3 cyclically to fill bar 4
    const finalEvents=[...baseEvents];
    if(numBars>rawBars){
      let offset=rawDurMs;
      while(offset<loopDurMs){
        baseEvents.forEach((ev,i)=>{
          const newTOff=ev.tOff+offset;
          if(newTOff<loopDurMs)finalEvents.push({...ev,id:`${ev.id}_t${i}_${offset}`,tOff:newTOff});
        });
        offset+=rawDurMs;
      }
      finalEvents.sort((a,b)=>a.tOff-b.tOff);
    }
    stopLooper();
    pushLoopSnapshot();
    const L=loopRef.current;
    L.events=finalEvents;L.lengthMs=loopDurMs;L.passId=1;L.scheduled=new Set();
    setLoopBars(numBars);
    setLoopDisp(finalEvents.map(ev=>({tid:ev.tid,tOff:ev.tOff,vel:ev.vel})));
    clearFreeCapture();
    setShowLooper(true);
    await startLooper(false);
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
    setSwipeToast(`${tpl.icon} ${tpl.name} · Euclidian`);
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
          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <div data-hint="Logo · Pulse sur chaque temps fort — indique que l'audio Web est actif" style={{width:36,height:36,borderRadius:9,background:"linear-gradient(135deg,#FF2D55,#FF9500)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:"#fff",animation:playing&&gInfo(cStep).first?"logoThump 0.18s ease-out 1":"none",boxShadow:"0 0 20px rgba(255,45,85,0.3)",flexShrink:0}}>K</div>
            <div style={{flexShrink:0}}>
              <div className="gradientShift" style={{fontSize:20,fontWeight:900,letterSpacing:"0.08em",whiteSpace:"nowrap",background:"linear-gradient(90deg,#FF2D55,#FF9500,#FFD60A,#30D158,#5E5CE6)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"gradientShift 4s linear infinite"}}>KICK & SNARE</div>
              <div className="subtitleAnim" style={{fontSize:8,letterSpacing:"0.4em",color:th.dim,whiteSpace:"nowrap"}}>DRUM EXPERIENCE</div>
            </div>
          </div>
          {/* Animated drummer mascot + kit selector + UNDO/REDO */}
          <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:20}}>
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
              <div data-hint="Kit selector · ‹ › to switch · Available kits: 808 Classic, CR-78 Vintage, Kit 3, Kit 8" style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
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
            const mc=th.mascot||"#bbb";
            const ac=(playing||anyHit)?"#FF9500":mc;const hi="#FF2D55";
            const aHH=act.includes("hihat");const aS=act.includes("snare");const aK=act.includes("kick");
            const aT=act.includes("tom");const aRide=act.includes("ride");const aCrash=act.includes("crash");
            const aClap=act.includes("clap");const aPerc=act.includes("perc");
            const bpmMs=60000/Math.max(30,bpm||120);
            const bobDur=`${(bpmMs/1000).toFixed(3)}s`;
            return(<div data-hint="Mascot · Hits the drums matching active tracks · Bob speed and halo synchronized to BPM" style={{flexShrink:0}}>
              <svg viewBox="0 0 130 52" width="130" height="52" style={{overflow:"visible",willChange:"contents",display:"block",filter:(playing||loopPlaying)?(anyHit?"drop-shadow(0 0 10px rgba(255,45,85,0.8))":"drop-shadow(0 0 5px rgba(255,149,0,0.5))"):"none",transition:"filter 0.08s"}}>
                {/* Halo ring behind mascot — synced with BPM */}
                {(playing||loopPlaying)&&<ellipse cx="44" cy="24" rx="28" ry="26" fill="none" stroke={anyHit?"#FF2D55":"#FF9500"} strokeWidth={0.8} opacity={0} style={{animation:`mascotHalo ${bobDur} ease-in-out infinite`,transformOrigin:"44px 24px"}}/>}
                {(playing||loopPlaying)&&<ellipse cx="44" cy="24" rx="22" ry="20" fill="none" stroke={anyHit?"rgba(255,45,85,0.3)":"rgba(255,149,0,0.2)"} strokeWidth={anyHit?2:1} style={{animation:`mascotHalo ${bobDur} ease-in-out infinite alternate`}}/>}
                {/* Hi-hat */}
                {aHH&&<g>
                  <line x1="14" y1="16" x2="14" y2="50" stroke={mc} strokeWidth="0.7"/>
                  <ellipse cx="14" cy="16" rx="7" ry="1.8" fill={hH?"#fff5e0":"none"} stroke={hH?hi:mc} strokeWidth={hH?1.5:0.7}/>
                  <ellipse cx="14" cy={hH?"14.5":"15"} rx="7" ry="1.8" fill="none" stroke={hH?hi:mc} strokeWidth={hH?1.5:0.7}/>
                  {hH&&<><line x1="10" y1="12" x2="8" y2="8" stroke={hi} strokeWidth="0.8" opacity="0.5"/><line x1="18" y1="12" x2="20" y2="8" stroke={hi} strokeWidth="0.8" opacity="0.5"/></>}
                </g>}
                {/* Snare */}
                {aS&&<g>
                  <rect x="22" y="30" width="16" height="7" rx="3" fill={hS?"#fff0e8":"none"} stroke={hS?hi:mc} strokeWidth={hS?1.5:0.7}/>
                  <line x1="24" y1="31" x2="24" y2="36" stroke={mc} strokeWidth="0.4"/><line x1="28" y1="31" x2="28" y2="36" stroke={mc} strokeWidth="0.4"/>
                  <line x1="32" y1="31" x2="32" y2="36" stroke={mc} strokeWidth="0.4"/><line x1="36" y1="31" x2="36" y2="36" stroke={mc} strokeWidth="0.4"/>
                  {hS&&<><line x1="22" y1="28" x2="19" y2="25" stroke={hi} strokeWidth="1" opacity="0.6"/><line x1="38" y1="28" x2="41" y2="25" stroke={hi} strokeWidth="1" opacity="0.6"/></>}
                </g>}
                {/* Kick drum */}
                {aK&&<g>
                  <ellipse cx="55" cy="42" rx="12" ry="8" fill={hK?"#ffe8e8":"none"} stroke={hK?hi:mc} strokeWidth={hK?1.8:0.7}/>
                  <ellipse cx="55" cy="42" rx="6" ry="4" fill="none" stroke={hK?hi:mc} strokeWidth="0.5"/>
                  {hK&&<><line x1="55" y1="32" x2="55" y2="28" stroke={hi} strokeWidth="1" opacity="0.5"/><line x1="48" y1="35" x2="45" y2="33" stroke={hi} strokeWidth="0.8" opacity="0.4"/><line x1="62" y1="35" x2="65" y2="33" stroke={hi} strokeWidth="0.8" opacity="0.4"/></>}
                </g>}
                {/* Tom */}
                {aT&&<g>
                  <ellipse cx="52" cy="25" rx="7" ry="3" fill={hT?"#fff0e8":"none"} stroke={hT?hi:mc} strokeWidth={hT?1.2:0.6}/>
                </g>}
                {/* Ride cymbal — flat, right side, bras droit */}
                {aRide&&<g>
                  <line x1="68" y1="13" x2="68" y2="50" stroke={mc} strokeWidth="0.7"/>
                  <ellipse cx="68" cy="13" rx="9" ry="2" fill={hRide?"#fffbe8":"none"} stroke={hRide?"#FFD60A":mc} strokeWidth={hRide?1.5:0.7}/>
                  {hRide&&<><line x1="64" y1="10" x2="62" y2="6" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/><line x1="72" y1="10" x2="74" y2="6" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/><line x1="68" y1="10" x2="68" y2="5" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/></>}
                </g>}
                {/* Crash cymbal — large tilted, upper right, bras gauche */}
                {aCrash&&<g>
                  <line x1="103" y1="8" x2="100" y2="50" stroke={mc} strokeWidth="0.7"/>
                  <ellipse cx="103" cy="8" rx="11" ry="2.8" fill={hCrash?"#fff5cc":"none"} stroke={hCrash?"#FFD60A":mc} strokeWidth={hCrash?1.8:0.7} transform="rotate(-8,103,8)"/>
                  {hCrash&&<><line x1="97" y1="4" x2="94" y2="0" stroke="#FFD60A" strokeWidth="1" opacity="0.7"/><line x1="109" y1="4" x2="112" y2="0" stroke="#FFD60A" strokeWidth="1" opacity="0.7"/><line x1="103" y1="3" x2="103" y2="-2" stroke="#FFD60A" strokeWidth="1" opacity="0.7"/></>}
                </g>}
                {/* Perc — bongo pair, close to set */}
                {aPerc&&<g>
                  <ellipse cx="81" cy="41" rx="5.5" ry="7.5" fill={hPerc?"#BF5AF222":"none"} stroke={hPerc?"#BF5AF2":mc} strokeWidth={hPerc?1.4:0.7}/>
                  <ellipse cx="81" cy="33.5" rx="5.5" ry="2" fill={hPerc?"#BF5AF222":"none"} stroke={hPerc?"#BF5AF2":mc} strokeWidth={hPerc?1.1:0.6}/>
                  <ellipse cx="89" cy="43" rx="4.5" ry="6.5" fill={hPerc?"#BF5AF222":"none"} stroke={hPerc?"#BF5AF2":mc} strokeWidth={hPerc?1.4:0.7}/>
                  <ellipse cx="89" cy="36.5" rx="4.5" ry="1.8" fill={hPerc?"#BF5AF222":"none"} stroke={hPerc?"#BF5AF2":mc} strokeWidth={hPerc?1.1:0.6}/>
                  {hPerc&&<><line x1="78" y1="31" x2="76" y2="27" stroke="#BF5AF2" strokeWidth="0.8" opacity="0.7"/><line x1="84" y1="31" x2="86" y2="27" stroke="#BF5AF2" strokeWidth="0.8" opacity="0.7"/></>}
                </g>}
                {/* Electronic pads — 1 per custom track, rack-mounted right side */}
                {customTracks.length>0&&(()=>{
                  const total=customTracks.length;const padW=7;const gap=2;const startX=130-(total*(padW+gap)-gap);
                  return(<g>
                    <line x1={startX-1} y1="18" x2={130-(gap)} y2="18" stroke={mc} strokeWidth="0.6" opacity="0.5"/>
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
                  <ellipse cx="8" cy="28" rx="4" ry="5.5" fill={hC?"#5E5CE622":"none"} stroke={hC?"#5E5CE6":mc} strokeWidth={hC?1.3:0.7}/>
                  <line x1="8" y1="33" x2="8" y2="45" stroke={hC?"#5E5CE6":mc} strokeWidth={hC?1.2:0.7}/>
                  {hC&&<><line x1="4" y1="25" x2="2" y2="21" stroke="#5E5CE6" strokeWidth="0.8" opacity="0.6"/><line x1="12" y1="25" x2="14" y2="21" stroke="#5E5CE6" strokeWidth="0.8" opacity="0.6"/></>}
                </g>}
                <g style={{animation:playing?`mbob ${bobDur} ease-in-out infinite`:anyHit?"none":"none",transformBox:"fill-box"}}>
                  <ellipse cx="44" cy="38" rx="6" ry="2" fill="none" stroke={mc} strokeWidth="0.8"/>
                  <line x1="38" y1="38" x2="36" y2="50" stroke={mc} strokeWidth="0.7"/><line x1="50" y1="38" x2="52" y2="50" stroke={mc} strokeWidth="0.7"/>
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
                    <rect x="39" y="8" width="4" height="3" rx="1" fill={playing?"#333":mc}/>
                    <rect x="45" y="8" width="4" height="3" rx="1" fill={playing?"#333":mc}/>
                    {playing&&<path d="M41,13 Q44,15 47,13" fill="none" stroke={ac} strokeWidth="0.8"/>}
                    <path d="M38,6 Q44,0 50,6" fill="none" stroke={ac} strokeWidth="1.5" strokeLinecap="round"/>
                    <rect x="36" y="5" width="3" height="5" rx="1.5" fill={ac} opacity="0.5"/>
                    <rect x="49" y="5" width="3" height="5" rx="1.5" fill={ac} opacity="0.5"/>
                  </g>
                </g>
              </svg>
            </div>);
          })()}
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            <button data-hint="Undo (Ctrl+Z) · Go back one step — up to 50 history steps" onClick={undo} disabled={histLen.past===0} title={`Undo (Ctrl+Z)${histLen.past?" — "+histLen.past+" step"+(histLen.past>1?"s":"")+" back":""}`} style={{width:28,height:28,border:`1px solid ${histLen.past?"rgba(100,210,255,0.35)":th.sBorder+"22"}`,borderRadius:6,background:histLen.past?"rgba(100,210,255,0.06)":"transparent",color:histLen.past?"#64D2FF":th.faint,fontSize:16,cursor:histLen.past?"pointer":"default",fontFamily:"inherit",opacity:histLen.past?1:0.3,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0}}>↺</button>
            <button data-hint="Redo (Ctrl+Y) · Restore the undone action" onClick={redo} disabled={histLen.future===0} title={`Redo (Ctrl+Y)${histLen.future?" — "+histLen.future+" step"+(histLen.future>1?"s":"")+" forward":""}`} style={{width:28,height:28,border:`1px solid ${histLen.future?"rgba(100,210,255,0.35)":th.sBorder+"22"}`,borderRadius:6,background:histLen.future?"rgba(100,210,255,0.06)":"transparent",color:histLen.future?"#64D2FF":th.faint,fontSize:16,cursor:histLen.future?"pointer":"default",fontFamily:"inherit",opacity:histLen.future?1:0.3,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0}}>↻</button>
            <button data-hint="Welcome screen · Show the intro overlay again · Useful after reinstalling or sharing with someone new" onClick={()=>{setShowInfo(false);setShowTour(false);setOverlayVisible(true);}} title="Show intro" style={{width:28,height:28,border:"1px solid rgba(255,45,85,0.2)",borderRadius:6,background:"transparent",color:"rgba(255,45,85,0.45)",fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0}}>⊙</button>
            <button data-hint="Interactive tutorial · Illustrated guided tour of the 8 app sections — can be replayed at any time" onClick={()=>{setShowTour(p=>!p);setShowInfo(false);}} title="Interactive tutorial" style={{width:28,height:28,border:`1px solid ${showTour?"#FF950055":"rgba(255,149,0,0.2)"}`,borderRadius:6,background:showTour?"rgba(255,149,0,0.15)":"transparent",color:showTour?"#FF9500":"rgba(255,149,0,0.55)",fontSize:14,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0}}>🎓</button>
            <button data-hint="User guide · Describes every control and interaction in the app" onClick={()=>setShowInfo(p=>!p)} title="User guide" style={{width:28,height:28,border:`1px solid ${showInfo?"#BF5AF255":"rgba(191,90,242,0.2)"}`,borderRadius:6,background:showInfo?"rgba(191,90,242,0.15)":"transparent",color:showInfo?"#BF5AF2":"rgba(191,90,242,0.55)",fontSize:13,fontWeight:900,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0,fontStyle:"italic"}}>?</button>
          </div>
          </div>
          <div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
            <button data-hint="Live Pads · 8 colored pads playable in real time by touch or keyboard · Perfect for performing" onClick={()=>{if(R.playing&&view==="euclid"){clearTimeout(schRef.current);setPlaying(false);setCStep(-1);R.step=-1;}setAct(a=>{const all=["kick","snare","hihat","clap","tom","ride","crash","perc"];const next=[...a];all.forEach(id=>{if(!next.includes(id))next.push(id);});return next;});setView("pads");setShowLooper(false);clearFreeCapture();}} style={pill(view==="pads","#5E5CE6")}>LIVE PADS</button>
            {/* ── SEQUENCER + EUCLID grouped block ── */}
            <div style={{display:"flex",border:`1px solid ${view==="sequencer"?"#FF2D5555":view==="euclid"?"#FFD60A55":th.sBorder}`,borderRadius:6,overflow:"hidden",transition:"border-color 0.15s",}}>

              <button data-hint="Sequencer · TR-808 step grid · Click = on/off · Drag ↕ = velocity · Long-press = probability" onClick={()=>view!=="sequencer"&&switchView("sequencer")} style={{padding:"5px 11px",border:"none",borderRight:`1px solid ${th.sBorder}`,borderRadius:0,background:view==="sequencer"?"#FF2D5518":"transparent",color:view==="sequencer"?"#FF2D55":th.dim,fontSize:9,fontWeight:700,cursor:view==="sequencer"?"default":"pointer",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"inherit"}}>SEQUENCER</button>
              <button data-hint="Euclidean Sequencer · Distributes N hits across M steps mathematically · African rhythms, polymeters" onClick={()=>view!=="euclid"&&switchView("euclid")} style={{padding:"5px 11px",border:"none",borderRight:`1px solid ${th.sBorder}`,borderRadius:0,background:view==="euclid"?"#FFD60A18":"transparent",color:view==="euclid"?"#FFD60A":th.dim,fontSize:9,fontWeight:700,cursor:view==="euclid"?"default":"pointer",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"inherit"}}>⬡ EUCLIDIAN</button>
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
        <FXRack
          gfx={gfx} setGfx={setGfx} tracks={atO} themeName={themeName} bpm={bpm}
          midiLM={midiLM} MidiTag={MidiTag} isPortrait={isPortrait}
          fxChainOrder={fxChainOrder} setFxChainOrder={setFxChainOrder}
          onChainOrderChange={(o:string[])=>{if(engine.rebuildChain)engine.rebuildChain(o,fxSendPos);else if(engine.setSerialOrder)engine.setSerialOrder(o);}}
          fxSendPos={fxSendPos} setFxSendPos={setFxSendPos}
          trackFx={trackFx} onTrackFxChange={onTrackFxChange}
        />

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
          <TipBadge id="seq_steps" text="Tap a cell to activate a sound · Double-tap to reset · Long-press = probability" color="#FF2D55"/>
          <div style={{display:"flex",flexDirection:"column",gap:0,position:"relative"}}
            onTouchStart={e=>{touchSwipeRef.current={x:e.touches[0].clientX,y:e.touches[0].clientY,target:e.target};}}
            onTouchEnd={e=>{
              const dx=e.changedTouches[0].clientX-touchSwipeRef.current.x;
              const dy=Math.abs(e.changedTouches[0].clientY-touchSwipeRef.current.y);
              if(Math.abs(dx)>60&&dy<30&&!(touchSwipeRef.current.target as HTMLElement)?.dataset?.step){
                if(dx<0){undo();setSwipeToast('↺ Undone');}
                else{redo();setSwipeToast('↻ Redone');}
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
            {!showAdd?<button data-hint="Add a track · Reactivate a hidden track or create a custom track with your own audio sample" onClick={()=>{setShowAdd(true);setShowCustomInput(false);setNewTrackName("");}} style={{width:"100%",padding:"8px",border:`1px dashed ${th.sBorder}`,borderRadius:8,background:"transparent",color:th.dim,fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>+ ADD TRACK</button>:(
              <div style={{padding:"8px 10px",borderRadius:8,background:th.surface,border:`1px solid ${th.sBorder}`,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                {inact.map(t=>(<button key={t.id} onClick={()=>{setAct(p=>[...p,t.id]);setShowAdd(false);}} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.color}33`,background:t.color+"10",color:t.color,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{t.icon} {t.label}</button>))}
                {CustomTrackInput()}
                <button onClick={()=>{setShowAdd(false);setShowCustomInput(false);setNewTrackName("");}} style={{marginLeft:"auto",padding:"4px 8px",border:"none",borderRadius:4,background:"rgba(255,55,95,0.1)",color:"#FF375F",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>CANCEL</button>
              </div>)}
          </div>
        </>)}

        {/* ── LIVE PADS ── */}
        {view==="pads"&&(<div style={{padding:"12px 0"}}>
          <TipBadge id="pads_tap" text="Play live! Tap a pad to trigger a sound · REC to record a loop" color="#5E5CE6"/>
          {/* ── Looper banner (foldable) ── */}
          <div style={{marginBottom:10,borderRadius:10,border:`1px solid ${showLooper||loopRec||loopPlaying?"rgba(191,90,242,0.35)":"rgba(191,90,242,0.15)"}`,overflow:"hidden",background:th.surface}}>
            {/* Header band — div (not button) so we can embed CAPTURE button without invalid nesting */}
            <div onClick={()=>setShowLooper(p=>!p)} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"8px 12px",cursor:"pointer",userSelect:"none"}}>
              <span style={{fontSize:10,color:"#BF5AF2"}}>⊙</span>
              <span style={{fontSize:9,fontWeight:800,color:"#BF5AF2",letterSpacing:"0.08em"}}>LOOPER</span>
              {loopRec&&<span style={{fontSize:7,fontWeight:800,color:"#FF2D55",animation:"rb 0.8s infinite"}}>● REC</span>}
              {loopPlaying&&!loopRec&&<span style={{fontSize:7,fontWeight:800,color:"#30D158"}}>▶ PLAY</span>}
              {recCountdown&&<span style={{fontSize:7,fontWeight:800,color:"#FF9500",animation:"rb 0.5s infinite"}}>COUNTDOWN…</span>}
              {/* ── CAPTURE + RESET — always in header, visible folded & unfolded ── */}
              {freeCaptureCount>0&&(
                <button
                  onClick={e=>{e.stopPropagation();clearFreeCapture();}}
                  title="Restart — clears recorded hits and starts over"
                  style={{marginLeft:4,flexShrink:0,padding:"3px 7px",borderRadius:5,border:"1px solid rgba(255,55,95,0.3)",background:"rgba(255,55,95,0.08)",color:"rgba(255,55,95,0.7)",fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",lineHeight:1}}
                >✕</button>
              )}
              {(()=>{
                const ready=freeCaptureCount>=4;
                const listening=freeCaptureCount>0&&freeCaptureCount<4;
                return(
                  <button
                    onClick={e=>{e.stopPropagation();if(ready)captureFromFreePlay();}}
                    title={ready?`${freeCaptureCount} hits · ${freeBpm??'?'} BPM detected — click to capture`:listening?`${freeCaptureCount}/4 hits — keep playing`:"Tap pads to activate capture mode"}
                    style={{marginLeft:listening||ready?2:4,flexShrink:0,padding:"3px 8px",borderRadius:5,border:ready?"none":`1px solid rgba(48,209,88,${listening?"0.3":"0.1"})`,background:ready?"linear-gradient(90deg,#30D158,#34C759)":listening?"rgba(48,209,88,0.08)":"rgba(48,209,88,0.02)",color:ready?"#fff":listening?"rgba(48,209,88,0.65)":"rgba(48,209,88,0.22)",fontSize:8,fontWeight:800,cursor:ready?"pointer":"default",fontFamily:"inherit",letterSpacing:"0.06em",boxShadow:ready?"0 0 10px rgba(48,209,88,0.3)":"none",animation:ready?"pulse 1.4s ease-in-out infinite":"none",transition:"all 0.2s",whiteSpace:"nowrap"}}
                  >
                    {ready?`⚡ ${freeBpm??'?'} BPM`:listening?`⚡ ${freeCaptureCount}/4`:"⚡ CAPTURE"}
                  </button>
                );
              })()}
              <span style={{marginLeft:"auto",fontSize:10,color:th.dim}}>{showLooper?"▲":"▼"}</span>
            </div>
            {showLooper&&(
              <div style={{padding:"0 12px 12px"}}>
                {recCountdown&&(
                  <div style={{position:"relative",marginBottom:8,padding:"7px 10px",borderRadius:7,background:"rgba(255,149,0,0.06)",border:"1px solid rgba(255,149,0,0.35)",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:0,left:0,height:"100%",background:"rgba(255,149,0,0.12)",animation:`recCountBar ${((60000/Math.max(30,bpm))*sig.beats/1000).toFixed(2)}s linear forwards`}}/>
                    <span style={{position:"relative",fontSize:8,fontWeight:800,color:"#FF9500",letterSpacing:"0.08em"}}>🎵 COUNTDOWN — REC in 1 bar…</span>
                  </div>
                )}
                <LooperPanel
                  loopBars={loopBars} setLoopBars={setLoopBars}
                  loopRec={loopRec} loopPlaying={loopPlaying} loopPlayhead={loopPlayhead}
                  loopDisp={loopDisp}
                  loopMetro={loopMetro} setLoopMetro={setLoopMetro}
                  onToggleRec={toggleLoopRec} onFreshRec={freshRecLooper} onTogglePlay={loopPlaying?stopLooper:()=>startLooper(false)} onUndo={undoLoop} onRedo={redoLoop} onClear={clearLooper}
                  loopCanUndo={loopCanUndo} loopCanRedo={loopCanRedo}
                  themeName={themeName} isPortrait={isPortrait}
                  bpm={bpm} tracks={atO}
                  onBeforeEdit={pushLoopSnapshot}
                  onMoveHit={(idx,newTOff)=>{
                    const L=loopRef.current;
                    if(!L.events[idx])return;
                    const ev=L.events[idx];
                    // Clear this event's scheduled keys so the scheduler immediately
                    // re-picks it at the new tOff on the next 25ms tick (during playback).
                    const toDelete:string[]=[];
                    L.scheduled.forEach((k:string)=>{if(k.startsWith(ev.id+':'))toDelete.push(k);});
                    toDelete.forEach((k:string)=>L.scheduled.delete(k));
                    L.events[idx]={...ev,tOff:Math.max(0,newTOff)};
                    setLoopDisp([...L.events]);
                  }}
                  onAddHit={(tid,tOff)=>{
                    pushLoopSnapshot();
                    const L=loopRef.current;
                    const dur=L.lengthMs>0?L.lengthMs:loopBars*sig.beats*(60000/Math.max(30,bpm));
                    const ev={id:`m_${Date.now()}`,tid,tOff:Math.max(0,Math.min(dur-1,tOff)),vel:1,pass:L.passId};
                    L.events.push(ev);
                    L.events.sort((a,b)=>a.tOff-b.tOff);
                    setLoopDisp([...L.events]);
                  }}
                  onRemoveHit={(idx)=>{
                    pushLoopSnapshot();
                    const L=loopRef.current;
                    if(idx<0||idx>=L.events.length)return;
                    L.events.splice(idx,1);
                    setLoopDisp([...L.events]);
                  }}
                  onQuantize={(div)=>{
                    pushLoopSnapshot();
                    const L=loopRef.current;
                    if(!L.events||!L.events.length)return;
                    const loopDurMs=L.lengthMs>0?L.lengthMs:loopBars*sig.beats*(60000/Math.max(30,bpm));
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
            {!showAdd?<button data-hint="Add a track · Reactivate a hidden track or create a custom track with your own audio sample" onClick={()=>{setShowAdd(true);setShowCustomInput(false);setNewTrackName("");}} style={{width:"100%",padding:"8px",border:`1px dashed ${th.sBorder}`,borderRadius:8,background:"transparent",color:th.dim,fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>+ ADD TRACK</button>:(
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
              <TipBadge id="euclid_n" text="N = number of steps · HITS = number of sounds · Spin the wheel to create rhythms" color="#FFD60A"/>
              <TipBadge id="euclid_edit" text="Tap EDIT to easily place your sounds on the Euclidean grid" color="#30D158"/>
              <div style={{display:"flex",flexDirection:isPortrait?"column":"row",gap:16,alignItems:"flex-start",minWidth:isPortrait?undefined:820}}>
                {/* ── LEFT: Track controls ── */}
                <div style={{display:"flex",flexDirection:"column",gap:6,width:380,flexShrink:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                    <div style={{fontSize:8,fontWeight:800,color:th.dim,letterSpacing:"0.12em"}}>EUCLIDIAN TRACKS</div>
                    <button data-hint={euclidEditMode?"EDIT mode active · Euclidean dots are larger and editable · Click DONE to finish":"EDIT mode · Enlarges dots for precise placement · Click to activate"} onClick={()=>setEuclidEditMode(p=>!p)} style={{padding:"2px 8px",borderRadius:10,border:`1px solid ${euclidEditMode?"#30D158":"#FFD60A"}`,background:euclidEditMode?"#30D15818":"#FFD60A18",color:euclidEditMode?"#30D158":"#FFD60A",fontSize:7,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em",flexShrink:0}}>{euclidEditMode?"DONE":"EDIT"}</button>
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
                                <div data-hint={`Track ${tr.label} · ${cnt} hit${cnt>1?"s":""} · Click to fold/unfold settings · ${p.fold?"Expanded":"Collapsed"}`} onClick={()=>writeP(tr.id,{fold:!p.fold})} style={{display:"flex",alignItems:"center",gap:3,width:92,flexShrink:0,cursor:"pointer",overflow:"hidden"}}>
                                  <span style={{flexShrink:0,opacity:aud?1:0.4}}><DrumSVG id={tr.id} color={tr.color} hit={flashing.has(tr.id)} sz={18} /></span>
                                  <span title={p.fold?"Expand":"Collapse"} style={{fontSize:9,fontWeight:800,color:aud?tr.color:th.dim,letterSpacing:"0.07em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,userSelect:"none"}}>{tr.label}</span>
                                  {cnt>0&&<span style={{background:tr.color+"33",color:tr.color,borderRadius:4,padding:"1px 3px",fontSize:6,fontWeight:700,flexShrink:0}}>{cnt}h</span>}
                                </div>
                                <button data-hint={isM?`MUTE active · Track ${tr.label} silenced · Click to re-enable`:`MUTE · Silence track ${tr.label} without clearing the Euclidean rhythm`} onClick={()=>setMuted(m=>({...m,[tr.id]:!m[tr.id]}))} style={{...btnSm,color:isM?"#FF375F":th.faint,border:`1px solid ${isM?"rgba(255,55,95,0.4)":th.sBorder}`,background:isM?"rgba(255,55,95,0.12)":"transparent"}}>M</button>
                                <button data-hint={isS?`SOLO active · Only track ${tr.label} is playing · Click to disable`:`SOLO · Isolate track ${tr.label} — all other tracks are silenced`} onClick={()=>setSoloed(s=>s===tr.id?null:tr.id)} style={{...btnSm,color:isS?"#FFD60A":th.faint,border:`1px solid ${isS?"rgba(255,214,10,0.4)":th.sBorder}`,background:isS?"rgba(255,214,10,0.12)":"transparent"}}>S</button>
                                {(()=>{const hasSmp=!!smpN[tr.id];return(<button data-hint={hasSmp?`Sample: ${smpN[tr.id]} · Click to change the audio file`:`Load an audio sample for track ${tr.label} (MP3, WAV, OGG)`} onClick={()=>ldFile(tr.id)} title={hasSmp?smpN[tr.id]:"Load sample"} style={{...btnSm,color:hasSmp?"#FF9500":th.faint,border:`1px solid ${hasSmp?"rgba(255,149,0,0.4)":th.sBorder}`,background:hasSmp?"rgba(255,149,0,0.15)":"transparent"}}>♪</button>);})()}
                                <MidiTag id={tr.id}/>
                                <button data-hint={`CLR · Clear all Euclidean hits from track ${tr.label} · Resets to N=${p.N} hits=0`} onClick={()=>clearTrack(tr.id)} title="Clear hits" style={{...btnSm,color:"#FF2D55",border:"1px solid rgba(255,45,85,0.3)",fontSize:7}}>CLR</button>
                                {act.length>1&&<button data-hint={`Remove track ${tr.label} from Euclidean view`} onClick={()=>{setAct(a=>a.filter(x=>x!==tr.id));if(tr.id.startsWith("ct_"))setCustomTracks(p=>p.filter(x=>x.id!==tr.id));}} style={{...btnSm,color:"#FF375F",border:"1px solid rgba(255,55,95,0.3)"}}>×</button>}
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
                            <span data-hint={`N · Cycle length for track ${tr.label} · Currently ${p.N} steps · ‹ › or drag ↕ to adjust (3–32)`} style={lbl0}>N</span>
                            <button data-hint={`Decrease N · Shorten the Euclidean cycle of ${tr.label} (currently ${p.N} steps)`} onMouseDown={e=>{e.preventDefault();chN(tr.id,Math.max(3,p.N-1));}} style={arw}>‹</button>
                            <span data-hint={`N = ${p.N} · Number of subdivisions in the ${tr.label} cycle · Drag ↕ to change`} onPointerDown={mkDrag(p.N,3,32,v=>chN(tr.id,v))} title="Drag ↕" style={{...val0,color:tr.color}}>{p.N}</span>
                            <button data-hint={`Increase N · Extend the Euclidean cycle of ${tr.label} (currently ${p.N} steps)`} onMouseDown={e=>{e.preventDefault();chN(tr.id,Math.min(32,p.N+1));}} style={arw}>›</button>
                            <span style={sep0}>·</span>
                            <span data-hint={`HITS · Number of hits distributed mathematically across ${p.N} steps for ${tr.label} · Currently ${p.hits} hits`} style={lbl0}>HITS</span>
                            <button data-hint={`Fewer hits · Remove a Euclidean hit from ${tr.label} (${p.hits}→${Math.max(0,p.hits-1)})`} onMouseDown={e=>{e.preventDefault();chH(tr.id,Math.max(0,p.hits-1));}} style={arw}>‹</button>
                            <span data-hint={`HITS = ${p.hits}/${p.N} · Euclidean algorithm distributes ${p.hits} sounds across ${p.N} steps optimally · Drag ↕ to adjust`} onPointerDown={mkDrag(p.hits,0,p.N,v=>chH(tr.id,v))} title="Drag ↕" style={{...val0,color:tr.color}}>{p.hits}<span style={{fontSize:7,color:th.faint,fontWeight:400}}>/{p.N}</span></span>
                            <button data-hint={`More hits · Add a Euclidean hit to ${tr.label} (${p.hits}→${Math.min(p.N,p.hits+1)})`} onMouseDown={e=>{e.preventDefault();chH(tr.id,Math.min(p.N,p.hits+1));}} style={arw}>›</button>
                            <span style={sep0}>·</span>
                            <span data-hint={`ROT · Pattern rotation · Shifts the starting point by ${p.rot} steps for ${tr.label} · Changes rhythmic accent`} style={lbl0}>ROT</span>
                            <button data-hint={`Rotate left · Shift the ${tr.label} Euclidean pattern one step left`} onMouseDown={e=>{e.preventDefault();chR(tr.id,((p.rot-1+p.N)%Math.max(p.N,1)));}} style={arw}>‹</button>
                            <span data-hint={`ROT = +${p.rot} · Current rotation of ${tr.label} pattern · Drag ↕ to adjust`} onPointerDown={mkDrag(p.rot,0,Math.max(p.N-1,0),v=>chR(tr.id,v))} title="Drag ↕" style={{...val0,color:tr.color}}>+{p.rot}</span>
                            <button data-hint={`Rotate right · Shift the ${tr.label} Euclidean pattern one step right`} onMouseDown={e=>{e.preventDefault();chR(tr.id,(p.rot+1)%Math.max(p.N,1));}} style={arw}>›</button>
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
                            const eucDotHint=on
                              ?`Step ${i+1}/${N} · ${tr.label} · Active · Velocity: ${velPct}%${cur?" · Currently playing":""} · Click = disable · Long-press = set velocity & probability`
                              :`Step ${i+1}/${N} · ${tr.label} · Inactive · Click to activate · Long-press = advanced options`;
                            return(
                              <g key={i} data-hint={eucDotHint} style={{cursor:on?"ns-resize":"pointer",userSelect:"none",touchAction:"none",WebkitTouchCallout:"none"}}>
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


        {/* ── Barre contextuelle bas ── */}
        <div style={{marginTop:14,padding:"7px 12px 18px",borderTop:`1px solid ${th.sBorder}`,minHeight:30,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:8,color:hoverMsg?th.dim:th.faint,letterSpacing:"0.05em",textAlign:"center",transition:"opacity 0.15s",opacity:hoverMsg?1:0.6}}>
            {hoverMsg||(atO.some(tr=>(pat[tr.id]||[]).some(v=>v>0))?(playing?"Drag ↕ on a step = velocity · Hold = probability":"Start playback to hear"):"Hover over an element to see its role")}
          </span>
        </div>
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
              <div style={{fontSize:6.5,color:th.faint,fontWeight:700,letterSpacing:"0.1em",marginBottom:8}}>STEP {step+1} — PROBABILITY</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:10}}>
                {[100,75,50,25].map(v=>(
                  <button key={v} onPointerDown={e=>{e.stopPropagation();applyProb(v);}}
                    style={{padding:"8px 0",borderRadius:6,border:`1px solid ${cur===v?"#FF9500":th.sBorder}`,background:cur===v?"rgba(255,149,0,0.22)":"transparent",color:cur===v?"#FF9500":th.dim,fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:"inherit",transition:"all 0.1s"}}>{v}%</button>
                ))}
              </div>
              <button onPointerDown={e=>{e.stopPropagation();setProbPopover(null);}}
                style={{width:"100%",padding:"5px 0",borderRadius:6,border:`1px solid ${th.sBorder}`,background:"transparent",color:th.faint,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕ CANCEL</button>
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
              <div style={{fontSize:6.5,color:th.faint,fontWeight:700,letterSpacing:"0.1em",textAlign:"center",marginBottom:4}}>STEP {step+1} — VELOCITY</div>
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
                <div style={{fontSize:6.5,color:th.faint,fontWeight:700,letterSpacing:"0.1em",marginBottom:5}}>PROBABILITY</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3}}>
                  {[100,75,50,25].map(v=>(
                    <button key={v} onPointerDown={e=>{e.stopPropagation();setVelPicker(p=>({...p,probPct:v}));}} style={{padding:"5px 0",borderRadius:5,border:`1px solid ${curProb===v?"#FF9500":th.sBorder}`,background:curProb===v?"rgba(255,149,0,0.2)":"transparent",color:curProb===v?"#FF9500":th.dim,fontSize:8,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>{v}%</button>
                  ))}
                </div>
              </div>
              {/* OK / Cancel */}
              <div style={{display:"flex",gap:4}}>
                <button onPointerDown={e=>{e.stopPropagation();setVelPicker(null);}} style={{flex:1,padding:"5px 0",borderRadius:6,border:`1px solid ${th.sBorder}`,background:"transparent",color:th.faint,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕ CANCEL</button>
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
          <div style={{fontSize:13,color:"rgba(255,255,255,0.8)",textAlign:"center",lineHeight:1.6,fontWeight:500}}>Your TR-808 drum sequencer in the browser. Build grooves, record loops, explore Euclidean rhythms.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%"}}>
            {[
              {icon:"◆",label:"Sequencer",desc:"Place sounds\nstep by step",col:"#FF2D55"},
              {icon:"⬡",label:"Euclidean",desc:"Algorithmic\nrhythms",col:"#FFD60A"},
              {icon:"⊙",label:"Looper",desc:"Record\nlive",col:"#BF5AF2"},
              {icon:"⊞",label:"Live Pads",desc:"Play\nin real time",col:"#5E5CE6"},
            ].map(({icon,label,desc,col})=>(
              <div key={label} style={{padding:"12px 10px",borderRadius:10,background:`${col}0A`,border:`1px solid ${col}33`,display:"flex",flexDirection:"column",gap:4}}>
                <div style={{fontSize:18,color:col}}>{icon}</div>
                <div style={{fontSize:10,fontWeight:800,color:col,letterSpacing:"0.06em"}}>{label}</div>
                <div style={{fontSize:8,color:"rgba(255,255,255,0.45)",whiteSpace:"pre-line",lineHeight:1.5}}>{desc}</div>
              </div>
            ))}
          </div>
          <button onClick={()=>{setLaunched();setOverlayVisible(false);}} style={{width:"100%",padding:"14px 0",borderRadius:12,border:"none",background:"linear-gradient(90deg,#FF2D55,#FF9500)",color:"#fff",fontSize:14,fontWeight:900,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em"}}>Let&apos;s go!</button>
          <button onClick={()=>{setLaunched();setOverlayVisible(false);}} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.35)",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>Already know it →</button>
        </div>
      </div>
    )}

    {/* ── Tutorial overlay ── */}
    {showTour&&<TutorialOverlay onClose={()=>setShowTour(false)} themeName={themeName}/>}
    {/* ── Info overlay ── */}
    {showInfo&&(
      <div style={{position:"fixed",inset:0,zIndex:9997,background:"rgba(0,0,0,0.82)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px 12px",overflowY:"auto"}} onClick={()=>setShowInfo(false)}>
        <div onClick={e=>e.stopPropagation()} style={{width:"min(680px,98vw)",borderRadius:18,background:th.surface,border:"1px solid rgba(191,90,242,0.3)",boxShadow:"0 12px 60px rgba(0,0,0,0.8)",overflow:"hidden"}}>
          {/* Header */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid rgba(191,90,242,0.15)",background:"linear-gradient(90deg,rgba(191,90,242,0.08),transparent)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:26,height:26,borderRadius:8,background:"rgba(191,90,242,0.2)",border:"1px solid rgba(191,90,242,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,color:"#BF5AF2",fontStyle:"italic"}}>?</div>
              <div>
                <div style={{fontSize:11,fontWeight:900,color:"#BF5AF2",letterSpacing:"0.12em"}}>USER GUIDE</div>
                <div style={{fontSize:8,color:th.faint,letterSpacing:"0.06em"}}>Kick & Snare — Drum Experience</div>
              </div>
            </div>
            <button onClick={()=>setShowInfo(false)} style={{width:28,height:28,border:"1px solid rgba(255,255,255,0.12)",borderRadius:6,background:"transparent",color:th.dim,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          {/* Sections */}
          <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:18}}>
            {([
              {title:"Header",color:"#FF9500",icon:"🎸",items:[
                {key:"K (logo)",desc:"Icon that pulses on every downbeat — shows that audio is active."},
                {key:"◀ Kit ▶",desc:"Switch between sound kits: 808 Classic, CR-78 Vintage, Kit 3, Kit 8. Each kit recolors all track sounds."},
                {key:"Mascot",desc:"Animated drummer that hits the drums matching active tracks. Bob speed and glow halo follow the BPM in real time."},
                {key:"↺ / ↻",desc:"Undo (Ctrl+Z) / Redo (Ctrl+Y) — up to 50 history steps on patterns."},
                {key:"? (this panel)",desc:"Displays this user guide. Click outside to close."},
                {key:"THEME",desc:"Toggle between dark and light theme. Purely visual preference."},
                {key:"LIVE PADS",desc:"Switch to Live Pads view: 8 colored pads playable by touch or keyboard for real-time performance."},
                {key:"SEQUENCER",desc:"Main view: TR-808 step sequencer. Place sounds on a 16 or 32-step grid."},
                {key:"⬡ EUCLIDIAN",desc:"Algorithmic Euclidean sequencer: distributes N hits across M steps with mathematical regularity (African rhythms, polymeters)."},
              ]},
              {title:"Transport",color:"#30D158",icon:"▶",items:[
                {key:"▶ / ■ (Space)",desc:"Start or stop playback. The green button pulses on every beat."},
                {key:"BPM — ‹ › or drag",desc:"Tempo in beats per minute (20–280). Click the arrows or drag vertically on the value."},
                {key:"TAP",desc:"Tap several times in rhythm to set the BPM automatically (TAP TEMPO)."},
                {key:"SWING",desc:"Shifts even steps to create a shuffled groove (0 = rigid, 100% = maximum swing)."},
                {key:"4/4 (time sig)",desc:"Choose the time signature: 4/4, 3/4, 6/8, 5/4, 7/8, etc. Groups steps into corresponding bars."},
                {key:"METRO",desc:"Enable the audio metronome. Adjust volume and subdivision in the transport bar."},
                {key:"VOL",desc:"Global master volume. Drag vertically to adjust."},
                {key:"CLEAR",desc:"Clear all steps from all tracks in the current pattern."},
                {key:"KEYS",desc:"Show keyboard mappings: each track has an assigned key for live play."},
                {key:"MIDI",desc:"Configure MIDI notes per track and enable MIDI Learn. Connect a controller to trigger tracks."},
                {key:"SHARE / WAV",desc:"SHARE copies a URL encoding the full pattern. WAV exports audio as a 16-bit PCM file."},
              ]},
              {title:"Tracks — Sequencer",color:"#FF2D55",icon:"◆",items:[
                {key:"Step — click/tap",desc:"Toggle a sound on or off at that position. The grid plays left to right."},
                {key:"Step — drag ↕",desc:"Adjust step velocity (hit volume). Up = louder, down = softer."},
                {key:"Step — drag ↔",desc:"Nudge: shift the hit slightly early or late (independent micro-swing per step)."},
                {key:"Step — long-press",desc:"Open the probability setting (0–100%). The sound fires randomly at that percentage."},
                {key:"Step — double-tap",desc:"Reset step to default values (velocity 100, nudge 0, probability 100%)."},
                {key:"M (mute)",desc:"Silently mute the track without clearing steps. Useful for live arrangements."},
                {key:"S (solo)",desc:"Isolate the track: all others are muted. Click again to return."},
                {key:"CLR",desc:"Clear all steps from this track only."},
                {key:"J (Jump)",desc:"Shift all steps one position to the right (pattern rotation)."},
                {key:"16st / 32st",desc:"Individual track length (can differ from others — polymetric)."},
                {key:"VOL / PAN / PITCH",desc:"Per-track controls: volume, stereo pan, pitch in semitones."},
                {key:"REV send",desc:"Send the track to the global reverb (FX Rack)."},
                {key:"+ ADD TRACK",desc:"Create an extra custom track with a loadable sample."},
              ]},
              {title:"FX Rack global",color:"#BF5AF2",icon:"⚙",items:[
                {key:"PRESETS",desc:"Load a genre preset (Trap, Boom Bap, Techno, Lo-Fi, Afro…) that configures all FX at once."},
                {key:"CHAIN (drag / ←→)",desc:"Reorder the Master Bus series chain: Drive → Comp → Filter in any order."},
                {key:"PRE / POST",desc:"Choose whether the send FX (reverb, delay…) receives the signal before or after the series chain."},
                {key:"REVERB",desc:"Algorithmic reverb (Plate/Room/Hall). Decay = tail length, Size = room size. SendRow = tracks sent."},
                {key:"DELAY",desc:"Stereo echo. BPM-synced or free time. Feedback = number of repeats."},
                {key:"CHORUS",desc:"Timbre doubling via light modulation. Rate = speed, Depth = amount."},
                {key:"FLANGER",desc:"Metallic phasing effect. Rate, Depth, Feedback. Sent per selected track."},
                {key:"PING-PONG",desc:"Delay that bounces left↔right. BPM sync available."},
                {key:"FILTER",desc:"Master LP/HP/BP filter. Optional LFO (sine/triangle/square) for auto-wah."},
                {key:"COMP + GR",desc:"Master compressor. GR meter shows gain reduction in real time."},
                {key:"DRIVE",desc:"Master saturation (4 modes: tube/tape/triangle/bit-crush)."},
                {key:"TRANSIENT",desc:"Per-track ATK/SUS shaper: boost or cut attack and body independently."},
              ]},
              {title:"Pattern Bank",color:"#64D2FF",icon:"◧",items:[
                {key:"PAT 1–8",desc:"Pattern slots. Tap to switch. Long-press to rename."},
                {key:"16 / 32 steps",desc:"Change the global step count for the current pattern (affects all tracks)."},
                {key:"TEMPLATES",desc:"Load a preset pattern: 808, Trap, Jazz Brushes, Afrobeat, etc. Inserts into the current slot."},
                {key:"DUP",desc:"Duplicate the current pattern into the next available slot."},
              ]},
              {title:"Song Arranger",color:"#FF9500",icon:"♪",items:[
                {key:"Add a pattern",desc:"Select a pattern slot and click + to add it to the playback chain."},
                {key:"Reorder",desc:"Drag chain blocks to rearrange song sections."},
                {key:"SONG mode",desc:"Plays the full chain in order — for composing a complete song."},
              ]},
              {title:"Looper",color:"#BF5AF2",icon:"⊙",items:[
                {key:"⏺ REC",desc:"Start recording free play (keyboard, MIDI, pads). Everything you play is captured."},
                {key:"▶ PLAY / ■ STOP",desc:"Play or stop the recorded loop continuously."},
                {key:"OVERDUB",desc:"Record over the current loop without erasing it."},
                {key:"BARS (1/2/4)",desc:"Loop duration in bars. Set before recording."},
                {key:"QUANT + APPLY",desc:"Select a subdivision (1/4, 1/8, 1/16, 1/32) then click APPLY to snap all hits."},
                {key:"AUTO-Q",desc:"Auto-quantizes each hit at the moment of recording."},
                {key:"Drag bars",desc:"Move a recorded hit horizontally on the timeline. Auto-snaps to 1/16."},
                {key:"↺ UNDO",desc:"Undo the last recording pass."},
                {key:"✕ CLEAR",desc:"Clear the entire loop."},
                {key:"⬇ WAV",desc:"Export the loop as a WAV file. Choose 1×, 2× or 4× repetitions."},
              ]},
              {title:"Euclidean Sequencer",color:"#FFD60A",icon:"⬡",items:[
                {key:"N (hits)",desc:"Number of sounds to distribute across the cycle."},
                {key:"M (steps)",desc:"Cycle length (number of subdivisions)."},
                {key:"Offset",desc:"Shifts the starting point of the Euclidean pattern (rotation)."},
                {key:"Polyrhythm presets",desc:"12 presets from musical traditions worldwide (Clave, Bembé, Tresillo…)."},
                {key:"EDIT (detail view)",desc:"Shows the generated Euclidean pattern and allows manual step-by-step editing."},
              ]},
              {title:"Live Pads",color:"#5E5CE6",icon:"⊞",items:[
                {key:"Colored pads",desc:"Play each track in real time. Velocity-sensitive (longer hold = louder on release)."},
                {key:"Keyboard shortcuts",desc:"Each track has an assigned key (Q, S, D, F, G, H, J, K by default — see KEYS)."},
                {key:"REC + pads",desc:"Enable REC to capture your hits into the sequencer or looper."},
              ]},
            ] as {title:string,color:string,icon:string,items:{key:string,desc:string}[]}[]).map(section=>(
              <div key={section.title}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
                  <span style={{fontSize:14,lineHeight:1}}>{section.icon}</span>
                  <span style={{fontSize:9,fontWeight:900,color:section.color,letterSpacing:"0.14em",textTransform:"uppercase"}}>{section.title}</span>
                  <div style={{flex:1,height:1,background:`linear-gradient(90deg,${section.color}33,transparent)`}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"4px 12px"}}>
                  {section.items.map(({key,desc})=>(
                    <div key={key} style={{display:"flex",gap:6,padding:"5px 8px",borderRadius:6,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.05)"}}>
                      <div style={{minWidth:90,maxWidth:90,flexShrink:0}}>
                        <span style={{fontSize:7.5,fontWeight:800,color:section.color,letterSpacing:"0.04em",lineHeight:1.3,wordBreak:"break-word"}}>{key}</span>
                      </div>
                      <div style={{fontSize:7.5,color:th.dim,lineHeight:1.45}}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{textAlign:"center",fontSize:7,color:th.faint,paddingTop:6,borderTop:"1px solid rgba(255,255,255,0.06)"}}>Click outside to close · Kick & Snare v9.0 — DRUM EXPERIENCE</div>
          </div>
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
              ["Space","Play / Stop"],
              ["Tap","Toggle step on/off"],
              ["Drag ↕ step","Set velocity"],
              ["Drag ↔ step","Nudge timing"],
              ["Long-press step","Set probability"],
              ["Double-tap step","Reset"],
              ["Swipe ← / →","Undo / Redo"],
              ["Long-press PAT","Rename pattern"],
              ["EUCLIDIAN → EDIT","Place hits visually"],
              ["VOL MASTER","Drag ↕ yellow bar (transport)"],
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

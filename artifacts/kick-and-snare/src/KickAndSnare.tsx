import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { DEFAULT_SAMPLES, b64toAB } from "./defaultSamples";
import { THEMES } from "./theme.js";
import { DrumSVG } from "./drumSVG.tsx";
import TransportBar from "./components/TransportBar.jsx";
import PatternBank from "./components/PatternBank.jsx";
import TrackRow from "./components/TrackRow.jsx";
import LooperPanel from "./components/LooperPanel.jsx";
import TutorialOverlay from "./components/TutorialOverlay.tsx";
import SampleLoaderModal from "./components/SampleLoaderModal.tsx";
import { useAppState } from "./hooks/useAppState.js";
import { usePanelTransition } from "./hooks/usePanelTransition";
import { KitBrowser, type UserKit, type SampleBankEntry } from "./components/KitBrowser.tsx";
import { KitComposer } from "./components/KitComposer.tsx";
import { idbPut, idbGet, idbDeleteKeysWithPrefix } from "./hooks/idbHelper.ts";
import { SEQUENCER_TEMPLATES } from "./sequencerTemplates.ts";
import { EUCLID_TEMPLATES, type EuclidTemplate } from "./euclidTemplates.ts";
import { isDrumKitIcon } from "./kitIcons";
import {
  TIME_SIGS, APP_VERSION, ALL_TRACKS, TRACKS, DEFAULT_ACTIVE, DEFAULT_KEY_MAP,
  DEFAULT_MIDI_NOTES, NOTE_NAMES, midiNoteName, MAX_PAT, NR, SEC_COL, CUSTOM_COLORS,
  mkE, mkN, mkV, mkP, mkR, DEFAULT_FX, DRUM_KITS, TEMPLATE_KITS, DELAY_DIVS, divToSec,
  type DrumKit,
} from "./constants";
import { engine } from "./engine";
const DRUM_KIT_IMG_SRC=`${import.meta.env.BASE_URL}drum-kit-icon.jpg`;

// ── TypeScript types ─────────────────────────────────────────────────────────
/** All built-in drum track IDs plus any custom track string. */
type TrackId = "kick" | "snare" | "hihat" | "clap" | "tom" | "ride" | "crash" | "perc" | string;

/** Pattern data: each key is a TrackId, value is an array of 0/1 step states. */
type StepMap = Record<TrackId, number[]>;

/** Per-track FX + synthesis shape configuration object. */
type FxConfig = {
  vol: number; pan: number; pitch: number; onPitch: boolean;
  rev: number; dly: number;
  fType: string; cut: number; res: number; onFilter: boolean;
  drive: number; driveMode: string; onDrive: boolean;
  crush: number; cThr: number; cRat: number; onComp: boolean;
  rMix: number; rDecay: number; onReverb: boolean;
  dMix: number; dTime: number; dSync: boolean; dDiv: string; onDelay: boolean;
  sDec: number; sTune: number; sPunch: number; sSnap: number; sBody: number; sTone: number;
  [key: string]: unknown;
};

/** Resolved theme object (dark or daylight). */
type Theme = typeof THEMES.dark;
// ────────────────────────────────────────────────────────────────────────────

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

// ── Kit persistence helpers ───────────────────────────────────────────────────
const USER_KITS_META_KEY='ks_user_kits_meta';
function saveUserKitsMeta(kits:UserKit[]):void{
  try{localStorage.setItem(USER_KITS_META_KEY,JSON.stringify(kits));}catch(e){console.warn('kit meta save failed',e);}
}
function loadUserKitsMeta():UserKit[]{
  try{return JSON.parse(localStorage.getItem(USER_KITS_META_KEY)||'[]');}catch{return [];}
}
// Converts an AudioBuffer to a WAV ArrayBuffer (re-uses encodeWAV above)
function bufferToWAVArrayBuffer(buf:AudioBuffer):ArrayBuffer{return encodeWAV(buf);}
// Pure utility — SVG waveform path from AudioBuffer (module-level so loadUserKit can use it)
function miniWaveformPathUtil(buffer:AudioBuffer,w:number,h:number):string{
  const data=buffer.getChannelData(0);const step=Math.max(1,Math.ceil(data.length/w));let d='';
  for(let x=0;x<w;x++){let mn=1,mx=-1;for(let j=0;j<step&&x*step+j<data.length;j++){const v=data[x*step+j];if(v<mn)mn=v;if(v>mx)mx=v;}d+=`M${x},${(((1+mn)/2)*h).toFixed(1)}L${x},${(((1+mx)/2)*h).toFixed(1)}`;}
  return d;
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

/**
 * Euclidean rhythm generator — Front/Back grouping method.
 * From Toussaint (2005) "The Euclidean Algorithm Generates Traditional Musical Rhythms".
 *
 * Distributes `hits` onsets as evenly as possible across `steps` positions.
 * Uses iterative pairing of front and back groups (same logic as Euclid's GCD).
 *
 * Tested: 0 failures on 300 combinations (hits 0..24, steps 1..24).
 * Verified against paper: E(3,8)=tresillo, E(5,8)=cinquillo, E(7,16)=samba.
 */
function euclidRhythm(hits: number, steps: number): number[] {
  if (steps <= 0) return [];
  if (hits <= 0) return Array(steps).fill(0);
  if (hits >= steps) return Array(steps).fill(1);

  // Initialize: front group = pulses [1], back group = rests [0]
  let front: number[][] = Array.from({ length: hits }, () => [1]);
  let back: number[][] = Array.from({ length: steps - hits }, () => [0]);

  // Iteratively pair front and back groups until back has 0 or 1 element
  while (back.length > 1) {
    const pairs = Math.min(front.length, back.length);
    const newFront: number[][] = [];
    for (let i = 0; i < pairs; i++) {
      newFront.push([...front[i], ...back[i]]);
    }
    const remainFront = front.slice(pairs);
    const remainBack = back.slice(pairs);
    front = newFront;
    back = remainFront.length > 0 ? remainFront : remainBack;
    if (back.length === 0) break;
  }

  // Flatten all groups into a single pattern
  return [...front, ...back].flat();
}

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
  const [open,setOpen]=useState(true);
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
    <div style={{marginBottom:8,borderRadius:10,background:th.surface,border:`1px solid rgba(191,90,242,0.2)`,overflow:'hidden'}}>
      {/* Compact header — no toggle, always open */}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',userSelect:'none',borderBottom:`1px solid ${th.sBorder}`}}>
        <svg ref={specRef} width={60} height={16} style={{flexShrink:0,borderRadius:3,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}/>
        {(['reverb','delay','filter','comp','drive','chorus','flanger','pingpong'] as const).filter(s=>gfx[s]?.on).map(s=>{
          const cols:Record<string,string>={reverb:'#64D2FF',delay:'#30D158',filter:'#FF9500',comp:'#5E5CE6',drive:'#FF6B35',chorus:'#5E5CE6',flanger:'#FF375F',pingpong:'#FFD60A'};
          const c=cols[s]||'#fff';
          return<span key={s} style={{fontSize:7,padding:'1px 5px',borderRadius:3,background:c+'1a',color:c,fontWeight:700,letterSpacing:'0.08em'}}>{s==='pingpong'?'P-P':s.slice(0,3).toUpperCase()}</span>;
        })}
        <div style={{flex:1}}/>
        <button data-hint={activeCount===0?"BYPASS · All global effects are disabled":"BYPASS ALL · Disable all global effects in one click · Useful for comparing dry/wet"}
          onClick={e=>{
            e.stopPropagation();
            setGfx(p=>{
              const anyOn=['reverb','delay','filter','comp','drive','chorus','flanger','pingpong'].some(k=>p[k]?.on);
              if(!anyOn)return p;
              const ng=JSON.parse(JSON.stringify(p));
              ['reverb','delay','filter','comp','drive','chorus','flanger','pingpong'].forEach(k=>{if(ng[k])ng[k].on=false;});
              return ng;
            });
          }}
          style={{padding:'2px 7px',borderRadius:4,border:`1px solid ${activeCount>0?'rgba(255,45,85,0.35)':th.sBorder}`,
            background:activeCount>0?'rgba(255,45,85,0.07)':'transparent',
            color:activeCount>0?'#FF2D55':th.faint,
            fontSize:7,fontWeight:activeCount>0?800:400,cursor:activeCount>0?'pointer':'default',
            fontFamily:'inherit',letterSpacing:'0.08em',flexShrink:0,opacity:activeCount>0?1:0.35}}>
          BYPASS
        </button>
        <button data-hint={showPresets?"Close FX presets":"PRESETS · Load a complete effects configuration"} onClick={e=>{e.stopPropagation();setShowPresets(p=>!p);}}
          style={{padding:'2px 7px',borderRadius:4,border:`1px solid ${showPresets?'#BF5AF255':th.sBorder}`,background:showPresets?'rgba(191,90,242,0.12)':'transparent',color:showPresets?'#BF5AF2':th.dim,fontSize:7,fontWeight:showPresets?800:400,cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.08em',flexShrink:0}}>
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

      <>
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
      </>
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
  const [bpm,setBpm]=useState(90);const [playing,setPlaying]=useState(false);const [cStep,setCStep]=useState(-1);
  const [swing,setSwing]=useState(0);const [muted,setMuted]=useState({});const [soloed,setSoloed]=useState(null);
  const [view,setView]=useState("pads");const [act,setAct]=useState(DEFAULT_ACTIVE);const [showAdd,setShowAdd]=useState(false);
  const [showPadsWelcome,setShowPadsWelcome]=useState(true);
  const [showSeqWelcome,setShowSeqWelcome]=useState(true);
  const [showEuclidWelcome,setShowEuclidWelcome]=useState(true);
  const [customTracks,setCustomTracks]=useState([]);
  const [newTrackName,setNewTrackName]=useState("");const [showCustomInput,setShowCustomInput]=useState(false);
  const [selectedCustomColor,setSelectedCustomColor]=useState<string|null>(null);
  const [euclidParams,setEuclidParams]=useState({});
  const [smpN,setSmpN]=useState({kick:"KICK · 808 [sample]",snare:"SNARE · 808 [sample]",hihat:"HI-HAT · 808 [sample]",clap:"CLAP · 808 [sample]",tom:"TOM · 808 [sample]",ride:"RIDE · 808 [sample]",crash:"CRASH · 808 [sample]",perc:"PERC · 808 [sample]"});
  const [fx,setFx]=useState(Object.fromEntries(TRACKS.map(t=>[t.id,{...DEFAULT_FX}])));
  const [kitIdx,setKitIdx]=useState(0);
  const kitIdxRef=useRef(0);kitIdxRef.current=kitIdx;
  // Pre-fetched ArrayBuffers for kit 808 (fetch on mount, decode when AudioContext is ready)
  const preloadedABRef=useRef<Record<string,ArrayBuffer>>({});
  const [showKitBrowser,setShowKitBrowser]=useState(false);
  const [showKitComposer,setShowKitComposer]=useState(false);
  const [userKits,setUserKits]=useState<UserKit[]>(()=>loadUserKitsMeta());
  const [activeKitId,setActiveKitId]=useState<string|null>(DRUM_KITS[0]?.id||null);
  const [userKitLabelOverride,setUserKitLabelOverride]=useState<Record<string,string>>({});
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
  // Prefetch 808 WAV files immediately on mount (no AudioContext needed — just fetch)
  useEffect(()=>{
    const kit808=DRUM_KITS[0];
    if(!kit808)return;
    const ks=(kit808 as any).samples as Record<string,string>;
    Object.entries(ks).forEach(([tid,url])=>{
      if(!url)return;
      fetch(url).then(r=>r.arrayBuffer()).then(ab=>{preloadedABRef.current[tid]=ab;}).catch(()=>{});
    });
  },[]);

  useEffect(()=>{
    if(!isAudioReady)return;
    (async()=>{
      // engine.init() is idempotent — creates AudioContext if not yet done
      await engine.init();
      engine.uGfx(gfxRef.current);
      engine.updateReverb(gfxRef.current.reverb?.decay??1.5,gfxRef.current.reverb?.size??0.5,gfxRef.current.reverb?.type||'room');
      // Auto-load 808 samples immediately on first audio activation
      if(kitIdxRef.current>=0){
        const fk=DRUM_KITS[kitIdxRef.current];
        if(fk&&engine.ctx){
          const ks=(fk as any).samples as Record<string,string>;
          await Promise.all(Object.entries(ks).map(async([tid,url])=>{
            if(!url)return;
            const pre=preloadedABRef.current[tid];
            try{
              const decoded=pre
                ?await engine.ctx!.decodeAudioData(pre.slice(0))
                :await (engine.loadUrl(tid,url).then(()=>(engine.buf as any)[tid]));
              if(decoded)(engine.buf as any)[tid]=decoded;
            }catch{
              engine.loadUrl(tid,url).catch(()=>{});
            }
          }));
          setSmpN(prev=>{
            const next={...prev};
            ALL_TRACKS.forEach(tr=>{if(ks[tr.id])next[tr.id]=`${tr.label} · ${fk.name} [sample]`;});
            return next;
          });
        }
      }
    })();
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
  // Song arranger — 2D grid: rows of 16 slots, each slot is pattern index or null
  const [songRows,setSongRows]=useState<(number|null)[][]>([[...Array(16).fill(null)]]);
  const [songMode,setSongMode]=useState(false);
  const [showSong,setShowSong]=useState(false);
  const songPosRef=useRef(0);
  const cPatLocked=useRef(false); // true = user has manually pinned an edit-pat while song plays

  // Helper: flat number[] → (number|null)[][] rows of 16
  const toSongRows=(flat:number[],rowLen=16)=>{
    if(!flat?.length)return[[...Array(rowLen).fill(null)]];
    const rows:(number|null)[][]=[];
    for(let i=0;i<flat.length;i+=rowLen){
      const row=[...flat.slice(i,i+rowLen)] as (number|null)[];
      while(row.length<rowLen)row.push(null);
      rows.push(row);
    }
    return rows;
  };
  // Flat array for scheduler (null slots excluded)
  const songChain=(songRows.flat().filter(v=>v!=null)) as number[];

  // ── Per-view independent snapshots ──
  // Each view (sequencer / euclid) owns its own pBank + cPat + song state.
  // Switching saves the outgoing state and restores the incoming state — no copy.
  const seqSnap=useRef<{pBank:any[],cPat:number,songRows:(number|null)[][],songMode:boolean}>({
    pBank:[mkE(16)], cPat:0, songRows:[[...Array(16).fill(null)]], songMode:false,
  });
  const euclidSnap=useRef<{pBank:any[],cPat:number}>({
    pBank:[mkE(16)], cPat:0,
  });
  // Tracks which view was active when entering pads — keeps the scheduler in the right branch
  const padSrcViewRef=useRef<string>("sequencer");

  const switchView=(nextView:string)=>{
    if(view===nextView)return;
    const fromPads=view==="pads";
    const toPads=nextView==="pads";

    // ── Stop ONLY on direct seq↔euclid; never when pads is involved (either side) ──
    if(!fromPads&&!toPads&&R.playing){_stopScheduler();setPlaying(false);setCStep(-1);R.step=-1;}
    // ── Metro: disable only on seq↔euclid when not playing ──
    if(!fromPads&&!toPads&&!R.playing)setMetro(false);

    if(toPads){
      // ── Record which view we're coming from (scheduler needs it) ──
      padSrcViewRef.current=view;
      // ── Save current view's state before entering pads ──
      if(view==="sequencer") seqSnap.current={pBank,cPat,songRows,songMode};
      else if(view==="euclid") euclidSnap.current={pBank,cPat};
      // act stays untouched — pads show exactly the same tracks as the source view
    } else if(fromPads){
      const crossView=nextView!==padSrcViewRef.current;
      if(crossView&&R.playing){_stopScheduler();setPlaying(false);setCStep(-1);R.step=-1;}
      if(crossView){
        // ── Different source → restore the target view's saved state ──
        if(nextView==="euclid"){
          const snap=euclidSnap.current;
          setPBank(snap.pBank);setCPat(snap.cPat);R.pat=snap.pBank[snap.cPat]??mkE(16);
          setSongMode(false);setSongRows([[...Array(16).fill(null)]]);songPosRef.current=0;
        } else if(nextView==="sequencer"){
          const snap=seqSnap.current;
          setPBank(snap.pBank);setCPat(snap.cPat);R.pat=snap.pBank[snap.cPat]??mkE(STEPS);
          setSongMode(snap.songMode);setSongRows(snap.songRows??[[...Array(16).fill(null)]]);songPosRef.current=0;
        }
      }
      // act stays untouched — deletions made in pads persist across all views
    } else {
      // ── Direct seq↔euclid: reset to fresh (no continuity) ──
      if(nextView==="euclid"){
        const fresh=[mkE(16)];
        // Re-apply euclidParams into the fresh pBank so the scheduler sees the correct
        // patterns immediately — without this, R.pat contains all-zeros until the user
        // moves a control (triggering applyE), causing silent beats from the start.
        const ep=euclidParams;
        Object.entries(ep).forEach(([tid,p])=>{
          const N=(p as any).N||16;const h=(p as any).hits||0;const rot=(p as any).rot||0;
          if(h>0){
            const raw=euclidRhythm(h,N);
            const r2=((rot%Math.max(N,1))+Math.max(N,1))%Math.max(N,1);
            const rotated=[...raw.slice(r2),...raw.slice(0,r2)].map(v=>v?100:0);
            fresh[0][tid]=rotated;
            if(!fresh[0]._steps)fresh[0]._steps={};
            (fresh[0]._steps as Record<string,number>)[tid]=N;
          }
        });
        setPBank(fresh);setCPat(0);R.pat=fresh[0];
        setSongMode(false);setSongRows([[...Array(16).fill(null)]]);songPosRef.current=0;
      } else if(nextView==="sequencer"){
        const fresh=[mkE(STEPS)];setPBank(fresh);setCPat(0);R.pat=fresh[0];
        setSongMode(false);setSongRows([[...Array(16).fill(null)]]);songPosRef.current=0;
      }
    }
    setView(nextView);
  };
  // Session
  // UI
  const [rec,setRec]=useState(false);const [kMap,setKMap]=useState({...DEFAULT_KEY_MAP});const [showK,setShowK]=useState(false);
  // ── lastSeqView: tracks which sequencer view (sequencer|euclid) was most recently active ──
  const [lastSeqView,setLastSeqView]=useState<'sequencer'|'euclid'>('sequencer');
  useEffect(()=>{if(view==='sequencer'||view==='euclid')setLastSeqView(view as 'sequencer'|'euclid');},[view]);
  // ── Per-pattern velocity: stVel ↔ pBank[cPat]._vel ──────────────────────────
  // stVel is global; we sync it per-pattern so randomize/drag only affects cPat.
  const _velFromSwitch=useRef(false);
  // When cPat changes, restore that pattern's saved velocity (if any)
  useEffect(()=>{
    const saved=(R.pb[cPat] as any)?._vel;
    if(saved&&Object.keys(saved).length>0){_velFromSwitch.current=true;setStVel({...saved});}
  },[cPat]);
  // When stVel changes, debounce-save to pBank[cPat]._vel (skip if from cPat switch)
  const _velSaveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{
    if(_velFromSwitch.current){_velFromSwitch.current=false;return;}
    if(_velSaveTimer.current)clearTimeout(_velSaveTimer.current);
    const snapPat=cPat;const snapVel=stVel;
    _velSaveTimer.current=setTimeout(()=>{
      setPBank(pb=>{const n=[...pb];n[snapPat]={...n[snapPat],_vel:{...snapVel}};return n;});
    },200);
    return()=>{if(_velSaveTimer.current)clearTimeout(_velSaveTimer.current);};
  },[stVel]);
  // ── velRange: min/max for random velocity ──
  const [velRange,setVelRange]=useState<{min:number,max:number}>({min:40,max:100});
  // ── H.3: recPadsVisible — kept for compat, no longer drives visibility ──
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [recPadsVisible,_setRecPadsVisible]=useState(false);
  const silentTracksRef=useRef<Set<string>>(new Set());
  const [showTS,setShowTS]=useState(false);
  const [flashing,setFlashing]=useState<Set<string>>(()=>new Set());
  const flashTimers=useRef<Record<string,ReturnType<typeof setTimeout>>>({});
  // Tracks which pad tids are currently held — prevents retap-erase re-trigger on long-press
  const padHeldRef=useRef<Set<string>>(new Set());
  // Race-condition guard for loadUserKit — incremented on each new load request
  const loadEpochRef=useRef(0);
  // Preview node for KitComposer sample previews
  const previewNodeRef=useRef<AudioBufferSourceNode|null>(null);
  const [velPicker,setVelPicker]=useState(null);
  // ── CP-I states ──
  const [euclidEditMode,setEuclidEditMode]=useState(false);
  const [euclidTouchFeedback,setEuclidTouchFeedback]=useState<{tid:string,step:number}|null>(null);
  const [swipeToast,setSwipeToast]=useState<string|null>(null);
  const [masterVol,setMasterVol]=useState(()=>appState.state.masterVol??80);
  const [patNameEdit,setPatNameEdit]=useState<number|null>(null);
  // ── Sample modal + pad FX ──
  const [sampleModalOpen,setSampleModalOpen]=useState(false);
  const [sampleModalTrack,setSampleModalTrack]=useState('');
  const [padFxTrack,setPadFxTrack]=useState<string|null>(null);
  const [padFxTab,setPadFxTab]=useState<string>('REV');
  // ── CP-F states ──
  const [showLooper,setShowLooper]=useState(false);
  const [showPerform,setShowPerform]=useState(false);
  const [showFxRack,setShowFxRack]=useState(false);
  const [stutterDiv,setStutterDiv]=useState<'1/4'|'1/4t'|'1/8'|'1/8t'|'1/16'|'1/32'>('1/8');
  const [perfTrack,setPerfTrack]=useState<string>('');
  const [waveformCache,setWaveformCache]=useState<Record<string,string>>({});
  const stutterRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const lastTrigRef=useRef<string>('');
  const perfTrackRef=useRef<string>('');
  const perfSwipeRef=useRef<{startX:number,startIdx:number}|null>(null);
  const perfRvHold=useRef(false);
  const perfDlHold=useRef(false);
  const perfRvPrevRef=useRef<{mix:number,decay:number,sends?:Record<string,number>}|null>(null);
  const perfDlPrevRef=useRef<{mix:number,time:number,fb:number,sends?:Record<string,number>}|null>(null);
  const filterPosRef=useRef<Record<string,{x:number,y:number}>>({});
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
  const _akRef=useRef<string>('');const _kiRef=useRef<number>(0);const _smRef=useRef<Record<string,string>>({});const _ctRef=useRef<any[]>([]);const _acRef=useRef<string[]>([]);const _ukRef=useRef<UserKit[]>([]);
  const linkBpmSentAt=useRef(0); // timestamp of last BPM we sent to Carabiner
  // Euclid polyrhythm — single global clock (all tracks advance in lock-step)
  const euclidGlobalRef=useRef<{nextTime:number|null,globalTick:number}>({nextTime:null,globalTick:0});
  // Write buffer for audio thread; display state for React re-render (one per scheduler tick)
  const euclidCurRef=useRef<Record<string,number>>({});
  const [euclidCurDisplay,setEuclidCurDisplay]=useState<Record<string,number>>({});
  const euclidMetroR=useRef<any>({nextTime:null,beat:0});
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

  const allT=useMemo(()=>[...ALL_TRACKS,...customTracks],[customTracks]);
  const _kitLbl=kitIdx>=0?((DRUM_KITS[kitIdx] as any)?.labels??{}):userKitLabelOverride;
  const atO=useMemo(()=>act.map(id=>{const t=allT.find(t=>t.id===id);if(!t)return null;const ov=_kitLbl[id];return ov?{...t,label:ov}:t;}).filter(Boolean),[act,allT,_kitLbl]);
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

  // In song mode, scheduler always plays R.cp (not the editor's cPat which may be different)
  R.pat=(playing&&songMode)?(R.pb?.[R.cp]??pat):pat;
  R.mut=muted;        // muted track map — scheduler skips muted tracks
  R.sol=soloed;       // soloed track id — scheduler enforces solo
  R.fx=fx;            // per-track FX config — passed to engine.play() on each hit
  R.sn=stNudge;       // nudge offsets — scheduler shifts step timing by ±ms
  R.vel=stVel;        // velocity per step — scheduler scales engine gain (0–100)
  R.at=act;           // active track IDs — scheduler and MIDI iterate this list
  R.pb=pBank;         // full pattern bank — song arranger reads all patterns
  R.playing=playing;  // playback state — avoids stale closure on play/stop toggle
  // In song mode with cPatLocked (user editing a different pattern), keep R.cp at the
  // scheduler's position (written directly at lines ~1610/1640) rather than following cPat.
  if(!(playing&&songMode&&cPatLocked.current)) R.cp=cPat;
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
  // R.view  = scheduler branch ("euclid" or "sequencer"). When in pads, use the source view
  //           so the background pattern plays identically to what was running before.
  // R.uiView = actual UI view — used for REC routing, Space key, free-capture routing.
  R.uiView=view;
  R.view=view==="pads"?(padSrcViewRef.current||"sequencer"):view;
  R.songMode=songMode;     // song chain active — scheduler advances pattern list
  R.songChain=songChain;   // flat ordered pattern indices (nulls excluded) — song mode iteration
  R.ts=trackSteps;         // per-track step count overrides — scheduler wrap point
  R.lkSync=linkSyncPlay;   // Ableton Link sync-on-play — start on beat boundary
  R.loopRec=false;          // LOOPER DISABLED
  R.silentTracks=silentTracksRef.current; // tracks with no sample in user kit → no sound
  // R.loopBars=loopBars;  // LOOPER DISABLED
  R.lastSeqView=lastSeqView; // E3: last active sequencer view for pads REC indicator
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
      // ── Per-track FX CC (prefix fx_*_tid) ──
      if(mapped?.startsWith('fx_pitch_on_')){const tid=mapped.slice(12);if(byte2>0)R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),onPitch:!(p[tid]?.onPitch??false)}}));return;}
      if(mapped?.startsWith('fx_pitch_')){const tid=mapped.slice(9);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),pitch:Math.round(byte2/127*24-12)}}));return;}
      if(mapped?.startsWith('fx_flt_on_')){const tid=mapped.slice(10);if(byte2>0)R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),onFilter:!(p[tid]?.onFilter??false)}}));return;}
      if(mapped?.startsWith('fx_cut_')){const tid=mapped.slice(7);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),cut:Math.round(80+Math.pow(byte2/127,2)*19920)}}));return;}
      if(mapped?.startsWith('fx_res_')){const tid=mapped.slice(7);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),res:+(byte2/127*20).toFixed(1)}}));return;}
      if(mapped?.startsWith('fx_drv_on_')){const tid=mapped.slice(10);if(byte2>0)R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),onDrive:!(p[tid]?.onDrive??false)}}));return;}
      if(mapped?.startsWith('fx_drv_')){const tid=mapped.slice(7);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),drive:Math.round(byte2/127*100)}}));return;}
      if(mapped?.startsWith('fx_rev_on_')){const tid=mapped.slice(10);if(byte2>0)R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),onReverb:!(p[tid]?.onReverb??false)}}));return;}
      if(mapped?.startsWith('fx_rmix_')){const tid=mapped.slice(8);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),rMix:Math.round(byte2/127*100)}}));return;}
      if(mapped?.startsWith('fx_rdec_')){const tid=mapped.slice(8);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),rDecay:+(0.1+byte2/127*5.9).toFixed(2)}}));return;}
      if(mapped?.startsWith('fx_rsz_')){const tid=mapped.slice(7);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),rSize:+(byte2/127).toFixed(3)}}));return;}
      if(mapped?.startsWith('fx_dly_on_')){const tid=mapped.slice(10);if(byte2>0)R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),onDelay:!(p[tid]?.onDelay??false)}}));return;}
      if(mapped?.startsWith('fx_dmix_')){const tid=mapped.slice(8);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),dMix:Math.round(byte2/127*100)}}));return;}
      if(mapped?.startsWith('fx_dtime_')){const tid=mapped.slice(9);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),dTime:+(0.01+byte2/127*1.89).toFixed(3)}}));return;}
      if(mapped?.startsWith('fx_dfdbk_')){const tid=mapped.slice(9);R.sFx?.(p=>({...p,[tid]:{...(p[tid]||{}),dFdbk:Math.round(byte2/127*95)}}));return;}
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
    // Court-circuit : joue immédiatement sans await.
    // play() gère ctx.resume() en interne si suspendu.
    // L'await est supprimé du chemin nominal (ctx running)
    // pour éliminer le saut de microtask queue.
    if(engine.ctx?.state!=='running'){
      // Contexte suspendu : on joue quand même.
      // play() appelle ctx.resume() sans await (ligne ~602).
      // Le son démarre dès que le contexte reprend.
      engine.ensureRunning().catch(()=>{});
    }
    if(!R.silentTracks?.has(tid)){
      engine.play(tid,vel,0,R.fx[tid]||{...DEFAULT_FX});
    }
    // animation & haptic always run, even for silent tracks
    lastTrigRef.current=tid;
    if(navigator.vibrate)setTimeout(()=>navigator.vibrate(15),0);
    if(flashTimers.current[tid])clearTimeout(flashTimers.current[tid]);
    setFlashing(s=>{const n=new Set(s);n.add(tid);return n;});
    flashTimers.current[tid]=setTimeout(()=>{setFlashing(s=>{const n=new Set(s);n.delete(tid);return n;});delete flashTimers.current[tid];},130);
    // LOOPER DISABLED
    // if(R.loopRec&&loopRef.current.audioStart!==null&&engine.ctx){
    //   const L=loopRef.current;
    //   const latSec=(engine.ctx.outputLatency||0)+(engine.ctx.baseLatency||0);
    //   const rawSec=engine.ctx.currentTime-L.audioStart-latSec;
    //   let tOff=((rawSec*1000)%L.lengthMs+L.lengthMs)%L.lengthMs;
    //   const snapThresh=Math.min(120,L.lengthMs*0.04);
    //   if(tOff>L.lengthMs-snapThresh)tOff=0;
    //   if(autoQRef.current&&L.lengthMs>0){const snapMs=L.lengthMs/(R.loopBars*16);tOff=Math.max(0,Math.min(L.lengthMs-snapMs,Math.round(tOff/snapMs)*snapMs));}
    //   const evId=`${Date.now()}-${Math.random()}`;
    //   const ev={id:evId,tid,tOff,vel,pass:L.passId};
    //   L.events.push(ev);setLoopDisp(d=>[...d,{tid,tOff,vel}]);
    // }
    // FREE-CAPTURE BPM DISABLED — conservé pour développement futur
    // if(R.uiView==='pads'&&!R.loopRec&&engine.ctx){ ... }
    // F.1b: REC mode with quantization snap + timing feedback + retap erase
    if(R.rec&&R.step>=0&&engine.ctx){
      const gSt=R.sig?.steps||16;
      const tSt=R.view==="euclid"?(R.ts?.[tid]||gSt):([gSt,gSt*2].includes(R.ts?.[tid])?R.ts[tid]:gSt);
      const ratio=Math.max(1,Math.round(tSt/gSt));
      // F.1b: lookahead-aware quantization — accounts for scheduler running ahead of audio time
      const bd=(60/R.bpm)*R.sig.beats/R.sig.steps;
      const sw=bd*(R.sw||0)/100*0.5;
      const curStepDur=R.step%2===0?(bd+sw):(bd-sw);
      const stepStart=nxtRef.current-curStepDur; // scheduled audio-time when R.step plays
      const offsetFromStart=engine.ctx.currentTime-stepStart; // <0 = still in lookahead buffer
      const stepsFromNow=Math.round(offsetFromStart/bd); // -1 at 90bpm, -2 at 180bpm, etc.
      const qStep=((R.step+stepsFromNow)%gSt+gSt)%gSt;
      // visual feedback: normalized offset within the actual nearest step
      const relOffset=(offsetFromStart%bd+bd)%bd;
      const snapRatio=relOffset/bd;
      const targetStep=ratio>1?qStep*ratio:qStep%tSt;
      // F.1c: timing feedback color
      const fbColor=snapRatio>=0.35&&snapRatio<=0.65?"#30D158":snapRatio>=0.2&&snapRatio<=0.8?"#FF9500":"#FF2D55";
      const fbLabel=snapRatio>=0.35&&snapRatio<=0.65?"✓":snapRatio>=0.2&&snapRatio<=0.8?"~":"!";
      setRecFeedback({step:targetStep,tid,color:fbColor,label:fbLabel});
      if(recFbTimerRef.current)clearTimeout(recFbTimerRef.current);
      recFbTimerRef.current=setTimeout(()=>{setRecFeedback(null);recFbTimerRef.current=null;},400);
      const v100=Math.max(1,Math.round(vel*100));
      // F.1d: always set (retap does NOT erase)
      setPBank(pb=>{const n=[...pb];const p={...n[R.cp]};p[tid]=[...p[tid]];p[tid][targetStep]=1;n[R.cp]=p;return n;});
      if(R.pat?.[tid]?.[targetStep]!==0)setStVel(sv=>({...sv,[tid]:{...(sv[tid]||{}),[targetStep]:v100}}));
    }
  },[]);
  R.trigPad=trigPad;
  // All tracks including custom (used by scheduler to iterate custom tracks)
  R.allT=allT;
  // Flash a pad in live-pads view at the correct audio-sync moment
  R.flashPad=(tid:string,aheadMs:number)=>{
    if(R.uiView!=="pads")return;
    setTimeout(()=>{
      if(flashTimers.current[tid])clearTimeout(flashTimers.current[tid]);
      setFlashing(s=>{const n=new Set(s);n.add(tid);return n;});
      flashTimers.current[tid]=setTimeout(()=>{setFlashing(s=>{const n=new Set(s);n.delete(tid);return n;});delete flashTimers.current[tid];},120);
    },Math.max(0,aheadMs));
  };
  const ssRef=useRef(null);const playRef=useRef(false);
  const recFbTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const autoPlayTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
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
      if(e.code==="Space"){e.preventDefault();if(R.uiView==="pads"){R.toggleLoopRec?.();}else{ssRef.current?.();}return;}
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
  // Worker-based scheduler: immune to iframe timer throttling by the browser
  const workerRef=useRef<Worker|null>(null);
  const schLoopRef=useRef<()=>void>(()=>{});

  const _stopScheduler=useCallback(()=>{
    if(workerRef.current){workerRef.current.postMessage({type:'stop'});workerRef.current.terminate();workerRef.current=null;}
    clearTimeout(schRef.current);schRef.current=null;
  },[]);

  const _startScheduler=useCallback((interval:number)=>{
    _stopScheduler();
    try{
      const blob=new Blob([
        'var id=null;self.onmessage=function(e){'+
        'if(e.data.type==="start"){if(id)clearInterval(id);id=setInterval(function(){self.postMessage("tick");},e.data.interval);}'+
        'else if(e.data.type==="stop"){if(id){clearInterval(id);id=null;}}};'
      ],{type:'text/javascript'});
      const url=URL.createObjectURL(blob);
      const w=new Worker(url);
      URL.revokeObjectURL(url);
      w.onmessage=()=>{if(R.playing)schLoopRef.current();};
      w.postMessage({type:'start',interval});
      workerRef.current=w;
    }catch{
      // Fallback: use drift-compensated setTimeout if Worker creation fails
      schRef.current=setTimeout(()=>schLoopRef.current(),interval);
    }
  },[_stopScheduler]);
  const schSt=useCallback((sn,time)=>{
    const p=R.pat,m=R.mut,s=R.sol,f=R.fx,nudge=R.sn,vel=R.vel,at=R.at;
    const prob=R.prob,ratch=R.ratch,cs=R.sig;
    const bd=(60/R.bpm)*(cs.beats||(cs.groups?.length||4))/cs.steps;
    const playTrStep=(tr,psn,ptime)=>{
      const stepProb=prob[tr.id]?.[psn]??100;
      if(Math.random()*100>=stepProb)return;
      if(R.silentTracks?.has(tr.id))return;
      if(p?.[tr.id]?.[psn]){
        const v=(vel[tr.id]?.[psn]??100)/100;
        const r=ratch[tr.id]?.[psn]||1;
        for(let ri=0;ri<r;ri++)engine.play(tr.id,v*(ri===0?1:0.65),(ri===0?(nudge[tr.id]?.[psn]||0):0),f[tr.id]||{...DEFAULT_FX},ptime+ri*(bd/r));
        if(R.flashPad){const _now=engine.ctx?.currentTime??ptime;R.flashPad(tr.id,Math.max(0,Math.round((ptime-_now)*1000)-4));}
      }
    };
    (R.allT||ALL_TRACKS).forEach(tr=>{
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
    if(!engine.ctx)return;const ct=engine.ctx.currentTime;let dirty=false;
    // H.1a: adaptive look-ahead + tick interval for mobile (from engine properties)
    const LA=engine._lookAhead;
    const schDelay=engine._schedInterval;
    if(R.view==="euclid"){
      const sixteenth=(60/R.bpm)/4;
      const at=R.at;const m=R.mut;const s=R.sol;

      // ── Horloge globale ancrée ───────────────────────────────────────────────
      // Une seule origine temporelle. Tous les sons = startTime + tick * sixteenth.
      // Garantit que les intervalles sont toujours des multiples entiers de sixteenth.
      const eg=euclidGlobalRef.current;
      if(eg.nextTime==null||eg.nextTime<ct-sixteenth){
        eg.nextTime=ct;
        eg.globalTick=0;
        const resetCur:Record<string,number>={};
        (R.allT||ALL_TRACKS).forEach(tr=>{resetCur[tr.id]=-1;});
        setEuclidCurDisplay(resetCur);
      }

      // ── Boucle de scheduling ─────────────────────────────────────────────────
      const eLA=Math.max(LA,0.20); // 200ms minimum — absorbe les délais React
      const curSnapshot:Record<string,number>={...euclidCurRef.current};

      while(eg.nextTime<ct+eLA){
        const tickTime=eg.nextTime;
        const globalTick=eg.globalTick;

        (R.allT||ALL_TRACKS).forEach(tr=>{
          if(!at.includes(tr.id))return;
          if(s&&s!==tr.id)return;
          if(m[tr.id])return;
          const N=R.pb[R.cp]?._steps?.[tr.id]||(R.pat?.[tr.id]?.length)||16;
          if(N<=0)return;
          // Polyrhythme : chaque piste lit son propre index dans le cycle global
          const stepIndex=globalTick%N;
          curSnapshot[tr.id]=stepIndex;
          if(R.pat?.[tr.id]?.[stepIndex]){
            const sp=R.prob[tr.id]?.[stepIndex]??100;
            if(Math.random()*100<sp){
              const v=(R.vel[tr.id]?.[stepIndex]??100)/100;
              const r=R.ratch[tr.id]?.[stepIndex]||1;
              const nd=R.sn[tr.id]?.[stepIndex]||0;
              for(let ri=0;ri<r;ri++)
                engine.play(tr.id,v*(ri===0?1:0.65),ri===0?nd:0,R.fx[tr.id]||{...DEFAULT_FX},tickTime+ri*(sixteenth/r));
              R.flashPad?.(tr.id,Math.max(0,Math.round((tickTime-ct)*1000)-4));
            }
          }
        });

        eg.globalTick++;
        eg.nextTime=eg.nextTime+sixteenth; // addition directe — jamais accumulée depuis 0
        dirty=true;
      }

      // Mise à jour visuelle des aiguilles — une seule fois par tick scheduler
      if(dirty){
        euclidCurRef.current=curSnapshot;
        setEuclidCurDisplay({...curSnapshot});
      }

      // ── Song mode ──────────────────────────────────────────────────────────────
      {
        const em2=euclidMetroR.current;
        if(!em2.songNextTime||em2.songNextTime<ct-0.5){em2.songNextTime=ct+0.05;em2.songGlobalStep=0;}
        const barSteps=R.sig?.steps||16;
        while(em2.songNextTime<ct+LA){
          const prev=em2.songGlobalStep??0;
          em2.songGlobalStep=(prev+1)%barSteps;
          if(em2.songGlobalStep===0&&prev>=0&&R.songMode&&R.songChain?.length>0){
            songPosRef.current=(songPosRef.current+1)%R.songChain.length;
            const nextPat=R.songChain[songPosRef.current];
            if(nextPat!==R.cp){
              R.cp=nextPat;if(!cPatLocked.current)setCPat(nextPat);
              eg.globalTick=0;
              eg.nextTime=em2.songNextTime;
            }
          }
          em2.songNextTime+=sixteenth;
        }
      }

      // ── Métronome ──────────────────────────────────────────────────────────────
      if(R.metro){
        const em=euclidMetroR.current;
        if(!em.metroNext||em.metroNext<ct-0.5){em.metroNext=ct+0.05;em.metroBeat=0;}
        while(em.metroNext<ct+eLA){
          playClk(em.metroNext,em.metroBeat===0?"accent":em.metroBeat%2===0?"beat":"sub");
          em.metroBeat=(em.metroBeat+1)%4;em.metroNext+=sixteenth;
        }
      }
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
        if(nextPat!==R.cp){R.cp=nextPat;if(!cPatLocked.current)setCPat(nextPat);}
      }
      const st=nxtRef.current;schSt(R.step,st);
      if(R.metro){const gs=isGS(R.step,gr,cs.accents||[0]);const sd=cs.subDiv||0;if(gs.y)playClk(st,gs.f?"accent":"beat");else if(sd>0&&R.step%sd===0)playClk(st,"sub");}
      const bd=cs.stepDiv?(60/R.bpm)/cs.stepDiv:(60/R.bpm)*cs.beats/cs.steps;
      // Swing: AND notes arrive late (shuffle feel). Range ×0.5 so 67%≈triplet, 100%=dotted.
      const sw=bd*(R.sw/100)*0.5;nxtRef.current+=R.step%2===0?(bd+sw):(bd-sw);
      // Sync visual cursor to audio: fire setCStep at the actual scheduled time (not lookahead)
      {const sn=R.step;const ahead=Math.max(0,Math.round((st-ct)*1000)-4);setTimeout(()=>setCStep(sn),ahead);}
    }
  },[schSt]);
  // Keep schLoopRef current so the worker's onmessage always calls the latest schLoop
  // (avoids stale closures when schSt or other deps change during playback)
  useEffect(()=>{schLoopRef.current=schLoop;},[schLoop]);

  const startStop=async()=>{
    await engine.ensureRunning();
    // Android WebView: AudioContext may be suspended after ensureRunning on older browsers
    if(engine.ctx.state==='suspended'){
      engine.ctx.onstatechange=()=>{if(engine.ctx.state==='running')setCtxSuspended(false);};
      setCtxSuspended(true);
      return;
    }
    // LOOPER DISABLED — looper routing removed, pads PLAY goes to sequencer
    // if(R.uiView==='pads'&&loopRef.current.events.length>0){ ... }
    if(playing){
      _stopScheduler();setPlaying(false);setCStep(-1);R.step=-1;setRec(false);cPatLocked.current=false;
      euclidGlobalRef.current={nextTime:null,globalTick:0};euclidCurRef.current={};setEuclidCurDisplay({});euclidMetroR.current={nextTime:null,beat:0};
    }else{
      R.step=-1;cPatLocked.current=false;songPosRef.current=0;nxtRef.current=engine.ctx.currentTime+0.05;
      if(R.songMode&&R.songChain.length>0){const fp=R.songChain[0];setCPat(fp);R.cp=fp;}
      euclidGlobalRef.current={nextTime:null,globalTick:0};euclidCurRef.current={};setEuclidCurDisplay({});euclidMetroR.current={nextTime:null,beat:0};
      schLoopRef.current=schLoop;_startScheduler(engine._schedInterval);schLoop();setPlaying(true);
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
      if(autoPlayTimerRef.current)clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current=setTimeout(()=>{autoPlayTimerRef.current=null;engine.ensureRunning().then(()=>{if(!R.playing)ssRef.current?.();});},800);
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

  // ── Save / Load Project ───────────────────────────────────────────────────────
  const saveProject=()=>{
    const project={
      _ks:1,
      bpm,swing,masterVol,
      tSigLabel:tSig.label,grpIdx,
      cPat,pBank,
      stVel,stNudge,stProb,stRatch,
      act,muted,soloed,
      customTracks,
      euclidParams,
      activeKitId,kitIdx,
      gfx,fx,
      fxChainOrder,fxSendPos,trackFx,
      songRows,
      velRange,
      themeName,
    };
    const json=JSON.stringify(project,null,2);
    const blob=new Blob([json],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const ts=new Date().toISOString().slice(0,16).replace("T","-").replace(/:/g,"");
    a.href=url;a.download=`ks-project-${ts}.ks.json`;
    a.click();URL.revokeObjectURL(url);
  };

  const loadProject=(file:File)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const p=JSON.parse(e.target?.result as string);
        if(!p||p._ks!==1){alert("Fichier invalide — ce n'est pas un projet Kick & Snare.");return;}
        if(p.bpm!==undefined)setBpm(p.bpm);
        if(p.swing!==undefined)setSwing(p.swing);
        if(p.masterVol!==undefined)setMasterVol(p.masterVol);
        if(p.tSigLabel){const ts=TIME_SIGS.find(s=>s.label===p.tSigLabel);if(ts)setTSig(ts);}
        if(p.grpIdx!==undefined)setGrpIdx(p.grpIdx);
        if(p.pBank){setPBank(p.pBank);setCPat(Math.min(p.cPat??0,p.pBank.length-1));}
        if(p.stVel)setStVel(p.stVel);
        if(p.stNudge)setStNudge(p.stNudge);
        if(p.stProb)setStProb(p.stProb);
        if(p.stRatch)setStRatch(p.stRatch);
        if(p.act)setAct(p.act);
        if(p.muted)setMuted(p.muted);
        if(p.soloed!==undefined)setSoloed(p.soloed);
        if(p.customTracks)setCustomTracks(p.customTracks);
        if(p.euclidParams)setEuclidParams(p.euclidParams);
        if(p.gfx)setGfx(p.gfx);
        if(p.fx)setFx(p.fx);
        if(p.fxChainOrder)setFxChainOrder(p.fxChainOrder);
        if(p.fxSendPos)setFxSendPos(p.fxSendPos);
        if(p.trackFx)setTrackFx(p.trackFx);
        if(p.songRows)setSongRows(p.songRows);else if(p.songChain)setSongRows(toSongRows(p.songChain));
        if(p.velRange)setVelRange(p.velRange);
        if(p.themeName)setThemeName(p.themeName);
        if(p.activeKitId!==undefined){
          setActiveKitId(p.activeKitId);
          if(p.kitIdx!==undefined)setKitIdx(p.kitIdx);
          // re-apply kit if factory
          const fk=DRUM_KITS.find(k=>k.id===p.activeKitId);
          if(fk)applyKit(fk);
        }
      }catch(err){alert("Impossible de lire le fichier projet.");console.error(err);}
    };
    reader.readAsText(file);
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
    // Click REC while stopped → immediate play + rec (no countdown)
    engine.ensureRunning().then(()=>{
      if(engine.ctx?.state==='suspended'){setCtxSuspended(true);return;}
      R.step=-1;cPatLocked.current=false;songPosRef.current=0;if(engine.ctx)nxtRef.current=engine.ctx.currentTime+0.05;
      if(R.songMode&&R.songChain.length>0){const fp=R.songChain[0];setCPat(fp);R.cp=fp;}
      euclidGlobalRef.current={nextTime:null,globalTick:0};euclidCurRef.current={};setEuclidCurDisplay({});euclidMetroR.current={nextTime:null,beat:0};
      schLoopRef.current=schLoop;_startScheduler(engine._schedInterval);schLoop();setPlaying(true);setRec(true);
    });
  };
  useEffect(()=>()=>_stopScheduler(),[]);

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
        // Worker-based scheduler keeps running in background; only restart if somehow stopped
        if(R.playing&&!workerRef.current){
          schLoopRef.current=schLoop;
          _startScheduler(engine._schedInterval);
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
        // Worker-based scheduler keeps running in background — no need to stop it.
        // The audio engine (WebAudio) is hardware-timed and immune to throttling.
        // We only stop the legacy looper scheduler (not worker-based).
        if(loopRef.current.audioStart!==null&&!R.loopRec){
          clearTimeout(loopRef.current.schTimer);loopRef.current.schTimer=null;
        }
      }
    };
    document.addEventListener('visibilitychange',onVis);
    // FIX PAD LATENCY — pre-resume AudioContext on FIRST touch so it's running
    // before the user's finger reaches a pad (avoids ctx.resume() delay in trigPad)
    const onFirstTouch=()=>{
      if(engine.ctx&&engine.ctx.state==='suspended')engine.ctx.resume().catch(()=>{});
      // Pre-warm all active track buffers on mobile so first tap is never silent
      if(engine._isMobile){
        const ids=R.at||[];
        ids.forEach((id:string)=>{if(!engine.buf?.[id])engine.renderShape(id,R.fx?.[id]||null,true).catch(()=>{});});
      }
      document.removeEventListener('touchstart',onFirstTouch,true);
      document.removeEventListener('pointerdown',onFirstTouch,true);
    };
    document.addEventListener('touchstart',onFirstTouch,{capture:true,passive:true});
    document.addEventListener('pointerdown',onFirstTouch,{capture:true,passive:true});
    return()=>{
      document.removeEventListener('visibilitychange',onVis);
      document.removeEventListener('touchstart',onFirstTouch,true);
      document.removeEventListener('pointerdown',onFirstTouch,true);
    };
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
  // Runs for both playing AND stopped loops (fixes visual BPM-drift on manual notes).
  useEffect(()=>{
    const L=loopRef.current;
    if(!L.loopBpm||!L.events.length)return;
    const oldBpm=L.loopBpm;
    const newBpm=bpm;
    if(oldBpm===newBpm)return;
    const ratio=oldBpm/newBpm;
    // Rescale all event offsets and loop length
    L.events=L.events.map(ev=>({...ev,tOff:ev.tOff*ratio}));
    L.lengthMs=L.lengthMs*ratio;
    L.loopBpm=newBpm;
    if(loopPlaying&&L.audioStart!==null&&engine.ctx){
      // Preserve phase so there is no audible jump during live playback
      const now=engine.ctx.currentTime;
      const oldPhase=(now-L.audioStart)%(L.lengthMs/ratio/1000);
      L.audioStart=now-oldPhase*ratio;
      L.scheduled=new Set();
    }
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
          // PRE-ARM: open gate immediately so the first tap at beat 1 is never lost.
          // JS setTimeout can fire 50-200ms late on mobile; without pre-arm, beat-1 taps
          // arrive before the gate opens and are silently dropped.
          // audioStart = recStart (future anchor) — any hit with rawSec < 0 will be
          // caught by the near-boundary threshold (tOff > lengthMs - 400) and placed at 0.
          {const L=loopRef.current;
            pushLoopSnapshot();
            L.passId++;L.events=[];setLoopDisp([]);
            L.lengthMs=(60000/Math.max(30,R.bpm))*R.sig.beats*loopBars;
            L.loopBpm=R.bpm;
            L.audioStart=recStart;
            R.loopRec=true;
          }
          setRecCountdown(true);
          // After recStart: update React state + start looper scheduler
          setTimeout(async()=>{
            setRecCountdown(false);
            setLoopRec(true);
            await startLooper(true,loopRef.current.audioStart??recStart);
          },(recStart-ctx.currentTime)*1000+8);
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
  // Push a deep snapshot of L.events+lengthMs before any mutation (rec, overdub, add, move-start, remove, quantize)
  const pushLoopSnapshot=()=>{
    const H=loopHistRef.current;
    H.past.push({events:loopRef.current.events.map(e=>({...e})),lengthMs:loopRef.current.lengthMs});
    if(H.past.length>60)H.past.shift();
    H.future=[];
    setLoopCanUndo(true);setLoopCanRedo(false);
  };
  const undoLoop=()=>{
    const L=loopRef.current;const H=loopHistRef.current;
    if(!H.past.length)return;
    H.future.push({events:L.events.map(e=>({...e})),lengthMs:L.lengthMs});
    const snap=H.past.pop()!;
    L.events=snap.events;L.lengthMs=snap.lengthMs;
    L.loopBpm=bpm; // re-anchor rescale reference after restore
    setLoopDisp([...L.events]);
    setLoopCanUndo(H.past.length>0);setLoopCanRedo(true);
  };
  const redoLoop=()=>{
    const L=loopRef.current;const H=loopHistRef.current;
    if(!H.future.length)return;
    H.past.push({events:L.events.map(e=>({...e})),lengthMs:L.lengthMs});
    const snap=H.future.pop()!;
    L.events=snap.events;L.lengthMs=snap.lengthMs;
    L.loopBpm=bpm;
    setLoopDisp([...L.events]);
    setLoopCanUndo(true);setLoopCanRedo(H.future.length>0);
  };
  const onChangeBars=(newBars:number)=>{
    const L=loopRef.current;
    const beatMs=60000/Math.max(30,R.bpm);
    const newDurMs=newBars*R.sig.beats*beatMs;
    const newLenSec=newDurMs/1000;
    // Recalculate audioStart to keep playhead phase coherent when the loop length changes live.
    // Without this, loopN = elapsed/newLenSec jumps → scheduler sees unknown id_loopN keys
    // → re-triggers events that just played → pile-up → saturation.
    const ctx=engine?.ctx;
    if(L.audioStart!==null&&ctx&&L.lengthMs>0){
      const oldLenSec=L.lengthMs/1000;
      const elapsed=ctx.currentTime-L.audioStart;
      const posInOldLoop=((elapsed%oldLenSec)+oldLenSec)%oldLenSec;
      const posInNewLoop=posInOldLoop%newLenSec;
      L.audioStart=ctx.currentTime-posInNewLoop;
    }
    // Non-destructive: L.events is NEVER filtered — it holds the full recording.
    // Reducing bars silences events beyond the window; increasing bars restores them.
    L.lengthMs=newDurMs;
    // Clear scheduled set so the scheduler reschedules cleanly with the new loopN keys.
    L.scheduled=new Set();
    if(L.events.length>0){
      setLoopDisp(L.events.filter(ev=>ev.tOff<newDurMs).map(ev=>({tid:ev.tid,tOff:ev.tOff,vel:ev.vel})));
    }
    setLoopBars(newBars);
    R.loopBars=newBars;
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
    // Step 1: deduplicate timestamps within 50ms (simultaneous kick+snare/hihat shouldn't count as 2 beats)
    const allTs=buf.map(h=>h.t).sort((a,b)=>a-b);
    const deduped:number[]=[allTs[0]];
    for(let i=1;i<allTs.length;i++){if(allTs[i]-deduped[deduped.length-1]>50)deduped.push(allTs[i]);}
    const ts=deduped;
    const scoreForBpm=(cBpm:number)=>{
      const bMs=60000/cBpm;
      let err=0;ts.forEach(t=>{const ph=t%bMs;err+=Math.min(ph,bMs-ph);});
      return(err/ts.length)/bMs;
    };
    let gridBpm:number|null=null,gridBest=Infinity;
    for(let cBpm=40;cBpm<=240;cBpm++){
      const score=scoreForBpm(cBpm);
      if(score<gridBest){gridBest=score;gridBpm=cBpm;}
    }
    // Anti-doubling: two-pass conservative strategy
    // Pass 1 — sequencer-BPM anchor: if gridBpm is close to 2× or 3× the sequencer BPM
    //   AND the sequencer BPM itself fits reasonably well, snap to it.
    //   The score gate prevents snapping when the user genuinely plays at a different tempo
    //   (e.g. true 200 BPM quarter notes when sequencer is at 90: seqScore is much worse).
    if(gridBpm&&bpm>=40&&gridBpm>bpm*1.4){
      const seqScore=scoreForBpm(Math.round(bpm));
      if(seqScore<=Math.max(gridBest,0.03)*2.5){
        for(let mult=2;mult<=4;mult++){
          if(Math.abs(gridBpm-mult*bpm)/(mult*bpm)<0.18){gridBpm=Math.round(bpm);break;}
        }
      }
    }
    // Pass 2 — single anti-doubling: halve once if the half tempo fits within 1.5× gridBest.
    // Conservative (no loop) to avoid cascading halvings (e.g. 200→100→50→45).
    if(gridBpm&&gridBpm>80){
      const halfBpm=Math.round(gridBpm/2);
      if(halfBpm>=40){
        const halfScore=scoreForBpm(halfBpm);
        if(halfScore<=Math.max(gridBest,0.03)*1.5){gridBpm=halfBpm;}
      }
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
  _akRef.current=activeKitId;_kiRef.current=kitIdx;_smRef.current=smpN;_ctRef.current=customTracks;_acRef.current=act;_ukRef.current=userKits;
  const _snap=()=>({
    pBank:JSON.parse(JSON.stringify(_pbRef.current)),
    euclidParams:JSON.parse(JSON.stringify(_epRef.current)),
    stVel:JSON.parse(JSON.stringify(_svRef.current)),
    stNudge:JSON.parse(JSON.stringify(_snRef.current)),
    stProb:JSON.parse(JSON.stringify(_spRef.current)),
    stRatch:JSON.parse(JSON.stringify(_srRef.current)),
    activeKitId:_akRef.current,
    kitIdx:_kiRef.current,
    smpN:{..._smRef.current},
    customTracks:JSON.parse(JSON.stringify(_ctRef.current)),
    act:[..._acRef.current],
  });
  const _updHL=()=>setHistLen({past:histRef.current.past.length,future:histRef.current.future.length});
  const pushHistory=()=>{histRef.current.past.push(_snap());if(histRef.current.past.length>60)histRef.current.past.shift();histRef.current.future=[];_updHL();};
  // Re-load audio buffers when restoring a kit from history (without pushing a new history entry)
  const _restoreKitAudio=(snapKitId:string)=>{
    const fk=DRUM_KITS.find(k=>k.id===snapKitId);
    if(fk){
      const kitSamples=fk.samples as Record<string,string>;
      ALL_TRACKS.forEach(tr=>{
        const tid=tr.id;const curFx=(R.fx as typeof fx)[tid]||{...DEFAULT_FX};
        delete (engine.buf as any)[tid];
        if(kitSamples[tid]){engine.loadUrl(tid,kitSamples[tid]).then(ok=>{if(!ok&&engine.ctx)engine.renderShape(tid,curFx,true).catch(()=>{});});}
        else if(engine.ctx){engine.renderShape(tid,curFx,true).catch(()=>{});}
      });
      return;
    }
    const uk=_ukRef.current.find(k=>k.id===snapKitId);
    if(uk)loadUserKit(uk);
  };
  const _applySnap=(s:ReturnType<typeof _snap>)=>{
    setPBank(s.pBank);setEuclidParams(s.euclidParams);setStVel(s.stVel);setStNudge(s.stNudge);setStProb(s.stProb);setStRatch(s.stRatch);
    setSmpN(s.smpN);setAct(s.act);setCustomTracks(s.customTracks);
    if(s.kitIdx!==_kiRef.current)setKitIdx(s.kitIdx);
    if(s.activeKitId!==_akRef.current){setActiveKitId(s.activeKitId);_restoreKitAudio(s.activeKitId);}
  };
  const undo=()=>{const h=histRef.current;if(!h.past.length)return;h.future.push(_snap());const s=h.past.pop();_applySnap(s);_updHL();};
  const redo=()=>{const h=histRef.current;if(!h.future.length)return;h.past.push(_snap());const s=h.future.pop();_applySnap(s);_updHL();};
  R.undo=undo;R.redo=redo;R.pushHistory=pushHistory;

  // ── Kit applier ─────────────────────────────────────────────────────────────
  const applyKit=(kit:typeof DRUM_KITS[number])=>{
    silentTracksRef.current=new Set();R.silentTracks=new Set();
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
    setActiveKitId(kit.id);
    setAct(DEFAULT_ACTIVE);
    setUserKitLabelOverride({});
  };

  // ── User kit management ───────────────────────────────────────────────────
  const saveCurrentAsKit=async(name:string,icon:string)=>{
    await engine.init();
    const samples:UserKit['samples']={};
    const shape:UserKit['shape']={};
    const kitId=`user_${Date.now()}`;
    for(const tid of act){
      shape[tid]={...(R.fx as typeof fx)[tid]||{...DEFAULT_FX}};
      const buf=(engine.buf as any)[tid] as AudioBuffer|undefined;
      if(buf){
        const blobKey=`ks_blob_${kitId}_${tid}`;
        try{await idbPut(blobKey,bufferToWAVArrayBuffer(buf));samples[tid]={type:'blob',blobKey,originalName:smpN[tid]||tid};}
        catch(e){console.warn('idb save failed',tid,e);samples[tid]={type:'synth'};}
      } else {
        samples[tid]={type:'synth'};
      }
    }
    const kit:UserKit={id:kitId,name,icon,createdAt:Date.now(),samples,shape};
    const updated=[...userKits,kit];
    setUserKits(updated);saveUserKitsMeta(updated);setActiveKitId(kit.id);
  };

  const loadUserKit=async(kit:UserKit)=>{
    await engine.init();
    const epoch=++loadEpochRef.current;
    const nextFx={...(R.fx as typeof fx)};
    const newSilent=new Set<string>();
    // ── Phase 1: pre-load ALL new buffers into temp map — never touch engine.buf yet ──
    const tempBufs:Record<string,AudioBuffer|'silent'|'synth'>={};
    const newSmpN:Record<string,string>={};
    const newWaveforms:Record<string,string>={};
    for(const [tid,info] of Object.entries(kit.samples)){
      if(epoch!==loadEpochRef.current)return;
      if(kit.shape[tid]){nextFx[tid]={...nextFx[tid],...kit.shape[tid]};engine.uFx(tid,nextFx[tid]);}
      if(info.type==='blob'&&info.blobKey){
        try{
          const ab=await idbGet(info.blobKey);
          if(!ab||epoch!==loadEpochRef.current)continue;
          const audioBuf=await engine.ctx!.decodeAudioData(ab.slice(0));
          if(epoch!==loadEpochRef.current)continue;
          tempBufs[tid]=audioBuf;
          newSmpN[tid]=info.originalName||'User sample';
          newWaveforms[tid]=miniWaveformPathUtil(audioBuf,28,16);
        }catch(e){console.warn('load user sample failed',tid,e);}
      } else if(info.type==='url'&&info.url){
        try{
          const resp=await fetch(info.url);const ab=await resp.arrayBuffer();
          if(epoch!==loadEpochRef.current)continue;
          const audioBuf=await engine.ctx!.decodeAudioData(ab);
          if(epoch!==loadEpochRef.current)continue;
          tempBufs[tid]=audioBuf;
          newSmpN[tid]=info.originalName||tid;
        }catch(e){
          console.warn('loadUserKit URL fetch failed',tid,e);
          tempBufs[tid]='synth';newSmpN[tid]=`${tid} · ${kit.name}`;
        }
      } else if(info.type==='none'){
        tempBufs[tid]='silent';newSmpN[tid]='—';newSilent.add(tid);
      } else {
        tempBufs[tid]='synth';newSmpN[tid]=`${tid} · ${kit.name}`;
      }
    }
    if(epoch!==loadEpochRef.current)return;
    // ── Phase 2: atomic swap — install all new buffers at once, then update React state ──
    for(const [tid,bufOrFlag] of Object.entries(tempBufs)){
      if(bufOrFlag instanceof AudioBuffer){
        engine.loadBuffer(tid,bufOrFlag);
      } else {
        delete (engine.buf as any)[tid];
        if(bufOrFlag==='synth'&&engine.ctx){
          engine.renderShape(tid,nextFx[tid]||{...DEFAULT_FX},true).catch(()=>{});
        }
      }
    }
    // Single batched React state update — no per-track setState calls during loading
    setSmpN(prev=>({...prev,...newSmpN}));
    setWaveformCache(prev=>({...prev,...newWaveforms}));
    silentTracksRef.current=newSilent;R.silentTracks=newSilent;
    setFx(nextFx);setActiveKitId(kit.id);setKitIdx(-1);
    setAct(DEFAULT_ACTIVE);setUserKitLabelOverride(kit.trackLabels||{});
  };

  const renameKit=(kitId:string,newName:string)=>{
    const updated=userKits.map(k=>k.id===kitId?{...k,name:newName}:k);
    setUserKits(updated);saveUserKitsMeta(updated);
  };
  const updateKitTrackLabels=(kitId:string,labels:Record<string,string>)=>{
    const updated=userKits.map(k=>k.id===kitId?{...k,trackLabels:labels}:k);
    setUserKits(updated);saveUserKitsMeta(updated);
    if(activeKitId===kitId)setUserKitLabelOverride(labels);
  };
  const deleteKit=async(kitId:string)=>{
    await idbDeleteKeysWithPrefix(`ks_blob_${kitId}_`).catch(()=>{});
    const updated=userKits.filter(k=>k.id!==kitId);
    setUserKits(updated);saveUserKitsMeta(updated);
    if(activeKitId===kitId)setActiveKitId(null);
  };

  // ── KitComposer helpers ────────────────────────────────────────────────────
  const previewSample=async(entry:SampleBankEntry)=>{
    await engine.init();
    if(!engine.ctx||!engine.mg)return;
    try{previewNodeRef.current?.stop();}catch{}previewNodeRef.current=null;
    let buf:AudioBuffer|null=null;
    try{
      if(entry.url){const resp=await fetch(entry.url);const ab=await resp.arrayBuffer();buf=await engine.ctx.decodeAudioData(ab);}
      else if(entry.blobKey){const ab=await idbGet(entry.blobKey);if(ab)buf=await engine.ctx.decodeAudioData(ab.slice(0));}
    }catch(e){console.warn('preview failed',e);}
    if(!buf||!engine.ctx)return;
    const src=engine.ctx.createBufferSource();src.buffer=buf;src.connect(engine.mg);src.start();
    previewNodeRef.current=src;
    src.onended=()=>{if(previewNodeRef.current===src)previewNodeRef.current=null;};
  };

  const saveComposedKit=async(name:string,icon:string,slots:Record<string,SampleBankEntry|null>,trackLabels:Record<string,string>)=>{
    const kitId=`user_${Date.now()}`;
    const samples:UserKit['samples']={};const shape:UserKit['shape']={};
    for(const [tid,entry] of Object.entries(slots)){
      shape[tid]={...(R.fx as typeof fx)[tid]||{...DEFAULT_FX}};
      if(!entry){samples[tid]={type:'none'};}
      else if(entry.url){samples[tid]={type:'url',url:entry.url,originalName:entry.name};}
      else if(entry.blobKey){samples[tid]={type:'blob',blobKey:entry.blobKey,originalName:entry.name};}
      else{samples[tid]={type:'none'};}
    }
    const kit:UserKit={id:kitId,name,icon,createdAt:Date.now(),samples,shape,trackLabels};
    const updated=[...userKits,kit];
    setUserKits(updated);saveUserKitsMeta(updated);
    setShowKitComposer(false);
    // Load the composed kit immediately so the user hears it
    await loadUserKit(kit);
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
    // BPM preserved: templates suggest BPM but never override user setting
    setSwipeToast(`${(tpl as any).icon||"✓"} ${tpl.name} · ${ns} steps`);
    setTimeout(()=>setSwipeToast(null),1200);
  };

  // ── Euclid template loader ─────────────────────────────────────────────────
  const loadEuclidTemplate=(tpl:EuclidTemplate)=>{
    pushHistory();
    const paramEntries=Object.entries(tpl.params) as [string,{N:number,hits:number,rot?:number}][];
    const newTids=paramEntries.map(([tid])=>tid);
    // ── 1. Merge euclidParams — update preset tracks, keep others intact ──
    setEuclidParams(prev=>{
      const next:{[k:string]:any}={...prev};
      paramEntries.forEach(([tid,p])=>{
        next[tid]={N:p.N,hits:p.hits,rot:p.rot??0,tpl:tpl.name,fold:false};
      });
      return next;
    });
    // ── 2. Pre-compute all patterns so we can sync-write R.pat AND update pBank ──
    const computed:Record<string,{rotated:number[],N:number}>={}; 
    paramEntries.forEach(([tid,p])=>{
      const N=p.N;const hits=p.hits;const rot=p.rot??0;
      const raw=euclidRhythm(hits,N);
      const r2=((rot%Math.max(N,1))+Math.max(N,1))%Math.max(N,1);
      const rotated=[...raw.slice(r2),...raw.slice(0,r2)].map(v=>v?100:0);
      computed[tid]={rotated,N};
    });
    // Sync-write R.pat so the scheduler sees the new pattern immediately (no stale-render lag)
    if(R.pat&&!(R.playing&&R.songMode&&R.cp!==cPat)){Object.entries(computed).forEach(([tid,{rotated}])=>{R.pat[tid]=[...rotated];});}
    // ── 3. Write preset tracks into pattern, keep non-preset tracks intact ──
    setPBank(pb=>{
      const n=[...pb];
      const existing=n[cPat]||{};
      const cp:any={...existing,_steps:{...(existing._steps||{})}};
      // Write ONLY the preset's Euclidean rhythms (non-preset tracks unchanged)
      Object.entries(computed).forEach(([tid,{rotated,N}])=>{
        cp._steps[tid]=N;
        cp[tid]=[...rotated];
      });
      n[cPat]=cp;
      return n;
    });
    // ── 4. Add preset tracks to active set — keep existing active tracks ──
    // Sync-write R.at so the scheduler sees new tracks immediately on the next tick
    R.at=[...new Set([...R.at,...newTids])];
    setAct(prev=>[...new Set([...prev,...newTids])]);
    // BPM preserved: euclid presets suggest BPM but never override user setting
    // Kit preserved: euclid presets never change the current kit
    setSwipeToast(`${tpl.icon} ${tpl.name} · Euclidian`);
    setTimeout(()=>setSwipeToast(null),1400);
  };

  const handleClick=(tid,step)=>{pushHistory();setPat(p=>{const r=[...(p[tid]||[])];r[step]=r[step]?0:1;return{...p,[tid]:r};});};
  // D2: Random velocity for active steps within velRange
  const randomizeVelocity=(tid:string)=>{
    pushHistory();
    setStVel(prev=>{
      const n={...prev};
      const steps=pat[tid]||[];
      const a=Array.isArray(n[tid])?[...n[tid]]:Array(STEPS).fill(100);
      for(let i=0;i<steps.length;i++){if(steps[i])a[i]=Math.round(velRange.min+Math.random()*(velRange.max-velRange.min));}
      n[tid]=a;return n;
    });
  };
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
    if(!ac){pushHistory();setPat(p=>{const r=[...(p[tid]||[])];r[step]=1;return{...p,[tid]:r};});setStNudge(p=>{const n={...p};const a=Array.isArray(n[tid])?[...n[tid]]:Array(STEPS).fill(0);a[step]=0;n[tid]=a;return n;});setStVel(p=>{const n={...p};const a=Array.isArray(n[tid])?[...n[tid]]:Array(STEPS).fill(100);a[step]=100;n[tid]=a;return n;});toggledEarly=true;
      // C1: PAINT MODE — drag horizontal on inactive step to fill consecutive steps
      let lastPaintStep=step;
      const paintMv=(ev:PointerEvent)=>{
        const stepEls=el.parentElement?.querySelectorAll('[data-step]');
        if(!stepEls)return;
        for(const stepEl of stepEls){
          const sr=(stepEl as HTMLElement).getBoundingClientRect();
          if(ev.clientX>=sr.left&&ev.clientX<=sr.right){
            const s=parseInt((stepEl as HTMLElement).getAttribute('data-step')||'-1');
            if(s>=0&&s!==lastPaintStep&&!pat[tid]?.[s]){
              setPat(p=>{const r2=[...(p[tid]||[])];r2[s]=1;return{...p,[tid]:r2};});
              setStVel(p=>{const n2={...p};const a2=Array.isArray(n2[tid])?[...n2[tid]]:Array(STEPS).fill(100);a2[s]=100;n2[tid]=a2;return n2;});
              lastPaintStep=s;didDragRef.current=true;
            }
            break;
          }
        }
      };
      el.addEventListener('pointermove',paintMv);
      el.addEventListener('pointerup',()=>el.removeEventListener('pointermove',paintMv),{once:true});
      el.addEventListener('pointercancel',()=>el.removeEventListener('pointermove',paintMv),{once:true});
      return; // Skip normal nudge/velocity drag logic
    }
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
  const ldFile=(tid:string)=>{setTimeout(()=>{setSampleModalTrack(tid);setSampleModalOpen(true);},60);};
  const ldFileLocal=(tid:string)=>{ldRef.current=tid;if(fileRef.current){(fileRef.current as HTMLInputElement).value="";(fileRef.current as HTMLInputElement).click();}};
  const miniWaveformPath=(buffer:AudioBuffer,w:number,h:number):string=>{
    const data=buffer.getChannelData(0);const step=Math.max(1,Math.ceil(data.length/w));let d='';
    for(let x=0;x<w;x++){let mn=1,mx=-1;for(let j=0;j<step&&x*step+j<data.length;j++){const v=data[x*step+j];if(v<mn)mn=v;if(v>mx)mx=v;}d+=`M${x},${(((1+mn)/2)*h).toFixed(1)}L${x},${(((1+mx)/2)*h).toFixed(1)}`;}
    return d;
  };
  const onFile=async e=>{const f=e.target.files?.[0];const tid=ldRef.current;if(!f||!tid)return;pushHistory();engine.init();const ok=await engine.load(tid,f);if(ok){setSmpN(p=>({...p,[tid]:f.name}));engine.play(tid,1,0,R.fx[tid]||{...DEFAULT_FX});if(engine.buf[tid]){const wp=miniWaveformPath(engine.buf[tid],28,16);setWaveformCache(p=>({...p,[tid]:wp}));}}ldRef.current=null;};
  const onSampleBuffer=(tid:string,buffer:AudioBuffer,name:string)=>{pushHistory();setSampleModalOpen(false);engine.init();engine.loadBuffer(tid,buffer);setSmpN(p=>({...p,[tid]:name}));engine.play(tid,1,0,R.fx[tid]||{...DEFAULT_FX});const wp=miniWaveformPath(buffer,28,16);setWaveformCache(p=>({...p,[tid]:wp}));};

  const pill=(on,c)=>({padding:"8px 16px",border:`1.5px solid ${on?c+"66":th.sBorder}`,borderRadius:8,background:on?c+"22":"rgba(255,255,255,0.03)",color:on?c:c+'77',fontSize:11,fontWeight:800,cursor:"pointer",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"inherit",transition:"all 0.2s cubic-bezier(0.32,0.72,0,1)",boxShadow:on?`0 0 12px ${c}22`:"none"});

  const CUST_ICONS=["◉","◈","⬟","⬡","◳","⬢","◙","⟡"];
  const addCustomTrack=()=>{
    const name=newTrackName.trim();if(!name)return;
    pushHistory();
    const id=`ct_${Date.now()}`;const N=STEPS;
    const usedColors=new Set([...ALL_TRACKS.map(t=>t.color),...customTracks.map(t=>t.color)]);
    const autoColor=CUSTOM_COLORS.find(c=>!usedColors.has(c))||CUSTOM_COLORS[customTracks.length%CUSTOM_COLORS.length];
    const finalColor=selectedCustomColor||autoColor;
    const t={id,label:name.toUpperCase().slice(0,10),icon:CUST_ICONS[customTracks.length%CUST_ICONS.length],color:finalColor};
    const newCustomTracks=[...customTracks,t];
    R.allT=[...ALL_TRACKS,...newCustomTracks];
    setCustomTracks(p=>[...p,t]);
    setPBank(pb=>pb.map(pat=>({...pat,[id]:Array(N).fill(0),_steps:{...(pat._steps||{}),[id]:N}})));
    setStVel(p=>({...p,[id]:Array(N).fill(100)}));
    setStNudge(p=>({...p,[id]:Array(N).fill(0)}));
    setStProb(p=>({...p,[id]:Array(N).fill(100)}));
    setStRatch(p=>({...p,[id]:Array(N).fill(1)}));
    setFx(p=>({...p,[id]:{...DEFAULT_FX}}));
    setAct(a=>[...a,id]);
    setNewTrackName("");setShowCustomInput(false);setShowAdd(false);setSelectedCustomColor(null);
    setSmpN(p=>({...p,[id]:"808 Cowbell (synth)"}));
    engine.init();if(!engine.ch[id])engine._build(id);
    (async()=>{
      try{const sr=engine.ctx.sampleRate;const oCtx=new OfflineAudioContext(1,Math.ceil(sr*0.65),sr);engine._syn(id,0,1,oCtx.destination,oCtx);engine.buf[id]=await oCtx.startRendering();}catch(e){console.warn("Custom 808 prerender failed",e);}
      if(engine.buf[id]){engine.play(id,0.7,0,{...DEFAULT_FX});}
    })();
  };

  // Shared custom track input UI (used in sequencer + euclid add panels)
  const CustomTrackInput=()=>showCustomInput?(
    <div style={{display:"flex",flexDirection:"column",gap:6,width:"100%",marginTop:4}}>
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        {(()=>{const usedColors=new Set([...ALL_TRACKS.map(t=>t.color),...customTracks.map(t=>t.color)]);const autoColor=CUSTOM_COLORS.find(c=>!usedColors.has(c))||CUSTOM_COLORS[0];const displayColor=selectedCustomColor||autoColor;return(
          <div style={{width:22,height:22,borderRadius:11,flexShrink:0,background:displayColor,border:`2px solid ${th.sBorder}`,boxShadow:`0 0 6px ${displayColor}44`}}/>
        );})()}
        <input autoFocus value={newTrackName} onChange={e=>setNewTrackName(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")addCustomTrack();if(e.key==="Escape"){setShowCustomInput(false);setNewTrackName("");setSelectedCustomColor(null);}}}
          placeholder="Track name…" maxLength={10}
          style={{flex:1,height:28,borderRadius:6,border:`1.5px solid ${selectedCustomColor?selectedCustomColor+'66':th.sBorder}`,background:"transparent",color:th.text,fontSize:11,fontWeight:700,padding:"0 8px",fontFamily:"inherit",outline:"none",transition:"border-color 0.15s"}}/>
        <button onClick={addCustomTrack} disabled={!newTrackName.trim()}
          style={{padding:"5px 14px",borderRadius:6,border:"1px solid rgba(48,209,88,0.4)",background:newTrackName.trim()?"rgba(48,209,88,0.15)":"transparent",color:newTrackName.trim()?"#30D158":th.dim,fontSize:10,fontWeight:800,cursor:newTrackName.trim()?"pointer":"default",fontFamily:"inherit",transition:"all 0.12s"}}>ADD</button>
        <button onClick={()=>{setShowCustomInput(false);setNewTrackName("");setSelectedCustomColor(null);}} style={{width:24,height:28,borderRadius:6,border:"none",background:"transparent",color:th.dim,fontSize:12,cursor:"pointer",lineHeight:1}}>✕</button>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",paddingLeft:2,alignItems:"center"}}>
        <span style={{fontSize:8,fontWeight:700,color:th.dim,marginRight:2}}>COLOR</span>
        {(()=>{const usedColors=new Set([...ALL_TRACKS.map(t=>t.color),...customTracks.map(t=>t.color)]);return CUSTOM_COLORS.filter(c=>!usedColors.has(c)).slice(0,12).map(c=>(
          <button key={c} onClick={()=>setSelectedCustomColor(c)}
            style={{width:22,height:22,borderRadius:11,padding:0,border:selectedCustomColor===c?`2.5px solid ${th.text}`:`1.5px solid ${c}55`,background:c,cursor:"pointer",transform:selectedCustomColor===c?"scale(1.25)":"scale(1)",transition:"all 0.1s",boxShadow:selectedCustomColor===c?`0 0 10px ${c}66`:"none"}}/>
        ));})()}
      </div>
    </div>
  ):(
    <button onClick={()=>{setShowCustomInput(true);setSelectedCustomColor(null);}} style={{padding:"5px 14px",borderRadius:6,border:`1px dashed ${th.sBorder}`,background:"transparent",color:th.dim,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ CUSTOM</button>
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
    <div style={{height:"100dvh",background:th.bg,color:th.text,fontFamily:"'JetBrains Mono','SF Mono','Fira Code',monospace",overflow:"hidden",touchAction:"manipulation",display:"flex",flexDirection:"column"}}>
      <input type="file" accept="audio/*" ref={fileRef} onChange={onFile} style={{display:"none"}}/>
      <SampleLoaderModal
        open={sampleModalOpen}
        trackId={sampleModalTrack}
        trackLabel={allT.find(t=>t.id===sampleModalTrack)?.label||sampleModalTrack}
        trackColor={allT.find(t=>t.id===sampleModalTrack)?.color||'#FF9500'}
        onClose={()=>setSampleModalOpen(false)}
        onFileLocal={ldFileLocal}
        onBufferLoaded={onSampleBuffer}
        initAudioCtx={()=>{engine.init();return engine.ctx;}}
        th={th}
      />
      {/* keyframes migrated to src/styles/animations.css (imported in App.tsx at CP-F) */}
      {!isAudioReady&&<div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,height:2,background:"rgba(0,0,0,0.25)"}}>
        <div style={{height:"100%",background:"linear-gradient(90deg,#FF2D55,#FF9500)",animation:"audioload 0.5s ease-out forwards",willChange:"width"}}/>
      </div>}
      {/* ═══ Fixed header: logo + kit + mascot + transport (always visible) ═══ */}
      <div style={{flexShrink:0,background:th.bg,zIndex:100,borderBottom:`1.5px solid ${th.sBorder}`,boxShadow:"0 2px 20px rgba(0,0,0,0.5)"}}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"4px 12px 0"}}>

        {/* ── Header ── */}
        <div style={{display:"flex",alignItems:"center",position:"relative",marginBottom:4,padding:"4px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
            <div data-hint={`Logo · Pulse on every downbeat — shows audio is active · v${APP_VERSION}`} onClick={()=>setShowInfo(p=>!p)} style={{width:38,height:38,borderRadius:10,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",animation:playing&&gInfo(cStep).first?"logoThump 0.18s ease-out 1":"none",boxShadow:playing?"0 0 24px rgba(255,45,85,0.5)":"0 0 12px rgba(255,45,85,0.2)",flexShrink:0,cursor:"pointer",transition:"box-shadow 0.3s",background:"#FF6A00"}}>
              <img src={`${import.meta.env.BASE_URL}fox-logo.jpg`} alt="Kick & Snare" style={{width:"100%",height:"100%",objectFit:"cover",display:"block",mixBlendMode:"multiply"}}/>
            </div>
            <div style={{flexShrink:0}}>
              <div className="gradientShift" style={{fontSize:20,fontWeight:900,letterSpacing:"0.08em",whiteSpace:"nowrap",background:"linear-gradient(90deg,#FF2D55,#FF9500,#FFD60A,#30D158,#5E5CE6)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"gradientShift 4s linear infinite"}}>KICK & SNARE</div>
              <div className="subtitleAnim" style={{fontSize:8,letterSpacing:"0.4em",color:th.dim,whiteSpace:"nowrap"}}>DRUM EXPERIENCE</div>
            </div>
          </div>
          {/* ── Col 2 : Kit selector ── */}
          <div style={{display:"flex",flex:1,alignItems:"stretch",justifyContent:"center"}}>
          {/* ── Kit selector → opens KitBrowser ── */}
          {(()=>{
            const activeUserKit=userKits.find(k=>k.id===activeKitId);
            const factoryKitForId=DRUM_KITS.find(k=>k.id===activeKitId);
            const curIcon=activeUserKit?activeUserKit.icon:factoryKitForId?.icon||DRUM_KITS[Math.max(0,kitIdx)]?.icon||'🔴';
            const curName=activeUserKit?activeUserKit.name:factoryKitForId?.name||DRUM_KITS[Math.max(0,kitIdx)]?.name||'808';
            const isUser=!!activeUserKit;
            return(
              <button data-hint="Open Kit Library · Browse factory and saved kits · Save current setup as a kit" onClick={()=>setShowKitBrowser(true)} style={{
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"6px 14px",borderRadius:10,
                background:"linear-gradient(160deg,rgba(255,149,0,0.15) 0%,rgba(255,45,85,0.1) 100%)",
                border:`1px solid ${isUser?"rgba(255,149,0,0.5)":"rgba(255,149,0,0.28)"}`,
                boxShadow:"0 0 14px rgba(255,149,0,0.1) inset",
                cursor:"pointer",fontFamily:"inherit",flexShrink:0,position:"relative",overflow:"hidden",
                transition:"border-color 0.15s,background 0.15s",alignSelf:"stretch",
              }}>
                <div style={{position:"absolute",bottom:0,left:0,right:0,height:1.5,background:"linear-gradient(90deg,transparent,#FF9500,#FF2D55,transparent)",opacity:0.7}}/>
                {isDrumKitIcon(curIcon)
                  ?<img src={DRUM_KIT_IMG_SRC} alt="drum kit" style={{width:36,height:36,objectFit:'contain',borderRadius:6,flexShrink:0,display:'block',filter:"drop-shadow(0 0 6px rgba(255,149,0,0.6))"}}/>
                  :curIcon.startsWith('<')
                    ?<span style={{display:'block',lineHeight:0,width:36,height:36,overflow:'hidden',flexShrink:0,filter:"drop-shadow(0 0 6px rgba(255,149,0,0.6))"}} dangerouslySetInnerHTML={{__html:curIcon}}/>
                    :<span style={{fontSize:26,lineHeight:1,filter:"drop-shadow(0 0 6px rgba(255,149,0,0.6))"}}>{curIcon}</span>
                }
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2}}>
                  <span style={{fontSize:9,fontWeight:800,color:"#FF9500",letterSpacing:"0.1em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{curName}</span>
                  <span style={{fontSize:7,color:th.dim,letterSpacing:"0.1em",fontWeight:600}}>{isUser?"MY KIT ▼":"BROWSE ▼"}</span>
                </div>
              </button>
            );
          })()}
          </div>{/* end col 2 kit */}
          {/* ── Col 3 : Mascotte ── */}
          <div style={{display:"flex",flex:1,alignItems:"center",justifyContent:"center"}}>
          {(()=>{
            const isAct=id=>act.includes(id)&&!muted[id];
            const eHit=tid=>view==="euclid"?!!pat[tid]?.[euclidCurDisplay[tid]]:!!pat[tid]?.[cStep];
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
          </div>{/* end col 3 mascot */}
          {/* ── Col 4 : Undo/Redo + Intro + Tutorial + Guide ── */}
          <div style={{display:"flex",gap:4,alignItems:"center",flex:1,justifyContent:"flex-end"}}>
            <button data-hint="Undo (Ctrl+Z) · Go back one step — up to 50 history steps" onClick={undo} disabled={histLen.past===0} title={`Undo (Ctrl+Z)${histLen.past?" — "+histLen.past+" step"+(histLen.past>1?"s":"")+" back":""}`} style={{width:28,height:28,border:`1px solid ${histLen.past?"rgba(100,210,255,0.35)":th.sBorder+"22"}`,borderRadius:6,background:histLen.past?"rgba(100,210,255,0.06)":"transparent",color:histLen.past?"#64D2FF":th.faint,fontSize:16,cursor:histLen.past?"pointer":"default",fontFamily:"inherit",opacity:histLen.past?1:0.3,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0}}>↺</button>
            <button data-hint="Redo (Ctrl+Y) · Restore the undone action" onClick={redo} disabled={histLen.future===0} title={`Redo (Ctrl+Y)${histLen.future?" — "+histLen.future+" step"+(histLen.future>1?"s":"")+" forward":""}`} style={{width:28,height:28,border:`1px solid ${histLen.future?"rgba(100,210,255,0.35)":th.sBorder+"22"}`,borderRadius:6,background:histLen.future?"rgba(100,210,255,0.06)":"transparent",color:histLen.future?"#64D2FF":th.faint,fontSize:16,cursor:histLen.future?"pointer":"default",fontFamily:"inherit",opacity:histLen.future?1:0.3,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0}}>↻</button>
            <button data-hint="Welcome screen · Show the intro overlay again · Useful after reinstalling or sharing with someone new" onClick={()=>{setShowInfo(false);setShowTour(false);setOverlayVisible(true);}} title="Show intro" style={{width:28,height:28,border:"1px solid rgba(255,45,85,0.2)",borderRadius:6,background:"transparent",color:"rgba(255,45,85,0.45)",fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0}}>⊙</button>
            <button data-hint="Interactive tutorial · Illustrated guided tour of the 8 app sections — can be replayed at any time" onClick={()=>{setShowTour(p=>!p);setShowInfo(false);}} title="Interactive tutorial" style={{width:28,height:28,border:`1px solid ${showTour?"#FF950055":"rgba(255,149,0,0.2)"}`,borderRadius:6,background:showTour?"rgba(255,149,0,0.15)":"transparent",color:showTour?"#FF9500":"rgba(255,149,0,0.55)",fontSize:14,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0}}>🎓</button>
            <button data-hint="User guide · Describes every control and interaction in the app" onClick={()=>setShowInfo(p=>!p)} title="User guide" style={{width:28,height:28,border:`1px solid ${showInfo?"#BF5AF255":"rgba(191,90,242,0.2)"}`,borderRadius:6,background:showInfo?"rgba(191,90,242,0.15)":"transparent",color:showInfo?"#BF5AF2":"rgba(191,90,242,0.55)",fontSize:13,fontWeight:900,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,transition:"all 0.15s",padding:0,fontStyle:"italic"}}>?</button>
          </div>
          <div style={{display:"none"}} aria-hidden="true">
            {/* Nav buttons moved to fixed bottom bar — code preserved for reference */}
            <button onClick={()=>{switchView("pads");setShowLooper(false);clearFreeCapture();}}>LIVE PADS</button>
            <button onClick={()=>view!=="sequencer"&&switchView("sequencer")}>SEQUENCER</button>
            <button onClick={()=>view!=="euclid"&&switchView("euclid")}>⬡ EUCLIDIAN</button>
          </div>
        </div>

        {/* ── Transport ── */}
        <TransportBar
          themeName={themeName} bpm={bpm} setBpm={setBpm} playing={playing} startStop={startStop}
          rec={rec} setRec={setRec} handleTap={handleTap} onRecClick={onRecClick}
          swing={swing} setSwing={setSwing} metro={metro} setMetro={setMetro}
          metroVol={metroVol} setMetroVol={setMetroVol} metroSub={metroSub} setMetroSub={setMetroSub}
          midiLM={midiLM} setMidiLM={setMidiLM} linkConnected={linkConnected} linkPeers={linkPeers}
          showLink={showLink} setShowLink={setShowLink} MidiTag={MidiTag}
          view={view} sig={sig} showTS={showTS} setShowTS={setShowTS} showK={showK} setShowK={setShowK}
          hasMidiApi={hasMidiApi} hasLinkApi={hasLinkApi}
          midiNotes={midiNotes} setMidiNotes={setMidiNotes} initMidi={initMidi}
          midiLearnTrack={midiLearnTrack} setMidiLearnTrack={setMidiLearnTrack}
          isPortrait={isPortrait} isAudioReady={isAudioReady} isMobile={isMobileRef.current}
          masterVol={masterVol} setMasterVol={setMasterVol}
          cPat={cPat} pBank={pBank} SEC_COL={SEC_COL} setShowSong={setShowSong}
          onClear={()=>{setPat(p=>{const n={};Object.keys(p).forEach(k=>{n[k]=Array.isArray(p[k])?p[k].map(()=>0):p[k];});return n;});setPBank(pb=>{const n=[...pb];const cp={...n[cPat]};ALL_TRACKS.forEach(t=>{if(Array.isArray(cp[t.id]))cp[t.id]=Array(cp[t.id].length||STEPS).fill(0);});customTracks.forEach(t=>{if(Array.isArray(cp[t.id]))cp[t.id]=Array(cp[t.id].length||STEPS).fill(0);});n[cPat]=cp;return n;});}}
          loopRec={loopRec} loopPlaying={loopPlaying} loopEventsCount={loopDisp.length}
          toggleLoopRec={toggleLoopRec} toggleLoopPlay={loopPlaying?stopLooper:()=>startLooper(false)}
          loopMetro={loopMetro} setLoopMetro={setLoopMetro}
          recCountdown={recCountdown} showLooper={showLooper}
          onLoopUndo={undoLoop} onLoopRedo={redoLoop} onLoopClear={clearLooper}
          loopCanUndo={loopCanUndo} loopCanRedo={loopCanRedo}
          freeCaptureCount={freeCaptureCount} freeBpm={freeBpm}
          onLoopCapture={captureFromFreePlay} onClearCapture={clearFreeCapture}
          onSaveProject={saveProject} onLoadProject={loadProject}
        />
        </div>{/* end fixed-header maxWidth */}
      </div>{/* end fixed-header */}
      {/* ═══ Scrollable content (flex:1 between fixed header + fixed bottom nav) ═══ */}
      <div style={{flex:1,minHeight:0,overflowY:"auto",overflowX:"hidden"}}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"0 12px",paddingBottom:60}}>

        {/* ── Time Signature ── */}
        {showTS&&view!=="euclid"&&(<div style={{marginBottom:10,padding:10,borderRadius:10,background:th.surface,border:`1px solid ${th.sBorder}`}}>
          <div style={{fontSize:9,fontWeight:700,color:"#30D158",marginBottom:8}}>TIME SIGNATURE</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
            {TIME_SIGS.map(s=>(<button key={s.label} onClick={()=>chSig(s)} style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${tSig.label===s.label?"rgba(48,209,88,0.4)":th.sBorder}`,background:tSig.label===s.label?"rgba(48,209,88,0.1)":"transparent",color:tSig.label===s.label?"#30D158":th.dim,fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>{s.label}</button>))}
          </div>
          {tSig.groupOptions&&(<div style={{marginBottom:8}}><div style={{fontSize:8,color:th.dim,marginBottom:4}}>BEAT GROUPING</div><div style={{display:"flex",gap:4}}>{tSig.groupOptions.map((o,i)=>(<button key={i} onClick={()=>setGrpIdx(i)} style={{padding:"5px 12px",borderRadius:5,border:`1px solid ${grpIdx===i?"rgba(48,209,88,0.4)":th.sBorder}`,background:grpIdx===i?"rgba(48,209,88,0.1)":"transparent",color:grpIdx===i?"#30D158":th.dim,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{o[o.length-1]}</button>))}</div></div>)}
        </div>)}

        {/* ── Keyboard Shortcut Cheat Sheet — desktop only ── */}
        {showK&&!isPortrait&&(<div style={{marginBottom:10,padding:12,borderRadius:10,background:th.surface,border:`1px solid ${th.sBorder}`}}>
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


        {/* ── Pattern Bank + Song Arranger ── */}
        {view!=="pads"&&<PatternBank
          themeName={themeName} pBank={pBank} setPBank={setPBank} cPat={cPat} setCPat={setCPat}
          songRows={songRows} setSongRows={setSongRows} songMode={songMode} setSongMode={setSongMode}
          showSong={showSong} setShowSong={setShowSong} playing={playing} songPosRef={songPosRef}
          cPatLocked={cPatLocked}
          STEPS={STEPS} MAX_PAT={MAX_PAT} SEC_COL={SEC_COL} mkE={mkE} R={R} isPortrait={isPortrait}
          patNameEdit={patNameEdit} setPatNameEdit={setPatNameEdit}
          onLoadTemplate={loadTemplate} onLoadEuclidTemplate={loadEuclidTemplate} view={view}
          onClear={()=>{setPat(p=>{const n={};Object.keys(p).forEach(k=>{n[k]=Array.isArray(p[k])?p[k].map(()=>0):p[k];});return n;});setPBank(pb=>{const n=[...pb];const cp={...n[cPat]};ALL_TRACKS.forEach(t=>{if(Array.isArray(cp[t.id]))cp[t.id]=Array(cp[t.id].length||STEPS).fill(0);});customTracks.forEach(t=>{if(Array.isArray(cp[t.id]))cp[t.id]=Array(cp[t.id].length||STEPS).fill(0);});n[cPat]=cp;return n;});}}
        />}

        {/* ── SEQUENCER ── */}
        {view==="sequencer"&&(<>
          <TipBadge id="seq_steps" text="Tap a cell to activate a sound · Double-tap to reset · Long-press = probability" color="#FF2D55"/>
          {/* ── REC Pads — only visible when REC is active in sequencer view ── */}
          {rec&&view==="sequencer"&&(
            <div style={{marginBottom:6,padding:"5px 8px",borderRadius:8,
              background:rec&&playing?"rgba(255,45,85,0.06)":th.surface,
              border:`1px solid ${rec&&playing?"rgba(255,45,85,0.28)":th.sBorder}`,
              display:"flex",alignItems:"center",gap:5,transition:"all 0.2s"}}>
              {rec&&playing
                ?<span style={{fontSize:7,fontWeight:800,color:"#FF2D55",letterSpacing:"0.1em",animation:"rb 0.8s infinite",flexShrink:0}}>● REC</span>
                :<span style={{fontSize:7,fontWeight:800,color:th.dim,letterSpacing:"0.1em",flexShrink:0}}>♫ TAP</span>
              }
              <div style={{display:"flex",gap:4,flex:1}}>
                {atO.map(tr=>(
                  <button key={tr.id}
                    onContextMenu={e=>e.preventDefault()}
                    onTouchStart={e=>{e.preventDefault();if(padHeldRef.current.has(tr.id))return;padHeldRef.current.add(tr.id);trigPad(tr.id,110/127);}}
                    onTouchEnd={()=>padHeldRef.current.delete(tr.id)}
                    onTouchCancel={()=>padHeldRef.current.delete(tr.id)}
                    onPointerDown={e=>{if(e.pointerType==="touch")return;if(padHeldRef.current.has(tr.id))return;padHeldRef.current.add(tr.id);e.preventDefault();trigPad(tr.id,1);}}
                    onPointerUp={e=>{if(e.pointerType!=="touch")padHeldRef.current.delete(tr.id);}}
                    onPointerCancel={e=>{if(e.pointerType!=="touch")padHeldRef.current.delete(tr.id);}}
                    style={{flex:1,height:80,borderRadius:6,background:flashing.has(tr.id)?tr.color+"44":tr.color+"0d",
                      border:`1.5px solid ${flashing.has(tr.id)?tr.color:tr.color+"2a"}`,
                      color:tr.color,cursor:"pointer",fontFamily:"inherit",fontSize:7,fontWeight:800,letterSpacing:"0.05em",
                      touchAction:"none",userSelect:"none",WebkitTapHighlightColor:"transparent",
                      boxShadow:flashing.has(tr.id)?`0 0 12px ${tr.color}44`:"none",
                      transition:"all 0.06s",display:"flex",alignItems:"center",justifyContent:"center",gap:3}}
                  >
                    <DrumSVG id={tr.id} color={tr.color} hit={flashing.has(tr.id)} sz={10}/>
                    <span>{tr.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
                  waveformPath={waveformCache[track.id]}
                  onRemove={()=>{R.at=R.at.filter(x=>x!==track.id);setAct(p=>p.filter(x=>x!==track.id));if(track.id.startsWith("ct_")){R.allT=(R.allT||[]).filter(t=>t.id!==track.id);setCustomTracks(p=>p.filter(x=>x.id!==track.id));}}}
                  onFxChange={(k,v)=>{setFx(prev=>{const nf={...(prev[track.id]||{...DEFAULT_FX}),[k]:v};engine.uFx(track.id,nf);return{...prev,[track.id]:nf};});}}
                  onSendCursorChange={(dir)=>setTrackSendCursor(p=>({...p,[track.id]:((p[track.id]??0)+dir+FX_SECS.length)%FX_SECS.length}))}
                  onSendAmtChange={(amt)=>{const idx=trackSendCursor[track.id]??0;const sec=FX_SECS[idx].sec;upSend(sec,track.id,amt);}}
                  onRandomVel={randomizeVelocity}
                  onStepCountChange={(nt)=>{const remap=(arr,from,to)=>{const r=Array(to).fill(0);(arr||Array(from).fill(0)).forEach((v,i)=>{if(v){const d=Math.min(to-1,Math.round(i*to/from));r[d]=Math.max(r[d],v);}});return r;};setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[track.id]:nt}};cp[track.id]=remap(cp[track.id],tSteps,nt);n[cPat]=cp;return n;});}}
                  onClear={()=>{setPBank(pb=>{const n=[...pb];const cp={...n[cPat]};const s={...(cp._steps||{})};delete s[track.id];cp._steps=s;cp[track.id]=Array(STEPS).fill(0);n[cPat]=cp;return n;});setEuclidParams(p=>{const n={...p};delete n[track.id];return n;});}}
                  onFxOpen={()=>setPadFxTrack(p=>p===track.id?null:track.id)}
                />
              );
            })}
          </div>
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
        {view==="pads"&&(<div style={{padding:"4px 0 0"}}>
          <TipBadge id="pads_tap" text="Play live! Tap a pad to trigger a sound · REC to record into the sequencer" color="#5E5CE6"/>
          {/* LOOPER DISABLED */}
          {false && (
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
                  loopBars={loopBars} setLoopBars={onChangeBars}
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
                    // Freeze lengthMs and anchor loopBpm so BPM changes scale notes correctly
                    if(!L.lengthMs||L.lengthMs<=0){L.lengthMs=dur;}
                    if(!L.loopBpm){L.loopBpm=bpm;}
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
                  loopDurMs={loopRef.current.lengthMs>0?loopRef.current.lengthMs:loopBars*sig.beats*(60000/Math.max(30,bpm))}
                  onVelChange={(idx:number,vel:number)=>{
                    const L=loopRef.current;
                    if(!L.events[idx])return;
                    L.events[idx]={...L.events[idx],vel};
                    setLoopDisp([...L.events]);
                  }}
                />
              </div>
            )}
          </div>
          )} {/* end LOOPER DISABLED */}
          {/* ─ Pads grid ─ */}
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(4,atO.length)},1fr)`,gridAutoRows:`calc((100dvh - 250px) / ${Math.ceil(atO.length/4)})`,gap:12,touchAction:"none",marginBottom:10}}>
            {atO.map((track)=>{
              const padVol=fx[track.id]?.vol??80;
              const pR=9;const pC=2*Math.PI*pR;
              const updateVol=(nv:number)=>{setFx(prev=>{const nf={...(prev[track.id]||{...DEFAULT_FX}),vol:nv};engine.uFx(track.id,nf);return{...prev,[track.id]:nf};});};
              return(
              <div key={track.id} style={{height:"100%"}}>
                {/* ── Pad tile ── */}
                <div style={{position:"relative",height:"100%"}}>
                  <button
                    onContextMenu={e=>e.preventDefault()}
                    onTouchStart={e=>{
                      e.preventDefault();
                      if(padHeldRef.current.has(track.id))return;
                      padHeldRef.current.add(track.id);
                      trigPad(track.id,110/127);
                    }}
                    onTouchEnd={()=>padHeldRef.current.delete(track.id)}
                    onTouchCancel={()=>padHeldRef.current.delete(track.id)}
                    onPointerDown={e=>{
                      if(e.pointerType==="touch")return;
                      if(padHeldRef.current.has(track.id))return;
                      padHeldRef.current.add(track.id);
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      trigPad(track.id,1);
                    }}
                    onPointerUp={e=>{if(e.pointerType!=="touch")padHeldRef.current.delete(track.id);}}
                    onPointerCancel={e=>{if(e.pointerType!=="touch")padHeldRef.current.delete(track.id);}}
                    style={{width:"100%",height:"100%",borderRadius:16,background:flashing.has(track.id)?track.color+"55":`linear-gradient(145deg,${track.color}28,${track.color}08)`,border:`2px solid ${flashing.has(track.id)?track.color:track.color+"44"}`,color:track.color,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",fontFamily:"inherit",boxShadow:flashing.has(track.id)?`0 0 40px ${track.color}66`:`0 0 16px ${track.color}11`,transition:"all 0.06s",transform:flashing.has(track.id)?"scale(0.95)":"scale(1)",touchAction:"none",userSelect:"none",WebkitTapHighlightColor:"transparent"}}>
                    <DrumSVG id={track.id} color={track.color} hit={flashing.has(track.id)} sz={44} />
                    <span style={{fontSize:13,fontWeight:700,letterSpacing:"0.1em"}}>{track.label}</span>
                    {!isPortrait&&<span style={{fontSize:10,color:th.dim,border:`1px solid ${th.sBorder}`,borderRadius:4,padding:"2px 8px"}}>{kMap[track.id]?.toUpperCase()||""}</span>}
                  </button>
                  {/* ── Delete button (top-left, absolute, frère du button → stopPropagation) ── */}
                  {atO.length>1&&(
                    <button
                      onTouchStart={e=>{e.stopPropagation();e.preventDefault();R.at=R.at.filter(x=>x!==track.id);setAct(p=>p.filter(x=>x!==track.id));if(track.id.startsWith("ct_")){R.allT=(R.allT||[]).filter(t=>t.id!==track.id);setCustomTracks(p=>p.filter(x=>x.id!==track.id));}}}
                      onClick={e=>{e.stopPropagation();R.at=R.at.filter(x=>x!==track.id);setAct(p=>p.filter(x=>x!==track.id));if(track.id.startsWith("ct_")){R.allT=(R.allT||[]).filter(t=>t.id!==track.id);setCustomTracks(p=>p.filter(x=>x.id!==track.id));}}}
                      onPointerDown={e=>{e.stopPropagation();}}
                      title={`Remove ${track.label}`}
                      style={{position:"absolute",top:6,left:6,width:22,height:22,borderRadius:6,border:"1px solid rgba(255,55,95,0.35)",background:"rgba(255,55,95,0.12)",color:"rgba(255,55,95,0.75)",fontSize:12,fontWeight:900,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontFamily:"inherit",touchAction:"none",userSelect:"none",WebkitTapHighlightColor:"transparent",zIndex:2}}
                    >×</button>
                  )}
                  {/* ── ♪ Load sample — top-right ── */}
                  <button
                    onTouchStart={e=>{e.stopPropagation();e.preventDefault();ldFile(track.id);}}
                    onClick={e=>{e.stopPropagation();ldFile(track.id);}}
                    onPointerDown={e=>e.stopPropagation()}
                    title={smpN[track.id]||"Load sample"}
                    style={{position:"absolute",top:6,right:6,width:22,height:22,borderRadius:6,border:`1px solid ${smpN[track.id]?"rgba(255,149,0,0.5)":"rgba(255,149,0,0.4)"}`,background:smpN[track.id]?"rgba(255,149,0,0.18)":"rgba(255,149,0,0.12)",color:"rgba(255,149,0,0.85)",fontSize:10,fontWeight:900,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontFamily:"inherit",touchAction:"none",userSelect:"none",WebkitTapHighlightColor:"transparent",zIndex:2,overflow:"hidden"}}
                  >
                    {waveformCache[track.id]?(
                      <svg viewBox="0 0 28 16" width="22" height="14" style={{position:"absolute",inset:0,margin:"auto",opacity:0.55,pointerEvents:"none"}} preserveAspectRatio="none">
                        <path d={waveformCache[track.id]} stroke="#FF9500" strokeWidth="1.2" fill="none"/>
                      </svg>
                    ):<span style={{position:"relative",zIndex:1}}>♪</span>}
                  </button>
                  {midiLM&&<div style={{position:"absolute",top:32,right:6,zIndex:2}}><MidiTag id={track.id}/></div>}
                  {/* ── 🎛 Sample FX — bottom-left ── */}
                  <button
                    onTouchStart={e=>{e.stopPropagation();e.preventDefault();const tid=track.id;setTimeout(()=>setPadFxTrack(p=>p===tid?null:tid),60);}}
                    onClick={e=>{e.stopPropagation();setPadFxTrack(p=>p===track.id?null:track.id);}}
                    onPointerDown={e=>e.stopPropagation()}
                    title="Sample FX"
                    style={{position:"absolute",bottom:6,left:6,width:22,height:22,borderRadius:6,border:`1px solid ${padFxTrack===track.id?"rgba(191,90,242,0.6)":"rgba(191,90,242,0.3)"}`,background:padFxTrack===track.id?"rgba(191,90,242,0.25)":"rgba(191,90,242,0.08)",color:`rgba(191,90,242,${padFxTrack===track.id?"1":"0.7"})`,fontSize:10,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontFamily:"inherit",touchAction:"none",userSelect:"none",WebkitTapHighlightColor:"transparent",zIndex:2}}
                  >🎛</button>
                  {/* ── VOL knob — bottom-right, frère du button → stopPropagation empêche tout conflit touch ── */}
                  <div
                    style={{position:"absolute",bottom:6,right:6,zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",gap:1,background:"rgba(0,0,0,0.4)",borderRadius:7,padding:"3px 5px",backdropFilter:"blur(4px)",touchAction:"none",userSelect:"none",WebkitTapHighlightColor:"transparent",cursor:"ns-resize"}}
                    onTouchStart={e=>{
                      e.stopPropagation();e.preventDefault();
                      const t0=e.touches[0];let sY=t0.clientY,sV=padVol;
                      const onMove=(te:TouchEvent)=>{te.preventDefault();const dy=sY-te.touches[0].clientY;updateVol(Math.max(0,Math.min(100,Math.round(sV+dy*1.5))));};
                      const onEnd=()=>{document.removeEventListener('touchmove',onMove);document.removeEventListener('touchend',onEnd);};
                      document.addEventListener('touchmove',onMove,{passive:false});
                      document.addEventListener('touchend',onEnd,{once:true});
                    }}
                    onPointerDown={e=>{
                      e.stopPropagation();
                      if(e.pointerType==='touch')return;
                      e.preventDefault();
                      const el=e.currentTarget;el.setPointerCapture(e.pointerId);
                      let sY=e.clientY,sV=padVol;
                      const mv=(pe:PointerEvent)=>{const dy=sY-pe.clientY;updateVol(Math.max(0,Math.min(100,Math.round(sV+dy*1.5))));};
                      const up=()=>el.removeEventListener('pointermove',mv);
                      el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up,{once:true});el.addEventListener('pointercancel',up,{once:true});
                    }}
                    onDoubleClick={e=>{e.stopPropagation();updateVol(80);}}
                    title={`VOL: ${padVol} — drag ↕ · double-click = 80%`}
                  >
                    <div style={{position:"relative",width:22,height:22}}>
                      <svg width="22" height="22" style={{position:"absolute",top:0,left:0,transform:"rotate(-90deg)"}} viewBox="0 0 28 28">
                        <circle cx="14" cy="14" r={pR} fill="none" stroke={track.color+"30"} strokeWidth="3"/>
                        <circle cx="14" cy="14" r={pR} fill="none" stroke={track.color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pC*padVol/100} ${pC}`}/>
                      </svg>
                      <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:5,fontWeight:900,color:track.color,pointerEvents:"none"}}>VOL</span>
                    </div>
                    <span style={{fontSize:7,fontWeight:700,color:track.color,opacity:0.85,lineHeight:1}}>{padVol}</span>
                  </div>
                </div>
              </div>
            );})}
          </div>
          {/* ── PERFORM FX v10 ── */}
          {(()=>{
            const divToMs=(div:string)=>{const b=60000/Math.max(30,bpm);const m:Record<string,number>={'1/4':b,'1/4t':b*2/3,'1/8':b/2,'1/8t':b/3,'1/16':b/4,'1/32':b/8};return m[div]??b/2;};
            const MASTER_ID='__master__';
            const isMaster=perfTrack===MASTER_ID;
            const target=isMaster?'':(perfTrack||atO[0]?.id||'');
            const tObj=isMaster?null:(atO.find(t=>t.id===target)||atO[0]);
            const tColor=isMaster?'#FFFFFF':(tObj?.color||'#5E5CE6');
            const tLabel=isMaster?'MASTER':(tObj?.label||'—');
            const tIcon=isMaster?'🔊':(tObj?.icon||'');
            /* selector nav – tracks + MASTER sentinel at the end */
            const allTargets=[...atO.map(t=>t.id),MASTER_ID];
            const curIdx=Math.max(0,allTargets.indexOf(isMaster?MASTER_ID:(perfTrack||atO[0]?.id||'')));
            const navTo=(ni:number)=>{const nid=allTargets[((ni%allTargets.length)+allTargets.length)%allTargets.length];setPerfTrack(nid);perfTrackRef.current=nid;};
            const applyFilter=(x:number,y:number)=>{
              const freq=20*Math.pow(1000,x);const q=y*22;
              const t2=engine.ctx?.currentTime??0;
              if(!isMaster&&target&&engine.ch[target]?.flt){
                engine.ch[target].flt.frequency.setTargetAtTime(freq,t2,0.01);
                engine.ch[target].flt.Q?.setTargetAtTime(q,t2,0.01);
              } else {
                engine.gFlt?.frequency.setTargetAtTime(freq,t2,0.01);
                engine.gFlt2?.frequency.setTargetAtTime(freq,t2,0.01);
                engine.gFlt?.Q.setTargetAtTime(q,t2,0.01);
                engine.gFlt2?.Q.setTargetAtTime(q,t2,0.01);
              }
            };
            const resetFilter=()=>{
              const t2=engine.ctx?.currentTime??0;
              const fCut=gfx.filter?.on?Math.max(20,gfx.filter.cut||18000):20000;
              const fQ=gfx.filter?.on?(gfx.filter.res||0):0;
              if(!isMaster&&target&&engine.ch[target]?.flt){
                engine.ch[target].flt.frequency.setTargetAtTime(fCut,t2,0.06);
                engine.ch[target].flt.Q?.setTargetAtTime(fQ,t2,0.06);
              } else {
                engine.gFlt?.frequency.setTargetAtTime(fCut,t2,0.06);
                engine.gFlt2?.frequency.setTargetAtTime(fCut,t2,0.06);
                engine.gFlt?.Q.setTargetAtTime(fQ,t2,0.06);
                engine.gFlt2?.Q.setTargetAtTime(fQ,t2,0.06);
              }
            };
            const startRvHold=()=>{
              engine.init();if(perfRvHold.current)return;perfRvHold.current=true;
              const t2=engine.ctx?.currentTime??0;
              if(engine.gRvConv&&!engine.gRvConv.buffer&&engine.rv)engine.gRvConv.buffer=engine.rv;
              if(isMaster){
                // Master : booste gRvBus + force tous les rvSend actifs à 0.5 min
                const curBus=engine.gRvBus?.gain.value??1;
                const sends:Record<string,number>={};
                Object.entries(engine.ch as Record<string,any>).forEach(([tid,c])=>{
                  if(c?.rvSend){sends[tid]=c.rvSend.gain.value;c.rvSend.gain.setTargetAtTime(Math.max(c.rvSend.gain.value,0.45),t2,0.04);}
                });
                perfRvPrevRef.current={mix:curBus*100,decay:2,sends};
                engine.gRvBus?.gain.setTargetAtTime(Math.min(2,curBus*2.0+0.6),t2,0.04);
              } else if(target&&engine.ch[target]?.rvSend){
                const cur=engine.ch[target].rvSend.gain.value;
                perfRvPrevRef.current={mix:cur*100,decay:2};
                engine.ch[target].rvSend.gain.setTargetAtTime(Math.min(1,cur+0.55),t2,0.02);
              }
            };
            const stopRvHold=()=>{
              if(!perfRvHold.current)return;perfRvHold.current=false;
              const t2=engine.ctx?.currentTime??0;
              const prev=perfRvPrevRef.current;
              if(isMaster){
                engine.gRvBus?.gain.setTargetAtTime((prev?.mix??100)/100,t2,0.2);
                if(prev?.sends){
                  Object.entries(prev.sends).forEach(([tid,savedGain])=>{
                    const c=(engine.ch as Record<string,any>)[tid];
                    if(c?.rvSend)c.rvSend.gain.setTargetAtTime(savedGain,t2,0.18);
                  });
                }
              } else if(prev&&target&&engine.ch[target]?.rvSend){
                engine.ch[target].rvSend.gain.setTargetAtTime(prev.mix/100,t2,0.08);
              }
              perfRvPrevRef.current=null;
            };
            const startDlHold=()=>{
              engine.init();if(perfDlHold.current)return;perfDlHold.current=true;
              const t2=engine.ctx?.currentTime??0;
              const divMs=divToMs(stutterDiv);
              if(isMaster){
                // Master : booste gDlWet + force tous les dlSend actifs à 0.5 min
                const curWet=engine.gDlWet?.gain.value??0;
                const sends:Record<string,number>={};
                Object.entries(engine.ch as Record<string,any>).forEach(([tid,c])=>{
                  if(c?.dlSend){sends[tid]=c.dlSend.gain.value;c.dlSend.gain.setTargetAtTime(Math.max(c.dlSend.gain.value,0.45),t2,0.02);}
                });
                perfDlPrevRef.current={mix:curWet*100,time:engine.gDlL?.delayTime.value??0.25,fb:35,sends};
                engine.gDlWet?.gain.setTargetAtTime(Math.min(1,curWet+0.7),t2,0.02);
              } else if(target&&engine.ch[target]?.dlSend){
                const cur=engine.ch[target].dlSend.gain.value;
                perfDlPrevRef.current={mix:cur*100,time:engine.gDlL?.delayTime.value??0.25,fb:35};
                engine.ch[target].dlSend.gain.setTargetAtTime(Math.min(1,cur+0.65),t2,0.02);
                engine.gDlWet?.gain.setTargetAtTime(0.7,t2,0.02);
              }
              if(engine.gDlL)engine.gDlL.delayTime.setTargetAtTime(Math.min(1.9,divMs/1000),t2,0.01);
              if(engine.gDlR)engine.gDlR.delayTime.setTargetAtTime(Math.min(1.9,divMs/1000*1.006),t2,0.01);
            };
            const stopDlHold=()=>{
              if(!perfDlHold.current)return;perfDlHold.current=false;
              const t2=engine.ctx?.currentTime??0;
              const prev=perfDlPrevRef.current;
              if(isMaster){
                engine.gDlWet?.gain.setTargetAtTime((prev?.mix??0)/100,t2,0.18);
                if(prev?.sends){
                  Object.entries(prev.sends).forEach(([tid,savedGain])=>{
                    const c=(engine.ch as Record<string,any>)[tid];
                    if(c?.dlSend)c.dlSend.gain.setTargetAtTime(savedGain,t2,0.15);
                  });
                }
              } else if(prev&&target&&engine.ch[target]?.dlSend){
                engine.ch[target].dlSend.gain.setTargetAtTime(prev.mix/100,t2,0.12);
                engine.gDlWet?.gain.setTargetAtTime((prev.mix??0)/100,t2,0.15);
              }
              if(engine.gDlL)engine.gDlL.delayTime.setTargetAtTime(Math.min(1.9,prev?.time??0.25),t2,0.05);
              if(engine.gDlR)engine.gDlR.delayTime.setTargetAtTime(Math.min(1.9,(prev?.time??0.25)*1.006),t2,0.05);
              perfDlPrevRef.current=null;
            };
            const startStutter=()=>{
              engine.init();
              if(isMaster){
                if(stutterRef.current)clearInterval(stutterRef.current);
                let muted=false;
                const half=divToMs(stutterDiv)/2;
                stutterRef.current=setInterval(()=>{
                  muted=!muted;
                  const t2=engine.ctx?.currentTime??0;
                  engine.mg?.gain.setTargetAtTime(muted?0:masterVol/100,t2,0.004);
                },half);
              } else {
                const tid=perfTrackRef.current||lastTrigRef.current||(atO[0]?.id??'');
                if(!tid)return;
                if(stutterRef.current)clearInterval(stutterRef.current);
                engine.play(tid,0.85,0,R.fx[tid]||{...DEFAULT_FX});
                stutterRef.current=setInterval(()=>engine.play(tid,0.85,0,R.fx[tid]||{...DEFAULT_FX}),divToMs(stutterDiv));
              }
            };
            const stopStutter=()=>{
              if(stutterRef.current){clearInterval(stutterRef.current);stutterRef.current=null;}
              if(isMaster&&engine.ctx&&engine.mg)engine.mg.gain.setTargetAtTime(masterVol/100,engine.ctx.currentTime,0.02);
            };
            const fPos=filterPosRef.current[target]||{x:0.5,y:0.5};
            const holdBtn=(label:string,color:string,onDown:()=>void,onUp:()=>void)=>(
              <button onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);onDown();}}
                onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}
                style={{flex:1,padding:"9px 4px",borderRadius:8,border:`1.5px solid ${color}55`,background:`${color}15`,color,fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em",touchAction:"none",userSelect:"none",WebkitTapHighlightColor:"transparent",transition:"all 0.1s"}}>
                {label}
              </button>
            );
            return (
              <div style={{marginTop:10,borderRadius:10,border:`1px solid ${showPerform?tColor+"44":"rgba(94,92,230,0.15)"}`,background:th.surface,overflow:"hidden",transition:"border-color 0.2s",borderLeft:`3px solid ${tColor}`}}>
                {/* Header: left=toggle, center=label, right=target selector */}
                <div style={{padding:"7px 10px",display:"flex",alignItems:"center",gap:6,userSelect:"none"}}>
                  <span onClick={()=>setShowPerform(p=>!p)} style={{fontSize:10,color:"#5E5CE6",flexShrink:0,cursor:"pointer"}}>🎛</span>
                  <span onClick={()=>setShowPerform(p=>!p)} style={{fontSize:9,fontWeight:800,color:"#5E5CE6",letterSpacing:"0.08em",flex:1,cursor:"pointer"}}>PERFORM FX</span>
                  {/* Pill badge selector with swipe */}
                  <div style={{display:"flex",alignItems:"center",gap:2,touchAction:"none"}}
                    onPointerDown={e=>{perfSwipeRef.current={startX:e.clientX,startIdx:curIdx};}}
                    onPointerUp={e=>{
                      if(!perfSwipeRef.current)return;const dx=e.clientX-perfSwipeRef.current.startX;
                      if(Math.abs(dx)>30)navTo(perfSwipeRef.current.startIdx+(dx<0?1:-1));
                      perfSwipeRef.current=null;
                    }}>
                    <button onClick={e=>{e.stopPropagation();navTo(curIdx-1);}} style={{width:18,height:18,borderRadius:4,border:"none",background:"transparent",color:th.dim,fontSize:14,cursor:"pointer",lineHeight:1,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                    <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:12,background:isMaster?"rgba(255,255,255,0.08)":`${tColor}1A`,border:`1px solid ${tColor}55`,minWidth:68,justifyContent:"center",transition:"all 0.18s"}}>
                      <span style={{fontSize:11,lineHeight:1}}>{tIcon}</span>
                      <span style={{fontSize:8,fontWeight:800,color:tColor,letterSpacing:"0.07em",lineHeight:1}}>{tLabel}</span>
                    </div>
                    <button onClick={e=>{e.stopPropagation();navTo(curIdx+1);}} style={{width:18,height:18,borderRadius:4,border:"none",background:"transparent",color:th.dim,fontSize:14,cursor:"pointer",lineHeight:1,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
                  </div>
                  <span onClick={()=>setShowPerform(p=>!p)} style={{fontSize:10,color:th.dim,cursor:"pointer"}}>{showPerform?"▲":"▼"}</span>
                </div>
                {showPerform&&(
                  <div style={{padding:"8px 12px 14px",display:"flex",flexDirection:"column",gap:10}}>
                    {/* FILTER XY */}
                    <div>
                      <div style={{fontSize:7,fontWeight:800,color:th.dim,letterSpacing:"0.07em",marginBottom:5}}>FILTER SWEEP · {tIcon} {tLabel} · drag cutoff (←→) resonance (↑↓)</div>
                      <div style={{height:80,borderRadius:8,background:`${tColor}08`,border:`1px solid ${tColor}33`,position:"relative",cursor:"crosshair",touchAction:"none",userSelect:"none",overflow:"hidden"}}
                        onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);engine.init();
                          const r=e.currentTarget.getBoundingClientRect();
                          const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
                          const y=Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height));
                          filterPosRef.current[target]={x,y};applyFilter(x,y);}}
                        onPointerMove={e=>{if(e.buttons===0)return;
                          const r=e.currentTarget.getBoundingClientRect();
                          const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
                          const y=Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height));
                          filterPosRef.current[target]={x,y};applyFilter(x,y);}}
                        onPointerUp={resetFilter} onPointerCancel={resetFilter}>
                        <div style={{position:"absolute",inset:0,background:`linear-gradient(90deg,rgba(100,210,255,0.07),${tColor}14)`}}/>
                        <div style={{position:"absolute",inset:0,background:"linear-gradient(0deg,rgba(255,149,0,0.06),transparent)"}}/>
                        {/* Crosshair dot */}
                        <div style={{position:"absolute",width:10,height:10,borderRadius:5,background:tColor,boxShadow:`0 0 8px ${tColor}`,left:`calc(${fPos.x*100}% - 5px)`,top:`calc(${(1-fPos.y)*100}% - 5px)`,transition:"left 0.06s,top 0.06s",pointerEvents:"none"}}/>
                        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
                          <span style={{fontSize:8,color:th.faint,opacity:0.7}}>← Cutoff →  ↑ Res ↓</span>
                        </div>
                      </div>
                    </div>
                    {/* STUTTER */}
                    <div>
                      <div style={{fontSize:7,fontWeight:800,color:th.dim,letterSpacing:"0.07em",marginBottom:5}}>STUTTER · {tIcon} {tLabel} — {isMaster?"hold = mute/unmute master":"hold to repeat pad"}</div>
                      <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                        {(['1/4','1/4t','1/8','1/8t','1/16','1/32'] as const).map(d=>(
                          <button key={d} onClick={()=>setStutterDiv(d)} style={{padding:"4px 9px",borderRadius:5,border:`1px solid ${stutterDiv===d?"#5E5CE6":"rgba(255,255,255,0.12)"}`,background:stutterDiv===d?"rgba(94,92,230,0.2)":"transparent",color:stutterDiv===d?"#5E5CE6":th.dim,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.12s"}}>{d}</button>
                        ))}
                        <button
                          onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);startStutter();}}
                          onPointerUp={stopStutter} onPointerCancel={stopStutter} onPointerLeave={stopStutter}
                          style={{padding:"6px 16px",borderRadius:6,border:`1.5px solid rgba(94,92,230,0.5)`,background:"rgba(94,92,230,0.15)",color:"#5E5CE6",fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.07em",touchAction:"none",userSelect:"none",WebkitTapHighlightColor:"transparent"}}>HOLD</button>
                      </div>
                    </div>
                    {/* REVERB + DELAY live */}
                    <div>
                      <div style={{fontSize:7,fontWeight:800,color:th.dim,letterSpacing:"0.07em",marginBottom:5}}>
                        REVERB &amp; DELAY HOLD · {tIcon} {tLabel}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        {holdBtn("REV HOLD","#64D2FF",startRvHold,stopRvHold)}
                        {holdBtn("DLY HOLD","#30D158",startDlHold,stopDlHold)}
                      </div>
                      <div style={{display:"flex",gap:3,marginTop:6,flexWrap:"wrap"}}>
                        <span style={{fontSize:6,color:th.faint,alignSelf:"center",marginRight:2}}>DLY DIV</span>
                        {(["1/4","1/4t","1/8","1/8t","1/16","1/32"] as const).map(d=>(
                          <button key={d} onClick={()=>setStutterDiv(d)}
                            style={{padding:"3px 7px",borderRadius:4,
                              border:`1px solid ${stutterDiv===d?"#30D158":"rgba(48,209,88,0.2)"}`,
                              background:stutterDiv===d?"rgba(48,209,88,0.15)":"transparent",
                              color:stutterDiv===d?"#30D158":th.faint,
                              fontSize:7,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
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
            // Fix 4: update R.pat synchronously so scheduler sees new pattern immediately
            if(R.pat&&!(R.playing&&R.songMode&&R.cp!==cPat))R.pat[tid]=[...rotated];
            setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[tid]:N}};cp[tid]=[...rotated];n[cPat]=cp;return n;});
          };
          const clearTrack=(tid)=>{const N=getP(tid).N;writeP(tid,{hits:0,rot:0,tpl:""});if(R.pat&&!(R.playing&&R.songMode&&R.cp!==cPat))R.pat[tid]=Array(N).fill(0);setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[tid]:N}};cp[tid]=Array(N).fill(0);n[cPat]=cp;return n;});};
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
            if(R.pat&&!(R.playing&&R.songMode&&R.cp!==cPat))R.pat[tid]=[...merged];
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
            if(R.pat&&!(R.playing&&R.songMode&&R.cp!==cPat))R.pat[tid]=[...pp];
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
                if(R.pat?.[tid]&&!(R.playing&&R.songMode&&R.cp!==cPat)){R.pat[tid]=[...R.pat[tid]];R.pat[tid][step]=R.pat[tid][step]>0?0:100;}
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
                                <button data-hint={`FX · Open per-track effects for ${tr.label} · Pitch, Filter, Drive, Volume, Pan, Reverb & Delay sends`} title="Track FX" onClick={()=>setPadFxTrack(p=>p===tr.id?null:tr.id)} style={{...btnSm,width:22,fontSize:9,background:padFxTrack===tr.id?"rgba(191,90,242,0.2)":"rgba(191,90,242,0.06)",color:"rgba(191,90,242,0.85)",border:`1px solid ${padFxTrack===tr.id?"rgba(191,90,242,0.6)":"rgba(191,90,242,0.3)"}`}}>🎛</button>
                                <button data-hint={isM?`MUTE active · Track ${tr.label} silenced · Click to re-enable`:`MUTE · Silence track ${tr.label} without clearing the Euclidean rhythm`} onClick={()=>setMuted(m=>({...m,[tr.id]:!m[tr.id]}))} style={{...btnSm,color:isM?"#FF375F":th.faint,border:`1px solid ${isM?"rgba(255,55,95,0.4)":th.sBorder}`,background:isM?"rgba(255,55,95,0.12)":"transparent"}}>M</button>
                                <button data-hint={isS?`SOLO active · Only track ${tr.label} is playing · Click to disable`:`SOLO · Isolate track ${tr.label} — all other tracks are silenced`} onClick={()=>setSoloed(s=>s===tr.id?null:tr.id)} style={{...btnSm,color:isS?"#FFD60A":th.faint,border:`1px solid ${isS?"rgba(255,214,10,0.4)":th.sBorder}`,background:isS?"rgba(255,214,10,0.12)":"transparent"}}>S</button>
                                {(()=>{const hasSmp=!!smpN[tr.id];const hasWv=!!waveformCache[tr.id];return(<button data-hint={hasSmp?`Sample: ${smpN[tr.id]} · Click to change the audio file`:`Load an audio sample for track ${tr.label} (MP3, WAV, OGG)`} onClick={()=>ldFile(tr.id)} title={hasSmp?smpN[tr.id]:"Load sample"} style={{...btnSm,color:hasSmp?"#FF9500":th.faint,border:`1px solid ${hasSmp?"rgba(255,149,0,0.4)":th.sBorder}`,background:hasSmp?"rgba(255,149,0,0.15)":"transparent",position:"relative",overflow:"hidden",minWidth:hasWv?28:undefined}}>{hasWv?(<svg viewBox="0 0 28 16" width="26" height="14" style={{position:"absolute",inset:0,margin:"auto",opacity:0.5,pointerEvents:"none"}} preserveAspectRatio="none"><path d={waveformCache[tr.id]} stroke="#FF9500" strokeWidth="1.2" fill="none"/></svg>):<span style={{position:"relative",zIndex:1}}>♪</span>}</button>);})()}
                                <MidiTag id={tr.id}/>
                                <button data-hint={`CLR · Clear all Euclidean hits from track ${tr.label} · Resets to N=${p.N} hits=0`} onClick={()=>clearTrack(tr.id)} title="Clear hits" style={{...btnSm,color:"#FF2D55",border:"1px solid rgba(255,45,85,0.3)",fontSize:7}}>CLR</button>
                                <button data-hint={`RAND · Randomize N, HITS and ROT for track ${tr.label}`} onClick={()=>{const rN=Math.max(6,Math.min(24,6+Math.floor(Math.random()*13)));const rH=1+Math.floor(Math.random()*(Math.ceil(rN/2)));const rR=Math.floor(Math.random()*rN);writeP(tr.id,{N:rN,hits:rH,rot:rR,tpl:""});applyE(tr.id,rN,rH,rR);}} title="Randomize" style={{...btnSm,color:"#FFD60A",border:"1px solid rgba(255,214,10,0.35)",background:"rgba(255,214,10,0.08)",fontSize:11}}>🎲</button>
                                {act.length>1&&<button data-hint={`Remove track ${tr.label} from Euclidean view`} onClick={()=>{R.at=R.at.filter(x=>x!==tr.id);setAct(a=>a.filter(x=>x!==tr.id));if(tr.id.startsWith("ct_")){R.allT=(R.allT||[]).filter(t=>t.id!==tr.id);setCustomTracks(p=>p.filter(x=>x.id!==tr.id));}}} style={{...btnSm,color:"#FF375F",border:"1px solid rgba(255,55,95,0.3)"}}>×</button>}
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

                {/* ── RIGHT: Concentric rings SVG — sticky so it stays visible while scrolling track controls ── */}
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,flex:1,position:"sticky",top:8,alignSelf:"flex-start",...(isPortrait?{order:-1,marginBottom:8}:{})}}>
                  <svg width={isPortrait?320:380} height={isPortrait?320:380} style={{display:"block",overflow:"visible"}}>
                    <circle cx={CX} cy={CY} r={R_OUT+20} fill={th.surface} stroke={th.sBorder} strokeWidth={1} opacity={0.6}/>
                    {atO.map((tr,ti)=>{
                      const R=R_OUT-ti*ringGap;
                      const p=getP(tr.id);const N=p.N;
                      const curS=playing&&euclidCurDisplay[tr.id]!=null?euclidCurDisplay[tr.id]:-1;
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
        </div>{/* end scrollable-content maxWidth */}
      </div>{/* end scrollable-content */}
    {/* ── Global Track FX bottom sheet (works from any view — sequencer, pads, euclid) ── */}
    {padFxTrack&&(()=>{
      const tr=atO.find(t=>t.id===padFxTrack);
      if(!tr) return null;
      const f:any={...DEFAULT_FX,...(fx[tr.id]||{})};
      const updFx=(updates:Record<string,unknown>)=>{
        setFx((prev:any)=>{
          const nf={...DEFAULT_FX,...(prev[tr.id]||{}), ...updates};
          engine.uFx(tr.id,nf);
          return{...prev,[tr.id]:nf};
        });
      };
      const freqFmt=(v:number)=>v>=1000?`${(v/1000).toFixed(1)}k`:String(Math.round(v));
      const SlRow=({label,keyName,min,max,step,val,color,fmt,disabled=false}:{label:string;keyName:string;min:number;max:number;step:number;val:number;color:string;fmt:(v:number)=>string;disabled?:boolean})=>(
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
          <span style={{fontSize:7.5,fontWeight:800,color:disabled?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.45)",width:56,flexShrink:0,textAlign:"right",letterSpacing:"0.06em",textTransform:"uppercase"}}>{label}</span>
          <input type="range" min={min} max={max} step={step} value={val} disabled={disabled}
            onChange={e=>updFx({[keyName]:Number(e.target.value)})}
            onTouchStart={e=>e.stopPropagation()}
            style={{flex:1,accentColor:color,minWidth:0,opacity:disabled?0.25:1,cursor:disabled?"not-allowed":"pointer",touchAction:"none"}}/>
          <span style={{fontSize:9,fontFamily:"monospace",fontWeight:700,color:disabled?"rgba(255,255,255,0.2)":color,width:46,flexShrink:0,textAlign:"left"}}>{fmt(val)}</span>
        </div>
      );
      const ToggleBtn=({on,label,color,onClick}:{on:boolean;label:string;color:string;onClick:()=>void})=>(
        <button onClick={onClick} style={{padding:"4px 10px",borderRadius:5,border:`1px solid ${on?color+"88":"rgba(255,255,255,0.12)"}`,background:on?color+"22":"transparent",color:on?color:"rgba(255,255,255,0.35)",fontSize:7.5,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em",transition:"all 0.12s",touchAction:"manipulation"}}>
          {label}
        </button>
      );
      const PillGroup=({opts,val,color,onSel}:{opts:{k:string;l:string}[];val:string;color:string;onSel:(k:string)=>void})=>(
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          {opts.map(o=>(
            <button key={o.k} onClick={()=>onSel(o.k)} style={{padding:"3px 8px",borderRadius:4,border:`1px solid ${val===o.k?color+"88":"rgba(255,255,255,0.1)"}`,background:val===o.k?color+"20":"transparent",color:val===o.k?color:"rgba(255,255,255,0.4)",fontSize:7,fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em",touchAction:"manipulation"}}>
              {o.l}
            </button>
          ))}
        </div>
      );
      const sec={marginBottom:14,paddingBottom:14,borderBottom:"1px solid rgba(255,255,255,0.06)"};
      const DEFAULT_FX_VALS={onPitch:false,pitch:0,onFilter:false,fType:"lowpass",cut:5000,res:0,onDrive:false,driveMode:"tape",drive:0,vol:80,pan:0,onReverb:false,rMix:0,rDecay:1.5,rSize:0.5,rType:"room",onDelay:false,dMix:0,dTime:0.25,dFdbk:35,dSync:false,dDiv:"1/4"};
      const resetAllFx=()=>updFx({...DEFAULT_FX_VALS});
      const SYNC_DIVS_LIST=["1/1","1/2","1/4","1/8","1/16","1/4.","1/8.","1/4t","1/8t"];
      const syncDivToTime=(div:string)=>{const map:Record<string,number>={"1/1":4,"1/2":2,"1/4":1,"1/8":0.5,"1/16":0.25,"1/4.":1.5,"1/8.":0.75,"1/4t":2/3,"1/8t":1/3};return Math.min(1.9,(map[div]||1)*(60/Math.max(30,bpm)));};
      return(
        <>
          <div onClick={()=>setPadFxTrack(null)} style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(0,0,0,0.55)"}}/>
          <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:1201,background:"#1c1c1e",borderRadius:"16px 16px 0 0",boxShadow:"0 -8px 40px rgba(0,0,0,0.7)",paddingBottom:"env(safe-area-inset-bottom,12px)"}}>
            <div style={{display:"flex",justifyContent:"center",paddingTop:8,paddingBottom:2}}>
              <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.2)"}}/>
            </div>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"2px 14px 6px"}}>
              <span style={{fontSize:10,fontWeight:800,color:tr.color,letterSpacing:"0.08em"}}>🎛 {tr.icon} {tr.label} — FX</span>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                <button onClick={resetAllFx} style={{padding:"2px 8px",borderRadius:5,border:"1px solid rgba(255,45,85,0.3)",background:"rgba(255,45,85,0.07)",color:"#FF2D55",fontSize:7,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em",touchAction:"manipulation"}}>RESET</button>
                <button onClick={()=>setPadFxTrack(null)} style={{background:"rgba(255,255,255,0.08)",border:"none",borderRadius:14,width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.6)",fontSize:14,cursor:"pointer",flexShrink:0}}>×</button>
              </div>
            </div>
            {/* Tab bar */}
            <div style={{display:"flex",gap:2,padding:"0 10px 8px"}}>
              {([
                {k:'PITCH',on:!!(f.onPitch),c:tr.color},
                {k:'FILTER',on:!!(f.onFilter),c:'#64D2FF'},
                {k:'DRIVE',on:!!(f.onDrive),c:'#FF9500'},
                {k:'REV',on:!!(f.onReverb),c:'#64D2FF'},
                {k:'DLY',on:!!(f.onDelay),c:'#30D158'},
                {k:'OUT',on:false,c:'#8E8E93'},
              ] as {k:string;on:boolean;c:string}[]).map(({k,on,c})=>(
                <button key={k} onClick={()=>setPadFxTab(k)}
                  style={{flex:1,padding:"5px 0",borderRadius:6,border:`1px solid ${padFxTab===k?c+"55":"rgba(255,255,255,0.07)"}`,
                    background:padFxTab===k?c+"18":"transparent",color:padFxTab===k?c:"rgba(255,255,255,0.3)",
                    fontSize:7.5,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.05em",
                    position:"relative",touchAction:"manipulation"}}>
                  {k}
                  {on&&<span style={{position:"absolute",top:3,right:5,width:4,height:4,borderRadius:"50%",background:c,boxShadow:`0 0 4px ${c}`}}/>}
                </button>
              ))}
            </div>
            {/* Tab content */}
            <div style={{padding:"4px 14px 16px",minHeight:100}}>
              {/* PITCH */}
              {padFxTab==='PITCH'&&(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <ToggleBtn on={f.onPitch??false} label={f.onPitch?"ON":"OFF"} color={tr.color} onClick={()=>updFx({onPitch:!(f.onPitch??false)})}/>
                    <MidiTag id={`fx_pitch_on_${tr.id}`}/>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,opacity:f.onPitch?1:0.35,pointerEvents:f.onPitch?"auto":"none"}}>
                    <SlRow label="Semitones" keyName="pitch" min={-12} max={12} step={1} val={f.pitch??0} color={tr.color} fmt={v=>(v>0?"+":"")+v+"st"}/>
                    <MidiTag id={`fx_pitch_${tr.id}`}/>
                  </div>
                </div>
              )}
              {/* FILTER */}
              {padFxTab==='FILTER'&&(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <ToggleBtn on={f.onFilter??false} label={f.onFilter?"ON":"OFF"} color="#64D2FF" onClick={()=>updFx({onFilter:!(f.onFilter??false)})}/>
                    <MidiTag id={`fx_flt_on_${tr.id}`}/>
                    <PillGroup val={f.fType||"lowpass"} color="#64D2FF" onSel={k=>updFx({fType:k,onFilter:true})} opts={[{k:"lowpass",l:"LP"},{k:"highpass",l:"HP"},{k:"bandpass",l:"BP"},{k:"notch",l:"NOTCH"}]}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,opacity:f.onFilter?1:0.35,pointerEvents:f.onFilter?"auto":"none"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <SlRow label="Cutoff" keyName="cut" min={80} max={20000} step={50} val={f.cut??5000} color="#64D2FF" fmt={v=>freqFmt(v)+"Hz"}/>
                      <MidiTag id={`fx_cut_${tr.id}`}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <SlRow label="Res" keyName="res" min={0} max={20} step={0.5} val={f.res??0} color="#64D2FF" fmt={v=>Number(v).toFixed(1)+"Q"}/>
                      <MidiTag id={`fx_res_${tr.id}`}/>
                    </div>
                  </div>
                </div>
              )}
              {/* DRIVE */}
              {padFxTab==='DRIVE'&&(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <ToggleBtn on={f.onDrive??false} label={f.onDrive?"ON":"OFF"} color="#FF9500" onClick={()=>updFx({onDrive:!(f.onDrive??false)})}/>
                    <MidiTag id={`fx_drv_on_${tr.id}`}/>
                    <PillGroup val={f.driveMode||"tape"} color="#FF9500" onSel={k=>updFx({driveMode:k,onDrive:true})} opts={[{k:"tape",l:"TAPE"},{k:"tanh",l:"SOFT"},{k:"tube",l:"TUBE"},{k:"bit",l:"BIT"}]}/>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,opacity:f.onDrive?1:0.35,pointerEvents:f.onDrive?"auto":"none"}}>
                    <SlRow label="Amount" keyName="drive" min={0} max={100} step={1} val={f.drive??0} color="#FF9500" fmt={v=>v+"%"}/>
                    <MidiTag id={`fx_drv_${tr.id}`}/>
                  </div>
                </div>
              )}
              {/* REV */}
              {padFxTab==='REV'&&(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <ToggleBtn on={f.onReverb??false} label={f.onReverb?"ON":"OFF"} color="#64D2FF" onClick={()=>updFx({onReverb:!(f.onReverb??false)})}/>
                    <MidiTag id={`fx_rev_on_${tr.id}`}/>
                    <PillGroup val={(f as any).rType||"room"} color="#64D2FF" onSel={(k:string)=>updFx({rType:k,onReverb:true})} opts={[{k:"room",l:"ROOM"},{k:"plate",l:"PLATE"},{k:"hall",l:"HALL"}]}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,opacity:f.onReverb?1:0.35,pointerEvents:f.onReverb?"auto":"none"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <SlRow label="Mix" keyName="rMix" min={0} max={100} step={1} val={f.rMix??0} color="#64D2FF" fmt={(v:number)=>v+"%"}/>
                      <MidiTag id={`fx_rmix_${tr.id}`}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <SlRow label="Decay" keyName="rDecay" min={0.1} max={6} step={0.1} val={f.rDecay??1.5} color="#64D2FF" fmt={(v:number)=>v.toFixed(1)+"s"}/>
                      <MidiTag id={`fx_rdec_${tr.id}`}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <SlRow label="Size" keyName="rSize" min={0} max={1} step={0.05} val={(f as any).rSize??0.5} color="#64D2FF" fmt={(v:number)=>Math.round(v*100)+"%"}/>
                      <MidiTag id={`fx_rsz_${tr.id}`}/>
                    </div>
                  </div>
                </div>
              )}
              {/* DLY */}
              {padFxTab==='DLY'&&(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <ToggleBtn on={f.onDelay??false} label={f.onDelay?"ON":"OFF"} color="#30D158" onClick={()=>updFx({onDelay:!(f.onDelay??false)})}/>
                    <MidiTag id={`fx_dly_on_${tr.id}`}/>
                    <button onClick={()=>updFx({dSync:!(f.dSync??false)})} style={{padding:"3px 8px",borderRadius:4,fontSize:7,fontWeight:800,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${f.dSync?"#30D158":"rgba(48,209,88,0.3)"}`,background:f.dSync?"rgba(48,209,88,0.15)":"transparent",color:f.dSync?"#30D158":"rgba(48,209,88,0.5)",touchAction:"manipulation"}}>SYNC</button>
                    {f.dSync&&(
                      <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
                        {SYNC_DIVS_LIST.map(d=>(
                          <button key={d} onClick={()=>updFx({dDiv:d})} style={{padding:"2px 5px",borderRadius:3,fontSize:6,fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${(f.dDiv||"1/4")===d?"#30D158":"rgba(48,209,88,0.2)"}`,background:(f.dDiv||"1/4")===d?"rgba(48,209,88,0.15)":"transparent",color:(f.dDiv||"1/4")===d?"#30D158":"rgba(255,255,255,0.3)",touchAction:"manipulation"}}>{d}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,opacity:f.onDelay?1:0.35,pointerEvents:f.onDelay?"auto":"none"}}>
                    {!f.dSync&&(
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <SlRow label="Time" keyName="dTime" min={0.01} max={1.9} step={0.01} val={f.dTime??0.25} color="#30D158" fmt={(v:number)=>v.toFixed(2)+"s"}/>
                        <MidiTag id={`fx_dtime_${tr.id}`}/>
                      </div>
                    )}
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <SlRow label="Fdbk" keyName="dFdbk" min={0} max={75} step={1} val={f.dFdbk??35} color="#30D158" fmt={(v:number)=>v+"%"}/>
                      <MidiTag id={`fx_dfdbk_${tr.id}`}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <SlRow label="Mix" keyName="dMix" min={0} max={100} step={1} val={f.dMix??0} color="#30D158" fmt={(v:number)=>v+"%"}/>
                      <MidiTag id={`fx_dmix_${tr.id}`}/>
                    </div>
                  </div>
                </div>
              )}
              {/* OUT */}
              {padFxTab==='OUT'&&(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <SlRow label="Volume" keyName="vol" min={0} max={100} step={1} val={f.vol??80} color="#8E8E93" fmt={v=>v+"%"}/>
                    <MidiTag id={`vol_${tr.id}`}/>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                    <span style={{fontSize:7.5,fontWeight:800,color:"rgba(255,255,255,0.45)",width:56,flexShrink:0,textAlign:"right",letterSpacing:"0.06em",textTransform:"uppercase"}}>Pan</span>
                    <div style={{flex:1,display:"flex",flexDirection:"column",gap:2,minWidth:0,position:"relative"}}>
                      <input type="range" min={-100} max={100} step={1} value={f.pan??0}
                        onChange={e=>updFx({pan:Number(e.target.value)})}
                        onTouchStart={e=>e.stopPropagation()}
                        style={{flex:1,accentColor:"#8E8E93",width:"100%",cursor:"pointer",touchAction:"none"}}/>
                      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,2px)",width:2,height:6,background:"rgba(255,255,255,0.3)",borderRadius:1,pointerEvents:"none"}}/>
                    </div>
                    <span style={{fontSize:9,fontFamily:"monospace",fontWeight:700,color:"#8E8E93",width:46,flexShrink:0,textAlign:"left"}}>{(f.pan??0)===0?"C":(f.pan??0)>0?`R${f.pan??0}`:`L${Math.abs(f.pan??0)}`}</span>
                    <MidiTag id={`pan_${tr.id}`}/>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      );
    })()}

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
      <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(12px)"}}>
        <div style={{maxWidth:440,width:"100%",borderRadius:20,background:"rgba(18,18,20,0.95)",border:"1px solid rgba(255,255,255,0.1)",padding:"32px 28px",display:"flex",flexDirection:"column",alignItems:"center",gap:18,boxShadow:"0 24px 80px rgba(0,0,0,0.8)"}}>
          {/* Drum kit mascot SVG */}
          <svg viewBox="0 0 140 70" width="140" height="70" fill="none" style={{overflow:"visible",filter:"drop-shadow(0 0 16px rgba(255,45,85,0.6))"}}>
            <ellipse cx="70" cy="58" rx="28" ry="9" stroke="#FF2D55" strokeWidth="1.4" fill="rgba(255,45,85,0.08)"/>
            <ellipse cx="70" cy="58" rx="14" ry="4.5" stroke="rgba(255,45,85,0.4)" strokeWidth="0.8"/>
            <ellipse cx="70" cy="49" rx="28" ry="9" stroke="#FF2D55" strokeWidth="1.4" fill="rgba(255,45,85,0.12)"/>
            <line x1="43" y1="58" x2="43" y2="48" stroke="rgba(255,149,0,0.6)" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="97" y1="58" x2="97" y2="48" stroke="rgba(255,149,0,0.6)" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="28" y1="22" x2="28" y2="50" stroke="#8E8E93" strokeWidth="0.8"/>
            <ellipse cx="28" cy="22" rx="10" ry="2.5" stroke="#FF9500" strokeWidth="1.2" fill="rgba(255,149,0,0.1)"/>
            <line x1="112" y1="18" x2="112" y2="50" stroke="#8E8E93" strokeWidth="0.8"/>
            <ellipse cx="112" cy="18" rx="13" ry="3" stroke="#FFD60A" strokeWidth="1.2" fill="rgba(255,214,10,0.1)"/>
            <ellipse cx="50" cy="42" rx="9" ry="5.5" stroke="#FF9500" strokeWidth="1" fill="rgba(255,149,0,0.08)"/>
            <ellipse cx="90" cy="40" rx="7" ry="5" stroke="#BF5AF2" strokeWidth="1" fill="rgba(191,90,242,0.08)"/>
            <style>{`@keyframes wob{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}} .dmwob{animation:wob 0.8s ease-in-out infinite;transform-origin:70px 58px}`}</style>
            <g className="dmwob">
              <line x1="50" y1="42" x2="30" y2="28" stroke="#30D158" strokeWidth="1.4" strokeLinecap="round"/>
              <circle cx="30" cy="28" r="3" fill="#30D158" opacity="0.9"/>
              <line x1="90" y1="40" x2="110" y2="25" stroke="#5E5CE6" strokeWidth="1.4" strokeLinecap="round"/>
              <circle cx="110" cy="25" r="3" fill="#5E5CE6" opacity="0.9"/>
            </g>
          </svg>
          <div style={{fontSize:26,fontWeight:900,letterSpacing:"0.08em",background:"linear-gradient(90deg,#FF2D55,#FF9500,#FFD60A,#30D158,#5E5CE6)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"gradientShift 4s linear infinite",textAlign:"center",lineHeight:1}}>KICK &amp; SNARE</div>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",letterSpacing:"0.35em",textAlign:"center",marginTop:-10}}>DRUM EXPERIENCE</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",textAlign:"center",lineHeight:1.65,fontWeight:400,maxWidth:340}}>Your TR-808 drum sequencer in the browser. Build grooves, record loops, and explore Euclidean rhythms.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,width:"100%"}}>
            {[
              {icon:"◆",label:"Sequencer",desc:"Program beats step by step",col:"#FF2D55"},
              {icon:"⬡",label:"Euclidean",desc:"Algorithmic polyrhythms",col:"#FFD60A"},
              {icon:"⊙",label:"Looper",desc:"Record & overdub live",col:"#BF5AF2"},
              {icon:"⊞",label:"Live Pads",desc:"Perform in real time",col:"#5E5CE6"},
            ].map(({icon,label,desc,col})=>(
              <div key={label} style={{padding:"10px 12px",borderRadius:10,background:`${col}0A`,border:`1px solid ${col}28`,display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:20,color:col,flexShrink:0}}>{icon}</div>
                <div>
                  <div style={{fontSize:9,fontWeight:800,color:col,letterSpacing:"0.06em"}}>{label}</div>
                  <div style={{fontSize:8,color:"rgba(255,255,255,0.4)",lineHeight:1.4,marginTop:2}}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={()=>{setLaunched();setOverlayVisible(false);}} style={{width:"100%",padding:"13px 0",borderRadius:12,border:"none",background:"linear-gradient(90deg,#FF2D55,#FF9500)",color:"#fff",fontSize:13,fontWeight:900,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em",boxShadow:"0 4px 20px rgba(255,45,85,0.4)"}}>START DRUMMING</button>
          <button onClick={()=>{setLaunched();setOverlayVisible(false);}} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.3)",fontSize:9,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.04em"}}>Skip intro →</button>
        </div>
      </div>
    )}

    {/* ── Master FX Rack bottom sheet ── */}
    {showFxRack&&(
      <>
        <div onClick={()=>setShowFxRack(false)} style={{position:"fixed",inset:0,zIndex:1400,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)"}}/>
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:1401,background:"#1a1a1e",borderRadius:"18px 18px 0 0",boxShadow:"0 -8px 48px rgba(0,0,0,0.8)",paddingBottom:"env(safe-area-inset-bottom,16px)",maxHeight:"88vh",overflowY:"auto",overflowX:"hidden"}}>
          <div style={{display:"flex",justifyContent:"center",paddingTop:10,paddingBottom:4}}>
            <div style={{width:38,height:4,borderRadius:2,background:"rgba(255,255,255,0.18)"}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 20px 10px"}}>
            <span style={{fontSize:12,fontWeight:900,color:"#FF9500",letterSpacing:"0.1em"}}>🎛 MASTER FX RACK</span>
            <button onClick={()=>setShowFxRack(false)} style={{background:"rgba(255,255,255,0.08)",border:"none",borderRadius:16,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.6)",fontSize:16,cursor:"pointer",flexShrink:0}}>×</button>
          </div>
          <FXRack
            gfx={gfx} setGfx={setGfx}
            tracks={[...ALL_TRACKS,...customTracks]}
            themeName={themeName} bpm={bpm}
            midiLM={midiLM} MidiTag={MidiTag}
            isPortrait={isPortrait}
            fxChainOrder={fxChainOrder} setFxChainOrder={setFxChainOrder}
            onChainOrderChange={(o:string[])=>{engine.setChainOrder?.(o);}}
            fxSendPos={fxSendPos} setFxSendPos={setFxSendPos}
            trackFx={trackFx} onTrackFxChange={onTrackFxChange}
          />
        </div>
      </>
    )}
    {/* ── Tutorial overlay ── */}
    <KitBrowser
      open={showKitBrowser}
      onClose={()=>setShowKitBrowser(false)}
      factoryKits={DRUM_KITS}
      userKits={userKits}
      activeKitId={activeKitId}
      onLoadFactory={kit=>{pushHistory();applyKit(kit);setShowKitBrowser(false);}}
      onLoadUser={kit=>{pushHistory();loadUserKit(kit);}}
      onSave={saveCurrentAsKit}
      onRename={renameKit}
      onDelete={deleteKit}
      onUpdateTrackLabels={updateKitTrackLabels}
      onOpenComposer={()=>setShowKitComposer(true)}
      themeName={themeName}
    />
    <KitComposer
      open={showKitComposer}
      onClose={()=>setShowKitComposer(false)}
      factoryKits={DRUM_KITS}
      userKits={userKits}
      tracks={ALL_TRACKS}
      onPreview={previewSample}
      onSave={saveComposedKit}
      themeName={themeName}
    />
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
                <div style={{fontSize:8,color:th.faint,letterSpacing:"0.06em"}}>Kick & Snare — Drum Experience · <span style={{color:"#FF9500",fontWeight:700}}>v{APP_VERSION}</span></div>
              </div>
            </div>
            <button onClick={()=>setShowInfo(false)} style={{width:28,height:28,border:"1px solid rgba(255,255,255,0.12)",borderRadius:6,background:"transparent",color:th.dim,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          {/* Sections */}
          <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:18}}>
            {([
              {title:"Header",color:"#FF9500",icon:"🎸",items:[
                {key:"K (logo)",desc:"Icon that pulses on every downbeat — shows that audio is active."},
                {key:"◀ Kit ▶",desc:"Switch between sound kits: 808, CR-78 Vintage, Kit 3, Kit 8. Each kit recolors all track sounds."},
                {key:"Mascot",desc:"Animated drummer that hits the drums matching active tracks. Bob speed and glow halo follow the BPM in real time."},
                {key:"↺ / ↻",desc:"Undo (Ctrl+Z) / Redo (Ctrl+Y) — up to 50 history steps on patterns."},
                {key:"? (this panel)",desc:"Displays this user guide. Click outside to close."},
                {key:"THEME",desc:"Toggle between dark and light theme. Purely visual preference."},
                {key:"LIVE PADS",desc:"Switch to Live Pads view: 8 colored pads playable by touch for real-time performance."},
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
                {key:"Velocity",desc:"Hold longer on a pad for a harder hit during live recording."},
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
    {/* ── Live Pads Welcome Popup ── */}
    {showPadsWelcome&&view==="pads"&&(
      <div onClick={()=>setShowPadsWelcome(false)} style={{position:"fixed",bottom:68,left:"50%",transform:"translateX(-50%)",zIndex:210,width:"min(380px,92vw)",borderRadius:14,background:"rgba(20,20,26,0.97)",border:"1px solid rgba(94,92,230,0.45)",boxShadow:"0 6px 32px rgba(0,0,0,0.8)",padding:"16px 18px",cursor:"pointer",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
          <span style={{fontSize:28,lineHeight:1,flexShrink:0}}>⊞</span>
          <div style={{flex:1}}>
            <div className="gradientShift" style={{fontSize:14,fontWeight:900,letterSpacing:"0.05em",marginBottom:8,background:"linear-gradient(90deg,#FF2D55,#FF9500,#FFD60A,#30D158,#5E5CE6)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"gradientShift 4s linear infinite"}}>Welcome to your Drum Experience</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",lineHeight:1.6,marginBottom:12}}>
              You are now in the Live Pads panel — tap or click any pad to trigger drums in real time. Two more views are available:
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
              <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:7,background:"rgba(255,45,85,0.12)",border:"1px solid rgba(255,45,85,0.3)"}}>
                <span style={{fontSize:11}}>▦</span>
                <span style={{fontSize:9,fontWeight:700,color:"#FF2D55",letterSpacing:"0.06em"}}>SEQUENCER</span>
                <span style={{fontSize:8,color:"rgba(255,255,255,0.45)"}}>step grid</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:7,background:"rgba(255,214,10,0.10)",border:"1px solid rgba(255,214,10,0.25)"}}>
                <span style={{fontSize:11}}>⬡</span>
                <span style={{fontSize:9,fontWeight:700,color:"#FFD60A",letterSpacing:"0.06em"}}>EUCLID</span>
                <span style={{fontSize:8,color:"rgba(255,255,255,0.45)"}}>polyrhythms</span>
              </div>
            </div>
          </div>
          <button onClick={e=>{e.stopPropagation();setShowPadsWelcome(false);}} style={{flexShrink:0,background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:16,cursor:"pointer",padding:0,lineHeight:1,marginTop:-2}}>✕</button>
        </div>
        <div style={{marginTop:10,fontSize:8,color:"rgba(255,255,255,0.3)",textAlign:"center" as const,letterSpacing:"0.04em"}}>TAP ANYWHERE TO DISMISS</div>
      </div>
    )}
    {/* ── Sequencer Welcome Popup ── */}
    {showSeqWelcome&&view==="sequencer"&&(
      <div onClick={()=>setShowSeqWelcome(false)} style={{position:"fixed",bottom:68,left:"50%",transform:"translateX(-50%)",zIndex:210,width:"min(400px,93vw)",borderRadius:14,background:"rgba(20,20,26,0.97)",border:"1px solid rgba(255,45,85,0.35)",boxShadow:"0 6px 32px rgba(0,0,0,0.8)",padding:"16px 18px",cursor:"pointer",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
          <span style={{fontSize:26,lineHeight:1,flexShrink:0}}>▦</span>
          <div style={{flex:1}}>
            <div className="gradientShift" style={{fontSize:14,fontWeight:900,letterSpacing:"0.05em",marginBottom:8,background:"linear-gradient(90deg,#FF2D55,#FF9500,#FFD60A,#30D158,#5E5CE6)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"gradientShift 4s linear infinite"}}>The Step Sequencer</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",lineHeight:1.6,marginBottom:10}}>
              Program your beats step by step — click a cell to activate it, drag up or down to set its velocity. Each row is a drum track. Use <strong style={{color:"#FF2D55"}}>REC</strong> to capture a live performance, browse <strong style={{color:"#5E5CE6"}}>PRESETS</strong> for ready-made patterns, or build a full track in the <strong style={{color:"#BF5AF2"}}>SONG ARRANGER</strong>.
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
              <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:6,background:"rgba(255,45,85,0.12)",border:"1px solid rgba(255,45,85,0.3)"}}>
                <span style={{fontSize:9,fontWeight:700,color:"#FF2D55",letterSpacing:"0.05em"}}>⏺ REC</span>
                <span style={{fontSize:8,color:"rgba(255,255,255,0.4)"}}>record live hits</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:6,background:"rgba(94,92,230,0.10)",border:"1px solid rgba(94,92,230,0.28)"}}>
                <span style={{fontSize:9,fontWeight:700,color:"#5E5CE6",letterSpacing:"0.05em"}}>■ PRESETS</span>
                <span style={{fontSize:8,color:"rgba(255,255,255,0.4)"}}>ready-made patterns</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:6,background:"rgba(191,90,242,0.10)",border:"1px solid rgba(191,90,242,0.28)"}}>
                <span style={{fontSize:9,fontWeight:700,color:"#BF5AF2",letterSpacing:"0.05em"}}>♫ SONG ARRANGER</span>
                <span style={{fontSize:8,color:"rgba(255,255,255,0.4)"}}>chain patterns</span>
              </div>
            </div>
          </div>
          <button onClick={e=>{e.stopPropagation();setShowSeqWelcome(false);}} style={{flexShrink:0,background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:16,cursor:"pointer",padding:0,lineHeight:1,marginTop:-2}}>✕</button>
        </div>
        <div style={{marginTop:10,fontSize:8,color:"rgba(255,255,255,0.3)",textAlign:"center" as const,letterSpacing:"0.04em"}}>TAP ANYWHERE TO DISMISS</div>
      </div>
    )}
    {/* ── Euclid Welcome Popup ── */}
    {showEuclidWelcome&&view==="euclid"&&(
      <div onClick={()=>setShowEuclidWelcome(false)} style={{position:"fixed",bottom:68,left:"50%",transform:"translateX(-50%)",zIndex:210,width:"min(400px,93vw)",borderRadius:14,background:"rgba(20,20,26,0.97)",border:"1px solid rgba(255,214,10,0.3)",boxShadow:"0 6px 32px rgba(0,0,0,0.8)",padding:"16px 18px",cursor:"pointer",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
          <span style={{fontSize:26,lineHeight:1,flexShrink:0}}>⬡</span>
          <div style={{flex:1}}>
            <div className="gradientShift" style={{fontSize:14,fontWeight:900,letterSpacing:"0.05em",marginBottom:8,background:"linear-gradient(90deg,#FF2D55,#FF9500,#FFD60A,#30D158,#5E5CE6)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"gradientShift 4s linear infinite"}}>The Euclidean Sequencer</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",lineHeight:1.6,marginBottom:10}}>
              Euclidean rhythms spread N hits as evenly as possible across M steps — a mathematical approach found in African, Cuban and Middle-Eastern music. Dial in hits, steps and rotation to build polyrhythms. Jump-start with a <strong style={{color:"#FFD60A"}}>PRESET</strong> or chain your clips in the <strong style={{color:"#BF5AF2"}}>SONG ARRANGER</strong>.
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
              <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:6,background:"rgba(255,214,10,0.10)",border:"1px solid rgba(255,214,10,0.28)"}}>
                <span style={{fontSize:9,fontWeight:700,color:"#FFD60A",letterSpacing:"0.05em"}}>⬡ PRESETS</span>
                <span style={{fontSize:8,color:"rgba(255,255,255,0.4)"}}>ready-made polyrhythms</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:6,background:"rgba(191,90,242,0.10)",border:"1px solid rgba(191,90,242,0.28)"}}>
                <span style={{fontSize:9,fontWeight:700,color:"#BF5AF2",letterSpacing:"0.05em"}}>♫ SONG ARRANGER</span>
                <span style={{fontSize:8,color:"rgba(255,255,255,0.4)"}}>chain patterns</span>
              </div>
            </div>
          </div>
          <button onClick={e=>{e.stopPropagation();setShowEuclidWelcome(false);}} style={{flexShrink:0,background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:16,cursor:"pointer",padding:0,lineHeight:1,marginTop:-2}}>✕</button>
        </div>
        <div style={{marginTop:10,fontSize:8,color:"rgba(255,255,255,0.3)",textAlign:"center" as const,letterSpacing:"0.04em"}}>TAP ANYWHERE TO DISMISS</div>
      </div>
    )}
    {/* ── Bottom Navigation Bar ── */}
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,display:"flex",alignItems:"stretch",background:"rgba(14,14,16,0.97)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderTop:`1.5px solid ${th.sBorder}`,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
      {([
        {id:"sequencer",label:"SEQUENCER",icon:"▦",color:"#FF2D55",hint:"Sequencer · TR-808 step grid · Click = on/off · Drag ↕ = velocity · Long-press = probability",act:()=>view!=="sequencer"&&switchView("sequencer")},
        {id:"pads",label:"LIVE PADS",icon:"⊞",color:"#5E5CE6",hint:"Live Pads · 8 colored pads playable in real time by touch or keyboard · Perfect for performing",act:()=>{switchView("pads");setShowLooper(false);clearFreeCapture();}},
        {id:"euclid",label:"EUCLID",icon:"⬡",color:"#FFD60A",hint:"Euclidean Sequencer · Distributes N hits across M steps mathematically · African rhythms, polymeters",act:()=>view!=="euclid"&&switchView("euclid")},
      ] as const).map(tab=>{
        const active=view===tab.id;
        return (
          <button
            key={tab.id}
            data-hint={tab.hint}
            onClick={tab.act}
            style={{
              flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,
              padding:"11px 6px 9px",border:"none",
              borderTop:`3px solid ${active?tab.color:"transparent"}`,
              background:active?`${tab.color}18`:"transparent",
              color:active?tab.color:`${tab.color}66`,
              cursor:"pointer",fontFamily:"inherit",textTransform:"uppercase" as const,
              transition:"all 0.2s cubic-bezier(0.32,0.72,0,1)",
              boxShadow:active?`inset 0 1px 0 ${tab.color}33`:"none",
            }}
          >
            <span style={{fontSize:22,lineHeight:1,filter:active?`drop-shadow(0 0 6px ${tab.color}88)`:"none",transition:"filter 0.2s"}}>{tab.icon}</span>
            <span style={{fontSize:9,fontWeight:800,letterSpacing:"0.06em",lineHeight:1}}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  </>);
}

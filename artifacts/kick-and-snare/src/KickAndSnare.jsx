import { useState, useEffect, useRef, useCallback } from "react";
import { DEFAULT_SAMPLES, b64toAB } from "./defaultSamples";

const THEMES={
  daylight:{bg:"linear-gradient(170deg,#F0EDE7 0%,#E6E2DB 100%)",surface:"rgba(0,0,0,0.06)",sBorder:"rgba(0,0,0,0.18)",text:"#1a1a1a",dim:"#666",faint:"#aaa",stepOff:"rgba(0,0,0,0.07)",stepAlt:"rgba(0,0,0,0.11)",cursor:"rgba(0,0,0,0.18)",btn:"rgba(0,0,0,0.09)",btnH:"rgba(0,0,0,0.16)"},
  dark:{bg:"linear-gradient(170deg,#0F0F0F 0%,#1A1A1A 100%)",surface:"rgba(255,255,255,0.04)",sBorder:"rgba(255,255,255,0.1)",text:"#F0F0F0",dim:"#777",faint:"#444",stepOff:"rgba(255,255,255,0.035)",stepAlt:"rgba(255,255,255,0.055)",cursor:"rgba(255,255,255,0.12)",btn:"rgba(255,255,255,0.07)",btnH:"rgba(255,255,255,0.13)"}
};

const TIME_SIGS=[
  {label:"4/4",beats:4,steps:16,groups:[4,4,4,4],accents:[0],stepDiv:4},
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


const defFx=()=>({pitch:0,fType:"lowpass",cut:20000,res:0,drive:0,crush:0,cThr:-24,cRat:1,rMix:0,rDecay:1.5,dMix:0,dTime:0.25,dSync:false,dDiv:"1/4",vol:80,pan:0,
  onPitch:true,onFilter:true,onDrive:true,onComp:true,onReverb:false,onDelay:false});

const DELAY_DIVS=["1/4","1/8","1/16","1/4d","1/8d","1/4t","1/8t"];
const divToSec=(div,bpm)=>{const b=60/bpm;const m={"1/4":b,"1/8":b/2,"1/16":b/4,"1/4d":b*1.5,"1/8d":b*0.75,"1/4t":b*2/3,"1/8t":b/3};return m[div]||b;};

// ═══ Euclidean Templates ═══
const EUCLID_TEMPLATES=[
  {name:"Tresillo",   origin:"Africa / Cuba",   region:"Africa",     N:8,  hits:[0,3,6],           desc:"E(3,8) — universal root rhythm",     instr:"kick"},
  {name:"Fume Fume",  origin:"Ghana (Ewe)",     region:"Africa",     N:12, hits:[0,2,4,7,9],       desc:"E(5,12) — Ghanaian song pattern",    instr:"hihat"},
  {name:"Bembé",      origin:"Yoruba / Cuba",   region:"Africa",     N:12, hits:[0,2,3,5,7,8,10],  desc:"E(7,12) — heart of Afro jazz",       instr:"snare"},
  {name:"Shiko",      origin:"Nigeria (Ewe)",   region:"Africa",     N:16, hits:[0,4,6,10,12],     desc:"E(5,16) — ritual dance pattern",     instr:"perc"},
  {name:"Soukous",    origin:"Congo",           region:"Africa",     N:12, hits:[0,2,4,6,9,11],    desc:"Congolese clave",                    instr:"hihat"},
  {name:"Habanera",   origin:"Cuba",            region:"Afro-Cuban", N:8,  hits:[0,3,5,7],         desc:"Foundation of danzón and tango",     instr:"kick"},
  {name:"Cinquillo",  origin:"Cuba",            region:"Afro-Cuban", N:8,  hits:[0,2,3,5,6],       desc:"E(5,8) — son and guaracha",          instr:"perc"},
  {name:"Clave 3-2",  origin:"Cuba (Son)",      region:"Afro-Cuban", N:16, hits:[0,3,6,10,12],     desc:"Backbone of Cuban music",            instr:"clap"},
  {name:"Clave 2-3",  origin:"Cuba (Son)",      region:"Afro-Cuban", N:16, hits:[2,4,8,11,14],     desc:"Reversed clave direction",           instr:"clap"},
  {name:"Rumba Clave",origin:"Cuba (Rumba)",    region:"Afro-Cuban", N:16, hits:[0,3,7,10,12],     desc:"More syncopated — 3rd beat shifted", instr:"clap"},
  {name:"Guaguancó",  origin:"Cuba (Rumba)",    region:"Afro-Cuban", N:12, hits:[0,3,4,6,10],      desc:"Urban rumba from Havana",            instr:"snare"},
  {name:"Baião",      origin:"Brazil (NE)",     region:"Brazil",     N:16, hits:[0,3,8,11],        desc:"Zabumba of the sertão",              instr:"kick"},
  {name:"Maracatu",   origin:"Pernambuco",      region:"Brazil",     N:16, hits:[0,6,10,12],       desc:"African royal court rhythm",         instr:"kick"},
  {name:"Bossa Nova", origin:"Brazil (Rio)",    region:"Brazil",     N:16, hits:[0,3,6,8,11,14],   desc:"João Gilberto's guitar pattern",     instr:"hihat"},
  {name:"Surdo",      origin:"Brazil (Samba)",  region:"Brazil",     N:16, hits:[0,8],             desc:"Deep pulse of the batucada",         instr:"kick"},
  {name:"Caixa",      origin:"Brazil (Samba)",  region:"Brazil",     N:16, hits:[0,2,4,6,8,10,12,14],desc:"Samba snare in eighth notes",      instr:"snare"},
  {name:"Xote",       origin:"Brazil (NE)",     region:"Brazil",     N:8,  hits:[0,2,5,7],         desc:"Forró quadrilha pattern",            instr:"hihat"},
];
const EUCLID_REGIONS=["Africa","Afro-Cuban","Brazil"];
const EUCLID_RCOL={"Africa":"#FFD60A","Afro-Cuban":"#FF9500","Brazil":"#30D158"};

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
  constructor(){this.ctx=null;this.mg=null;this.buf={};this.rv=null;this.ch={};this._c={};this.ana={};}
  init(){if(this.ctx)return;this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.mg=this.ctx.createGain();this.mg.gain.value=0.8;this.mg.connect(this.ctx.destination);this._mkRv();TRACKS.forEach(t=>this._build(t.id));this._loadDefaults();}
  async _loadDefaults(){
    for(const [id,b64] of Object.entries(DEFAULT_SAMPLES)){
      try{const ab=b64toAB(b64);this.buf[id]=await this.ctx.decodeAudioData(ab);}catch(e){console.warn("Default sample load failed:",id,e);}
    }
  }
  _mkRv(decay){
    const d=decay||2;const sr=this.ctx.sampleRate;const l=Math.ceil(sr*Math.min(5,d));
    const b=this.ctx.createBuffer(2,l,sr);
    const erTaps=[0.012,0.019,0.028,0.037,0.042,0.053,0.067];
    const erGains=[0.7,0.5,0.6,0.35,0.4,0.3,0.25];
    for(let ch=0;ch<2;ch++){
      const data=b.getChannelData(ch);
      for(let t=0;t<erTaps.length;t++){const idx=Math.floor(erTaps[t]*sr*(ch===1?1.05:1));if(idx<l)data[idx]+=(erGains[t]*(0.8+Math.random()*0.4))*(ch===0?1:0.9);}
      for(let i=Math.floor(sr*0.08);i<l;i++){const t=i/sr;const env=Math.exp(-t*3/d);const lpf=Math.exp(-t*1.5/d);const noise=Math.random()*2-1;const raw=noise*env;data[i]+=(raw*lpf*0.5+(i>0?data[i-1]*0.3:0));}
    }
    this.rv=b;
  }
  updateReverb(decay){this._mkRv(decay);TRACKS.forEach(id=>{const c=this.ch[id.id||id];if(c&&c.conv){try{c.conv.buffer=this.rv;}catch(e){}}});}
  _build(id){
    const c={};c.in=this.ctx.createGain();c.flt=this.ctx.createBiquadFilter();c.flt.type="lowpass";c.flt.frequency.value=20000;
    c.drv=this.ctx.createWaveShaper();c.drv.oversample="2x";c.drv.curve=this._cv(0);
    c.cmp=this.ctx.createDynamicsCompressor();c.cmp.threshold.value=-24;c.cmp.ratio.value=1;c.cmp.attack.value=0.003;c.cmp.release.value=0.15;
    c.vol=this.ctx.createGain();c.vol.gain.value=0.8;
    c.pan=this.ctx.createStereoPanner?this.ctx.createStereoPanner():this.ctx.createGain();
    c.dry=this.ctx.createGain();c.rvG=this.ctx.createGain();c.rvG.gain.value=0;c.conv=this.ctx.createConvolver();c.conv.buffer=this.rv;
    c.dlG=this.ctx.createGain();c.dlG.gain.value=0;c.dl=this.ctx.createDelay(2);c.dl.delayTime.value=0.25;c.dlFb=this.ctx.createGain();c.dlFb.gain.value=0.3;
    // Analyser for VU meters
    c.ana=this.ctx.createAnalyser();c.ana.fftSize=256;
    c.in.connect(c.flt);c.flt.connect(c.drv);c.drv.connect(c.cmp);c.cmp.connect(c.vol);c.vol.connect(c.pan);
    c.pan.connect(c.dry);c.dry.connect(this.mg);c.pan.connect(c.rvG);c.rvG.connect(c.conv);c.conv.connect(this.mg);
    c.pan.connect(c.dlG);c.dlG.connect(c.dl);c.dl.connect(c.dlFb);c.dlFb.connect(c.dl);c.dl.connect(this.mg);
    c.pan.connect(c.ana);
    this.ch[id]=c;this.ana[id]=c.ana;
  }
  _cv(d){const k=Math.round(d*100);if(this._c[k])return this._c[k];const n=8192,a=new Float32Array(n),v=d*5;for(let i=0;i<n;i++){const x=i*2/n-1;a[i]=v===0?x:((1+v)*x)/(1+v*Math.abs(x));}this._c[k]=a;return a;}
  uFx(id,f){
    const c=this.ch[id];if(!c)return;const t=this.ctx.currentTime;
    c.flt.type=f.onFilter?(f.fType||"lowpass"):"lowpass";
    c.flt.frequency.setTargetAtTime(f.onFilter?Math.min(20000,Math.max(20,f.cut||20000)):20000,t,0.02);
    c.flt.Q.setTargetAtTime(f.onFilter?(f.res||0):0,t,0.02);
    c.drv.curve=f.onDrive?this._cv((f.drive||0)/100):this._cv(0);
    c.cmp.threshold.setTargetAtTime(f.onComp?(f.cThr||-24):0,t,0.02);
    c.cmp.ratio.setTargetAtTime(f.onComp?Math.max(1,f.cRat||1):1,t,0.02);
    c.vol.gain.setTargetAtTime((f.vol||80)/100,t,0.02);
    if(c.pan.pan)c.pan.pan.setTargetAtTime((f.pan||0)/100,t,0.02);
    const wv=f.onReverb?(f.rMix||0)/100:0;const wd=f.onDelay?(f.dMix||0)/100:0;
    c.dry.gain.setTargetAtTime(Math.max(0.1,1-wv*0.5-wd*0.5),t,0.02);
    c.rvG.gain.setTargetAtTime(wv,t,0.02);c.dlG.gain.setTargetAtTime(wd,t,0.02);
    c.dl.delayTime.setTargetAtTime(f.dTime||0.25,t,0.02);
  }
  async load(id,file){this.init();try{const a=await file.arrayBuffer();this.buf[id]=await this.ctx.decodeAudioData(a);return true;}catch(e){return false;}}
  play(id,vel=1,dMs=0,f=null,at=null){
    if(!this.ctx)this.init();const c=this.ch[id];if(!c)return;
    const raw=at!==null?(at+dMs/1000):(this.ctx.currentTime+Math.max(0,dMs)/1000);
    const t=Math.max(this.ctx.currentTime+0.001,raw);
    if(f)this.uFx(id,f);const r=Math.pow(2,((f?.onPitch?f.pitch:0)||0)/12);
    if(this.buf[id]){const s=this.ctx.createBufferSource();s.buffer=this.buf[id];s.playbackRate.setValueAtTime(r,t);const g=this.ctx.createGain();g.gain.setValueAtTime(vel,t);s.connect(g);g.connect(c.in);s.start(t);s.stop(t+s.buffer.duration/r+0.1);}
    else this._syn(id,t,vel,c.in);
  }
  getLevel(id){
    const an=this.ana[id];if(!an)return 0;
    const buf=new Uint8Array(an.fftSize);an.getByteTimeDomainData(buf);
    let mx=0;for(let i=0;i<buf.length;i++){const v=Math.abs(buf[i]-128)/128;if(v>mx)mx=v;}
    return mx;
  }
  _syn(id,t,v,d){v*=0.8;const ctx=this.ctx;const S={
    kick:()=>{const o=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain(),g2=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(180,t);o.frequency.exponentialRampToValueAtTime(28,t+0.12);g.gain.setValueAtTime(v*1.2,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.5);o.connect(g);g.connect(d);o.start(t);o.stop(t+0.5);o2.type="sine";o2.frequency.setValueAtTime(55,t);g2.gain.setValueAtTime(v*0.6,t);g2.gain.exponentialRampToValueAtTime(0.001,t+0.4);o2.connect(g2);g2.connect(d);o2.start(t);o2.stop(t+0.4);const nb=ctx.createBuffer(1,ctx.sampleRate*0.008,ctx.sampleRate),dd=nb.getChannelData(0);for(let i=0;i<dd.length;i++)dd[i]=(Math.random()*2-1)*Math.exp(-i*8/dd.length);const ns=ctx.createBufferSource();ns.buffer=nb;const ng=ctx.createGain();ng.gain.setValueAtTime(v*0.4,t);ns.connect(ng);ng.connect(d);ns.start(t);},
    snare:()=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type="triangle";o.frequency.setValueAtTime(220,t);o.frequency.exponentialRampToValueAtTime(120,t+0.04);g.gain.setValueAtTime(v*0.6,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.1);o.connect(g);g.connect(d);o.start(t);o.stop(t+0.1);const nb=ctx.createBuffer(1,ctx.sampleRate*0.18,ctx.sampleRate),dd=nb.getChannelData(0);for(let i=0;i<dd.length;i++)dd[i]=(Math.random()*2-1);const ns=ctx.createBufferSource();ns.buffer=nb;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=3500;bp.Q.value=1.5;const ng=ctx.createGain();ng.gain.setValueAtTime(v*0.7,t);ng.gain.exponentialRampToValueAtTime(0.001,t+0.18);ns.connect(bp);bp.connect(ng);ng.connect(d);ns.start(t);ns.stop(t+0.18);},
    hihat:()=>{const g=ctx.createGain();g.gain.setValueAtTime(v*0.3,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.06);g.connect(d);[4000,5340,6800].forEach(f=>{const o=ctx.createOscillator();o.type="square";o.frequency.value=f;const og=ctx.createGain();og.gain.value=0.3;o.connect(og);og.connect(g);o.start(t);o.stop(t+0.06);});const nb=ctx.createBuffer(1,ctx.sampleRate*0.04,ctx.sampleRate),dd=nb.getChannelData(0);for(let i=0;i<dd.length;i++)dd[i]=Math.random()*2-1;const ns=ctx.createBufferSource();ns.buffer=nb;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=9000;const ng=ctx.createGain();ng.gain.setValueAtTime(v*0.25,t);ng.gain.exponentialRampToValueAtTime(0.001,t+0.04);ns.connect(hp);hp.connect(ng);ng.connect(d);ns.start(t);ns.stop(t+0.04);},
    clap:()=>{const g=ctx.createGain();g.connect(d);[0,0.01,0.02].forEach(off=>{const nb=ctx.createBuffer(1,ctx.sampleRate*0.01,ctx.sampleRate),dd=nb.getChannelData(0);for(let j=0;j<dd.length;j++)dd[j]=Math.random()*2-1;const ns=ctx.createBufferSource();ns.buffer=nb;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=2000;bp.Q.value=1;const ig=ctx.createGain();ig.gain.setValueAtTime(v*0.25,t+off);ig.gain.exponentialRampToValueAtTime(0.001,t+off+0.015);ns.connect(bp);bp.connect(ig);ig.connect(g);ns.start(t+off);ns.stop(t+off+0.015);});const nb=ctx.createBuffer(1,ctx.sampleRate*0.15,ctx.sampleRate),dd=nb.getChannelData(0);for(let i=0;i<dd.length;i++)dd[i]=(Math.random()*2-1);const ns=ctx.createBufferSource();ns.buffer=nb;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=1500;bp.Q.value=2;const ng=ctx.createGain();ng.gain.setValueAtTime(v*0.5,t+0.03);ng.gain.exponentialRampToValueAtTime(0.001,t+0.15);ns.connect(bp);bp.connect(ng);ng.connect(g);ns.start(t+0.03);ns.stop(t+0.15);},
    tom:()=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(60,t+0.15);g.gain.setValueAtTime(v*0.8,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.3);o.connect(g);g.connect(d);o.start(t);o.stop(t+0.3);},
    ride:()=>{const nb=ctx.createBuffer(1,ctx.sampleRate*0.4,ctx.sampleRate),dd=nb.getChannelData(0);for(let i=0;i<dd.length;i++)dd[i]=Math.random()*2-1;const ns=ctx.createBufferSource();ns.buffer=nb;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=5500;const g=ctx.createGain();g.gain.setValueAtTime(v*0.2,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.4);ns.connect(hp);hp.connect(g);g.connect(d);ns.start(t);ns.stop(t+0.4);},
    crash:()=>{const nb=ctx.createBuffer(1,ctx.sampleRate*0.8,ctx.sampleRate),dd=nb.getChannelData(0);for(let i=0;i<dd.length;i++)dd[i]=Math.random()*2-1;const ns=ctx.createBufferSource();ns.buffer=nb;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=3500;const g=ctx.createGain();g.gain.setValueAtTime(v*0.35,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.8);ns.connect(hp);hp.connect(g);g.connect(d);ns.start(t);ns.stop(t+0.8);},
    perc:()=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type="triangle";o.frequency.setValueAtTime(900,t);o.frequency.exponentialRampToValueAtTime(400,t+0.03);g.gain.setValueAtTime(v*0.35,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.06);o.connect(g);g.connect(d);o.start(t);o.stop(t+0.06);},
  };if(S[id])S[id]();}
}
const engine=new Eng();

// ═══ SSL FX Strip ═══
function SSL({tid,color,fx,setFx,bpm,onClose,themeName="dark"}){
  const th=THEMES[themeName]||THEMES.dark;const f=fx[tid]||defFx();
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
    <div style={{display:"flex",gap:4,marginBottom:12}}>
      {["lowpass","highpass","bandpass"].map(ft=>(<button key={ft} onClick={()=>u("fType",ft)} style={{flex:1,padding:"4px 0",borderRadius:4,border:"1px solid",fontSize:8,fontWeight:700,fontFamily:"inherit",cursor:"pointer",textTransform:"uppercase",borderColor:f.fType===ft?color+"55":th.sBorder,background:f.fType===ft?color+"15":"transparent",color:f.fType===ft?color:th.dim}}>{ft.replace("pass","")}</button>))}
    </div>
    <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
      <Sec title="Pitch" c="#FF2D55" on={f.onPitch} onToggle={()=>tog("onPitch")}><VF label="Semi" value={f.pitch} min={-12} max={12} step={1} unit="st" c="#FF2D55" onChange={v=>u("pitch",Math.round(v))}/></Sec>
      <Sec title="Filter" c="#555" on={f.onFilter} onToggle={()=>tog("onFilter")}><VF label="Cutoff" value={f.cut} min={20} max={20000} step={10} unit="" c="#555" onChange={v=>u("cut",Math.round(v))}/><VF label="Reso" value={f.res} min={0} max={25} step={0.5} unit="" c="#555" onChange={v=>u("res",v)}/></Sec>
      <Sec title="Drive" c="#FF9500" on={f.onDrive} onToggle={()=>tog("onDrive")}><VF label="Satur." value={f.drive} min={0} max={100} step={1} unit="%" c="#FF9500" onChange={v=>u("drive",Math.round(v))}/><VF label="Crush" value={f.crush} min={0} max={100} step={1} unit="%" c="#BF5AF2" onChange={v=>u("crush",Math.round(v))}/></Sec>
      <Sec title="Comp" c="#5E5CE6" on={f.onComp} onToggle={()=>tog("onComp")}><VF label="Thresh" value={f.cThr} min={-60} max={0} step={1} unit="dB" c="#5E5CE6" onChange={v=>u("cThr",Math.round(v))}/><VF label="Ratio" value={f.cRat} min={1} max={20} step={0.5} unit=":1" c="#5E5CE6" onChange={v=>u("cRat",v)}/></Sec>
      <Sec title="Reverb" c="#64D2FF" on={f.onReverb} onToggle={()=>tog("onReverb")}><VF label="Mix" value={f.rMix} min={0} max={100} step={1} unit="%" c="#64D2FF" onChange={v=>u("rMix",Math.round(v))}/><VF label="Decay" value={f.rDecay} min={0.1} max={5} step={0.1} unit="s" c="#64D2FF" onChange={v=>{u("rDecay",v);if(engine.ctx)engine.updateReverb(v);}}/></Sec>
      <Sec title="Delay" c="#30D158" on={f.onDelay} onToggle={()=>tog("onDelay")}>
        <VF label="Mix" value={f.dMix} min={0} max={100} step={1} unit="%" c="#30D158" onChange={v=>u("dMix",Math.round(v))}/>
        {f.dSync?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:30,flex:1}}><span style={{fontSize:8,fontWeight:700,color:th.dim}}>Div</span><div style={{display:"flex",flexDirection:"column",gap:2}}>{DELAY_DIVS.map(dv=>(<button key={dv} onClick={()=>{u("dDiv",dv);u("dTime",divToSec(dv,bpm));}} style={{padding:"2px 6px",borderRadius:3,border:`1px solid ${f.dDiv===dv?"rgba(48,209,88,0.4)":th.sBorder}`,background:f.dDiv===dv?"rgba(48,209,88,0.1)":"transparent",color:f.dDiv===dv?"#30D158":th.dim,fontSize:7,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{dv}</button>))}</div></div>)
        :(<VF label="Time" value={f.dTime} min={0.05} max={1} step={0.05} unit="s" c="#30D158" onChange={v=>u("dTime",v)}/>)}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:30}}><span style={{fontSize:8,fontWeight:700,color:th.dim}}>Sync</span><button onClick={()=>{const ns=!f.dSync;u("dSync",ns);if(ns)u("dTime",divToSec(f.dDiv||"1/4",bpm));}} style={{padding:"4px 8px",borderRadius:4,border:`1px solid ${f.dSync?"rgba(48,209,88,0.4)":th.sBorder}`,background:f.dSync?"rgba(48,209,88,0.12)":"transparent",color:f.dSync?"#30D158":th.dim,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{f.dSync?"ON":"OFF"}</button></div>
      </Sec>
      <Sec title="Output" c="#888" on={true} onToggle={()=>{}}><VF label="Volume" value={f.vol} min={0} max={100} step={1} unit="%" c="#888" onChange={v=>u("vol",Math.round(v))}/><VF label="Pan" value={f.pan} min={-100} max={100} step={1} unit={f.pan===0?"C":f.pan<0?"L":"R"} c="#888" onChange={v=>u("pan",Math.round(v))}/></Sec>
    </div>
  </div>);
}

// ═══ Main ═══
export default function KickAndSnare(){
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

  const [bpm,setBpm]=useState(90);const [playing,setPlaying]=useState(false);const [cStep,setCStep]=useState(-1);
  const [swing,setSwing]=useState(0);const [muted,setMuted]=useState({});const [soloed,setSoloed]=useState(null);
  const [view,setView]=useState("sequencer");const [act,setAct]=useState(DEFAULT_ACTIVE);const [showAdd,setShowAdd]=useState(false);
  const [customTracks,setCustomTracks]=useState([]);
  const [newTrackName,setNewTrackName]=useState("");const [showCustomInput,setShowCustomInput]=useState(false);
  const [euclidParams,setEuclidParams]=useState({});
  const [fxO,setFxO]=useState(null);const [smpN,setSmpN]=useState({kick:"BWJAZZ Kick (default)",snare:"BB3 Snare (default)"});
  const [fx,setFx]=useState(Object.fromEntries(TRACKS.map(t=>[t.id,defFx()])));
  const [stNudge,setStNudge]=useState(mkN(16));
  const [stVel,setStVel]=useState(mkV(16));
  const [stProb,setStProb]=useState(mkP(16));
  const [stRatch,setStRatch]=useState(mkR(16));
  // Song arranger
  const [songChain,setSongChain]=useState([0]);
  const [songMode,setSongMode]=useState(false);
  const [showSong,setShowSong]=useState(false);
  const songPosRef=useRef(0);
  // Session
  // UI
  const [rec,setRec]=useState(false);const [kMap,setKMap]=useState({...DEFAULT_KEY_MAP});const [showK,setShowK]=useState(false);
  const [showTS,setShowTS]=useState(false);const [flash,setFlash]=useState(null);
  const [metro,setMetro]=useState(false);
  const [metroVol,setMetroVol]=useState(10);
  const [dragInfo,setDragInfo]=useState(null);
  const [metroSub,setMetroSub]=useState("off");
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
  const linkBpmSentAt=useRef(0); // timestamp of last BPM we sent to Carabiner
  // VU meter refs — direct DOM manipulation for performance
  const vuRefs=useRef({});

  const allT=[...ALL_TRACKS,...customTracks];
  const atO=act.map(id=>allT.find(t=>t.id===id)).filter(Boolean);
  const inact=ALL_TRACKS.filter(t=>!act.includes(t.id));

  const R=useRef({step:-1}).current;
  const tapTimesRef=useRef([]);

  R.pat=pat;R.mut=muted;R.sol=soloed;R.fx=fx;R.sn=stNudge;R.vel=stVel;R.at=act;R.pb=pBank;R.playing=playing;
  R.cp=cPat;R.bpm=bpm;R.sw=swing;R.rec=rec;R.km=kMap;R.sig=sig;R.metro=metro;R.mVol=metroVol;
  R.mSub=metroSub;R.prob=stProb;R.ratch=stRatch;
  R.songMode=songMode;R.songChain=songChain;R.ts=trackSteps;R.lkSync=linkSyncPlay;
  R.mnMap=midiNoteMap;R.mLearn=midiLearnTrack;R.mNotes=midiNotes;
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

  // VU meter animation
  useEffect(()=>{
    let running=true;
    const tick=()=>{
      if(!running)return;
      Object.keys(vuRefs.current).forEach(id=>{
        const el=vuRefs.current[id];
        if(el&&engine.ana[id]){
          const lv=engine.getLevel(id);
          const pct=Math.round(lv*100);
          el.style.width=`${Math.min(100,pct*1.5)}%`;
          el.style.background=pct>50?"#FF2D55":pct>25?"#FF9500":"#30D158";
          el.style.opacity=lv>0.005?"1":"0.15";
        }
      });
      requestAnimationFrame(tick);
    };
    if(playing)requestAnimationFrame(tick);
    return()=>{running=false;};
  },[playing]);

  // Keyboard shortcuts
  const trigPad=useCallback((tid,vel=1)=>{
    engine.init();engine.play(tid,vel,0,R.fx[tid]||defFx());
    setFlash(tid);setTimeout(()=>setFlash(null),100);
    if(R.rec&&R.step>=0){
      const gSt=R.sig?.steps||16;const tSt=R.ts?.[tid]||gSt;const ratio=Math.max(1,Math.round(tSt/gSt));const s=ratio>1?R.step*ratio:R.step%tSt;
      const v100=Math.max(1,Math.round(vel*100));
      setPBank(pb=>{const n=[...pb];const p={...n[R.cp]};p[tid]=[...p[tid]];p[tid][s]=1;n[R.cp]=p;return n;});
      setStVel(sv=>({...sv,[tid]:{...(sv[tid]||{}),[s]:v100}}));
    }
  },[]);
  R.trigPad=trigPad;
  const ssRef=useRef(null);const playRef=useRef(false);
  R.ss=ssRef;R.setRec=setRec;
  useEffect(()=>{playRef.current=playing;},[playing]);
  useEffect(()=>{
    const down=e=>{if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")return;
      if(e.code==="Space"){e.preventDefault();ssRef.current?.();return;}
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
        for(let ri=0;ri<r;ri++)engine.play(tr.id,v*(ri===0?1:0.65),(ri===0?(nudge[tr.id]?.[psn]||0):0),f[tr.id]||defFx(),ptime+ri*(bd/r));
      }
    };
    ALL_TRACKS.forEach(tr=>{
      if(!at.includes(tr.id))return;if(s&&s!==tr.id)return;if(m[tr.id])return;
      const tSteps=R.pb[R.cp]?._steps?.[tr.id]||(R.sig?.steps||16);
      const gSt=R.sig?.steps||16;const ratio=Math.max(1,Math.round(tSteps/gSt));
      if(ratio>1){for(let i=0;i<ratio;i++)playTrStep(tr,sn*ratio+i,time+i*bd/ratio);}
      else{playTrStep(tr,sn%tSteps,time);}
    });
  },[]);

  const schLoop=useCallback(()=>{
    if(!engine.ctx)return;const ct=engine.ctx.currentTime;const cs=R.sig;const gr=cs.groups||[cs.steps];
    let stepped=false;
    while(nxtRef.current<ct+0.1){
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
      stepped=true;
      const bd=cs.stepDiv?(60/R.bpm)/cs.stepDiv:(60/R.bpm)*cs.beats/cs.steps;
      const sw=bd*(R.sw/100);nxtRef.current+=R.step%2===0?(bd-sw):(bd+sw);
    }
    if(stepped)setCStep(R.step);
    schRef.current=setTimeout(schLoop,25);
  },[schSt]);

  const startStop=()=>{
    engine.init();
    if(playing){
      clearTimeout(schRef.current);setPlaying(false);setCStep(-1);R.step=-1;setRec(false);
    }else{
      R.step=-1;songPosRef.current=0;nxtRef.current=engine.ctx.currentTime+0.05;schLoop();setPlaying(true);
    }
  };
  ssRef.current=startStop;
  useEffect(()=>()=>clearTimeout(schRef.current),[]);


  // Step interactions
  const handleClick=(tid,step)=>setPat(p=>{const r=[...(p[tid]||[])];r[step]=r[step]?0:1;return{...p,[tid]:r};});
  const didDragRef=useRef(false);
  const startDrag=(tid,step,e)=>{
    e.preventDefault();
    const ac=!!pat[tid]?.[step];
    const startX=e.touches?e.touches[0].clientX:e.clientX;
    const startY=e.touches?e.touches[0].clientY:e.clientY;
    const startNudge=stNudge[tid]?.[step]||0;const startVel=stVel[tid]?.[step]??100;
    let axis=null;let moved=false;didDragRef.current=false;
    if(ac)setDragInfo({tid,step,axis:null});
    const mv=ev=>{
      if(!ac)return;ev.preventDefault();
      const cx=ev.touches?ev.touches[0].clientX:ev.clientX;const cy=ev.touches?ev.touches[0].clientY:ev.clientY;
      const dx=cx-startX,dy=cy-startY;
      if(!axis&&(Math.abs(dx)>5||Math.abs(dy)>5)){axis=Math.abs(dx)>Math.abs(dy)?"h":"v";moved=true;didDragRef.current=true;setDragInfo({tid,step,axis});}
      if(axis==="h"){const nv=Math.round((startNudge+dx*0.5)/5)*5;setStNudge(p=>{const n={...p};const src=n[tid];const a=Array.isArray(src)?[...src]:Array(STEPS).fill(0);a[step]=Math.max(-NR,Math.min(NR,nv));n[tid]=a;return n;});}
      else if(axis==="v"){const nv=Math.round(startVel-dy*0.8);setStVel(p=>{const n={...p};const src=n[tid];const a=Array.isArray(src)?[...src]:Array(STEPS).fill(100);a[step]=Math.max(5,Math.min(100,nv));n[tid]=a;return n;});}
    };
    const up=()=>{
      setDragInfo(null);
      if(!moved){dblTap(tid,step);setTimeout(()=>{if(!didDragRef.current)handleClick(tid,step);},10);}
      window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);
      window.removeEventListener("touchmove",mv);window.removeEventListener("touchend",up);
    };
    window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);
    window.addEventListener("touchmove",mv,{passive:false});window.addEventListener("touchend",up);
  };
  const lastTap=useRef({});
  const dblTap=(tid,step)=>{
    const key=`${tid}-${step}`;const now=Date.now();
    if(lastTap.current[key]&&now-lastTap.current[key]<300){
      setStNudge(p=>{const n={...p};const src=n[tid];const a=Array.isArray(src)?[...src]:Array(STEPS).fill(0);a[step]=0;n[tid]=a;return n;});
      setStVel(p=>{const n={...p};const src=n[tid];const a=Array.isArray(src)?[...src]:Array(STEPS).fill(100);a[step]=100;n[tid]=a;return n;});
      didDragRef.current=true;lastTap.current[key]=0;
    }else lastTap.current[key]=now;
  };

  // Right-click: cycle ratchet 1→2→3→4→1
  const handleRightClick=(tid,step,e)=>{
    e.preventDefault();if(!pat[tid]?.[step])return;
    setStRatch(p=>{const n={...p};const src=n[tid];const a=Array.isArray(src)?[...src]:Array(STEPS).fill(1);a[step]=(a[step]%4)+1;n[tid]=a;return n;});
  };

  // Shift-click: cycle probability 100→75→50→25→100
  const handleShiftClick=(tid,step,e)=>{
    if(!e.shiftKey)return false;
    if(!pat[tid]?.[step])return true;
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
    const t={id,label:name.toUpperCase().slice(0,10),icon:CUST_ICONS[customTracks.length%CUST_ICONS.length],color:SEC_COL[(customTracks.length+4)%SEC_COL.length]};
    setCustomTracks(p=>[...p,t]);
    setPBank(pb=>pb.map(pat=>({...pat,[id]:Array(N).fill(0),_steps:{...(pat._steps||{}),[id]:N}})));
    setStVel(p=>({...p,[id]:Array(N).fill(100)}));
    setStNudge(p=>({...p,[id]:Array(N).fill(0)}));
    setStProb(p=>({...p,[id]:Array(N).fill(100)}));
    setStRatch(p=>({...p,[id]:Array(N).fill(1)}));
    setFx(p=>({...p,[id]:defFx()}));
    setAct(a=>[...a,id]);
    setNewTrackName("");setShowCustomInput(false);setShowAdd(false);
    // Auto-open file picker so user can immediately load a sample
    setTimeout(()=>ldFile(id),50);
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

  return(
    <div style={{minHeight:"100vh",background:th.bg,color:th.text,fontFamily:"'JetBrains Mono','SF Mono','Fira Code',monospace",overflow:"auto"}}>
      <input type="file" accept="audio/*" ref={fileRef} onChange={onFile} style={{display:"none"}}/>
      <style>{`@keyframes rb{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}`}</style>
      <div style={{maxWidth:960,margin:"0 auto",padding:"16px 12px"}}>

        {/* ── Header ── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,padding:"10px 0",borderBottom:`1px solid ${th.sBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#FF2D55,#FF9500)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"#fff",boxShadow:"0 0 20px rgba(255,45,85,0.3)"}}>K</div>
            <div>
              <div style={{fontSize:18,fontWeight:800,letterSpacing:"0.08em",background:"linear-gradient(90deg,#FF2D55,#FF9500,#FFD60A)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>KICK & SNARE</div>
              <div style={{fontSize:9,letterSpacing:"0.4em",color:th.dim}}>DRUM SEQUENCER</div>
            </div>
          </div>
          {/* Animated drummer mascot */}
          {(()=>{
            const isAct=id=>act.includes(id)&&!muted[id];
            const hK=(playing&&isAct("kick")&&!!pat.kick?.[cStep])||flash==="kick";
            const hS=(playing&&isAct("snare")&&!!pat.snare?.[cStep])||flash==="snare";
            const hH=(playing&&isAct("hihat")&&!!pat.hihat?.[cStep])||flash==="hihat";
            const hR=(playing&&(isAct("ride")&&!!pat.ride?.[cStep]||isAct("crash")&&!!pat.crash?.[cStep]))||flash==="ride"||flash==="crash";
            const hT=(playing&&isAct("tom")&&!!pat.tom?.[cStep])||flash==="tom";
            const hC=(playing&&isAct("clap")&&!!pat.clap?.[cStep])||flash==="clap"||flash==="perc";
            const lHit=hS||hH||hC;const rHit=hR||hT;const lA=hS?-55:hH?-30:hC?-45:5;const rA=hR?-60:hT?-30:5;
            const anyHit=hK||hS||hH||hR||hT||hC;
            const ac=(playing||anyHit)?"#FF9500":"#bbb";const hi="#FF2D55";const bob=playing?Math.sin((cStep||0)*0.7)*2:anyHit?-3:0;
            const aHH=act.includes("hihat");const aS=act.includes("snare");const aK=act.includes("kick");
            const aT=act.includes("tom");const aR=act.includes("ride")||act.includes("crash");
            const aP=act.includes("clap")||act.includes("perc");
            const show=(v)=>({opacity:v?1:0,transition:"opacity 0.4s, transform 0.4s",transform:v?"scale(1)":"scale(0.7)",transformOrigin:"center"});
            return(
              <svg viewBox="0 0 110 52" width="110" height="52" style={{flexShrink:0,overflow:"visible",willChange:"contents"}}>
                {/* Hi-hat */}
                <g style={show(aHH)}>
                  <line x1="14" y1="16" x2="14" y2="50" stroke="#ccc" strokeWidth="0.7"/>
                  <ellipse cx="14" cy="16" rx="7" ry="1.8" fill={hH?"#fff5e0":"none"} stroke={hH?hi:"#ccc"} strokeWidth={hH?1.5:0.7}/>
                  <ellipse cx="14" cy={hH?"14.5":"15"} rx="7" ry="1.8" fill="none" stroke={hH?hi:"#ccc"} strokeWidth={hH?1.5:0.7}/>
                  {hH&&<><line x1="10" y1="12" x2="8" y2="8" stroke={hi} strokeWidth="0.8" opacity="0.5"/><line x1="18" y1="12" x2="20" y2="8" stroke={hi} strokeWidth="0.8" opacity="0.5"/></>}
                </g>
                {/* Snare */}
                <g style={show(aS)}>
                  <rect x="22" y="30" width="16" height="7" rx="3" fill={hS?"#fff0e8":"none"} stroke={hS?hi:"#ccc"} strokeWidth={hS?1.5:0.7}/>
                  <line x1="24" y1="31" x2="24" y2="36" stroke="#ddd" strokeWidth="0.4"/><line x1="28" y1="31" x2="28" y2="36" stroke="#ddd" strokeWidth="0.4"/>
                  <line x1="32" y1="31" x2="32" y2="36" stroke="#ddd" strokeWidth="0.4"/><line x1="36" y1="31" x2="36" y2="36" stroke="#ddd" strokeWidth="0.4"/>
                  {hS&&<><line x1="22" y1="28" x2="19" y2="25" stroke={hi} strokeWidth="1" opacity="0.6"/><line x1="38" y1="28" x2="41" y2="25" stroke={hi} strokeWidth="1" opacity="0.6"/></>}
                </g>
                {/* Kick drum */}
                <g style={show(aK)}>
                  <ellipse cx="55" cy="42" rx="12" ry="8" fill={hK?"#ffe8e8":"none"} stroke={hK?hi:"#ccc"} strokeWidth={hK?1.8:0.7}/>
                  <ellipse cx="55" cy="42" rx="6" ry="4" fill="none" stroke={hK?hi:"#ddd"} strokeWidth="0.5"/>
                  {hK&&<><line x1="55" y1="32" x2="55" y2="28" stroke={hi} strokeWidth="1" opacity="0.5"/><line x1="48" y1="35" x2="45" y2="33" stroke={hi} strokeWidth="0.8" opacity="0.4"/><line x1="62" y1="35" x2="65" y2="33" stroke={hi} strokeWidth="0.8" opacity="0.4"/></>}
                </g>
                {/* Tom */}
                <g style={show(aT)}>
                  <ellipse cx="52" cy="25" rx="7" ry="3" fill={hT?"#fff0e8":"none"} stroke={hT?hi:"#ccc"} strokeWidth={hT?1.2:0.6}/>
                </g>
                {/* Ride / Crash cymbal */}
                <g style={show(aR)}>
                  <line x1="78" y1="12" x2="78" y2="50" stroke="#ccc" strokeWidth="0.7"/>
                  <ellipse cx="78" cy="12" rx="9" ry="2" fill={hR?"#fffbe8":"none"} stroke={hR?"#FFD60A":"#ccc"} strokeWidth={hR?1.5:0.7}/>
                  <ellipse cx="72" cy="40" rx="7" ry="4" fill="none" stroke="#ddd" strokeWidth="0.5"/>
                  {hR&&<><line x1="74" y1="9" x2="72" y2="5" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/><line x1="82" y1="9" x2="84" y2="5" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/><line x1="78" y1="9" x2="78" y2="4" stroke="#FFD60A" strokeWidth="0.8" opacity="0.6"/></>}
                </g>
                <g style={{transform:`translateY(${bob}px)`,transition:"transform 0.08s"}}>
                  <ellipse cx="44" cy="38" rx="6" ry="2" fill="none" stroke="#bbb" strokeWidth="0.8"/>
                  <line x1="38" y1="38" x2="36" y2="50" stroke="#bbb" strokeWidth="0.7"/><line x1="50" y1="38" x2="52" y2="50" stroke="#bbb" strokeWidth="0.7"/>
                  <path d="M41,37 Q37,43 33,49" fill="none" stroke={ac} strokeWidth="2" strokeLinecap="round"/>
                  <g style={{transform:`rotate(${hK?-10:0}deg)`,transformOrigin:"47px 37px",transition:"transform 0.04s"}}>
                    <path d="M47,37 Q51,43 55,49" fill="none" stroke={hK?hi:ac} strokeWidth={hK?2.5:2} strokeLinecap="round"/>
                    <line x1="55" y1="49" x2="60" y2="48" stroke={hK?hi:ac} strokeWidth={hK?2.5:2} strokeLinecap="round"/>
                  </g>
                  <path d={`M44,18 Q${43+bob*0.3},28 44,36`} fill="none" stroke={ac} strokeWidth="2.2" strokeLinecap="round"/>
                  <g style={{transform:`rotate(${lA}deg)`,transformOrigin:"38px 20px",transition:"transform 0.05s ease-out"}}>
                    <path d="M44,20 Q38,24 30,28" fill="none" stroke={lHit?hi:ac} strokeWidth={lHit?2.5:2} strokeLinecap="round"/>
                    <line x1="30" y1="28" x2="19" y2="22" stroke={lHit?hi:ac} strokeWidth={lHit?2.2:1.5} strokeLinecap="round"/>
                    {lHit&&<circle cx="19" cy="22" r="2" fill={hi} opacity="0.6"/>}
                  </g>
                  <g style={{transform:`rotate(${-rA}deg)`,transformOrigin:"50px 20px",transition:"transform 0.05s ease-out"}}>
                    <path d="M44,20 Q50,24 58,28" fill="none" stroke={rHit?hi:ac} strokeWidth={rHit?2.5:2} strokeLinecap="round"/>
                    <line x1="58" y1="28" x2="69" y2="22" stroke={rHit?hi:ac} strokeWidth={rHit?2.2:1.5} strokeLinecap="round"/>
                    {rHit&&<circle cx="69" cy="22" r="2" fill={hi} opacity="0.6"/>}
                  </g>
                  <g style={{transform:`rotate(${playing?Math.sin((cStep||0)*0.6)*4:0}deg)`,transformOrigin:"44px 12px",transition:"transform 0.08s"}}>
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
          <div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
            <button onClick={()=>setThemeName(p=>p==="dark"?"daylight":"dark")} style={pill(false,th.dim)}>THEME</button>
            <button onClick={()=>setView("pads")} style={pill(view==="pads","#5E5CE6")}>PADS</button>
            {/* ── SEQUENCER + EUCLID grouped block ── */}
            <div style={{display:"flex",border:`1px solid ${view==="sequencer"?"#FF2D5555":view==="euclid"?"#FFD60A55":th.sBorder}`,borderRadius:6,overflow:"hidden",transition:"border-color 0.15s"}}>
              <button onClick={()=>setView("sequencer")} style={{padding:"5px 11px",border:"none",borderRight:`1px solid ${th.sBorder}`,borderRadius:0,background:view==="sequencer"?"#FF2D5518":"transparent",color:view==="sequencer"?"#FF2D55":th.dim,fontSize:9,fontWeight:700,cursor:"pointer",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"inherit"}}>SEQUENCER</button>
              <button onClick={()=>setView("euclid")} style={{padding:"5px 11px",border:"none",borderRadius:0,background:view==="euclid"?"#FFD60A18":"transparent",color:view==="euclid"?"#FFD60A":th.dim,fontSize:9,fontWeight:700,cursor:"pointer",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"inherit"}}>⬡ EUCLID</button>
            </div>
          </div>
        </div>

        {/* ── Transport ── */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"10px 12px",borderRadius:12,background:th.surface,border:`1px solid ${th.sBorder}`,flexWrap:"wrap"}}>
          <div style={{position:"relative",display:"inline-block"}}>
            <button onClick={startStop} style={{width:44,height:44,borderRadius:"50%",border:"none",background:playing?"linear-gradient(135deg,#FF2D55,#FF375F)":"linear-gradient(135deg,#30D158,#34C759)",color:"#fff",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:playing?"0 0 20px rgba(255,45,85,0.4)":"0 0 20px rgba(48,209,88,0.4)"}}>{playing?"■":"▶"}</button>
            <div style={{position:"absolute",bottom:-8,left:"50%",transform:"translateX(-50%)"}}><MidiTag id="__play__"/></div>
          </div>
          <div style={{position:"relative",display:"inline-block"}}>
            <button onClick={()=>{if(playing)setRec(!rec);}} style={{width:32,height:32,borderRadius:"50%",border:rec?"2px solid #FF2D55":`2px solid ${th.sBorder}`,background:rec?"rgba(255,45,85,0.2)":"transparent",color:rec?"#FF2D55":th.dim,fontSize:11,cursor:playing?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",opacity:playing?1:0.3,animation:rec?"rb 0.8s infinite":"none"}}>●</button>
            <div style={{position:"absolute",bottom:-8,left:"50%",transform:"translateX(-50%)"}}><MidiTag id="__rec__"/></div>
          </div>
          <div style={{flex:"1 1 80px",minWidth:70}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
              <span style={{fontSize:8,color:th.dim,letterSpacing:"0.15em"}}>BPM</span>
              <MidiTag id="__bpm__"/>
              <button onClick={()=>setBpm(Math.max(30,bpm-1))} style={{border:"none",background:"transparent",color:th.dim,cursor:"pointer",fontSize:12,padding:"0 4px"}}>&lt;</button>
              <span style={{fontSize:24,fontWeight:900,color:"#FF9500"}}>{bpm}</span>
              <button onClick={()=>setBpm(Math.min(300,bpm+1))} style={{border:"none",background:"transparent",color:th.dim,cursor:"pointer",fontSize:12,padding:"0 4px"}}>&gt;</button>
            </div>
            <input type="range" min={30} max={300} value={bpm} onChange={e=>setBpm(Number(e.target.value))} style={{width:"100%",height:4,accentColor:"#FF9500"}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <button onClick={handleTap} style={{padding:"6px 12px",borderRadius:6,background:"rgba(255,149,0,0.15)",color:"#FF9500",border:"1px solid rgba(255,149,0,0.3)",fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>TAP</button>
            <MidiTag id="__tap__"/>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
            <div style={{display:"flex",alignItems:"center",gap:3}}>
              <span style={{fontSize:8,color:th.dim}}>SWING</span>
              <MidiTag id="__swing__"/>
            </div>
            <span style={{fontSize:11,fontWeight:700,color:"#5E5CE6"}}>{swing}%</span>
            <input type="range" min={0} max={100} value={swing} onChange={e=>setSwing(Number(e.target.value))} style={{width:55,height:3,accentColor:"#5E5CE6"}}/>
          </div>
          <button onClick={()=>setShowTS(!showTS)} style={pill(showTS,"#30D158")}>{sig.label}</button>
          {(()=>{
            const onMDown=e=>{e.preventDefault();const startY=e.touches?e.touches[0].clientY:e.clientY;const startVol=metroVol;let moved=false;
              const mv=ev=>{ev.preventDefault();const cy=ev.touches?ev.touches[0].clientY:ev.clientY;const dy=cy-startY;if(Math.abs(dy)>5){moved=true;setMetroVol(Math.max(0,Math.min(100,Math.round(startVol-dy*0.8))));}};
              const up=()=>{if(!moved)setMetro(p=>!p);window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);window.removeEventListener("touchmove",mv);window.removeEventListener("touchend",up);};
              window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);window.addEventListener("touchmove",mv,{passive:false});window.addEventListener("touchend",up);};
            return(<div onMouseDown={onMDown} onTouchStart={onMDown} style={{...pill(metro,"#FF9500"),position:"relative",overflow:"hidden",touchAction:"none",userSelect:"none",cursor:"pointer"}}>
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:`${metroVol}%`,background:metro?"rgba(255,149,0,0.12)":"transparent",borderRadius:6,transition:"height 0.15s",pointerEvents:"none"}}/>
              <span style={{position:"relative",zIndex:1}}>METRO {metroVol}%</span>
            </div>);
          })()}
          {metro&&<button onClick={()=>setMetroSub(p=>p==="off"?"light":p==="light"?"full":"off")} style={pill(metroSub!=="off","#FF9500")}>SUB {metroSub==="off"?"OFF":metroSub==="light"?"◦":"●"}</button>}
          <button onClick={()=>setShowK(!showK)} style={{...pill(showK,"#FFD60A"),display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:22,lineHeight:1}}>⌨</span>
            <span style={{fontSize:8,fontWeight:800,letterSpacing:"0.04em"}}>Keyb</span>
          </button>
          <button onClick={async()=>{
            if(!midiNotes){const ok=await initMidi();if(!ok)return;setMidiNotes(true);}
            const entering=!midiLM;setMidiLM(entering);if(!entering)setMidiLearnTrack(null);
          }} style={{...pill(midiLM,"#FF9500"),display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:11}}>🎹</span>
            <span style={{fontSize:8,fontWeight:800,letterSpacing:"0.04em"}}>MIDI</span>
          </button>
          {/* Ableton Link */}
          <button onClick={()=>setShowLink(p=>!p)} style={{...pill(showLink||linkConnected,"#BF5AF2"),fontSize:8,display:"flex",alignItems:"center",gap:3}}>
            🔗{linkConnected?` ${linkPeers}p`:' LINK'}
          </button>
        </div>

        {/* ── Time Signature ── */}
        {showTS&&(<div style={{marginBottom:10,padding:10,borderRadius:10,background:th.surface,border:`1px solid ${th.sBorder}`}}>
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
            {[["Click","Toggle step on/off"],["Drag →","Nudge timing (ms)"],["Drag ↑↓","Set velocity"],["Double-tap","Reset nudge + velocity"],["Right-click","Cycle ratchet 1→2→3→4"],["Shift+click","Cycle probability 100→75→50→25%"]].map(([k,v])=>(
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

        {/* ── Pattern Bank ── */}
        <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:8,padding:"5px 10px",borderRadius:10,background:th.surface,border:`1px solid ${th.sBorder}`}}>
          <span style={{fontSize:8,color:th.dim}}>PAT</span>
          {pBank.map((_,i)=>(<button key={i} onClick={()=>{setCPat(i);R.pat=pBank[i];}} style={{width:28,height:24,borderRadius:5,cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:800,border:`1px solid ${cPat===i?SEC_COL[i%8]+"66":th.sBorder}`,background:cPat===i?SEC_COL[i%8]+"20":"transparent",color:cPat===i?SEC_COL[i%8]:th.dim}}>{i+1}</button>))}
          {pBank.length<MAX_PAT&&<button onClick={()=>{setPBank(p=>[...p,mkE(STEPS)]);setCPat(pBank.length);}} style={{width:24,height:24,border:`1px dashed ${th.sBorder}`,borderRadius:5,background:"transparent",color:th.dim,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>}
          <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
            {pBank.length<MAX_PAT&&<button onClick={()=>{const dup=JSON.parse(JSON.stringify(pBank[cPat]));setPBank(p=>{const n=[...p];n.splice(cPat+1,0,dup);return n;});setCPat(cPat+1);}} style={{padding:"2px 6px",border:`1px solid ${th.sBorder}`,borderRadius:5,background:"transparent",color:th.dim,fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>DUP</button>}
            {pBank.length>1&&<button onClick={()=>{setPBank(p=>p.filter((_,j)=>j!==cPat));if(cPat>0)setCPat(cPat-1);}} style={{padding:"2px 6px",border:"1px solid rgba(255,55,95,0.2)",borderRadius:5,background:"transparent",color:"#FF375F",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>DEL</button>}
          </div>
        </div>

        {/* ── SONG ARRANGER (foldable) ── */}
        <div style={{marginBottom:8,borderRadius:10,background:th.surface,border:`1px solid ${showSong?"rgba(191,90,242,0.35)":th.sBorder}`,overflow:"hidden"}}>
          {/* Fold header */}
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",userSelect:"none"}}>
            <div onClick={()=>setShowSong(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,flex:1,cursor:"pointer"}}>
              <span style={{fontSize:9,fontWeight:800,color:"#BF5AF2",letterSpacing:"0.1em"}}>SONG ARRANGER</span>
              <span style={{fontSize:10,color:th.dim}}>{showSong?"▲":"▼"}</span>
            </div>
            <button onClick={e=>{e.stopPropagation();setSongMode(p=>!p);}} style={{...pill(songMode,"#BF5AF2"),fontSize:8,padding:"2px 8px",animation:songMode&&playing?"pulse 1s infinite":"none"}}>
              {songMode?(playing?"▶ ON":"ON"):"OFF"}
            </button>
          </div>
          {showSong&&(<div style={{padding:"0 12px 12px"}}>
            <div style={{marginBottom:10}}>
              {songMode&&<span style={{fontSize:8,color:th.dim}}>The sequencer automatically advances through the pattern chain each cycle</span>}
            </div>
            {/* Chain rows */}
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
              {songChain.map((patIdx,chainIdx)=>{
                const isActive=songMode&&playing&&songPosRef.current===chainIdx;
                return(<div key={chainIdx} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",borderRadius:6,background:isActive?"rgba(191,90,242,0.08)":"transparent",border:`1px solid ${isActive?"rgba(191,90,242,0.3)":"transparent"}`}}>
                  <span style={{width:16,fontSize:8,color:isActive?"#BF5AF2":th.faint,fontWeight:700,textAlign:"right",flexShrink:0}}>{chainIdx+1}</span>
                  <div style={{display:"flex",gap:3,flex:1,flexWrap:"wrap"}}>
                    {pBank.map((_,pi)=>(<button key={pi} onClick={()=>setSongChain(p=>{const n=[...p];n[chainIdx]=pi;return n;})} style={{width:26,height:22,borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontSize:9,fontWeight:800,border:`1px solid ${patIdx===pi?SEC_COL[pi%8]+"66":th.sBorder}`,background:patIdx===pi?SEC_COL[pi%8]+"20":"transparent",color:patIdx===pi?SEC_COL[pi%8]:th.dim}}>{pi+1}</button>))}
                  </div>
                  {isActive&&<span style={{fontSize:9,color:"#BF5AF2"}}>▶</span>}
                  <button onClick={()=>setSongChain(p=>{const n=[...p];n.splice(chainIdx+1,0,patIdx);return n;})} title="Duplicate below" style={{width:18,height:18,border:`1px solid ${th.sBorder}`,borderRadius:3,background:"transparent",color:th.dim,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>+</button>
                  {songChain.length>1&&<button onClick={()=>setSongChain(p=>p.filter((_,j)=>j!==chainIdx))} style={{width:18,height:18,border:"1px solid rgba(255,55,95,0.25)",borderRadius:3,background:"transparent",color:"#FF375F",fontSize:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>}
                </div>);
              })}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setSongChain(p=>[...p,cPat])} style={{padding:"4px 12px",borderRadius:6,border:"1px dashed rgba(191,90,242,0.35)",background:"transparent",color:"#BF5AF2",fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ ADD STEP</button>
              <button onClick={()=>setSongChain([cPat])} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${th.sBorder}`,background:"transparent",color:th.dim,fontSize:9,cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>RESET</button>
            </div>
          </div>)}
        </div>

        {/* ── SEQUENCER ── */}
        {view==="sequencer"&&(<>
          <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {atO.map((track)=>{
              const isM=muted[track.id],isS=soloed===track.id,aud=soloed?isS:!isM;
              const hasSmp=!!smpN[track.id];const hasFx=fx[track.id]&&(fx[track.id].drive>0||fx[track.id].pitch!==0||fx[track.id].cut<20000||fx[track.id].onReverb||fx[track.id].onDelay);
              const isFO=fxO===track.id;
              const tSteps=trackSteps[track.id]||STEPS;
              const tsOpts=[STEPS,STEPS*2];const tsIdx=tsOpts.indexOf(tSteps);const nextTs=tsIdx>=0?tsOpts[(tsIdx+1)%tsOpts.length]:STEPS;
              const isCustomTs=tSteps!==STEPS;
              const hasRec=(pat[track.id]||[]).some(v=>v);const stLocked=hasRec;
              return(<div key={track.id}>
                <div style={{display:"flex",alignItems:"center",gap:3,opacity:aud?1:0.3,padding:"3px 0"}}>
                  {/* Track Label + VOL/PAN — 2-col grid */}
                  {(()=>{
                    const f=fx[track.id]||defFx();
                    const vol=f.vol??80;const pan=f.pan??0;
                    const uFx=(k,v)=>setFx(prev=>({...prev,[track.id]:{...(prev[track.id]||defFx()),[k]:v}}));
                    const slLbl={fontSize:6,color:track.color,fontWeight:800,letterSpacing:"0.04em",flexShrink:0,width:16};
                    const btnSt={height:18,border:"none",borderRadius:3,cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:7};
                    return(
                      <div style={{flexShrink:0,display:"grid",gridTemplateColumns:"auto auto 60px",columnGap:4,rowGap:3,alignItems:"center"}}>
                        {/* R1C1: icon + label */}
                        <div style={{display:"flex",alignItems:"center",gap:3}}>
                          <span style={{fontSize:12,color:track.color,flexShrink:0}}>{track.icon}</span>
                          <span style={{fontSize:10,fontWeight:700,color:track.color,maxWidth:38,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{track.label}</span>
                          <MidiTag id={track.id}/>
                        </div>
                        {/* R1C2: M · S · CLR */}
                        <div style={{display:"flex",gap:2}}>
                          <button onClick={()=>setMuted(p=>({...p,[track.id]:!p[track.id]}))} style={{...btnSt,width:18,background:isM?"rgba(255,55,95,0.25)":th.btn,color:isM?"#FF375F":th.faint}}>M</button>
                          <button onClick={()=>setSoloed(p=>p===track.id?null:track.id)} style={{...btnSt,width:18,background:isS?"rgba(255,214,10,0.25)":th.btn,color:isS?"#FFD60A":th.faint}}>S</button>
                          <button onClick={()=>setPat(p=>({...p,[track.id]:Array(tSteps).fill(0)}))} style={{...btnSt,width:22,background:th.btn,color:th.dim,fontSize:6}} title="Clear track">CLR</button>
                        </div>
                        {/* R1C3: VOL slider */}
                        <div style={{display:"flex",alignItems:"center",gap:2}}>
                          <span style={slLbl}>VOL</span>
                          <input type="range" min={0} max={100} step={1} value={vol} title={`VOL ${vol}`} onChange={e=>uFx("vol",Number(e.target.value))} style={{flex:1,height:3,accentColor:track.color,cursor:"pointer",display:"block",minWidth:0}}/>
                        </div>
                        {/* R2C1: 16st */}
                        <div style={{display:"flex",alignItems:"center",gap:2}}>
                          <button title={stLocked?"Clear track to change resolution":`${tSteps}st → ${nextTs}st`} disabled={stLocked} onClick={()=>{const remap=(arr,from,to)=>{const r=Array(to).fill(0);(arr||Array(from).fill(0)).forEach((v,i)=>{if(v){const d=Math.min(to-1,Math.round(i*to/from));r[d]=Math.max(r[d],v);}});return r;};setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[track.id]:nextTs}};cp[track.id]=remap(cp[track.id],tSteps,nextTs);n[cPat]=cp;return n;});}} style={{...btnSt,border:`1px solid ${stLocked?"rgba(255,55,95,0.25)":isCustomTs?track.color+"44":th.sBorder}`,background:stLocked?"rgba(255,55,95,0.06)":isCustomTs?track.color+"11":"transparent",color:stLocked?"rgba(255,55,95,0.5)":isCustomTs?track.color:th.dim,cursor:stLocked?"not-allowed":"pointer",opacity:stLocked?0.6:1,padding:"0 3px"}}>{tSteps}st</button>
                        </div>
                        {/* R2C2: ♪ · FX · × */}
                        <div style={{display:"flex",gap:2}}>
                          <button onClick={()=>ldFile(track.id)} title={hasSmp?smpN[track.id]:"Load sample"} style={{...btnSt,width:20,background:hasSmp?"rgba(255,149,0,0.2)":th.btn,color:hasSmp?"#FF9500":th.dim}}>♪</button>
                          <button onClick={()=>setFxO(isFO?null:track.id)} style={{...btnSt,width:22,background:isFO?"rgba(191,90,242,0.25)":hasFx?"rgba(191,90,242,0.12)":th.btn,color:isFO||hasFx?"#BF5AF2":th.dim,fontSize:6}}>FX</button>
                          {act.length>1&&<button onClick={()=>{setAct(p=>p.filter(x=>x!==track.id));if(fxO===track.id)setFxO(null);}} style={{...btnSt,width:18,background:"rgba(255,55,95,0.08)",color:"#FF375F",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>}
                        </div>
                        {/* R2C3: PAN slider */}
                        <div style={{display:"flex",alignItems:"center",gap:2}}>
                          <span style={slLbl}>PAN</span>
                          <div style={{flex:1,position:"relative",height:10,minWidth:0}}>
                            <div style={{position:"absolute",top:"50%",left:0,right:0,height:2,background:th.sBorder,borderRadius:1,transform:"translateY(-50%)"}}/>
                            <div style={{position:"absolute",top:0,bottom:0,left:"50%",width:1,background:track.color+"55",transform:"translateX(-50%)"}}/>
                            {pan!==0&&<div style={{position:"absolute",top:"50%",height:3,borderRadius:1,background:track.color,transform:"translateY(-50%)",left:pan<0?`${50+(pan/100)*50}%`:"50%",width:`${Math.abs(pan/100)*50}%`}}/>}
                            <div style={{position:"absolute",top:"50%",left:`${(pan+100)/2}%`,width:7,height:7,borderRadius:"50%",background:track.color,transform:"translate(-50%,-50%)",boxShadow:`0 0 0 2px ${track.color}33`,pointerEvents:"none"}}/>
                            <input type="range" min={-100} max={100} step={1} value={pan} title={`PAN ${pan===0?"C":pan<0?"L"+Math.abs(pan):"R"+pan}`} onChange={e=>uFx("pan",Number(e.target.value))} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",opacity:0,cursor:"pointer",margin:0}}/>
                          </div>
                        </div>
                        {/* R3: VU + sample name — spans all cols */}
                        <div style={{gridColumn:"1/-1",display:"flex",flexDirection:"column",gap:1}}>
                          <div style={{height:3,borderRadius:2,background:th.btn,overflow:"hidden",position:"relative"}}>
                            <div ref={el=>{if(el)vuRefs.current[track.id]=el;}} style={{height:"100%",width:"0%",borderRadius:2,background:"#30D158",transition:"width 0.05s",opacity:0.15}}/>
                          </div>
                          {smpN[track.id]&&<span style={{fontSize:6,color:th.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{smpN[track.id].substring(0,24)}</span>}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Steps */}
                  <div style={{display:"flex",gap:0,flex:1}}>
                    {Array(tSteps).fill(0).map((_,step)=>{
                      const ac=!!pat[track.id]?.[step];
                      const ratio=Math.max(1,Math.round(tSteps/STEPS));const isCur=ratio>1?(step>=cStep*ratio&&step<(cStep+1)*ratio):cStep%tSteps===step;
                      const gs=Math.min(STEPS-1,Math.round(step*STEPS/tSteps));const gi=gInfo(gs);
                      const sn=stNudge[track.id]?.[step]||0;const vel=(stVel[track.id]?.[step]??100);
                      const prob=stProb[track.id]?.[step]??100;const ratch=stRatch[track.id]?.[step]||1;
                      const isDrag=dragInfo?.tid===track.id&&dragInfo?.step===step;
                      const dragAxis=isDrag?dragInfo.axis:null;
                      return(<div key={step}
                        onMouseDown={e=>{if(e.shiftKey&&handleShiftClick(track.id,step,e))return;startDrag(track.id,step,e);}}
                        onTouchStart={e=>startDrag(track.id,step,e)}
                        onContextMenu={e=>handleRightClick(track.id,step,e)}
                        style={{flex:1,aspectRatio:"1",borderRadius:3,cursor:ac?"grab":"pointer",
                          position:"relative",minWidth:0,overflow:"hidden",
                          marginLeft:gi.first&&step>0?4:1,touchAction:"none",userSelect:"none",
                          background:isCur&&gi.first?"rgba(255,149,0,0.45)":isCur?th.cursor:gi.gi%2===1?th.stepAlt:th.stepOff,
                          boxShadow:ac&&isCur?`0 0 10px ${track.color},inset 0 0 5px ${track.color}`:"none",
                          transform:isDrag?"scale(1.15)":ac&&isCur?"scale(1.08)":"scale(1)",
                          transition:isDrag?"none":"all 0.08s",
                          border:isDrag?`1px solid ${dragAxis==="v"?"#FFD60A":dragAxis==="h"?"#64D2FF":"transparent"}`:ac?`1px solid ${track.color}`:`1px solid ${th.sBorder}`,
                        }}>
                        {ac&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:`${vel}%`,borderRadius:3,background:track.color,transition:isDrag?"none":"height 0.15s"}}/>}
                        {ac&&prob<100&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:`${track.color}33`,zIndex:3}}>
                          <div style={{height:"100%",width:`${prob}%`,background:"#FFD60A",borderRadius:1}}/>
                        </div>}
                        {ac&&ratch>1&&<div style={{position:"absolute",top:1,right:1,fontSize:5,fontWeight:900,color:"#fff",background:"rgba(0,0,0,0.7)",borderRadius:2,padding:"0 1px",lineHeight:"8px",zIndex:4}}>×{ratch}</div>}
                        {ac&&sn!==0&&<div style={{position:"absolute",top:0,bottom:0,left:`${50+sn*0.4}%`,width:2,borderRadius:1,background:track.color,opacity:0.6,transform:"translateX(-50%)",pointerEvents:"none"}}/>}
                        {isDrag&&dragAxis==="v"&&<span style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:7,fontWeight:800,color:"#fff",textShadow:"0 0 3px rgba(0,0,0,0.5)",pointerEvents:"none",zIndex:5}}>{vel}%</span>}
                        {isDrag&&dragAxis==="h"&&<span style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:7,fontWeight:800,color:"#fff",textShadow:"0 0 3px rgba(0,0,0,0.5)",pointerEvents:"none",zIndex:5}}>{sn>0?"+":""}{sn}</span>}
                        {ac&&prob<100&&!isDrag&&<span style={{position:"absolute",top:1,left:1,fontSize:5,color:"#FFD60A",fontWeight:700,lineHeight:1,zIndex:4}}>{prob}%</span>}
                      </div>);
                    })}
                  </div>
                </div>
                {isFO&&<SSL tid={track.id} color={track.color} fx={fx} setFx={setFx} bpm={bpm} onClose={()=>setFxO(null)} themeName={themeName}/>}
              </div>);
            })}
          </div>
          <div style={{marginTop:6}}>
            {!showAdd?<button onClick={()=>{setShowAdd(true);setShowCustomInput(false);setNewTrackName("");}} style={{width:"100%",padding:"8px",border:`1px dashed ${th.sBorder}`,borderRadius:8,background:"transparent",color:th.dim,fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>+ ADD TRACK</button>:(
              <div style={{padding:"8px 10px",borderRadius:8,background:th.surface,border:`1px solid ${th.sBorder}`,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                {inact.map(t=>(<button key={t.id} onClick={()=>{setAct(p=>[...p,t.id]);setShowAdd(false);}} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${t.color}33`,background:t.color+"10",color:t.color,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{t.icon} {t.label}</button>))}
                {CustomTrackInput()}
                <button onClick={()=>{setShowAdd(false);setShowCustomInput(false);setNewTrackName("");}} style={{marginLeft:"auto",padding:"4px 8px",border:"none",borderRadius:4,background:"rgba(255,55,95,0.1)",color:"#FF375F",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>CANCEL</button>
              </div>)}
          </div>
        </>)}

        {/* ── PADS ── */}
        {view==="pads"&&(<div style={{padding:"12px 0"}}>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(4,atO.length)},1fr)`,gap:12}}>
            {atO.map((track,i)=>(<button key={track.id}
              onPointerDown={e=>{e.preventDefault();trigPad(track.id);if(navigator.vibrate)navigator.vibrate(20);}}
              style={{aspectRatio:"1",borderRadius:16,background:flash===track.id?track.color+"55":`linear-gradient(145deg,${track.color}28,${track.color}08)`,border:`2px solid ${flash===track.id?track.color:track.color+"44"}`,color:track.color,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",fontFamily:"inherit",boxShadow:flash===track.id?`0 0 40px ${track.color}66`:`0 0 20px ${track.color}11`,transition:"all 0.06s",transform:flash===track.id?"scale(0.95)":"scale(1)"}}>
              <span style={{fontSize:32}}>{track.icon}</span>
              <span style={{fontSize:13,fontWeight:700,letterSpacing:"0.1em"}}>{track.label}</span>
              <span style={{fontSize:10,color:th.dim,border:`1px solid ${th.sBorder}`,borderRadius:4,padding:"2px 8px"}}>{kMap[track.id]?.toUpperCase()||""}</span>
              {/* VU in pads view */}
              <div style={{width:"80%",height:4,borderRadius:2,background:th.btn,overflow:"hidden"}}>
                <div ref={el=>{if(el){vuRefs.current[track.id+"_pad"]=el;/* share ref for pads too */}}} style={{height:"100%",width:"0%",background:track.color,transition:"width 0.05s"}}/>
              </div>
            </button>))}
          </div>
          <div style={{textAlign:"center",marginTop:12,fontSize:8,color:th.dim}}>Click or press key to trigger · Keyboard shortcut ⌨ in transport</div>
        </div>)}

        {/* ── EUCLID VIEW ── */}
        {view==="euclid"&&(()=>{
          const CX=190,CY=190;
          const R_OUT=162,R_IN=atO.length>1?38:148;
          const ringGap=atO.length>1?(R_OUT-R_IN)/(atO.length-1):0;
          const getP=tid=>euclidParams[tid]||{N:trackSteps[tid]||STEPS,hits:0,rot:0,tpl:"",fold:false};
          const writeP=(tid,up)=>setEuclidParams(p=>({...p,[tid]:{...getP(tid),...up}}));
          const applyE=(tid,N,hits,rot)=>{
            const raw=euclidRhythm(hits,N);
            const r2=rot%Math.max(N,1);
            const rotated=[...raw.slice(r2),...raw.slice(0,r2)].map(v=>v?100:0);
            setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[tid]:N}};cp[tid]=[...rotated];n[cPat]=cp;return n;});
          };
          const chN=(tid,newN)=>{const p=getP(tid);const h=Math.min(p.hits,newN);const r=p.rot%newN;writeP(tid,{N:newN,hits:h,rot:r});applyE(tid,newN,h,r);};
          const chH=(tid,h)=>{const p=getP(tid);writeP(tid,{hits:h,tpl:""});applyE(tid,p.N,h,p.rot);};
          const chR=(tid,r)=>{const p=getP(tid);writeP(tid,{rot:r});applyE(tid,p.N,p.hits,r);};
          const applyTplTo=(tid,t)=>{
            writeP(tid,{N:t.N,hits:t.hits.length,rot:0,tpl:t.name});
            const pp=Array(t.N).fill(0);t.hits.forEach(h=>{pp[h]=100;});
            setPBank(pb=>{const n=[...pb];const cp={...n[cPat],_steps:{...(n[cPat]._steps||{}),[tid]:t.N}};cp[tid]=[...pp];n[cPat]=cp;return n;});
          };
          const selStyle={width:"100%",background:th.surface,border:`1px solid ${th.sBorder}`,borderRadius:5,color:th.text,fontSize:9,fontFamily:"inherit",padding:"4px 6px",cursor:"pointer"};
          const mkDrag=(initVal,min,max,cb)=>e=>{
            e.preventDefault();const sy=e.clientY;let cv=initVal;
            const mv=me=>{const nv=Math.max(min,Math.min(max,initVal+Math.round((sy-me.clientY)/6)));if(nv!==cv){cv=nv;cb(nv);}};
            const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);};
            window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);
          };
          const mkVelDrag=(tid,step,isOn,initVelPct)=>e=>{
            e.preventDefault();e.stopPropagation();
            const sy=e.clientY;let moved=false;let cv=initVelPct;
            const mv=me=>{const dy=sy-me.clientY;if(Math.abs(dy)>4)moved=true;if(moved&&isOn){const nv=Math.max(1,Math.min(100,initVelPct+Math.round(dy/3)));if(nv!==cv){cv=nv;setStVel(sv=>{const ns={...sv};ns[tid]=[...(ns[tid]||[])];ns[tid][step]=nv;return ns;});}}};
            const up=()=>{
              if(!moved){setPBank(pb=>{const n=[...pb];const cp={...n[cPat]};cp[tid]=[...cp[tid]];cp[tid][step]=cp[tid][step]>0?0:100;n[cPat]=cp;return n;});}
              window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);
            };
            window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);
          };
          const btnSm={height:18,minWidth:18,border:`1px solid ${th.sBorder}`,borderRadius:3,background:"transparent",fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"0 3px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"};
          const arw={width:16,height:18,border:`1px solid ${th.sBorder}`,borderRadius:3,background:"transparent",color:th.dim,fontSize:11,cursor:"pointer",fontFamily:"inherit",padding:0,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0};
          const lbl0={fontSize:6.5,color:th.dim,fontWeight:700,letterSpacing:"0.07em",flexShrink:0};
          const val0={fontSize:11,fontWeight:800,cursor:"ns-resize",userSelect:"none",touchAction:"none",minWidth:22,textAlign:"center",flexShrink:0};
          const sep0={fontSize:10,color:th.faint,flexShrink:0};
          return(
            <div style={{padding:"8px 0",overflowX:"auto"}}>
              <div style={{display:"flex",gap:16,alignItems:"flex-start",minWidth:720}}>
                {/* ── LEFT: Track controls ── */}
                <div style={{display:"flex",flexDirection:"column",gap:6,width:310,flexShrink:0}}>
                  <div style={{fontSize:8,fontWeight:800,color:th.dim,letterSpacing:"0.12em",marginBottom:2}}>EUCLIDEAN TRACKS</div>
                  {atO.map((tr)=>{
                    const p=getP(tr.id);const cnt=(pat[tr.id]||[]).filter(v=>v>0).length;
                    const isM=!!muted[tr.id];const isS=soloed===tr.id;const aud=soloed?isS:!isM;
                    return(
                      <div key={tr.id} style={{borderRadius:8,border:`1px solid ${tr.color}${aud?"44":"22"}`,background:tr.color+(aud?"0a":"05"),padding:"6px 10px",display:"flex",flexDirection:"column",gap:5,transition:"opacity 0.1s",opacity:aud?1:0.65}}>
                        {/* ── Header: 2-col grid — left: fold·icon·name·M·S·× | right: stacked H-sliders ── */}
                        {(()=>{
                          const f=fx[tr.id]||defFx();
                          const vol=f.vol??80;const pan=f.pan??0;
                          const uFx=(k,v)=>setFx(prev=>({...prev,[tr.id]:{...(prev[tr.id]||defFx()),[k]:v}}));
                          const slH={width:"100%",height:3,accentColor:tr.color,cursor:"pointer",display:"block"};
                          const slLbl={fontSize:6,color:tr.color,fontWeight:800,letterSpacing:"0.05em",flexShrink:0,width:18};
                          const slVal={fontSize:6,color:th.faint,fontWeight:600,flexShrink:0,width:20,textAlign:"right"};
                          return(
                            <div style={{display:"grid",gridTemplateColumns:"auto 1fr",columnGap:6,rowGap:4,alignItems:"center"}}>
                              {/* Row 1 left: fold + icon + label + cnt + M + S + × */}
                              <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                                <span onClick={()=>writeP(tr.id,{fold:!p.fold})} style={{fontSize:8,color:th.dim,cursor:"pointer",userSelect:"none",flexShrink:0}}>{p.fold?"▶":"▼"}</span>
                                <span style={{fontSize:12,flexShrink:0,opacity:aud?1:0.5}}>{tr.icon}</span>
                                <span style={{fontSize:9,fontWeight:800,color:aud?tr.color:th.dim,letterSpacing:"0.07em",maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tr.label}</span>
                                {cnt>0&&<span style={{background:tr.color+"33",color:tr.color,borderRadius:4,padding:"1px 4px",fontSize:6,fontWeight:700,flexShrink:0}}>{cnt}h</span>}
                                <button onClick={()=>setMuted(m=>({...m,[tr.id]:!m[tr.id]}))} style={{...btnSm,color:isM?"#FF375F":th.faint,border:`1px solid ${isM?"rgba(255,55,95,0.4)":th.sBorder}`,background:isM?"rgba(255,55,95,0.12)":"transparent"}}>M</button>
                                <button onClick={()=>setSoloed(s=>s===tr.id?null:tr.id)} style={{...btnSm,color:isS?"#FFD60A":th.faint,border:`1px solid ${isS?"rgba(255,214,10,0.4)":th.sBorder}`,background:isS?"rgba(255,214,10,0.12)":"transparent"}}>S</button>
                                {(()=>{const hasSmp=!!smpN[tr.id];return(<button onClick={()=>ldFile(tr.id)} title={hasSmp?smpN[tr.id]:"Load sample"} style={{...btnSm,color:hasSmp?"#FF9500":th.faint,border:`1px solid ${hasSmp?"rgba(255,149,0,0.4)":th.sBorder}`,background:hasSmp?"rgba(255,149,0,0.15)":"transparent"}}>♪</button>);})()}
                                {act.length>1&&<button onClick={()=>{setAct(a=>a.filter(x=>x!==tr.id));if(fxO===tr.id)setFxO(null);}} style={{...btnSm,color:"#FF375F",border:"1px solid rgba(255,55,95,0.3)"}}>×</button>}
                              </div>
                              {/* Row 1 right: VOL horizontal slider */}
                              <div style={{display:"flex",alignItems:"center",gap:4}}>
                                <span style={slLbl}>VOL</span>
                                <input type="range" min={0} max={100} step={1} value={vol} onChange={e=>uFx("vol",Number(e.target.value))} style={slH}/>
                                <span style={slVal}>{vol}</span>
                              </div>
                              {/* Row 2 left: empty spacer (grid auto-sizes to match row 1 left) */}
                              <div/>
                              {/* Row 2 right: PAN horizontal slider */}
                              <div style={{display:"flex",alignItems:"center",gap:4}}>
                                <span style={slLbl}>PAN</span>
                                <div style={{flex:1,position:"relative",height:10}}>
                                  {/* Track */}
                                  <div style={{position:"absolute",top:"50%",left:0,right:0,height:2,background:th.sBorder,borderRadius:1,transform:"translateY(-50%)"}}/>
                                  {/* Center tick */}
                                  <div style={{position:"absolute",top:0,bottom:0,left:"50%",width:1,background:tr.color+"55",transform:"translateX(-50%)"}}/>
                                  {/* Fill bar from center outward */}
                                  {pan!==0&&<div style={{position:"absolute",top:"50%",height:3,borderRadius:1,background:tr.color,transform:"translateY(-50%)",left:pan<0?`${50+(pan/100)*50}%`:"50%",width:`${Math.abs(pan/100)*50}%`}}/>}
                                  {/* Thumb */}
                                  <div style={{position:"absolute",top:"50%",left:`${(pan+100)/2}%`,width:8,height:8,borderRadius:"50%",background:tr.color,transform:"translate(-50%,-50%)",boxShadow:`0 0 0 2px ${tr.color}33`,pointerEvents:"none"}}/>
                                  {/* Hidden range input for interaction */}
                                  <input type="range" min={-100} max={100} step={1} value={pan} onChange={e=>uFx("pan",Number(e.target.value))} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",opacity:0,cursor:"pointer",margin:0}}/>
                                </div>
                                <span style={slVal}>{pan===0?"C":pan<0?"L"+Math.abs(pan):"R"+pan}</span>
                              </div>
                            </div>
                          );
                        })()}
                        {/* ── Body (unfolded): template + spinners only ── */}
                        {!p.fold&&(
                          <div style={{display:"flex",flexDirection:"column",gap:5}}>
                            <select value={p.tpl||""} onChange={e=>{const t=EUCLID_TEMPLATES.find(x=>x.name===e.target.value);if(t)applyTplTo(tr.id,t);}} style={selStyle}>
                              <option value="">— Load a template —</option>
                              {EUCLID_REGIONS.map(r=>(
                                <optgroup key={r} label={r}>
                                  {EUCLID_TEMPLATES.filter(t=>t.region===r).map(t=>(
                                    <option key={t.name} value={t.name}>{t.name} · {t.N} steps</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"nowrap"}}>
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
                              <button onMouseDown={e=>{e.preventDefault();chR(tr.id,Math.max(0,p.rot-1));}} style={arw}>‹</button>
                              <span onPointerDown={mkDrag(p.rot,0,Math.max(p.N-1,0),v=>chR(tr.id,v))} title="Drag ↕" style={{...val0,color:tr.color}}>+{p.rot}</span>
                              <button onMouseDown={e=>{e.preventDefault();chR(tr.id,Math.min(Math.max(p.N-1,0),p.rot+1));}} style={arw}>›</button>
                            </div>
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
                  <svg width={380} height={380} style={{display:"block",overflow:"visible"}}>
                    <circle cx={CX} cy={CY} r={R_OUT+20} fill={th.surface} stroke={th.sBorder} strokeWidth={1} opacity={0.6}/>
                    {atO.map((tr,ti)=>{
                      const R=R_OUT-ti*ringGap;
                      const p=getP(tr.id);const N=p.N;
                      const curS=cStep>=0?cStep%N:-1;
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
                            const rv=(cur?dotR+2:dotR)+(on?Math.round((velPct/100)*3):0);
                            const vOp=on?0.3+(velPct/100)*0.7:0.45;
                            return(
                              <g key={i} onPointerDown={mkVelDrag(tr.id,i,on,velPct)} style={{cursor:on?"ns-resize":"pointer",userSelect:"none",touchAction:"none"}}>
                                {cur&&<circle cx={vx} cy={vy} r={rv+7} fill={tr.color+(on?"28":"11")}/>}
                                <circle cx={vx} cy={vy} r={rv}
                                  fill={on?tr.color:(cur?tr.color+"33":th.stepOff)}
                                  stroke={on?tr.color:th.sBorder}
                                  strokeWidth={on?0:0.5}
                                  opacity={on?vOp:0.45}/>
                                {on&&velPct<80&&<circle cx={vx} cy={vy} r={rv*0.4} fill="#000" opacity={0.2}/>}
                                {N<=20&&<text x={vx} y={vy+rv+8} textAnchor="middle" fontSize={5} fill={on?tr.color:th.faint} fontFamily="monospace" opacity={0.7}>{i+1}</text>}
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
                    {atO.length} track{atO.length>1?"s":""} · {atO.reduce((a,tr)=>a+(pat[tr.id]||[]).filter(v=>v>0).length,0)} hits · click = toggle · drag ↕ = velocity
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Step position visualizer ── */}
        <div style={{display:"flex",gap:0,marginTop:14,justifyContent:"center",height:22,alignItems:"flex-end"}}>
          {Array(STEPS).fill(0).map((_,i)=>{const gi=gInfo(i);return(<div key={i} style={{width:5,height:cStep===i?18:gi.first?10:5,borderRadius:3,marginLeft:gi.first&&i>0?6:2,background:cStep===i?"linear-gradient(180deg,#FF2D55,#FF9500)":gi.first?"#FFB340":th.btn,transition:"height 0.1s",boxShadow:cStep===i?"0 0 8px rgba(255,45,85,0.5)":gi.first?"0 0 3px rgba(255,179,64,0.4)":"none"}}/>);})}
        </div>

        <div style={{textAlign:"center",marginTop:14,padding:"8px 0 20px",borderTop:`1px solid ${th.sBorder}`,fontSize:8,color:th.faint}}>
          KICK &amp; SNARE v8 — Drag ↔ nudge · Drag ↕ velocity · Double-tap reset · Right-click ratchet · Shift+click probability
        </div>
      </div>
    </div>
  );
}

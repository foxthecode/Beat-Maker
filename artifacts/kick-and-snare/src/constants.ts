import { SVG_808, SVG_LAUNCHPAD } from './kitIcons';

// ── Time Signatures ──────────────────────────────────────────────────────────
export const TIME_SIGS=[
  {label:"4/4",beats:4,steps:16,groups:[4,4,4,4],accents:[0],stepDiv:4,subDiv:2},
  {label:"3/4",beats:3,steps:12,groups:[4,4,4],accents:[0],stepDiv:4,subDiv:2},
  {label:"6/8",beats:2,steps:12,groups:[6,6],accents:[0],stepDiv:4,subDiv:2},
  {label:"12/8",beats:4,steps:24,groups:[6,6,6,6],accents:[0],stepDiv:4,subDiv:2},
  {label:"5/4",beats:5,steps:20,groups:[4,4,4,4,4],accents:[0,3],stepDiv:4,subDiv:2},
  {label:"5/8",beats:2,steps:10,groups:[6,4],groupOptions:[[6,4,"3+2"],[4,6,"2+3"]],accents:[0],stepDiv:4,subDiv:2},
  {label:"7/8",beats:3,steps:14,groups:[4,4,6],groupOptions:[[4,4,6,"2+2+3"],[6,4,4,"3+2+2"],[4,6,4,"2+3+2"]],accents:[0],stepDiv:4,subDiv:2},
];

export const APP_VERSION="9.2.0";

// ── Tracks ───────────────────────────────────────────────────────────────────
export const ALL_TRACKS=[
  {id:"kick",label:"KICK",color:"#FF2D55",icon:"◆"},
  {id:"snare",label:"SNARE",color:"#FF9500",icon:"◼"},
  {id:"hihat",label:"HI-HAT",color:"#30D158",icon:"△"},
  {id:"clap",label:"CLAP",color:"#5E5CE6",icon:"✦"},
  {id:"tom",label:"TOM",color:"#FF375F",icon:"●"},
  {id:"ride",label:"RIDE",color:"#64D2FF",icon:"◇"},
  {id:"crash",label:"CRASH",color:"#FFD60A",icon:"✶"},
  {id:"perc",label:"PERC",color:"#BF5AF2",icon:"▲"},
];
export const TRACKS=ALL_TRACKS;

export const DEFAULT_ACTIVE=["kick","snare","hihat","clap","tom","ride","crash","perc"];
export const DEFAULT_KEY_MAP={kick:"q",snare:"s",hihat:"d",clap:"f",tom:"g",ride:"h",crash:"j",perc:"k"};
export const DEFAULT_MIDI_NOTES:Record<string,number|null>={kick:36,snare:38,hihat:42,clap:39,tom:45,ride:51,crash:49,perc:47,__play__:246,__rec__:247,__tap__:null,__bpm__:null,__swing__:null};
export const NOTE_NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
export const midiNoteName=(n:number|null)=>n==null?"—":n>=128?`CC${n-128}`:NOTE_NAMES[n%12]+(Math.floor(n/12)-1);
export const MAX_PAT=8;
export const NR=50;

// ── Colors ───────────────────────────────────────────────────────────────────
export const SEC_COL=["#FF2D55","#FF9500","#30D158","#5E5CE6","#BF5AF2","#64D2FF","#FFD60A","#FF375F"];
export const CUSTOM_COLORS=['#E91E63','#9C27B0','#00BCD4','#8BC34A','#FF5722','#607D8B','#CDDC39','#00E676','#F50057','#18FFFF','#76FF03','#FF6E40','#B388FF','#1DE9B6','#FFAB40','#8D6E63'];

// ── Pattern helpers ──────────────────────────────────────────────────────────
export const mkE=(s:number)=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(0)]));
export const mkN=(s:number)=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(0)]));
export const mkV=(s:number)=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(100)]));
export const mkP=(s:number)=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(100)]));
export const mkR=(s:number)=>Object.fromEntries(ALL_TRACKS.map(t=>[t.id,Array(s).fill(1)]));

// ── Default FX ───────────────────────────────────────────────────────────────
export const DEFAULT_FX=Object.freeze({
  pitch:0,fType:"lowpass",cut:5000,res:0,drive:0,driveMode:"tape",crush:0,cThr:-24,cRat:1,
  rMix:0,rDecay:1.5,dMix:0,dTime:0.25,dSync:false,dDiv:"1/4",vol:80,pan:0,
  onPitch:false,onFilter:false,onDrive:false,onComp:true,onReverb:false,onDelay:false,
  sDec:1.0,sTune:1.0,sPunch:1.0,sSnap:1.0,sBody:1.0,sTone:1.0,
  onTransient:false,tsAttack:0,tsSustain:0,
});

// ── Drum Kits ────────────────────────────────────────────────────────────────
const B=import.meta.env.BASE_URL;
export const DRUM_KITS=[
  {id:"808",      name:"808",         icon:SVG_808,
   samples:{kick:`${B}samples/turbo808/kick.wav`,snare:`${B}samples/turbo808/snare.wav`,hihat:`${B}samples/turbo808/hihat.wav`,clap:`${B}samples/turbo808/clap.wav`,tom:`${B}samples/turbo808/tom.wav`,ride:`${B}samples/turbo808/ride.wav`,crash:`${B}samples/turbo808/crash.wav`,perc:`${B}samples/turbo808/perc.wav`},
   labels:{tom:"SUB",ride:"OPEN HH",crash:"FX",perc:"HARM"},
   shape:{sDec:1,   sTune:1,    sPunch:1,   sSnap:1,   sBody:1,   sTone:1   }},
  {id:"lofi",     name:"Lo-Fi",       icon:"📼",
   samples:{kick:`${B}samples/lofi/kick.wav`,snare:`${B}samples/lofi/snare.wav`,hihat:`${B}samples/lofi/hihat.wav`,clap:`${B}samples/lofi/clap.wav`,tom:`${B}samples/lofi/tom.wav`,ride:`${B}samples/lofi/ride.wav`,crash:`${B}samples/lofi/crash.wav`,perc:`${B}samples/lofi/perc.wav`},
   shape:{sDec:0.8, sTune:0.9,  sPunch:0.7, sSnap:0.5, sBody:1.15,sTone:0.65}},
  {id:"electro",  name:"Electronic",  icon:SVG_LAUNCHPAD,
   samples:{kick:`${B}samples/electronic/kick.wav`,snare:`${B}samples/electronic/snare.wav`,hihat:`${B}samples/electronic/hihat.wav`,clap:`${B}samples/electronic/clap.wav`,tom:`${B}samples/electronic/tom.wav`,ride:`${B}samples/electronic/ride.wav`,crash:`${B}samples/electronic/crash.wav`,perc:`${B}samples/electronic/perc.wav`},
   shape:{sDec:0.3, sTune:1.5,  sPunch:2.8, sSnap:2.8, sBody:0.7, sTone:1.7 }},
  {id:"acoustic", name:"Acoustic",    icon:"🥁",
   samples:{kick:`${B}samples/acoustic/kick.wav`,snare:`${B}samples/acoustic/snare.wav`,hihat:`${B}samples/acoustic/hihat.wav`,clap:`${B}samples/acoustic/clap.wav`,tom:`${B}samples/acoustic/tom.wav`,ride:`${B}samples/acoustic/ride.wav`,crash:`${B}samples/acoustic/crash.wav`,perc:`${B}samples/acoustic/perc.wav`},
   shape:{sDec:1.5, sTune:1.08, sPunch:0.85,sSnap:1.6, sBody:1.5, sTone:1   }},
  {id:"world",    name:"World",       icon:"🌍",
   samples:{kick:`${B}samples/world/perc1.wav`,snare:`${B}samples/world/perc2.wav`,hihat:`${B}samples/world/perc3.wav`,clap:`${B}samples/world/perc4.wav`,tom:`${B}samples/world/perc5.wav`,ride:`${B}samples/world/perc6.wav`,crash:`${B}samples/world/perc7.wav`,perc:`${B}samples/world/perc8.wav`},
   labels:{kick:"Perc 1",snare:"Perc 2",hihat:"Perc 3",clap:"Perc 4",tom:"Perc 5",ride:"Perc 6",crash:"Perc 7",perc:"Perc 8"},
   shape:{sDec:0.6, sTune:1.05, sPunch:1.4, sSnap:2.0, sBody:1.1, sTone:1.3 }},
];
export type DrumKit=typeof DRUM_KITS[number];

// ── Template → Kit mapping ───────────────────────────────────────────────────
export const TEMPLATE_KITS:Record<string,string>={
  classic_808:"808",boom_bap:"808",reggae:"808",
  trap:"electro",
  jazz_swing:"acoustic",
  lofi:"lofi",
  house:"electro",techno_909:"electro",dnb:"electro",uk_garage:"electro",
  funk:"acoustic",gospel:"acoustic",
  bossa_nova:"world",samba:"world",
  afrobeat:"world",
  tresillo:"world",cinquillo:"world",son_clave:"world",bossa_bell:"world",
  west_african_bell:"world",kpanlogo:"world",venda:"world",
  ruchenitza:"acoustic",aksak:"acoustic",nawakhat:"acoustic",hemiola_4_3:"acoustic",
  reich_phase:"electro",
};

// ── Delay helpers ─────────────────────────────────────────────────────────────
export const DELAY_DIVS=["1/4","1/8","1/16","1/4d","1/8d","1/4t","1/8t"];
export const divToSec=(div:string,bpm:number)=>{const b=60/bpm;const m:Record<string,number>={"1/4":b,"1/8":b/2,"1/16":b/4,"1/4d":b*1.5,"1/8d":b*0.75,"1/4t":b*2/3,"1/8t":b/3};return m[div]||b;};

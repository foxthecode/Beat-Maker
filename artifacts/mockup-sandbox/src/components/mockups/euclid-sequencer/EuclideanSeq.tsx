import { useState, useEffect, useRef, useCallback } from "react";

const INSTRUMENTS = [
  { id: "kick",  label: "KICK",  color: "#FF2D55", icon: "◆" },
  { id: "snare", label: "SNARE", color: "#FF9500", icon: "◼" },
  { id: "hat",   label: "HAT",   color: "#FFD60A", icon: "●" },
  { id: "clap",  label: "CLAP",  color: "#30D158", icon: "★" },
  { id: "perc",  label: "PERC",  color: "#5E5CE6", icon: "▲" },
];

const STEP_OPTIONS = [3,4,5,6,7,8,9,11,12,16,24,32];

type Template = { name:string; origin:string; region:string; N:number; hits:number[]; desc:string; instr?:string };
const TEMPLATES: Template[] = [
  // ── Afrique de l'Ouest
  { name:"Tresillo",    origin:"Afrique / Cuba",   region:"Afrique",    N:8,  hits:[0,3,6],           desc:"E(3,8) — rythme-racine universel",    instr:"kick"  },
  { name:"Fume Fume",   origin:"Ghana (Ewe)",       region:"Afrique",    N:12, hits:[0,2,4,7,9],       desc:"E(5,12) — chant ghanéen",              instr:"hat"   },
  { name:"Bembé",       origin:"Yoruba / Cuba",     region:"Afrique",    N:12, hits:[0,2,3,5,7,8,10],  desc:"E(7,12) — cœur du jazz afro",          instr:"snare" },
  { name:"Shiko",       origin:"Nigeria (Ewe)",     region:"Afrique",    N:16, hits:[0,4,6,10,12],     desc:"E(5,16) — danse rituelle",             instr:"perc"  },
  { name:"Soukous",     origin:"Congo",             region:"Afrique",    N:12, hits:[0,2,4,6,9,11],    desc:"Clave congolaise",                     instr:"hat"   },
  // ── Afro-Cuban
  { name:"Habanera",    origin:"Cuba",              region:"Afro-Cuban", N:8,  hits:[0,3,5,7],         desc:"Base du danzón et du tango",           instr:"kick"  },
  { name:"Cinquillo",   origin:"Cuba",              region:"Afro-Cuban", N:8,  hits:[0,2,3,5,6],       desc:"E(5,8) — son et guaracha",             instr:"perc"  },
  { name:"Clave 3-2",   origin:"Cuba (Son)",        region:"Afro-Cuban", N:16, hits:[0,3,6,10,12],     desc:"Épine dorsale de la musique cubaine",  instr:"clap"  },
  { name:"Clave 2-3",   origin:"Cuba (Son)",        region:"Afro-Cuban", N:16, hits:[2,4,8,11,14],     desc:"Clave à sens inversé",                 instr:"clap"  },
  { name:"Rumba Clave", origin:"Cuba (Rumba)",      region:"Afro-Cuban", N:16, hits:[0,3,7,10,12],     desc:"Plus syncopée, décalage du 3e beat",   instr:"clap"  },
  { name:"Guaguancó",   origin:"Cuba (Rumba)",      region:"Afro-Cuban", N:12, hits:[0,3,4,6,10],      desc:"Rumba urbaine de La Havane",           instr:"snare" },
  // ── Brésil
  { name:"Baião",       origin:"Brésil (Nord-Est)", region:"Brésil",     N:16, hits:[0,3,8,11],        desc:"Zabumba du sertão",                    instr:"kick"  },
  { name:"Maracatu",    origin:"Pernambuco",        region:"Brésil",     N:16, hits:[0,6,10,12],       desc:"Rythme de la cour royale africaine",   instr:"kick"  },
  { name:"Bossa Nova",  origin:"Brésil (Rio)",      region:"Brésil",     N:16, hits:[0,3,6,8,11,14],   desc:"Violão de João Gilberto",              instr:"hat"   },
  { name:"Surdo",       origin:"Brésil (Samba)",    region:"Brésil",     N:16, hits:[0,8],             desc:"Pulsation grave de la batucada",       instr:"kick"  },
  { name:"Caixa",       origin:"Brésil (Samba)",    region:"Brésil",     N:16, hits:[0,2,4,6,8,10,12,14], desc:"Caisse claire samba en croches",   instr:"snare" },
  { name:"Xote",        origin:"Brésil (Nordeste)", region:"Brésil",     N:8,  hits:[0,2,5,7],         desc:"Quadrilha do forró",                   instr:"hat"   },
];

const REGIONS = ["Afrique", "Afro-Cuban", "Brésil"];
const REGION_COLORS: Record<string,string> = { "Afrique":"#FFD60A", "Afro-Cuban":"#FF9500", "Brésil":"#30D158" };

function vertex(i:number,N:number,cx:number,cy:number,r:number){
  const a=(2*Math.PI*i)/N-Math.PI/2;
  return {x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};
}
function polygonPoints(N:number,cx:number,cy:number,r:number){
  return Array.from({length:N},(_,i)=>{const v=vertex(i,N,cx,cy,r);return `${v.x},${v.y}`;}).join(" ");
}

export function EuclideanSeq(){
  const [N,setN]=useState(16);
  const [hits,setHits]=useState<Record<number,Set<string>>>({
    0:new Set(["kick"]),4:new Set(["kick","hat"]),6:new Set(["hat"]),
    8:new Set(["kick","snare"]),10:new Set(["hat"]),12:new Set(["kick"]),14:new Set(["hat"]),2:new Set(["hat"]),
  });
  const [selected,setSelected]=useState("kick");
  const [playhead,setPlayhead]=useState(-1);
  const [playing,setPlaying]=useState(false);
  const [bpm,setBpm]=useState(120);
  const [hovered,setHovered]=useState<number|null>(null);
  const [region,setRegion]=useState("Afrique");
  const timerRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const stepRef=useRef(-1);
  const CX=195,CY=195,R=158;

  const toggleHit=useCallback((i:number)=>{
    setHits(prev=>{
      const next={...prev};
      const s=new Set(next[i]||[]);
      if(s.has(selected))s.delete(selected);else s.add(selected);
      if(s.size===0)delete next[i];else next[i]=s;
      return next;
    });
  },[selected]);

  useEffect(()=>{
    if(timerRef.current)clearInterval(timerRef.current);
    if(!playing){setPlayhead(-1);stepRef.current=-1;return;}
    const ms=(60/bpm/4)*1000;
    timerRef.current=setInterval(()=>{stepRef.current=(stepRef.current+1)%N;setPlayhead(stepRef.current);},ms);
    return()=>{if(timerRef.current)clearInterval(timerRef.current);};
  },[playing,bpm,N]);

  const changeN=(newN:number)=>{
    setN(newN);
    setHits(prev=>{const next:Record<number,Set<string>>={};Object.entries(prev).forEach(([k,v])=>{if(Number(k)<newN)next[Number(k)]=v;});return next;});
    stepRef.current=-1;setPlayhead(-1);
  };

  const applyTemplate=(t:Template)=>{
    changeN(t.N);
    const instrId=t.instr||selected;
    setHits(prev=>{
      const next:Record<number,Set<string>>={};
      // keep other instruments' hits that fit in new N
      Object.entries(prev).forEach(([k,v])=>{
        const step=Number(k);if(step>=t.N)return;
        const s=new Set(v);s.delete(instrId);
        if(s.size>0)next[step]=s;
      });
      // apply template hits for the instrument
      t.hits.forEach(i=>{
        const s=new Set(next[i]||[]);s.add(instrId);next[i]=s;
      });
      return next;
    });
    setSelected(instrId);
  };

  const activeInstr=(i:number)=>hits[i]?[...hits[i]]:[];
  const isActive=(i:number)=>(hits[i]?.size||0)>0;
  const isCurrent=(i:number)=>i===playhead;
  const instrCount=(id:string)=>Object.values(hits).filter(s=>s.has(id)).length;
  const headAngle=playhead>=0?(2*Math.PI*playhead)/N-Math.PI/2:-Math.PI/2;

  const regionTemplates=TEMPLATES.filter(t=>t.region===region);
  const rc=REGION_COLORS[region]||"#888";

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(170deg,#0F0F0F 0%,#1A1A1A 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:"16px",fontFamily:"monospace",color:"#F0F0F0",boxSizing:"border-box"}}>

      <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.15em",color:"#30D158",marginBottom:2}}>
        KICK & SNARE — VUE EUCLIDIENNE
      </div>
      <div style={{fontSize:8,color:"#333",marginBottom:14,letterSpacing:"0.1em"}}>
        CLIQUER UN SOMMET · SÉLECTIONNER L'INSTRUMENT D'ABORD
      </div>

      <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>

        {/* ── Instrument selector ── */}
        <div style={{display:"flex",flexDirection:"column",gap:5,paddingTop:60}}>
          {INSTRUMENTS.map(ins=>(
            <button key={ins.id} onClick={()=>setSelected(ins.id)} style={{
              display:"flex",alignItems:"center",gap:7,padding:"7px 12px",
              borderRadius:7,border:`1px solid ${selected===ins.id?ins.color+"88":"rgba(255,255,255,0.07)"}`,
              background:selected===ins.id?ins.color+"18":"transparent",
              color:selected===ins.id?ins.color:"#555",
              fontSize:10,fontWeight:800,cursor:"pointer",fontFamily:"monospace",
              letterSpacing:"0.08em",transition:"all 0.12s",
            }}>
              <span style={{fontSize:13}}>{ins.icon}</span>
              <span>{ins.label}</span>
              {instrCount(ins.id)>0&&(
                <span style={{marginLeft:2,background:ins.color+"2a",color:ins.color,
                  borderRadius:3,padding:"1px 4px",fontSize:8,fontWeight:700}}>
                  {instrCount(ins.id)}
                </span>
              )}
            </button>
          ))}
          <div style={{marginTop:8,fontSize:8,color:"#2a2a2a",letterSpacing:"0.08em"}}>ACTIF SÉL.</div>
        </div>

        {/* ── Polygon + controls ── */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>

          {/* Play / BPM */}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>setPlaying(p=>!p)} style={{
              padding:"6px 18px",borderRadius:7,border:"none",
              background:playing?"rgba(255,45,85,0.18)":"rgba(48,209,88,0.18)",
              color:playing?"#FF2D55":"#30D158",
              fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"monospace",letterSpacing:"0.1em",
            }}>{playing?"⏹ STOP":"▶ PLAY"}</button>
            <span style={{fontSize:8,color:"#444",letterSpacing:"0.1em"}}>BPM</span>
            <input type="range" min={60} max={200} value={bpm} onChange={e=>setBpm(Number(e.target.value))}
              style={{width:70,accentColor:"#30D158"}}/>
            <span style={{fontSize:11,color:"#F0F0F0",fontWeight:700,minWidth:26}}>{bpm}</span>
          </div>

          {/* Polygon SVG */}
          <svg width={390} height={390} style={{display:"block"}}>
            <circle cx={CX} cy={CY} r={R+14} fill="none" stroke="rgba(48,209,88,0.03)" strokeWidth={28}/>
            <polygon points={polygonPoints(N,CX,CY,R)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1}/>
            <circle cx={CX} cy={CY} r={18} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.06)" strokeWidth={1}/>
            {[0.55,0.78].map(f=>(
              <circle key={f} cx={CX} cy={CY} r={R*f} fill="none"
                stroke="rgba(255,255,255,0.02)" strokeWidth={1} strokeDasharray="2 5"/>
            ))}
            {playhead>=0&&(
              <line x1={CX} y1={CY}
                x2={CX+(R+18)*Math.cos(headAngle)} y2={CY+(R+18)*Math.sin(headAngle)}
                stroke="#30D158" strokeWidth={2} strokeLinecap="round" opacity={0.85}/>
            )}
            {Array.from({length:N},(_,i)=>{
              const v=vertex(i,N,CX,CY,R);
              const on=isActive(i);
              return(<line key={`sp${i}`} x1={CX} y1={CY} x2={v.x} y2={v.y}
                stroke={on?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.02)"} strokeWidth={0.5}/>);
            })}
            {Array.from({length:N},(_,i)=>{
              const v=vertex(i,N,CX,CY,R);
              const instrs=activeInstr(i);
              const on=instrs.length>0;
              const cur=isCurrent(i);
              const hov=hovered===i;
              const r0=on?13:7;
              const selIns=INSTRUMENTS.find(x=>x.id===selected)!;
              return(
                <g key={i} style={{cursor:"pointer"}}
                  onClick={()=>toggleHit(i)}
                  onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}>
                  {cur&&on&&(
                    <circle cx={v.x} cy={v.y} r={r0+10}
                      fill={(INSTRUMENTS.find(x=>x.id===instrs[0])?.color||"#fff")+"18"}/>
                  )}
                  <circle cx={v.x} cy={v.y} r={hov?r0+2:r0}
                    fill={on?(cur?"#fff":"rgba(255,255,255,0.07)"):(hov?selIns.color+"18":"rgba(255,255,255,0.03)")}
                    stroke={on?(cur?"#fff":INSTRUMENTS.find(x=>x.id===instrs[0])?.color||"#fff"):(hov?selIns.color+"77":"rgba(255,255,255,0.1)")}
                    strokeWidth={on?1.5:1} style={{transition:"r 0.08s"}}/>
                  {on&&instrs.map((id,di)=>{
                    const ins=INSTRUMENTS.find(x=>x.id===id)!;
                    const dR=3;
                    const off=instrs.length>1?(di-(instrs.length-1)/2)*7:0;
                    return(<circle key={id} cx={v.x+off} cy={v.y} r={dR}
                      fill={cur?"#000":ins.color} opacity={0.92}/>);
                  })}
                  <text x={v.x} y={v.y+(on?r0+11:16)} textAnchor="middle" fontSize={6.5}
                    fill={cur?"#30D158":on?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.12)"}
                    fontFamily="monospace" fontWeight={cur?700:400}>{i+1}</text>
                </g>
              );
            })}
            <text x={CX} y={CY+4} textAnchor="middle" fontSize={9}
              fill={playing?"#30D158":"#333"} fontFamily="monospace" fontWeight={700}>
              {playing?"▶":"■"}
            </text>
          </svg>

          {/* Steps selector */}
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"center",maxWidth:390}}>
            <span style={{fontSize:8,color:"#444",letterSpacing:"0.1em"}}>STEPS</span>
            {STEP_OPTIONS.map(n=>(
              <button key={n} onClick={()=>changeN(n)} style={{
                padding:"3px 8px",borderRadius:4,
                border:`1px solid ${N===n?"rgba(48,209,88,0.5)":"rgba(255,255,255,0.07)"}`,
                background:N===n?"rgba(48,209,88,0.1)":"transparent",
                color:N===n?"#30D158":"#555",
                fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"monospace",
              }}>{n}</button>
            ))}
          </div>

          {/* Active hit summary */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",minHeight:22}}>
            {INSTRUMENTS.filter(ins=>instrCount(ins.id)>0).map(ins=>(
              <div key={ins.id} style={{display:"flex",alignItems:"center",gap:4,
                padding:"2px 7px",borderRadius:4,
                background:ins.color+"12",border:`1px solid ${ins.color}2a`,
                fontSize:8,color:ins.color,fontWeight:700,letterSpacing:"0.08em"}}>
                {ins.icon} {ins.label} ×{instrCount(ins.id)}
              </div>
            ))}
            {Object.keys(hits).length===0&&(
              <span style={{fontSize:8,color:"#2a2a2a",letterSpacing:"0.08em"}}>
                Cliquez un sommet pour ajouter un hit
              </span>
            )}
          </div>
        </div>

        {/* ── Templates panel ── */}
        <div style={{display:"flex",flexDirection:"column",gap:6,width:200}}>
          <div style={{fontSize:8,fontWeight:700,letterSpacing:"0.12em",color:"#30D158",marginBottom:2}}>
            TEMPLATES
          </div>

          {/* Region tabs */}
          <div style={{display:"flex",gap:4,marginBottom:4}}>
            {REGIONS.map(r=>(
              <button key={r} onClick={()=>setRegion(r)} style={{
                flex:1,padding:"4px 4px",borderRadius:4,fontSize:7,fontWeight:800,
                border:`1px solid ${region===r?REGION_COLORS[r]+"66":"rgba(255,255,255,0.06)"}`,
                background:region===r?REGION_COLORS[r]+"15":"transparent",
                color:region===r?REGION_COLORS[r]:"#444",
                cursor:"pointer",fontFamily:"monospace",letterSpacing:"0.06em",
              }}>{r}</button>
            ))}
          </div>

          {/* Template list */}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {regionTemplates.map(t=>{
              const ins=INSTRUMENTS.find(x=>x.id===(t.instr||"kick"))!;
              return(
                <button key={t.name} onClick={()=>applyTemplate(t)} style={{
                  textAlign:"left",padding:"7px 9px",borderRadius:6,
                  border:"1px solid rgba(255,255,255,0.06)",
                  background:"rgba(255,255,255,0.02)",
                  cursor:"pointer",fontFamily:"monospace",
                  transition:"all 0.12s",
                }}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                    <span style={{fontSize:10,fontWeight:800,color:"#F0F0F0",letterSpacing:"0.05em"}}>{t.name}</span>
                    <div style={{display:"flex",alignItems:"center",gap:3}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:ins.color,display:"inline-block"}}/>
                      <span style={{fontSize:7,color:rc,fontWeight:700}}>{t.N}st</span>
                    </div>
                  </div>
                  <div style={{fontSize:7.5,color:"#555",marginBottom:2}}>{t.origin}</div>
                  <div style={{fontSize:7,color:"#333",fontStyle:"italic"}}>{t.desc}</div>
                  {/* mini pattern preview */}
                  <div style={{display:"flex",gap:2,marginTop:5,flexWrap:"wrap"}}>
                    {Array.from({length:Math.min(t.N,16)},(_,i)=>(
                      <div key={i} style={{
                        width:t.N<=16?7:5,height:t.N<=16?7:5,borderRadius:2,
                        background:t.hits.includes(i)?ins.color:"rgba(255,255,255,0.06)",
                        flexShrink:0,
                      }}/>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

import React,{useState,useMemo,useRef} from 'react';
import {THEMES} from '../theme.js';
import type {UserKit,SampleBankEntry} from './KitBrowser.tsx';

const KIT_EMOJIS=['🥁','🔴','🎷','📼','⚡','🌍','🔥','🎹','🎸','🎺','🎵','💥','🔊','🎤','⭐','🧨','🪘','🎼','🔉','🏺'];

interface Track{id:string;label:string;color:string;}
interface FactoryKit{id:string;name:string;icon:string;samples:Record<string,string>;}

interface Props{
  open:boolean;onClose:()=>void;
  factoryKits:readonly FactoryKit[];
  userKits:UserKit[];
  tracks:readonly Track[];
  onPreview:(entry:SampleBankEntry)=>Promise<void>;
  onSave:(name:string,icon:string,slots:Record<string,SampleBankEntry|null>)=>Promise<void>;
  themeName:string;
}

function buildBank(factoryKits:readonly FactoryKit[],userKits:UserKit[]):SampleBankEntry[]{
  const bank:SampleBankEntry[]=[];
  factoryKits.forEach(kit=>{
    Object.entries(kit.samples).forEach(([tid,url])=>{
      if(url)bank.push({id:`f_${kit.id}_${tid}`,name:`${kit.name} — ${tid.toUpperCase()}`,category:tid,source:'factory',url:url as string});
    });
  });
  userKits.forEach(kit=>{
    Object.entries(kit.samples).forEach(([tid,info])=>{
      if(info.type==='blob'&&info.blobKey)bank.push({id:`u_${kit.id}_${tid}`,name:`${kit.name} — ${info.originalName||tid.toUpperCase()}`,category:tid,source:'user',blobKey:info.blobKey});
    });
  });
  return bank;
}

export function KitComposer({open,onClose,factoryKits,userKits,tracks,onPreview,onSave,themeName}:Props){
  const th=THEMES[themeName]||THEMES.dark;
  const [slots,setSlots]=useState<Record<string,SampleBankEntry|null>>(()=>Object.fromEntries(tracks.map(t=>[t.id,null])));
  const [activeSlot,setActiveSlot]=useState(tracks[0]?.id||'kick');
  const [activeTab,setActiveTab]=useState(tracks[0]?.id||'kick');
  const [dialog,setDialog]=useState(false);
  const [kitName,setKitName]=useState('');
  const [kitIcon,setKitIcon]=useState('🥁');
  const [saving,setSaving]=useState(false);
  const [previewing,setPreviewing]=useState<string|null>(null);
  const nameRef=useRef<HTMLInputElement>(null);

  const bank=useMemo(()=>buildBank(factoryKits,userKits),[factoryKits,userKits]);
  const tabSamples=useMemo(()=>bank.filter(e=>e.category===activeTab),[bank,activeTab]);
  const filledCount=Object.values(slots).filter(Boolean).length;

  if(!open)return null;

  const selectSlot=(tid:string)=>{setActiveSlot(tid);setActiveTab(tid);};

  const assign=(entry:SampleBankEntry)=>{
    setSlots(prev=>({...prev,[activeSlot]:entry}));
    // Auto-advance to next empty slot
    const idx=tracks.findIndex(t=>t.id===activeSlot);
    for(let i=1;i<tracks.length;i++){
      const next=tracks[(idx+i)%tracks.length];
      if(!slots[next.id]){selectSlot(next.id);break;}
    }
  };

  const handlePreview=async(entry:SampleBankEntry)=>{
    setPreviewing(entry.id);
    try{await onPreview(entry);}finally{setPreviewing(null);}
  };

  const handleSave=async()=>{
    if(!kitName.trim()||saving)return;
    setSaving(true);
    try{await onSave(kitName.trim(),kitIcon,slots);setDialog(false);setKitName('');setKitIcon('🥁');}
    finally{setSaving(false);}
  };

  const panel:React.CSSProperties={background:'linear-gradient(170deg,#141420 0%,#0F0A14 100%)',borderTop:'1px solid rgba(191,90,242,0.22)',borderRadius:'16px 16px 0 0',maxHeight:'92vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 -8px 40px rgba(0,0,0,0.6)'};
  const inputSt:React.CSSProperties={width:'100%',boxSizing:'border-box',padding:'8px 10px',borderRadius:8,border:'1px solid rgba(191,90,242,0.35)',background:'rgba(191,90,242,0.07)',color:th.text,fontSize:13,fontFamily:'inherit',outline:'none'};
  const btnSt=(c='#BF5AF2',bg='rgba(191,90,242,0.12)'):React.CSSProperties=>({padding:'8px 14px',borderRadius:8,border:`1px solid ${c}55`,background:bg,color:c,fontSize:11,fontWeight:800,letterSpacing:'0.08em',cursor:'pointer',fontFamily:'inherit',transition:'all 0.1s'});

  return(
    <div style={{position:'fixed',inset:0,zIndex:500,display:'flex',flexDirection:'column',justifyContent:'flex-end',background:'rgba(0,0,0,0.78)',backdropFilter:'blur(4px)'}}
      onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={panel}>

        {/* Header */}
        <div style={{padding:'14px 16px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,borderBottom:`1px solid ${th.sBorder}`}}>
          <div>
            <div style={{fontSize:11,fontWeight:900,color:'#BF5AF2',letterSpacing:'0.2em'}}>COMPOSE KIT</div>
            <div style={{fontSize:7,color:th.dim,letterSpacing:'0.1em',marginTop:1}}>ASSIGN SAMPLES PER TRACK — {filledCount}/{tracks.length} SLOTS FILLED</div>
          </div>
          <button onClick={onClose} style={{...btnSt('#888','transparent'),padding:'6px 10px',fontSize:14}}>✕</button>
        </div>

        {/* Slot bar */}
        <div style={{padding:'10px 12px 0',flexShrink:0,overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          <div style={{display:'flex',gap:6,minWidth:'max-content',paddingBottom:10}}>
            {tracks.map(tr=>{
              const assigned=slots[tr.id];
              const isActive=activeSlot===tr.id;
              return(
                <button key={tr.id} onClick={()=>selectSlot(tr.id)} style={{
                  display:'flex',flexDirection:'column',alignItems:'center',gap:3,
                  padding:'8px 10px',borderRadius:10,cursor:'pointer',minWidth:70,
                  border:`2px solid ${isActive?tr.color:assigned?tr.color+'44':th.sBorder}`,
                  background:isActive?tr.color+'18':assigned?tr.color+'0a':th.surface,
                  transition:'all 0.12s',fontFamily:'inherit',
                  boxShadow:isActive?`0 0 12px ${tr.color}33`:'none',
                }}>
                  <span style={{fontSize:8,fontWeight:900,color:isActive?tr.color:assigned?tr.color+'cc':th.dim,letterSpacing:'0.08em'}}>{tr.label}</span>
                  <span style={{fontSize:6,color:isActive?'#fff':th.faint,maxWidth:68,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'center',letterSpacing:'0.04em'}}>
                    {assigned?assigned.name.split(' — ')[1]||assigned.name:'— empty —'}
                  </span>
                  {assigned&&<div style={{width:4,height:4,borderRadius:'50%',background:tr.color}}/>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category tabs */}
        <div style={{display:'flex',overflowX:'auto',flexShrink:0,padding:'0 12px',gap:4,borderBottom:`1px solid ${th.sBorder}`}}>
          {tracks.map(tr=>{
            const isActive=activeTab===tr.id;
            const count=bank.filter(e=>e.category===tr.id).length;
            return(
              <button key={tr.id} onClick={()=>setActiveTab(tr.id)} style={{
                padding:'7px 10px',borderRadius:'8px 8px 0 0',cursor:'pointer',fontFamily:'inherit',flexShrink:0,
                border:'none',borderBottom:isActive?`2px solid ${tr.color}`:'2px solid transparent',
                background:isActive?tr.color+'18':'transparent',
                color:isActive?tr.color:th.dim,fontSize:8,fontWeight:800,letterSpacing:'0.1em',
                transition:'all 0.12s',
              }}>
                {tr.label}
                {count>0&&<span style={{fontSize:6,color:isActive?tr.color:th.faint,marginLeft:3}}>({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Sample list */}
        <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch'}}>
          {tabSamples.length===0?(
            <div style={{padding:'24px 16px',fontSize:9,color:th.dim,letterSpacing:'0.08em',textAlign:'center'}}>
              No samples in this category.<br/>Load factory samples or save a user kit to see samples here.
            </div>
          ):(
            <div style={{padding:'8px 0'}}>
              {tabSamples.map(entry=>{
                const isAssigned=Object.values(slots).some(s=>s?.id===entry.id);
                const isAssignedHere=slots[activeSlot]?.id===entry.id;
                const isPrev=previewing===entry.id;
                return(
                  <div key={entry.id} style={{
                    display:'flex',alignItems:'center',gap:8,padding:'8px 14px',cursor:'pointer',
                    borderBottom:`1px solid ${th.sBorder}`,
                    background:isAssignedHere?'rgba(191,90,242,0.08)':isAssigned?'rgba(255,149,0,0.04)':'transparent',
                    transition:'background 0.1s',
                  }}
                  onClick={()=>assign(entry)}>
                    <button onClick={e=>{e.stopPropagation();handlePreview(entry);}} style={{
                      width:26,height:26,borderRadius:6,flexShrink:0,cursor:'pointer',fontFamily:'inherit',
                      border:`1px solid ${isPrev?'#30D158':'rgba(255,255,255,0.15)'}`,
                      background:isPrev?'rgba(48,209,88,0.18)':'rgba(255,255,255,0.05)',
                      color:isPrev?'#30D158':th.dim,fontSize:10,display:'flex',alignItems:'center',justifyContent:'center',
                      transition:'all 0.12s',
                    }}>
                      {isPrev?'◼':'▶'}
                    </button>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,color:isAssignedHere?'#BF5AF2':th.text,fontWeight:isAssignedHere?800:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{entry.name}</div>
                      <div style={{fontSize:7,color:entry.source==='user'?'#FF9500':th.faint,marginTop:1,letterSpacing:'0.06em'}}>{entry.source==='user'?'MY SAMPLE':'FACTORY'}</div>
                    </div>
                    {isAssignedHere&&<span style={{fontSize:14,color:'#BF5AF2',flexShrink:0}}>✓</span>}
                    {isAssigned&&!isAssignedHere&&<span style={{fontSize:8,color:th.faint,flexShrink:0}}>·</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:'10px 14px',borderTop:`1px solid ${th.sBorder}`,flexShrink:0,display:'flex',gap:8,alignItems:'center'}}>
          <button onClick={()=>setSlots(Object.fromEntries(tracks.map(t=>[t.id,null])))} style={{...btnSt('#888','transparent'),padding:'8px 10px',fontSize:9}}>CLEAR</button>
          <button onClick={()=>{setKitName('');setKitIcon('🥁');setDialog(true);}} disabled={filledCount===0}
            style={{...btnSt('#BF5AF2','rgba(191,90,242,0.14)'),flex:1,textAlign:'center',opacity:filledCount===0?0.4:1}}>
            SAVE AS KIT ({filledCount} sample{filledCount!==1?'s':''})
          </button>
        </div>
      </div>

      {/* Save dialog */}
      {dialog&&(
        <div style={{position:'fixed',inset:0,zIndex:510,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)',padding:16}}>
          <div style={{background:'#161624',border:'1px solid rgba(191,90,242,0.35)',borderRadius:14,padding:20,width:'100%',maxWidth:340,display:'flex',flexDirection:'column',gap:14}}>
            <div style={{fontSize:11,fontWeight:900,color:'#BF5AF2',letterSpacing:'0.15em'}}>NAME YOUR KIT</div>
            <input ref={nameRef} placeholder="Kit name…" value={kitName} onChange={e=>setKitName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSave()} style={inputSt} maxLength={32} autoFocus/>
            <div>
              <div style={{fontSize:8,color:th.dim,marginBottom:6,letterSpacing:'0.1em'}}>ICON</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {KIT_EMOJIS.map(em=>(
                  <button key={em} onClick={()=>setKitIcon(em)} style={{width:32,height:32,borderRadius:6,border:`2px solid ${kitIcon===em?'#BF5AF2':th.sBorder}`,background:kitIcon===em?'rgba(191,90,242,0.18)':'transparent',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>{em}</button>
                ))}
              </div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setDialog(false)} style={{...btnSt('#888','transparent'),flex:1}}>CANCEL</button>
              <button onClick={handleSave} disabled={saving||!kitName.trim()} style={{...btnSt('#BF5AF2','rgba(191,90,242,0.15)'),flex:2,opacity:saving||!kitName.trim()?0.4:1}}>{saving?'SAVING…':'SAVE'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

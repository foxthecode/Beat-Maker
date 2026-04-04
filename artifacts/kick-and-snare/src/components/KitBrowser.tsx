import React,{useState,useRef,useEffect} from 'react';
import {THEMES} from '../theme.js';
import {useSheetTransition} from '../hooks/usePanelTransition';

const KIT_EMOJIS=['🥁','🔴','🎷','📼','⚡','🌍','🔥','🎹','🎸','🎺','🎵','💥','🔊','🎤','⭐','🧨','🪘','🎼','🔉','🏺'];

export interface UserKit{
  id:string;name:string;icon:string;createdAt:number;
  samples:Record<string,{type:'url'|'blob'|'synth';url?:string;blobKey?:string;originalName?:string;}>;
  shape:Record<string,Record<string,number>>;
}
export interface SampleBankEntry{
  id:string;name:string;category:string;
  source:'factory'|'user';
  url?:string;blobKey?:string;
}

interface FactoryKit{id:string;name:string;icon:string;samples:Record<string,string>;}

interface Props{
  open:boolean;onClose:()=>void;
  factoryKits:readonly FactoryKit[];
  userKits:UserKit[];
  activeKitId:string|null;
  onLoadFactory:(kit:FactoryKit)=>void;
  onLoadUser:(kit:UserKit)=>Promise<void>;
  onSave:(name:string,icon:string)=>Promise<void>;
  onRename:(kitId:string,name:string)=>void;
  onDelete:(kitId:string)=>void;
  onOpenComposer:()=>void;
  themeName:string;
}

export function KitBrowser({open,onClose,factoryKits,userKits,activeKitId,onLoadFactory,onLoadUser,onSave,onRename,onDelete,onOpenComposer,themeName}:Props){
  const th=THEMES[themeName]||THEMES.dark;
  const sheet=useSheetTransition(open);
  const [dialog,setDialog]=useState<null|'save'|{kind:'rename';kit:UserKit}>(null);
  const [kitName,setKitName]=useState('');
  const [kitIcon,setKitIcon]=useState('🥁');
  const [menuFor,setMenuFor]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState<string|null>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  const nameRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{if(!open){setDialog(null);setMenuFor(null);}else{setLoading(null);}},[ open]);
  useEffect(()=>{if(dialog)setTimeout(()=>nameRef.current?.focus(),80);},[dialog]);

  useEffect(()=>{
    if(!menuFor)return;
    const handler=(e:MouseEvent)=>{if(menuRef.current&&!menuRef.current.contains(e.target as Node))setMenuFor(null);};
    document.addEventListener('mousedown',handler,{capture:true});
    return()=>document.removeEventListener('mousedown',handler,{capture:true});
  },[menuFor]);

  if(!sheet.visible)return null;

  const handleSave=async()=>{
    if(!kitName.trim()||saving)return;
    setSaving(true);
    try{await onSave(kitName.trim(),kitIcon);setDialog(null);setKitName('');setKitIcon('🥁');}
    finally{setSaving(false);}
  };
  const handleRename=()=>{
    if(typeof dialog==='object'&&dialog?.kind==='rename'&&kitName.trim()){
      onRename(dialog.kit.id,kitName.trim());setDialog(null);setKitName('');
    }
  };
  const openRename=(kit:UserKit)=>{setMenuFor(null);setKitName(kit.name);setDialog({kind:'rename',kit});};
  const openSave=()=>{setKitName('');setKitIcon('🥁');setDialog('save');};

  const card=(icon:string,name:string,sub:string,isActive:boolean,onClick:()=>void,extra?:React.ReactNode)=>(
    <div onClick={onClick} style={{
      position:'relative',padding:'12px 10px 10px',borderRadius:12,cursor:'pointer',
      border:`2px solid ${isActive?'#FF9500':th.sBorder}`,
      background:isActive?'rgba(255,149,0,0.08)':th.surface,
      display:'flex',flexDirection:'column',alignItems:'center',gap:4,
      transition:'all 0.14s',userSelect:'none',WebkitTapHighlightColor:'transparent',
      boxShadow:isActive?'0 0 14px rgba(255,149,0,0.15)':'none',
    }}>
      <div style={{fontSize:26,lineHeight:1}}>{icon}</div>
      <div style={{fontSize:9,fontWeight:800,color:isActive?'#FF9500':th.text,letterSpacing:'0.06em',textAlign:'center',lineHeight:1.2,maxWidth:70,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
      <div style={{fontSize:7,color:th.dim,textAlign:'center'}}>{sub}</div>
      {isActive&&<div style={{position:'absolute',top:5,right:5,width:6,height:6,borderRadius:'50%',background:'#FF9500'}}/>}
      {extra}
    </div>
  );

  const grid=(children:React.ReactNode)=>(
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(88px,1fr))',gap:8}}>{children}</div>
  );

  const sectionLabel=(txt:string)=>(
    <div style={{fontSize:8,fontWeight:800,color:th.dim,letterSpacing:'0.18em',marginBottom:6,marginTop:2}}>{txt}</div>
  );

  const factorySampleCount=(kit:FactoryKit)=>Object.values(kit.samples).filter(Boolean).length;

  const inputSt:React.CSSProperties={width:'100%',boxSizing:'border-box',padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,149,0,0.35)',background:'rgba(255,149,0,0.07)',color:th.text,fontSize:13,fontFamily:'inherit',outline:'none'};
  const btnSt=(color='#FF9500',bg='rgba(255,149,0,0.12)'):React.CSSProperties=>({padding:'8px 18px',borderRadius:8,border:`1px solid ${color}55`,background:bg,color,fontSize:11,fontWeight:800,letterSpacing:'0.08em',cursor:'pointer',fontFamily:'inherit',transition:'all 0.1s'});

  return(
    <>
    <div className={sheet.overlayClass} onClick={onClose} style={{position:'fixed',inset:0,zIndex:400,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(4px)'}}/>
    <div className={sheet.sheetClass} style={{position:'fixed',bottom:0,left:0,right:0,zIndex:401,maxWidth:960,margin:'0 auto',background:'linear-gradient(170deg,#141420 0%,#0F0A14 100%)',borderTop:'1px solid rgba(255,149,0,0.18)',borderRadius:'16px 16px 0 0',maxHeight:'85vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 -8px 40px rgba(0,0,0,0.6)'}}>
        {/* Header */}
        <div style={{padding:'14px 16px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,borderBottom:`1px solid ${th.sBorder}`}}>
          <div>
            <div style={{fontSize:11,fontWeight:900,color:'#FF9500',letterSpacing:'0.2em'}}>KIT LIBRARY</div>
            <div style={{fontSize:7,color:th.dim,letterSpacing:'0.1em',marginTop:1}}>{factoryKits.length} FACTORY · {userKits.length} USER</div>
          </div>
          <button onClick={onClose} style={{...btnSt('#888','transparent'),padding:'6px 10px',fontSize:14}}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{flex:1,overflowY:'auto',padding:'14px 14px 0',WebkitOverflowScrolling:'touch'}}>
          {sectionLabel('FACTORY KITS')}
          {grid(factoryKits.map(kit=>{
            const isAct=activeKitId===kit.id;
            const sc=factorySampleCount(kit);
            return card(kit.icon,kit.name,sc>0?`${sc} samples`:'synthesis',isAct,()=>{if(!isAct)onLoadFactory(kit);},undefined);
          }))}

          <div style={{height:18}}/>
          {sectionLabel('MY KITS')}
          {userKits.length===0
            ?<div style={{fontSize:9,color:th.dim,padding:'12px 0',letterSpacing:'0.08em'}}>No user kits yet — save your current setup below.</div>
            :grid(userKits.map(kit=>{
              const isAct=activeKitId===kit.id;
              const dateStr=new Date(kit.createdAt).toLocaleDateString('en',{month:'short',day:'numeric'});
              const menuOpen=menuFor===kit.id;
              const dots=(
                <button onClick={e=>{e.stopPropagation();setMenuFor(menuOpen?null:kit.id);}} style={{position:'absolute',top:5,left:5,width:18,height:18,borderRadius:4,border:`1px solid ${th.sBorder}`,background:menuOpen?'rgba(255,149,0,0.18)':'transparent',color:th.dim,fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'inherit',lineHeight:1,padding:0}} title="Kit options">⋮</button>
              );
              return(
                <div key={kit.id} style={{position:'relative'}}>
                  {card(kit.icon,kit.name,dateStr,isAct,async()=>{if(!isAct&&!loading){setLoading(kit.id);try{await onLoadUser(kit);}finally{setLoading(null);}}},dots)}
                  {loading===kit.id&&<div style={{position:'absolute',inset:0,borderRadius:12,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,pointerEvents:'none'}}>⏳</div>}
                  {menuOpen&&(
                    <div ref={menuRef} style={{position:'absolute',top:28,left:0,zIndex:10,background:'#1e1e2e',border:`1px solid ${th.sBorder}`,borderRadius:8,overflow:'hidden',boxShadow:'0 4px 20px rgba(0,0,0,0.5)',minWidth:110}}>
                      <button onClick={()=>openRename(kit)} style={{display:'block',width:'100%',padding:'8px 14px',background:'transparent',border:'none',color:th.text,fontSize:10,fontWeight:700,textAlign:'left',cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.06em'}}>✏️ RENAME</button>
                      <button onClick={()=>{setMenuFor(null);if(confirm(`Delete "${kit.name}"?`))onDelete(kit.id);}} style={{display:'block',width:'100%',padding:'8px 14px',background:'transparent',border:'none',color:'#FF375F',fontSize:10,fontWeight:700,textAlign:'left',cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.06em'}}>🗑 DELETE</button>
                    </div>
                  )}
                </div>
              );
            }))
          }
          <div style={{height:80}}/>
        </div>

        {/* Sticky footer */}
        <div style={{padding:'12px 14px',borderTop:`1px solid ${th.sBorder}`,flexShrink:0,display:'flex',gap:8}}>
          <button onClick={()=>{onClose();onOpenComposer();}} style={{...btnSt('#BF5AF2','rgba(191,90,242,0.1)'),padding:'8px 12px',flexShrink:0}} title="Assemble a kit from individual samples">🎛 COMPOSE</button>
          <button onClick={openSave} style={{...btnSt(),flex:1,textAlign:'center'}}>＋ SAVE CURRENT AS KIT</button>
        </div>
      </div>

      {/* Save dialog */}
      {dialog==='save'&&(
        <div style={{position:'fixed',inset:0,zIndex:410,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.55)',padding:16}}>
          <div style={{background:'#161624',border:`1px solid rgba(255,149,0,0.3)`,borderRadius:14,padding:20,width:'100%',maxWidth:340,display:'flex',flexDirection:'column',gap:14}}>
            <div style={{fontSize:11,fontWeight:900,color:'#FF9500',letterSpacing:'0.15em'}}>SAVE KIT</div>
            <input ref={nameRef} placeholder="Kit name…" value={kitName} onChange={e=>setKitName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSave()} style={inputSt} maxLength={32}/>
            <div>
              <div style={{fontSize:8,color:th.dim,marginBottom:6,letterSpacing:'0.1em'}}>ICON</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {KIT_EMOJIS.map(em=>(
                  <button key={em} onClick={()=>setKitIcon(em)} style={{width:32,height:32,borderRadius:6,border:`2px solid ${kitIcon===em?'#FF9500':th.sBorder}`,background:kitIcon===em?'rgba(255,149,0,0.15)':'transparent',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>{em}</button>
                ))}
              </div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setDialog(null)} style={{...btnSt('#888','transparent'),flex:1}}>CANCEL</button>
              <button onClick={handleSave} disabled={saving||!kitName.trim()} style={{...btnSt('#FF9500','rgba(255,149,0,0.15)'),flex:2,opacity:saving||!kitName.trim()?0.45:1}}>{saving?'SAVING…':'SAVE KIT'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename dialog */}
      {typeof dialog==='object'&&dialog?.kind==='rename'&&(
        <div style={{position:'fixed',inset:0,zIndex:410,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.55)',padding:16}}>
          <div style={{background:'#161624',border:`1px solid rgba(255,149,0,0.3)`,borderRadius:14,padding:20,width:'100%',maxWidth:340,display:'flex',flexDirection:'column',gap:14}}>
            <div style={{fontSize:11,fontWeight:900,color:'#FF9500',letterSpacing:'0.15em'}}>RENAME KIT</div>
            <input ref={nameRef} value={kitName} onChange={e=>setKitName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleRename()} style={inputSt} maxLength={32}/>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setDialog(null)} style={{...btnSt('#888','transparent'),flex:1}}>CANCEL</button>
              <button onClick={handleRename} disabled={!kitName.trim()} style={{...btnSt('#FF9500','rgba(255,149,0,0.15)'),flex:2,opacity:!kitName.trim()?0.45:1}}>RENAME</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

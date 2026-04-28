import React,{useState,useRef,useEffect} from "react";
import{getSlots,saveSlot,deleteSlot,exportProject,importProject,fmtDate,NUM_SLOTS,type ProjectState,type ProjectSlot} from "../projectManager";

interface SaveModalProps{
  theme:any;
  getState:()=>ProjectState;
  onLoad:(state:ProjectState)=>void;
  onClose:()=>void;
}

export default function SaveModal({theme:th,getState,onLoad,onClose}:SaveModalProps){
  const[slots,setSlots]=useState<(ProjectSlot|null)[]>(getSlots);
  const[editIdx,setEditIdx]=useState<number|null>(null);
  const[editName,setEditName]=useState("");
  const[feedback,setFeedback]=useState<string|null>(null);
  const[confirmDel,setConfirmDel]=useState<number|null>(null);
  const importRef=useRef<HTMLInputElement>(null);

  const refresh=()=>setSlots(getSlots());

  const showFeedback=(msg:string)=>{
    setFeedback(msg);
    setTimeout(()=>setFeedback(null),2000);
  };

  const handleSave=(idx:number)=>{
    if(editIdx===idx){
      saveSlot(idx,editName,getState());
      refresh();setEditIdx(null);setEditName("");
      showFeedback("✓ Saved");
    }else{
      const existing=slots[idx];
      setEditName(existing?.name||`Project ${idx+1}`);
      setEditIdx(idx);
    }
  };

  const handleLoad=(idx:number)=>{
    const slot=slots[idx];
    if(!slot)return;
    onLoad(slot.state);
    showFeedback("✓ Loaded");
    setTimeout(onClose,700);
  };

  const handleDelete=(idx:number)=>{
    if(confirmDel===idx){
      deleteSlot(idx);refresh();setConfirmDel(null);
    }else{setConfirmDel(idx);}
  };

  const handleExport=(idx:number)=>{
    const slot=slots[idx];
    if(!slot)return;
    exportProject(slot.name,slot.state);
  };

  const handleImportClick=()=>importRef.current?.click();

  const handleImportFile=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    try{
      const state=await importProject(file);
      onLoad(state);
      showFeedback("✓ Imported");
      setTimeout(onClose,700);
    }catch(err:any){
      showFeedback("✗ Invalid file");
    }
    e.target.value="";
  };

  const overlayStyle:React.CSSProperties={
    position:"fixed",inset:0,zIndex:9000,
    background:"rgba(0,0,0,0.75)",backdropFilter:"blur(4px)",
    display:"flex",alignItems:"center",justifyContent:"center",
    padding:16,
  };

  const panelStyle:React.CSSProperties={
    background:th.surface,border:`1px solid ${th.sBorder}`,
    borderRadius:16,padding:"20px 18px 16px",
    width:"100%",maxWidth:400,
    display:"flex",flexDirection:"column",gap:10,
    fontFamily:"inherit",
  };

  const slotStyle=(filled:boolean):React.CSSProperties=>({
    border:`1px solid ${filled?'rgba(255,255,255,0.15)':th.sBorder}`,
    borderRadius:10,padding:"10px 12px",
    background:filled?"rgba(255,255,255,0.04)":"transparent",
    display:"flex",flexDirection:"column",gap:6,
  });

  const btn=(color:string,ghost=false):React.CSSProperties=>({
    padding:"5px 10px",borderRadius:6,fontSize:9,fontWeight:800,cursor:"pointer",
    fontFamily:"inherit",letterSpacing:"0.07em",textTransform:"uppercase" as const,
    border:`1px solid ${ghost?color+"55":color}`,
    background:ghost?"transparent":color+"22",
    color:ghost?color+"88":color,
    transition:"all 0.12s",
    flexShrink:0,
  });

  return(
    <div style={overlayStyle} onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,fontWeight:900,color:th.fg,letterSpacing:"0.08em",flex:1}}>💾 PROJECTS</span>
          {feedback&&<span style={{fontSize:9,fontWeight:700,color:"#30D158",letterSpacing:"0.06em"}}>{feedback}</span>}
          <button onClick={onClose} style={{...btn(th.dim,true),padding:"3px 8px",fontSize:11}}>✕</button>
        </div>

        {/* Slots */}
        {slots.map((slot,idx)=>(
          <div key={idx} style={slotStyle(!!slot)}>
            {editIdx===idx?(
              /* Inline name editor */
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input
                  autoFocus
                  value={editName}
                  onChange={e=>setEditName(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter")handleSave(idx);if(e.key==="Escape"){setEditIdx(null);}}}
                  placeholder={`Project ${idx+1}`}
                  style={{flex:1,background:"transparent",border:`1px solid ${th.sBorder}`,borderRadius:6,
                    color:th.fg,fontSize:12,fontWeight:500,fontFamily:"system-ui,-apple-system,sans-serif",
                    padding:"4px 8px",outline:"none",minWidth:0}}
                />
                <button onClick={()=>handleSave(idx)} style={btn("#30D158")}>SAVE</button>
                <button onClick={()=>setEditIdx(null)} style={btn(th.dim,true)}>✕</button>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                {/* Slot info */}
                <div style={{flex:1,minWidth:0}}>
                  {slot?(
                    <>
                      <div style={{fontSize:12,fontWeight:600,color:th.fg,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:"system-ui,-apple-system,sans-serif"}}>{slot.name}</div>
                      <div style={{fontSize:10,color:th.dim,marginTop:1,fontFamily:"system-ui,-apple-system,sans-serif"}}>{fmtDate(slot.date)}</div>
                    </>
                  ):(
                    <div style={{fontSize:10,color:th.faint,fontStyle:"italic",fontFamily:"system-ui,-apple-system,sans-serif"}}>— empty —</div>
                  )}
                </div>
                {/* Actions */}
                <div style={{display:"flex",gap:4,flexShrink:0}}>
                  {slot&&(
                    <>
                      <button onClick={()=>handleLoad(idx)} style={btn("#5E5CE6")} title="Load this project">LOAD</button>
                      <button onClick={()=>handleExport(idx)} style={btn("#FF9500",true)} title="Export as JSON file">↓</button>
                      <button onClick={()=>handleDelete(idx)}
                        style={btn(confirmDel===idx?"#FF2D55":"#FF2D55",confirmDel!==idx)}
                        title={confirmDel===idx?"Confirm delete":"Delete slot"}
                        onBlur={()=>setConfirmDel(null)}>
                        {confirmDel===idx?"SURE?":"✕"}
                      </button>
                    </>
                  )}
                  <button onClick={()=>handleSave(idx)} style={btn("#30D158")} title="Save current project here">
                    SAVE
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Footer: Export current + Import */}
        <div style={{display:"flex",gap:8,paddingTop:6,borderTop:`1px solid ${th.sBorder}`}}>
          <button
            onClick={()=>exportProject("current",getState())}
            style={{...btn("#FF9500"),flex:1}}
            title="Export current project to a .json file">
            ↓ EXPORT JSON
          </button>
          <button onClick={handleImportClick} style={{...btn("#5E5CE6"),flex:1}} title="Import a .json project file">
            ↑ IMPORT JSON
          </button>
          <input ref={importRef} type="file" accept=".json" style={{display:"none"}} onChange={handleImportFile}/>
        </div>
      </div>
    </div>
  );
}

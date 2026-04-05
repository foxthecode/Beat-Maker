import React,{useState,useRef,useEffect} from 'react';
import {THEMES} from '../theme.js';
import type {UserKit,SampleBankEntry} from './KitBrowser.tsx';
import {useSheetTransition} from '../hooks/usePanelTransition';
import {idbPut} from '../hooks/idbHelper';
import {USER_KIT_COLORS,drumKitSVG} from '../kitIcons';

interface Track{id:string;label:string;color:string;}
interface FactoryKit{id:string;name:string;icon:string;samples:Record<string,string>;}

interface Props{
  open:boolean;onClose:()=>void;
  factoryKits:readonly FactoryKit[];
  userKits:UserKit[];
  tracks:readonly Track[];
  onPreview:(entry:SampleBankEntry)=>Promise<void>;
  onSave:(name:string,icon:string,slots:Record<string,SampleBankEntry|null>,trackLabels:Record<string,string>)=>Promise<void>;
  themeName:string;
}

// ── WAV encoder ────────────────────────────────────────────────────────────
function audioBufferToWAV(buffer:AudioBuffer):ArrayBuffer{
  const numCh=buffer.numberOfChannels,length=buffer.length,sr=buffer.sampleRate;
  const bytesPerSample=2,blockAlign=numCh*bytesPerSample,dataSize=length*blockAlign;
  const ab=new ArrayBuffer(44+dataSize);const v=new DataView(ab);
  const ws=(off:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(off+i,s.charCodeAt(i));};
  ws(0,'RIFF');v.setUint32(4,36+dataSize,true);ws(8,'WAVE');ws(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,numCh,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*blockAlign,true);v.setUint16(32,blockAlign,true);
  v.setUint16(34,16,true);ws(36,'data');v.setUint32(40,dataSize,true);
  let off=44;
  const chs=Array.from({length:numCh},(_,i)=>buffer.getChannelData(i));
  for(let i=0;i<length;i++)for(let ch=0;ch<numCh;ch++){
    const s=Math.max(-1,Math.min(1,chs[ch][i]));
    v.setInt16(off,s<0?s*0x8000:s*0x7FFF,true);off+=2;
  }
  return ab;
}

// ── TrimModal ──────────────────────────────────────────────────────────────
interface TrimModalProps{
  blob:Blob;name:string;category:string;
  onConfirm:(entry:SampleBankEntry)=>void;
  onCancel:()=>void;
  themeName:string;
}
function TrimModal({blob,name,category,onConfirm,onCancel,themeName}:TrimModalProps){
  const th=THEMES[themeName]||THEMES.dark;
  const [trimStart,setTrimStart]=useState(0);
  const [trimEnd,setTrimEnd]=useState(1);
  const [duration,setDuration]=useState(0);
  const [waveform,setWaveform]=useState<number[]>([]);
  const [previewing,setPreviewing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [dragHandle,setDragHandle]=useState<'start'|'end'|null>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const decodedRef=useRef<AudioBuffer|null>(null);
  const previewCtxRef=useRef<AudioContext|null>(null);
  const previewSrcRef=useRef<AudioBufferSourceNode|null>(null);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const ab=await blob.arrayBuffer();
        // Use an AudioContext for decode (user gesture already happened — recording/file pick)
        const ctx=new AudioContext();
        const decoded=await ctx.decodeAudioData(ab);
        await ctx.close();
        if(cancelled)return;
        decodedRef.current=decoded;
        setDuration(decoded.duration);
        const data=decoded.getChannelData(0);
        const steps=120,chunk=Math.max(1,Math.floor(data.length/steps));
        const wf:number[]=[];
        for(let i=0;i<steps;i++){
          let mx=0;
          for(let j=0;j<chunk;j++){const v=Math.abs(data[Math.min(i*chunk+j,data.length-1)]);if(v>mx)mx=v;}
          wf.push(mx);
        }
        setWaveform(wf);
      }catch(e){console.warn('TrimModal decode',e);}
    })();
    return()=>{cancelled=true;previewSrcRef.current?.stop();previewCtxRef.current?.close();};
  },[blob]);

  // Draw waveform + drag handles
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas||!waveform.length)return;
    const ctx=canvas.getContext('2d')!;
    const{width,height}=canvas;
    ctx.clearRect(0,0,width,height);
    const barW=width/waveform.length;
    const sIdx=Math.floor(trimStart*waveform.length);
    const eIdx=Math.ceil(trimEnd*waveform.length);
    // 1. Waveform bars
    waveform.forEach((v,i)=>{
      const inRange=i>=sIdx&&i<=eIdx;
      ctx.fillStyle=inRange?'#BF5AF2':'rgba(191,90,242,0.22)';
      const h=Math.max(2,v*height*0.88);
      ctx.fillRect(i*barW,(height-h)/2,Math.max(1,barW-0.5),h);
    });
    // 2. Shaded out-of-range regions
    ctx.fillStyle='rgba(0,0,0,0.48)';
    ctx.fillRect(0,0,trimStart*width,height);
    ctx.fillRect(trimEnd*width,0,(1-trimEnd)*width,height);
    // 3. Colored drag handles (drawn on top, 4px wide)
    ctx.fillStyle='rgba(191,90,242,0.95)';
    ctx.fillRect(trimStart*width-2,0,4,height);
    ctx.fillStyle='rgba(48,209,88,0.95)';
    ctx.fillRect(trimEnd*width-2,0,4,height);
    // 4. Triangular grab indicators at center
    const my=height/2;
    ctx.fillStyle='rgba(191,90,242,1)';
    ctx.beginPath();ctx.moveTo(trimStart*width+2,my-7);ctx.lineTo(trimStart*width+12,my);ctx.lineTo(trimStart*width+2,my+7);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(48,209,88,1)';
    ctx.beginPath();ctx.moveTo(trimEnd*width-2,my-7);ctx.lineTo(trimEnd*width-12,my);ctx.lineTo(trimEnd*width-2,my+7);ctx.closePath();ctx.fill();
  },[waveform,trimStart,trimEnd]);

  // Drag handlers for trim handles on the canvas
  const getHandle=(px:number)=>{
    const dS=Math.abs(px-trimStart),dE=Math.abs(px-trimEnd);
    if(dS<0.1&&dS<=dE)return 'start' as const;
    if(dE<0.1)return 'end' as const;
    return null;
  };
  const onPtrDown=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    const r=canvasRef.current!.getBoundingClientRect();
    const px=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
    const h=getHandle(px);
    if(h){e.currentTarget.setPointerCapture(e.pointerId);setDragHandle(h);}
  };
  const onPtrMove=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(!dragHandle||!canvasRef.current)return;
    const r=canvasRef.current.getBoundingClientRect();
    const px=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
    if(dragHandle==='start'){if(px<trimEnd-0.02)setTrimStart(px);}
    else{if(px>trimStart+0.02)setTrimEnd(px);}
  };
  const onPtrUp=()=>setDragHandle(null);

  const handlePreview=async()=>{
    if(!decodedRef.current)return;
    previewSrcRef.current?.stop();await previewCtxRef.current?.close();
    const ctx=new AudioContext();previewCtxRef.current=ctx;
    const src=ctx.createBufferSource();src.buffer=decodedRef.current;
    src.connect(ctx.destination);
    const offset=trimStart*decodedRef.current.duration;
    const dur=(trimEnd-trimStart)*decodedRef.current.duration;
    setPreviewing(true);src.onended=()=>setPreviewing(false);
    src.start(0,offset,dur);previewSrcRef.current=src;
  };
  const stopPreview=()=>{previewSrcRef.current?.stop();setPreviewing(false);};

  const handleConfirm=async()=>{
    if(!decodedRef.current||saving)return;
    setSaving(true);
    try{
      const decoded=decodedRef.current;
      const totalLen=decoded.length;
      const startSample=Math.floor(trimStart*totalLen);
      const endSample=Math.ceil(trimEnd*totalLen);
      const trimLen=Math.max(1,endSample-startSample);
      const oac=new OfflineAudioContext(decoded.numberOfChannels,trimLen,decoded.sampleRate);
      const src=oac.createBufferSource();src.buffer=decoded;src.connect(oac.destination);
      src.start(0,decoded.duration*trimStart,decoded.duration*(trimEnd-trimStart));
      const rendered=await oac.startRendering();
      const wav=audioBufferToWAV(rendered);
      const key=`ks_blob_trim_${Date.now()}`;
      await idbPut(key,wav);
      const entry:SampleBankEntry={id:`trim_${Date.now()}`,name,category,source:'user',blobKey:key};
      onConfirm(entry);
    }catch(e){console.warn('TrimModal confirm',e);}
    finally{setSaving(false);}
  };

  const fmtT=(s:number)=>s<10?`${s.toFixed(2)}s`:s<60?`${s.toFixed(1)}s`:`${Math.floor(s/60)}:${(s%60).toFixed(0).padStart(2,'0')}`;
  const btnSt=(c='#BF5AF2',bg='rgba(191,90,242,0.12)'):React.CSSProperties=>({
    padding:'9px 14px',borderRadius:8,border:`1px solid ${c}55`,background:bg,color:c,
    fontSize:10,fontWeight:800,letterSpacing:'0.08em',cursor:'pointer',fontFamily:'inherit',transition:'all 0.1s',
  });

  return(
    <div style={{position:'fixed',inset:0,zIndex:520,display:'flex',alignItems:'flex-end',background:'rgba(0,0,0,0.72)',backdropFilter:'blur(4px)'}}>
      <div style={{width:'100%',maxWidth:960,margin:'0 auto',background:'#12121e',borderTop:'2px solid #BF5AF2',borderRadius:'16px 16px 0 0',padding:20,display:'flex',flexDirection:'column',gap:14}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:11,fontWeight:900,color:'#BF5AF2',letterSpacing:'0.2em'}}>TRIM SAMPLE</div>
            <div style={{fontSize:8,color:th.dim,marginTop:2,letterSpacing:'0.08em'}}>{name} · {fmtT(duration)} total</div>
          </div>
          <button onClick={onCancel} style={{background:'transparent',border:'none',color:th.dim,fontSize:20,cursor:'pointer',padding:'4px 8px'}}>✕</button>
        </div>

        {/* Waveform + draggable handles */}
        <div style={{position:'relative',borderRadius:10,overflow:'hidden',background:'rgba(191,90,242,0.05)',border:'1px solid rgba(191,90,242,0.18)'}}>
          <canvas ref={canvasRef} width={600} height={96}
            style={{width:'100%',height:96,display:'block',cursor:'ew-resize',touchAction:'none'}}
            onPointerDown={onPtrDown} onPointerMove={onPtrMove} onPointerUp={onPtrUp} onPointerCancel={onPtrUp}/>
          {!waveform.length&&(
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:th.dim,letterSpacing:'0.1em'}}>ANALYSING WAVEFORM…</div>
          )}
          {waveform.length>0&&(
            <>
              <div style={{position:'absolute',bottom:3,left:`calc(${trimStart*100}% + 5px)`,fontSize:7,color:'#BF5AF2',fontWeight:700,pointerEvents:'none',whiteSpace:'nowrap',letterSpacing:'0.04em'}}>{fmtT(trimStart*duration)}</div>
              <div style={{position:'absolute',bottom:3,right:`calc(${(1-trimEnd)*100}% + 5px)`,fontSize:7,color:'#30D158',fontWeight:700,pointerEvents:'none',whiteSpace:'nowrap',textAlign:'right',letterSpacing:'0.04em'}}>{fmtT(trimEnd*duration)}</div>
            </>
          )}
        </div>

        {/* Trim info */}
        <div style={{fontSize:8,color:th.dim,textAlign:'center',letterSpacing:'0.08em'}}>
          SELECTION: {fmtT((trimEnd-trimStart)*duration)} / {fmtT(duration)} · <span style={{color:'rgba(191,90,242,0.6)'}}>DRAG HANDLES TO TRIM</span>
        </div>

        {/* Buttons */}
        <div style={{display:'flex',gap:8}}>
          <button onClick={onCancel} style={{...btnSt('#888','transparent'),flex:1}}>DISCARD</button>
          <button onClick={previewing?stopPreview:handlePreview} style={{
            ...btnSt(previewing?'#30D158':'rgba(48,209,88,0.7)',previewing?'rgba(48,209,88,0.14)':'transparent'),flex:1,
          }}>{previewing?'◼ STOP':'▶ PREVIEW'}</button>
          <button onClick={handleConfirm} disabled={saving} style={{...btnSt('#BF5AF2','rgba(191,90,242,0.15)'),flex:2,opacity:saving?0.5:1}}>
            {saving?'SAVING…':'✓ USE THIS SAMPLE'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── KitComposer ────────────────────────────────────────────────────────────
export function KitComposer({open,onClose,factoryKits,userKits,tracks,onPreview,onSave,themeName}:Props){
  const th=THEMES[themeName]||THEMES.dark;
  const sheet=useSheetTransition(open);

  const [slots,setSlots]=useState<Record<string,SampleBankEntry|null>>(()=>Object.fromEntries(tracks.map(t=>[t.id,null])));
  const [activeSlot,setActiveSlot]=useState(tracks[0]?.id||'kick');
  const [trackLabels,setTrackLabels]=useState<Record<string,string>>(()=>Object.fromEntries(tracks.map(t=>[t.id,t.label])));
  const [editingLabel,setEditingLabel]=useState<string|null>(null);
  const [dialog,setDialog]=useState(false);
  const [kitName,setKitName]=useState('');
  const [saving,setSaving]=useState(false);
  const nameRef=useRef<HTMLInputElement>(null);
  const fileInputRef=useRef<HTMLInputElement>(null);

  // Recording
  const [recording,setRecording]=useState(false);
  const [recSeconds,setRecSeconds]=useState(0);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const recChunksRef=useRef<Blob[]>([]);
  const recTimerRef=useRef<ReturnType<typeof setInterval>|null>(null);

  // Trim pending — set when recording stops or file is loaded
  const [trimPending,setTrimPending]=useState<{blob:Blob;name:string}|null>(null);

  useEffect(()=>{if(!open&&recording)stopRecording();},[open]);

  const filledCount=Object.values(slots).filter(Boolean).length;

  if(!sheet.visible)return null;

  const selectSlot=(tid:string)=>{
    setActiveSlot(tid);
    setEditingLabel(null);
    const entry=slots[tid];
    if(entry)onPreview(entry).catch(()=>{});
  };

  // Auto-advance to next empty slot after assignment
  const advanceSlot=(assignedTid:string)=>{
    const idx=tracks.findIndex(t=>t.id===assignedTid);
    for(let i=1;i<tracks.length;i++){
      const next=tracks[(idx+i)%tracks.length];
      if(!slots[next.id]){setActiveSlot(next.id);break;}
    }
  };

  const handleSave=async()=>{
    if(!kitName.trim()||saving)return;
    setSaving(true);
    const icon=drumKitSVG(USER_KIT_COLORS[(userKits.length)%USER_KIT_COLORS.length]);
    try{await onSave(kitName.trim(),icon,slots,trackLabels);setDialog(false);setKitName('');}
    finally{setSaving(false);}
  };

  // ── Recording ─────────────────────────────────────────────────────────────
  function stopRecording(){
    if(recTimerRef.current){clearInterval(recTimerRef.current);recTimerRef.current=null;}
    try{recorderRef.current?.stop();}catch{}
  }

  async function startRecording(){
    if(recording){stopRecording();return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const recorder=new MediaRecorder(stream);
      recChunksRef.current=[];
      recorder.ondataavailable=(e)=>{if(e.data.size>0)recChunksRef.current.push(e.data);};
      recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        if(recTimerRef.current){clearInterval(recTimerRef.current);recTimerRef.current=null;}
        const blob=new Blob(recChunksRef.current,{type:'audio/webm'});
        const time=new Date().toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        setRecording(false);setRecSeconds(0);
        // Show TrimModal instead of auto-assigning
        setTrimPending({blob,name:`Rec ${time}`});
      };
      recorder.start();
      recorderRef.current=recorder;
      setRecording(true);setRecSeconds(0);
      recTimerRef.current=setInterval(()=>setRecSeconds(s=>s+1),1000);
    }catch(e){
      console.warn('Mic denied',e);
      alert('Microphone access denied. Please allow mic access to record.');
    }
  }

  // ── File loader ────────────────────────────────────────────────────────────
  function handleFileChange(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    if(!file)return;
    e.target.value=''; // allow re-picking same file
    setTrimPending({blob:file,name:file.name.replace(/\.[^.]+$/,'')});
  }

  // ── TrimModal confirm ─────────────────────────────────────────────────────
  function onTrimConfirm(entry:SampleBankEntry){
    setSlots(prev=>({...prev,[activeSlot]:entry}));
    advanceSlot(activeSlot);
    setTrimPending(null);
  }

  const inputSt:React.CSSProperties={width:'100%',boxSizing:'border-box',padding:'8px 10px',borderRadius:8,border:'1px solid rgba(191,90,242,0.35)',background:'rgba(191,90,242,0.07)',color:th.text,fontSize:13,fontFamily:'inherit',outline:'none'};
  const btnSt=(c='#BF5AF2',bg='rgba(191,90,242,0.12)'):React.CSSProperties=>({padding:'8px 14px',borderRadius:8,border:`1px solid ${c}55`,background:bg,color:c,fontSize:11,fontWeight:800,letterSpacing:'0.08em',cursor:'pointer',fontFamily:'inherit',transition:'all 0.1s'});
  const fmtSec=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  return(
    <>
    <div className={sheet.overlayClass} onClick={onClose} style={{position:'fixed',inset:0,zIndex:498,background:'rgba(0,0,0,0.78)',backdropFilter:'blur(4px)'}}/>
    <div className={sheet.sheetClass} style={{position:'fixed',bottom:0,left:0,right:0,zIndex:499,maxWidth:960,margin:'0 auto',background:'linear-gradient(170deg,#141420 0%,#0F0A14 100%)',borderTop:'1px solid rgba(191,90,242,0.22)',borderRadius:'16px 16px 0 0',maxHeight:'92vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 -8px 40px rgba(0,0,0,0.6)'}}>

      {/* Header */}
      <div style={{padding:'14px 16px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,borderBottom:`1px solid ${th.sBorder}`}}>
        <div>
          <div style={{fontSize:11,fontWeight:900,color:'#BF5AF2',letterSpacing:'0.2em'}}>COMPOSE YOUR OWN KIT</div>
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
            const label=trackLabels[tr.id]||tr.label;
            const isEditing=editingLabel===tr.id&&isActive;
            return(
              <button key={tr.id} onClick={()=>selectSlot(tr.id)} style={{
                display:'flex',flexDirection:'column',alignItems:'center',gap:3,
                padding:'8px 10px',borderRadius:10,cursor:'pointer',minWidth:72,
                border:`2px solid ${isActive?tr.color:assigned?tr.color+'44':th.sBorder}`,
                background:isActive?tr.color+'18':assigned?tr.color+'0a':th.surface,
                transition:'all 0.12s',fontFamily:'inherit',
                boxShadow:isActive?`0 0 12px ${tr.color}33`:'none',
              }}>
                <div style={{display:'flex',alignItems:'center',gap:2,maxWidth:70}}>
                  {isEditing?(
                    <input autoFocus value={label} maxLength={14}
                      onChange={e=>setTrackLabels(p=>({...p,[tr.id]:e.target.value}))}
                      onClick={e=>e.stopPropagation()}
                      onBlur={()=>setEditingLabel(null)}
                      onKeyDown={e=>{if(e.key==='Enter'||e.key==='Escape'){e.stopPropagation();setEditingLabel(null);}}}
                      style={{width:56,fontSize:7,background:'transparent',border:'none',borderBottom:`1px solid ${tr.color}`,color:tr.color,fontWeight:900,outline:'none',fontFamily:'inherit',letterSpacing:'0.06em',padding:'0 0 1px',textAlign:'center'}}
                    />
                  ):(
                    <span style={{fontSize:8,fontWeight:900,color:isActive?tr.color:assigned?tr.color+'cc':th.dim,letterSpacing:'0.08em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:58}}>{label}</span>
                  )}
                  {isActive&&!isEditing&&(
                    <span onClick={e=>{e.stopPropagation();setEditingLabel(tr.id);}} title="Rename track"
                      style={{fontSize:8,cursor:'text',opacity:0.5,flexShrink:0,lineHeight:1}}>✎</span>
                  )}
                </div>
                <span style={{fontSize:6,color:isActive?'#fff':th.faint,maxWidth:70,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'center',letterSpacing:'0.04em'}}>
                  {assigned?assigned.name.split(' — ')[1]||assigned.name:'— empty —'}
                </span>
                {assigned&&<div style={{width:4,height:4,borderRadius:'50%',background:tr.color}}/>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Guide */}
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'24px 20px',gap:18}}>
        <div style={{fontSize:28,opacity:0.35}}>🎙</div>
        <div style={{textAlign:'center',fontSize:9,color:th.dim,letterSpacing:'0.1em',lineHeight:1.8}}>
          SELECT A SLOT ABOVE<br/>
          THEN LOAD A FILE OR RECORD FROM THE MIC<br/>
          <span style={{color:'rgba(191,90,242,0.5)'}}>EACH SAMPLE OPENS TRIM & PREVIEW BEFORE BEING ASSIGNED</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{padding:'10px 14px',borderTop:`1px solid ${th.sBorder}`,flexShrink:0,display:'flex',gap:8,alignItems:'center'}}>
        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept="audio/*" style={{display:'none'}} onChange={handleFileChange}/>

        {/* Load file button */}
        <button
          onClick={()=>fileInputRef.current?.click()}
          title="Load an audio file from your device"
          style={{
            minWidth:44,height:44,borderRadius:10,flexShrink:0,cursor:'pointer',fontFamily:'inherit',
            border:'1px solid rgba(50,173,230,0.45)',background:'rgba(50,173,230,0.08)',
            color:'#32ADE6',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',
            transition:'all 0.15s',
          }}>
          📁
        </button>

        {/* Record button */}
        <button
          onClick={startRecording}
          title={recording?`Stop recording (${fmtSec(recSeconds)})`:' Record from microphone'}
          style={{
            minWidth:44,height:44,borderRadius:10,flexShrink:0,cursor:'pointer',fontFamily:'inherit',
            border:`2px solid ${recording?'#FF375F':'rgba(255,55,95,0.35)'}`,
            background:recording?'rgba(255,55,95,0.22)':'rgba(255,55,95,0.07)',
            color:recording?'#FF375F':'#FF375Faa',fontSize:recording?9:14,
            fontWeight:800,letterSpacing:'0.06em',display:'flex',alignItems:'center',justifyContent:'center',gap:4,
            animation:recording?'pulse 1s infinite':'none',
            transition:'all 0.15s',
          }}>
          {recording?(
            <><span style={{fontSize:7,animation:'rb 0.8s infinite',display:'inline-block'}}>●</span>{fmtSec(recSeconds)}</>
          ):'🎙'}
        </button>

        <button onClick={()=>setSlots(Object.fromEntries(tracks.map(t=>[t.id,null])))} style={{...btnSt('#888','transparent'),padding:'8px 10px',fontSize:9}}>CLEAR</button>
        <button onClick={()=>{setKitName('');setDialog(true);}} disabled={filledCount===0}
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
          {/* Icon preview */}
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',borderRadius:10,background:'rgba(191,90,242,0.06)',border:'1px solid rgba(191,90,242,0.15)'}}>
            <span style={{display:'block',lineHeight:0,width:36,height:36,overflow:'hidden',flexShrink:0}}
              dangerouslySetInnerHTML={{__html:drumKitSVG(USER_KIT_COLORS[userKits.length%USER_KIT_COLORS.length])}}/>
            <div>
              <div style={{fontSize:8,color:'#BF5AF2',fontWeight:800,letterSpacing:'0.1em'}}>AUTO-ASSIGNED ICON</div>
              <div style={{fontSize:7,color:th.dim,marginTop:2}}>Unique drum kit colour per kit</div>
            </div>
          </div>
          <input ref={nameRef} placeholder="Kit name…" value={kitName} onChange={e=>setKitName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSave()} style={inputSt} maxLength={32} autoFocus/>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setDialog(false)} style={{...btnSt('#888','transparent'),flex:1}}>CANCEL</button>
            <button onClick={handleSave} disabled={saving||!kitName.trim()} style={{...btnSt('#BF5AF2','rgba(191,90,242,0.15)'),flex:2,opacity:saving||!kitName.trim()?0.4:1}}>{saving?'SAVING…':'SAVE'}</button>
          </div>
        </div>
      </div>
    )}

    {/* TrimModal */}
    {trimPending&&(
      <TrimModal
        blob={trimPending.blob}
        name={trimPending.name}
        category={activeSlot}
        onConfirm={onTrimConfirm}
        onCancel={()=>setTrimPending(null)}
        themeName={themeName}
      />
    )}
    </>
  );
}

import React,{useState,useMemo,useRef,useEffect,useCallback} from 'react';
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
  onSave:(name:string,icon:string,slots:Record<string,SampleBankEntry|null>)=>Promise<void>;
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

  // Draw waveform
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas||!waveform.length)return;
    const ctx=canvas.getContext('2d')!;
    const{width,height}=canvas;
    ctx.clearRect(0,0,width,height);
    const barW=width/waveform.length;
    const sIdx=Math.floor(trimStart*waveform.length);
    const eIdx=Math.ceil(trimEnd*waveform.length);
    waveform.forEach((v,i)=>{
      const inRange=i>=sIdx&&i<=eIdx;
      ctx.fillStyle=inRange?'#BF5AF2':'rgba(191,90,242,0.22)';
      const h=Math.max(2,v*height*0.88);
      ctx.fillRect(i*barW,(height-h)/2,Math.max(1,barW-0.5),h);
    });
    // Trim line handles
    ctx.fillStyle='rgba(255,255,255,0.85)';
    ctx.fillRect(trimStart*width-1,0,2,height);
    ctx.fillRect(trimEnd*width-1,0,2,height);
    // Shaded out-of-range
    ctx.fillStyle='rgba(0,0,0,0.45)';
    ctx.fillRect(0,0,trimStart*width,height);
    ctx.fillRect(trimEnd*width,0,(1-trimEnd)*width,height);
  },[waveform,trimStart,trimEnd]);

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

        {/* Waveform */}
        <div style={{position:'relative',borderRadius:10,overflow:'hidden',background:'rgba(191,90,242,0.05)',border:'1px solid rgba(191,90,242,0.18)'}}>
          <canvas ref={canvasRef} width={600} height={90} style={{width:'100%',height:90,display:'block'}}/>
          {!waveform.length&&(
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:th.dim,letterSpacing:'0.1em'}}>ANALYSING WAVEFORM…</div>
          )}
        </div>

        {/* Sliders */}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:8,fontWeight:700,color:th.dim,width:36,letterSpacing:'0.06em',flexShrink:0}}>START</span>
            <input type="range" min={0} max={0.99} step={0.001} value={trimStart}
              onChange={e=>{const v=parseFloat(e.target.value);if(v<trimEnd-0.01)setTrimStart(v);}}
              style={{flex:1,accentColor:'#BF5AF2'}}/>
            <span style={{fontSize:8,color:'#BF5AF2',width:40,textAlign:'right',flexShrink:0}}>{fmtT(trimStart*duration)}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:8,fontWeight:700,color:th.dim,width:36,letterSpacing:'0.06em',flexShrink:0}}>END</span>
            <input type="range" min={0.01} max={1} step={0.001} value={trimEnd}
              onChange={e=>{const v=parseFloat(e.target.value);if(v>trimStart+0.01)setTrimEnd(v);}}
              style={{flex:1,accentColor:'#BF5AF2'}}/>
            <span style={{fontSize:8,color:'#BF5AF2',width:40,textAlign:'right',flexShrink:0}}>{fmtT(trimEnd*duration)}</span>
          </div>
        </div>

        {/* Trim info */}
        <div style={{fontSize:8,color:th.dim,textAlign:'center',letterSpacing:'0.08em'}}>
          SELECTION: {fmtT((trimEnd-trimStart)*duration)} / {fmtT(duration)}
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

// ── Bank builder ───────────────────────────────────────────────────────────
function buildBank(factoryKits:readonly FactoryKit[],userKits:UserKit[],extraEntries:SampleBankEntry[]):SampleBankEntry[]{
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
  extraEntries.forEach(e=>{if(!bank.find(b=>b.id===e.id))bank.push(e);});
  return bank;
}

// ── KitComposer ────────────────────────────────────────────────────────────
export function KitComposer({open,onClose,factoryKits,userKits,tracks,onPreview,onSave,themeName}:Props){
  const th=THEMES[themeName]||THEMES.dark;
  const sheet=useSheetTransition(open);

  const [slots,setSlots]=useState<Record<string,SampleBankEntry|null>>(()=>Object.fromEntries(tracks.map(t=>[t.id,null])));
  const [activeSlot,setActiveSlot]=useState(tracks[0]?.id||'kick');
  const [activeTab,setActiveTab]=useState(tracks[0]?.id||'kick');
  const [dialog,setDialog]=useState(false);
  const [kitName,setKitName]=useState('');
  const [saving,setSaving]=useState(false);
  const [previewing,setPreviewing]=useState<string|null>(null);
  const nameRef=useRef<HTMLInputElement>(null);
  const fileInputRef=useRef<HTMLInputElement>(null);

  // Recording
  const [recording,setRecording]=useState(false);
  const [recSeconds,setRecSeconds]=useState(0);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const recChunksRef=useRef<Blob[]>([]);
  const recTimerRef=useRef<ReturnType<typeof setInterval>|null>(null);

  // Extra entries (not yet in a saved kit)
  const [recEntries,setRecEntries]=useState<SampleBankEntry[]>([]);

  // Trim pending — set when recording stops or file is loaded
  const [trimPending,setTrimPending]=useState<{blob:Blob;name:string}|null>(null);

  useEffect(()=>{if(!open&&recording)stopRecording();},[open]);

  const bank=useMemo(()=>buildBank(factoryKits,userKits,recEntries),[factoryKits,userKits,recEntries]);
  const tabSamples=useMemo(()=>bank.filter(e=>e.category===activeTab),[bank,activeTab]);
  const filledCount=Object.values(slots).filter(Boolean).length;

  if(!sheet.visible)return null;

  const selectSlot=(tid:string)=>{setActiveSlot(tid);setActiveTab(tid);};

  const assign=(entry:SampleBankEntry)=>{
    setSlots(prev=>({...prev,[activeSlot]:entry}));
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
    const icon=drumKitSVG(USER_KIT_COLORS[(userKits.length)%USER_KIT_COLORS.length]);
    try{await onSave(kitName.trim(),icon,slots);setDialog(false);setKitName('');}
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
    setRecEntries(prev=>[...prev,entry]);
    setSlots(prev=>({...prev,[activeSlot]:entry}));
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
            No samples in this category.<br/>Load a file or record from the mic below.
          </div>
        ):(
          <div style={{padding:'8px 0'}}>
            {tabSamples.map(entry=>{
              const isAssigned=Object.values(slots).some(s=>s?.id===entry.id);
              const isAssignedHere=slots[activeSlot]?.id===entry.id;
              const isPrev=previewing===entry.id;
              const isUser=entry.id.startsWith('trim_')||entry.id.startsWith('rec_');
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
                    <div style={{fontSize:7,color:isUser?'#FF375F':entry.source==='user'?'#FF9500':th.faint,marginTop:1,letterSpacing:'0.06em'}}>{isUser?'🎙 MY RECORDING':entry.source==='user'?'MY SAMPLE':'FACTORY'}</div>
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
              dangerouslySetInnerHTML={{__html:drumKitSVG(USER_KIT_COLORS[userKits.length%USER_KIT_COLORS.length]).replace('width="30" height="26"','width="36" height="36"')}}/>
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

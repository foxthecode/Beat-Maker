import { TRACKS } from './constants';

// ═══ Audio Engine ════════════════════════════════════════════════════════════
class Eng{
  constructor(){this.ctx=null;this.mg=null;this.buf={};this.rv=null;this.ch={};this._c={};this._resumeP=null;this._chainOrder=['drive','comp','filter'];this._sendPositions={};this._rvKey='';
    const _ua=typeof navigator!=='undefined'?navigator.userAgent:'';
    // iPadOS 13+ reports as "Macintosh" — detect via maxTouchPoints
    const _isIpadOS=/Macintosh/.test(_ua)&&typeof navigator!=='undefined'&&navigator.maxTouchPoints>1;
    this._isMobile=/Android|iPhone|iPad/i.test(_ua)||_isIpadOS;
    this._isAndroid=/Android/i.test(_ua);
    this._rInProg=new Set();
    this._rQueue=[];
    this._rRunning=false;
    this._nodeCount=0;
    // PERFORM FX HOLD guards — set by React when a HOLD button is held.
    // While true, uFx() skips the matching send so the hold automation is not overwritten.
    this._rvHoldActive=false;
    this._dlHoldActive=false;
    // 300ms look-ahead on mobile: absorbs browser jitter and iOS scheduler throttling
    this._lookAhead=this._isMobile?0.30:0.10;
    // 60ms tick interval: less main-thread pressure than 50ms, still plenty of margin
    this._schedInterval=this._isMobile?60:25;
    // KeepAlive AudioWorklet state — prevents audio thread from sleeping between hits
    this._kaReady=false;this._kaNode=null;
  }
  init(){
    if(this.ctx)return;
    // 'interactive' on all platforms — 300ms scheduler lookahead gives enough margin to prevent
    // underruns even on Android. 'playback' added 200-400ms fixed latency which made live pads
    // feel completely unresponsive on Android. Bluetooth adaptation is handled by diagFn below.
    const latHint='interactive';
    const ctxOpts={latencyHint:latHint};
    this.ctx=new(window.AudioContext||window.webkitAudioContext)(ctxOpts);
    if(this._isMobile){
      const diagFn=()=>{
        const hint='interactive';
        const ol=this.ctx.outputLatency??0;
        if(ol>0.05){
          this._lookAhead=Math.max(this._lookAhead,ol+0.08);
          this._schedInterval=Math.max(this._schedInterval,Math.round(ol*1000*0.6));
          console.info(`[Audio] Bluetooth detected — lookAhead→${(this._lookAhead*1000).toFixed(0)}ms, schInterval→${this._schedInterval}ms`);
        }
        console.info(
          `[Audio] latencyHint:${hint} | sampleRate:${this.ctx.sampleRate}Hz`+
          ` | base:${(this.ctx.baseLatency*1000).toFixed(1)}ms`+
          ` | output:${(ol*1000).toFixed(1)}ms`+
          ` | total:${((this.ctx.baseLatency+ol)*1000).toFixed(1)}ms`
        );
      };
      this.ctx.addEventListener('statechange',()=>{if(this.ctx.state==='running')diagFn();},{once:true});
    }
    this.mg=this.ctx.createGain();this.mg.gain.value=0.8;
    this.gDrv=this.ctx.createWaveShaper();this.gDrv.oversample=this._isMobile?'2x':'4x';
    this.gDrv.curve=this._buildCurve('tanh',0);
    this.gCmp=this.ctx.createDynamicsCompressor();
    this.gCmp.threshold.value=0;this.gCmp.ratio.value=1;
    this.gCmp.knee.value=6;this.gCmp.attack.value=0.005;this.gCmp.release.value=0.08;
    this.gCmpMakeup=this.ctx.createGain();this.gCmpMakeup.gain.value=1;
    this.gCmp.connect(this.gCmpMakeup);
    this.gFlt=this.ctx.createBiquadFilter();this.gFlt.type='lowpass';this.gFlt.frequency.value=20000;
    this.gFlt2=this.ctx.createBiquadFilter();this.gFlt2.type='lowpass';this.gFlt2.frequency.value=20000;
    this.gFlt.connect(this.gFlt2);
    this.gOut=this.ctx.createGain();this.gOut.gain.value=1;
    this.gOut.connect(this.ctx.destination);
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'&&this.ctx?.state==='suspended'){
        this.ctx.resume();
      }
    });
    this.gFltLfo=this.ctx.createOscillator();this.gFltLfo.type='sine';this.gFltLfo.frequency.value=1.0;
    this.gFltLfoDepth=this.ctx.createGain();this.gFltLfoDepth.gain.value=0;
    this.gFltLfo.connect(this.gFltLfoDepth);
    this.gFltLfoDepth.connect(this.gFlt.frequency);
    this.gFltLfoDepth.connect(this.gFlt2.frequency);
    this.gFltLfo.start();
    this.gRvBus=this.ctx.createGain();this.gRvConv=this.ctx.createConvolver();
    this.gRvBus.connect(this.gRvConv);this.gRvConv.connect(this.gOut);
    // ── Delay bus — stereo avec wet/dry explicite ────────────────────────────
    this.gDlBus=this.ctx.createGain();
    this.gDlDry=this.ctx.createGain();this.gDlDry.gain.value=1.0;
    this.gDlWet=this.ctx.createGain();this.gDlWet.gain.value=0.0;
    this.gDlL=this.ctx.createDelay(2);this.gDlL.delayTime.value=0.25;
    this.gDlR=this.ctx.createDelay(2);this.gDlR.delayTime.value=0.27;
    this.gDlFb=this.ctx.createGain();this.gDlFb.gain.value=0.35;
    this.gDlHpf=this.ctx.createBiquadFilter();this.gDlHpf.type='highpass';this.gDlHpf.frequency.value=180;
    this.gDlLpf=this.ctx.createBiquadFilter();this.gDlLpf.type='lowpass';this.gDlLpf.frequency.value=6500;
    this.gDlPanL=this.ctx.createStereoPanner?this.ctx.createStereoPanner():this.ctx.createGain();
    this.gDlPanR=this.ctx.createStereoPanner?this.ctx.createStereoPanner():this.ctx.createGain();
    if(this.gDlPanL.pan)this.gDlPanL.pan.value=-0.4;
    if(this.gDlPanR.pan)this.gDlPanR.pan.value=0.4;
    this.gDlBus.connect(this.gDlDry);this.gDlDry.connect(this.gOut);
    this.gDlBus.connect(this.gDlWet);
    this.gDlWet.connect(this.gDlL);this.gDlWet.connect(this.gDlR);
    this.gDlL.connect(this.gDlLpf);this.gDlLpf.connect(this.gDlHpf);
    this.gDlHpf.connect(this.gDlFb);this.gDlFb.connect(this.gDlL);
    this.gDlL.connect(this.gDlPanL);this.gDlPanL.connect(this.gOut);
    this.gDlR.connect(this.gDlPanR);this.gDlPanR.connect(this.gOut);
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
    this.gChoFeed=this.ctx.createGain();this.gChoFeed.gain.value=0;
    this.gChoFeed.connect(this.gChoBus);
    this.gFlaBus=this.ctx.createGain();this.gFlaBus.gain.value=0;
    this.gFlaDl=this.ctx.createDelay(0.02);this.gFlaDl.delayTime.value=0.003;
    this.gFlaFb=this.ctx.createGain();this.gFlaFb.gain.value=0.6;
    this.gFlaLfo=this.ctx.createOscillator();this.gFlaLfo.type='sine';this.gFlaLfo.frequency.value=0.3;
    this.gFlaDepth=this.ctx.createGain();this.gFlaDepth.gain.value=0.002;
    this.gFlaWet=this.ctx.createGain();this.gFlaWet.gain.value=0.7;
    this.gFlaLfo.connect(this.gFlaDepth);this.gFlaDepth.connect(this.gFlaDl.delayTime);
    this.gFlaBus.connect(this.gFlaDl);this.gFlaDl.connect(this.gFlaFb);this.gFlaFb.connect(this.gFlaDl);
    this.gFlaDl.connect(this.gFlaWet);this.gFlaWet.connect(this.gOut);this.gFlaLfo.start();
    this.gFlaFeed=this.ctx.createGain();this.gFlaFeed.gain.value=0;
    this.gFlaFeed.connect(this.gFlaBus);
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
    this.gAnalyser=this.ctx.createAnalyser();
    this.gAnalyser.fftSize=this._isMobile?256:512;this.gAnalyser.smoothingTimeConstant=0.8;
    this.gOut.connect(this.gAnalyser);
    this._mkRv(2,0.5,'room');this._rvKey='2|0.5|room';
    if(this.gRvConv)this.gRvConv.buffer=this.rv; // assigne immédiatement — sinon le convolver produit du silence
    TRACKS.forEach(t=>this._build(t.id));this._loadDefaults();
    this._chainOrder=['drive','comp','filter'];this._sendPositions={};
    this.rebuildChain(this._chainOrder,this._sendPositions);
  }
  async _loadDefaults(){
    const durs={kick:1.2,snare:0.28,hihat:0.1,clap:0.28,tom:0.65,ride:0.45,crash:1.6,perc:0.65};
    await Promise.all(Object.entries(durs).map(async([id,dur])=>{
      try{
        const sr=this.ctx.sampleRate;
        const oCtx=new OfflineAudioContext(1,Math.ceil(sr*dur),sr);
        this._syn(id,0,1,oCtx.destination,oCtx);
        this.buf[id]=await oCtx.startRendering();
      }catch(e){console.warn("808 prerender failed:",id,e);}
    }));
    this.onReady?.();
  }
  async ensureRunning(){
    if(!this.ctx)this.init();
    if(this.ctx.state==='suspended'){
      if(!this._resumeP)this._resumeP=this.ctx.resume().finally(()=>{this._resumeP=null;});
      await this._resumeP;
    }
    // Start KeepAlive once ctx is running — fire-and-forget, never blocks the audio path
    if(!this._kaReady)this._initKeepAlive();
  }
  async _initKeepAlive(){
    if(this._kaReady||!this.ctx)return;
    this._kaReady=true; // set immediately to prevent concurrent calls
    try{
      // AudioWorklet runs in the audio rendering thread itself — keeps it pinned awake.
      // Without this, Android OS suspends the thread during silence → underrun on next hit.
      const base=(typeof import.meta!=='undefined'&&import.meta.env?.BASE_URL)||'/';
      const url=base.endsWith('/')?`${base}keepalive-worklet.js`:`${base}/keepalive-worklet.js`;
      await this.ctx.audioWorklet.addModule(url);
      this._kaNode=new AudioWorkletNode(this.ctx,'ks-keepalive');
      this._kaNode.connect(this.ctx.destination);
      console.info('[Audio] KeepAlive worklet active — audio thread pinned');
    }catch(e){
      console.warn('[Audio] KeepAlive worklet unavailable (AudioWorklet not supported or blocked):',e);
    }
  }
  // Reverb IR par bruit blanc + décroissance exponentielle (approche Tone.js / Google Web Audio)
  // Calcul < 3ms même pour 4s de decay — pas de boucle sample-par-sample complexe.
  _mkRv(decay=2,size=0.5,type='room'){
    const sr=this.ctx.sampleRate;
    // Pre-delay par type
    const preDelayMs=type==='plate'?2:type==='hall'?(20+size*35):(8+size*15);
    const preDelaySamples=Math.floor(preDelayMs/1000*sr);
    // Durée de queue limitée à 4s
    const tailSec=Math.min(4,decay*(type==='hall'?1.15:1.0));
    const totalSamples=preDelaySamples+Math.ceil(sr*tailSec);
    const buf=this.ctx.createBuffer(2,totalSamples,sr);
    // RT60 → taux de décroissance : -60dB au bout de tailSec
    const decayRate=Math.log(0.001)/tailSec;
    for(let ch=0;ch<2;ch++){
      const data=buf.getChannelData(ch);
      for(let i=0;i<totalSamples;i++){
        if(i<preDelaySamples){data[i]=0;continue;}
        const t=(i-preDelaySamples)/sr;
        data[i]=(Math.random()*2-1)*Math.exp(decayRate*t);
      }
      // Décorrélation stéréo : décalage de 0.5ms sur ch1
      if(ch===1){
        const shift=Math.floor(sr*0.0005);
        for(let i=totalSamples-1;i>=shift;i--)data[i]=data[i-shift];
        for(let i=0;i<shift;i++)data[i]=0;
      }
    }
    this.rv=buf;
  }
  updateReverb(decay:number,size:number,type='room'){
    // Guard: changer gRvConv.buffer réinitialise l'état interne du ConvolverNode
    // (coupe la queue de reverb en cours). On ne reconstruit l'IR que si les params changent.
    const key=`${decay}|${size}|${type}`;
    if(this._rvKey===key)return;
    this._rvKey=key;
    this._mkRv(decay,size,type);
    if(this.gRvConv){try{this.gRvConv.buffer=this.rv;}catch(e){}}
  }
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
    this._chainOrder=chain;this._sendPositions=sendPositions;
  }
  setSerialOrder(order:string[]){this.rebuildChain(order,this._sendPositions);}
  _build(id){
    const c={};
    c.in=this.ctx.createGain();
    c.tsAtk=this.ctx.createGain();c.tsAtk.gain.value=1;
    c.drv=this.ctx.createWaveShaper();
    c.drv.curve=this._buildCurve('tanh',0);
    c.drv.oversample=this._isMobile?'none':'2x';
    c.flt=this.ctx.createBiquadFilter();
    c.flt.type='lowpass';c.flt.frequency.value=20000;c.flt.Q.value=0;
    c.vol=this.ctx.createGain();c.vol.gain.value=0.8;
    c.pan=this.ctx.createStereoPanner?this.ctx.createStereoPanner():this.ctx.createGain();
    c.dry=this.ctx.createGain();c.dry.gain.value=1;
    c.rvSend=this.ctx.createGain();c.rvSend.gain.value=0;
    c.dlSend=this.ctx.createGain();c.dlSend.gain.value=0;
    c.choSend=this.ctx.createGain();c.choSend.gain.value=0;
    c.flaSend=this.ctx.createGain();c.flaSend.gain.value=0;
    c.ppSend=this.ctx.createGain();c.ppSend.gain.value=0;
    c.in.connect(c.tsAtk);c.tsAtk.connect(c.drv);c.drv.connect(c.flt);c.flt.connect(c.vol);c.vol.connect(c.pan);
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
    const driveMode=gfx.drive?.mode||'tanh';
    const driveAmt=gfx.drive?.on?(gfx.drive.amt/100):0;
    this.gDrv.curve=this._buildCurve(driveMode,driveAmt);
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
    const fType=gfx.filter?.on?(gfx.filter.type||'lowpass'):'lowpass';
    const fCut=gfx.filter?.on?Math.max(20,gfx.filter.cut||18000):20000;
    const fQ=gfx.filter?.on?(gfx.filter.res||0):0;
    this.gFlt.type=fType;this.gFlt2.type=fType;
    this.gFlt.frequency.setTargetAtTime(fCut,t,0.004);this.gFlt2.frequency.setTargetAtTime(fCut,t,0.004);
    this.gFlt.Q.setTargetAtTime(fQ,t,0.004);this.gFlt2.Q.setTargetAtTime(fQ,t,0.004);
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
    const dlOn=gfx.delay?.on??false;
    if(this.gDlL)  this.gDlL.delayTime.setTargetAtTime(Math.min(1.9,gfx.delay?.time||0.25),t,0.01);
    if(this.gDlR)  this.gDlR.delayTime.setTargetAtTime(Math.min(1.9,(gfx.delay?.time||0.25)*1.006),t,0.01);
    if(this.gDlFb) this.gDlFb.gain.setTargetAtTime(Math.min(0.75,(gfx.delay?.fdbk||35)/100),t,0.01);
    if(this.gDlWet)this.gDlWet.gain.setTargetAtTime(dlOn?(gfx.delay?.mix??35)/100:0,t,0.02);
    if(this.gDlLpf)this.gDlLpf.frequency.setTargetAtTime(dlOn?(gfx.delay?.lpf??6500):20000,t,0.01);
    const choOn=gfx.chorus?.on??false;
    if(this.gChoBus)this.gChoBus.gain.setTargetAtTime(choOn?1:0,t,0.01);
    if(this.gChoFeed)this.gChoFeed.gain.setTargetAtTime(0,t,0.01);
    if(this.gChoLfo)this.gChoLfo.frequency.setTargetAtTime(Math.max(0.1,gfx.chorus?.rate??0.8),t,0.01);
    if(this.gChoDepthL&&this.gChoDepthR){
      const depth=(gfx.chorus?.depth??30)/100*0.007;
      this.gChoDepthL.gain.setTargetAtTime(choOn?depth:0,t,0.01);
      this.gChoDepthR.gain.setTargetAtTime(choOn?-depth:0,t,0.01);
    }
    const flaOn=gfx.flanger?.on??false;
    if(this.gFlaBus)this.gFlaBus.gain.setTargetAtTime(flaOn?1:0,t,0.01);
    if(this.gFlaFeed)this.gFlaFeed.gain.setTargetAtTime(0,t,0.01);
    if(this.gFlaLfo)this.gFlaLfo.frequency.setTargetAtTime(Math.max(0.05,gfx.flanger?.rate??0.3),t,0.01);
    if(this.gFlaDepth){const depth=(gfx.flanger?.depth??50)/100*0.004;this.gFlaDepth.gain.setTargetAtTime(flaOn?depth:0,t,0.01);}
    if(this.gFlaFb)this.gFlaFb.gain.setTargetAtTime(flaOn?Math.min(0.9,(gfx.flanger?.feedback??60)/100):0,t,0.01);
    const ppOn=gfx.pingpong?.on??false;
    if(this.gPpBus)this.gPpBus.gain.setTargetAtTime(ppOn?1:0,t,0.01);
    if(this.gPpDlL&&this.gPpDlR){
      const ppTime=gfx.pingpong?.time??0.25;
      this.gPpDlL.delayTime.setTargetAtTime(Math.min(1.9,ppTime),t,0.01);
      this.gPpDlR.delayTime.setTargetAtTime(Math.min(1.9,ppTime),t,0.01);
    }
    if(this.gPpFbLR&&this.gPpFbRL){
      const fb=Math.min(0.85,(gfx.pingpong?.fdbk??50)/100);
      this.gPpFbLR.gain.setTargetAtTime(fb,t,0.01);this.gPpFbRL.gain.setTargetAtTime(fb,t,0.01);
    }
    if(this.gPpLpf)this.gPpLpf.frequency.setTargetAtTime(ppOn?5000:20000,t,0.01);
    Object.keys(this.ch).forEach(id=>{
      const c=this.ch[id];if(!c)return;
      const ppS=ppOn&&!!gfx.pingpong?.sends?.[id];
      const choS=choOn&&!!gfx.chorus?.sends?.[id];
      const flaS=flaOn&&!!gfx.flanger?.sends?.[id];
      if(c.choSend)c.choSend.gain.setTargetAtTime(choS?0.85:0,t,0.01);
      if(c.flaSend)c.flaSend.gain.setTargetAtTime(flaS?0.85:0,t,0.01);
      if(c.ppSend)c.ppSend.gain.setTargetAtTime(ppS?0.70:0,t,0.01);
      const anySend=choS||flaS||ppS;
      const manySend=[choS,flaS,ppS].filter(Boolean).length>1;
      if(c.dry)c.dry.gain.setTargetAtTime(manySend?0.3:anySend?0.6:1,t,0.3);
    });
  }
  _buildCurve(mode='tanh',amt=0){
    const key=mode+'_'+Math.round(amt*100);
    if(this._c[key])return this._c[key];
    const n=this._isMobile?4096:8192,a=new Float32Array(n),d=amt;
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
    const isPadTap = noteTime == null || noteTime <= ct + 0.005;
    const transTime = isPadTap
      ? 0.001
      : (this._isMobile ? 0.05 : 0.005);
    c.vol.gain.cancelScheduledValues(ct);
    c.vol.gain.setTargetAtTime((f?.vol??80)/100,ct,transTime);
    if(c.pan?.pan){
      c.pan.pan.cancelScheduledValues(ct);
      c.pan.pan.setTargetAtTime((f?.pan??0)/100,ct,transTime);
    }
    if(c.flt){
      const fOn=f?.onFilter??false;
      const fType=fOn?(f?.fType||'lowpass'):'lowpass';
      const fCut=fOn?Math.max(20,Math.min(20000,f?.cut??5000)):20000;
      const fQ=fOn?Math.max(0,Math.min(25,f?.res??0)):0;
      c.flt.type=fType;
      c.flt.frequency.cancelScheduledValues(ct);
      c.flt.frequency.setTargetAtTime(fCut,ct,0.01);
      c.flt.Q.cancelScheduledValues(ct);
      c.flt.Q.setTargetAtTime(fQ,ct,0.01);
    }
    if(c.drv){
      const dOn=f?.onDrive??false;
      const dAmt=dOn?Math.max(0,Math.min(100,f?.drive??0))/100:0;
      const dMode=f?.driveMode||'tape';
      c.drv.curve=this._buildCurve(dMode,dAmt);
    }
    // Skip reverb/delay send updates while a PERFORM FX HOLD is active —
    // otherwise the per-note automation would overwrite the HOLD boost.
    if(c.rvSend&&!this._rvHoldActive){
      const rvOn=f?.onReverb??false;
      const rvAmt=rvOn?Math.max(0,Math.min(1,(f?.rMix??0)/100)):0;
      c.rvSend.gain.cancelScheduledValues(ct);
      c.rvSend.gain.setTargetAtTime(rvAmt,ct,0.02);
      if(rvOn)this.updateReverb(f?.rDecay??1.5,f?.rSize??0.5,f?.rType??'room');
    }
    if(c.dlSend&&!this._dlHoldActive){
      const dlOn=f?.onDelay??false;
      const dlAmt=dlOn?Math.max(0,Math.min(1,(f?.dMix??0)/100)):0;
      c.dlSend.gain.cancelScheduledValues(ct);
      c.dlSend.gain.setTargetAtTime(dlAmt,ct,0.02);
      if(dlOn&&this.gDlL&&!this._dlHoldActive){
        this.gDlL.delayTime.setTargetAtTime(Math.min(1.9,f?.dTime??0.25),ct,0.02);
        if(this.gDlR)this.gDlR.delayTime.setTargetAtTime(Math.min(1.9,(f?.dTime??0.25)*1.006),ct,0.02);
        if(this.gDlFb)this.gDlFb.gain.setTargetAtTime(Math.min(0.75,(f?.dFdbk??35)/100),ct,0.02);
        if(this.gDlWet)this.gDlWet.gain.setTargetAtTime((f?.dMix??0)/100,ct,0.02);
      }
    }
    if(c.tsAtk){
      const nt=noteTime!=null&&noteTime>ct?noteTime:ct;
      if(f?.onTransient&&(f.tsAttack!==0||f.tsSustain!==0)){
        const atkGain=Math.pow(10,(f.tsAttack||0)/20);
        const susGain=Math.pow(10,(f.tsSustain||0)/20);
        c.tsAtk.gain.cancelScheduledValues(nt);
        c.tsAtk.gain.setValueAtTime(atkGain,nt);
        c.tsAtk.gain.setTargetAtTime(susGain,nt+0.01,0.04);
      }else{
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
  loadBuffer(id,buffer){this.init();if(!this.ch[id])this._build(id);this.buf[id]=buffer;}
  play(id,vel=1,dMs=0,f=null,at=null){
    if(!this.ctx)this.init();if(!this.ch[id])this._build(id);const c=this.ch[id];if(!c)return;
    if(this.ctx.state==='suspended'){this.ctx.resume().catch(e=>console.warn('[Audio] ctx.resume() failed:',e));}
    const raw=at!==null?(at+dMs/1000):(this.ctx.currentTime+Math.max(0,dMs)/1000);
    const t=Math.max(this.ctx.currentTime+0.001,raw);
    if(f)this.uFx(id,f,t);const r=Math.pow(2,((f?.onPitch?f.pitch:0)||0)/12);
    if(this._isMobile&&!this.buf[id])this.renderShape(id,f).catch(()=>{});
    if(this.buf[id]){
      if(this._isMobile&&this._nodeCount>=24){return;}
      this._nodeCount++;
      const s=this.ctx.createBufferSource();s.buffer=this.buf[id];s.playbackRate.setValueAtTime(r,t);const g=this.ctx.createGain();g.gain.setValueAtTime(vel,t);s.connect(g);g.connect(c.in);s.start(t);s.stop(t+s.buffer.duration/r+0.1);
      if(this._isMobile){
        const releaseMs=Math.max(0,(t-this.ctx.currentTime)*1000)+80;
        setTimeout(()=>{this._nodeCount=Math.max(0,this._nodeCount-1);},releaseMs);
        s.onended=()=>{s.disconnect();g.disconnect();};
      }else{
        s.onended=()=>{s.disconnect();g.disconnect();this._nodeCount=Math.max(0,this._nodeCount-1);};
      }
    }
    else{
      const sh=f?{sDec:f.sDec??1,sTune:f.sTune??1,sPunch:f.sPunch??1,sSnap:f.sSnap??1,sBody:f.sBody??1,sTone:f.sTone??1}:undefined;
      this._syn(id,t,vel,c.in,undefined,sh);
    }
  }
  _syn(id,t,v,d,octx,sh){
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
        const freqs=this._isMobile?[80,167,273,329]:[80,119,167,219,273,329];
        freqs.map(f=>f*sTone).forEach(f=>{const o=osc("square",f);const og=gain(v*0.06);og.gain.exponentialRampToValueAtTime(0.001,t+decay);o.connect(og);og.connect(mg);o.start(t);o.stop(t+decay+0.001);});
        const ns=noise(decay);const hp=filt("highpass",8000*sTone);const ng=gain(v*0.18*sSnap);ng.gain.exponentialRampToValueAtTime(0.001,t+decay);ns.connect(hp);hp.connect(ng);ng.connect(d);ns.start(t);ns.stop(t+decay+0.001);
      },
      clap:()=>{
        const offsets=this._isMobile?[0,0.018]:[0,0.009,0.018,0.028];
        offsets.map(off=>off*sSnap).forEach(off=>{const ns=noise(0.012);const bp=filt("bandpass",1200,1.5);const g=gain(v*0.55*sPunch);g.gain.setValueAtTime(0,t);g.gain.setValueAtTime(v*0.55*sPunch,t+Math.max(0.0001,off));g.gain.exponentialRampToValueAtTime(0.001,t+Math.max(0.001,off)+0.012);ns.connect(bp);bp.connect(g);g.connect(d);ns.start(t+Math.max(0,off));ns.stop(t+Math.max(0,off)+0.015);});
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
      const dur=0.55*sDec;const mg=gain(1);mg.connect(d);const shift=(id.length>3?id.charCodeAt(3):id.charCodeAt(0))%5;
      const[fa,fb]=([[520,800],[562,845],[600,900],[480,760],[640,960]][shift]||[640,960]);
      [fa*sTune,fb*sTune].forEach(f=>{const o=osc("square",f);const bp=filt("bandpass",f,6);const og=gain(v*0.28*sBody);og.gain.exponentialRampToValueAtTime(0.001,t+dur);o.connect(bp);bp.connect(og);og.connect(mg);o.start(t);o.stop(t+dur+0.01);});
      return;
    }
    S[id]();
  }
  async renderShape(id,fxObj,silent=false){
    if(!this.ctx)return;
    if(this._rInProg.has(id))return;
    if(this._isMobile){
      return new Promise(res=>{
        this._rQueue.push({id,fxObj,silent,res});
        if(!this._rRunning)this._drainRQ();
      });
    }
    await this._doRender(id,fxObj,silent);
  }
  async _drainRQ(){
    this._rRunning=true;
    while(this._rQueue.length){
      const {id,fxObj,silent,res}=this._rQueue.shift();
      await this._doRender(id,fxObj,silent);
      res();
    }
    this._rRunning=false;
  }
  async _doRender(id,fxObj,silent){
    if(!this.ctx||this._rInProg.has(id))return;
    this._rInProg.add(id);
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
    finally{this._rInProg.delete(id);}
  }
}

export const engine=new Eng();
export type { Eng };

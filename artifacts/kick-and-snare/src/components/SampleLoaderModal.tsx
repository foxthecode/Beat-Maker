import { useState, useRef, useEffect } from 'react';

interface SampleLoaderModalProps {
  open: boolean;
  trackId: string;
  trackLabel: string;
  trackColor: string;
  onClose: () => void;
  onFileLocal: (trackId: string) => void;
  onBufferLoaded: (trackId: string, buffer: AudioBuffer, name: string) => void;
  initAudioCtx: () => AudioContext | null;
  th: any;
}

type Step = 'choice' | 'recording' | 'trim';

export default function SampleLoaderModal({
  open, trackId, trackLabel, trackColor,
  onClose, onFileLocal, onBufferLoaded, initAudioCtx, th,
}: SampleLoaderModalProps) {
  const [step, setStep] = useState<Step>('choice');
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [startPct, setStartPct] = useState(0);
  const [endPct, setEndPct] = useState(1);
  const [previewNode, setPreviewNode] = useState<AudioBufferSourceNode | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  // NEW: permission state to show proactive guidance
  const [permState, setPermState] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startPctRef = useRef(0);
  const endPctRef = useRef(1);

  startPctRef.current = startPct;
  endPctRef.current = endPct;

  const stopPreviewNode = () => {
    if (previewNode) { try { previewNode.stop(); } catch {} setPreviewNode(null); }
  };

  // FIX: check permission state proactively when modal opens
  useEffect(() => {
    if (open) {
      setStep('choice'); setIsRecording(false); setRecSeconds(0);
      setBuffer(null); setStartPct(0); setEndPct(1); setRecError(null);

      // Check HTTPS
      const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (!isSecure) {
        setRecError('⚠️ Enregistrement impossible en HTTP.\nAccède à l\'app via son URL https:// ou via localhost.');
        return;
      }

      // FIX: proactively query mic permission state (Chrome/Edge/Firefox support this)
      if (navigator.permissions?.query) {
        navigator.permissions.query({ name: 'microphone' as PermissionName }).then(result => {
          setPermState(result.state as any);
          result.onchange = () => setPermState(result.state as any);
        }).catch(() => {
          setPermState('unknown'); // Safari doesn't support querying mic permission
        });
      }
    }
    return () => { stopPreviewNode(); };
  }, [open]);

  useEffect(() => {
    if (buffer) drawWaveform(buffer, startPct, endPct);
  }, [buffer, startPct, endPct]);

  const drawWaveform = (buf: AudioBuffer, sPct: number, ePct: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    ctx2d.clearRect(0, 0, W, H);
    const data = buf.getChannelData(0);

    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, 0, W, H);
    ctx2d.fillStyle = trackColor + '22';
    ctx2d.fillRect(W * sPct, 0, W * (ePct - sPct), H);

    ctx2d.beginPath();
    ctx2d.strokeStyle = trackColor;
    ctx2d.lineWidth = 1;
    for (let x = 0; x < W; x++) {
      const base = Math.floor((x / W) * data.length);
      const step = Math.max(1, Math.ceil(data.length / W));
      let min = 1, max = -1;
      for (let j = 0; j < step && base + j < data.length; j++) {
        const v = data[base + j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx2d.moveTo(x + 0.5, ((1 - max) / 2) * H);
      ctx2d.lineTo(x + 0.5, ((1 - min) / 2) * H);
    }
    ctx2d.stroke();

    ctx2d.fillStyle = '#30D158';
    ctx2d.fillRect(W * sPct - 2, 0, 4, H);
    ctx2d.fillStyle = '#FF2D55';
    ctx2d.fillRect(W * ePct - 2, 0, 4, H);
  };

  const startRecordingWithStream = (stream: MediaStream) => {
    streamRef.current = stream;
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', '']
      .find(t => !t || MediaRecorder.isTypeSupported(t)) || '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    chunksRef.current = [];

    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    recorder.onerror = () => {
      stream.getTracks().forEach(t => t.stop());
      setRecError("Erreur pendant l'enregistrement. Réessayez.");
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (!chunksRef.current.length) { setRecError('Aucun audio capturé.'); return; }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      try {
        const ctx = initAudioCtx();
        if (!ctx) { setRecError('Contexte audio non disponible.'); return; }
        if (ctx.state === 'suspended') await ctx.resume();
        const ab = await blob.arrayBuffer();
        const abCopy = ab.slice(0);
        const decoded = await ctx.decodeAudioData(abCopy);
        setBuffer(decoded);
        setStartPct(0);
        setEndPct(1);
        setStep('trim');
      } catch (e) {
        console.error('[SampleLoaderModal] decodeAudioData failed', e);
        setRecError("Décodage audio échoué. Réessayez ou utilisez Firefox.");
      }
    };

    recRef.current = recorder;
    recorder.start(100);
    setIsRecording(true);
    setRecSeconds(0);
    timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
  };

  // FIX: detailed error messages per browser/OS/device
  const buildMicErrorMessage = (err: any): string => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isChromeiOS = isIOS && /CriOS/.test(ua);
    const isMac = /Macintosh/.test(ua);
    const isFirefox = /Firefox/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);

    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      if (isChromeiOS) {
        return (
          "🎤 Accès micro refusé sur Chrome iOS.\n\n" +
          "Réglages iOS → Chrome → Microphone → Activer\n" +
          "Puis revenez sur l'app et réessayez.\n\n" +
          "💡 Ou ouvrez l'app dans Safari (meilleur support iOS)."
        );
      }
      if (isIOS && isSafari) {
        return (
          "🎤 Accès micro refusé sur Safari iOS.\n\n" +
          "Réglages iOS → Safari → Microphone → Autoriser\n" +
          "Ou autorisez dans la popup qui apparaît au clic REC.\n\n" +
          "⚠️ Safari redemande la permission à chaque rechargement, c'est normal."
        );
      }
      if (isMac && isSafari) {
        return (
          "🎤 Micro refusé (Safari macOS).\n\n" +
          "Safari → Préférences → Sites web → Microphone → Autoriser\n" +
          "macOS : Préférences Système → Confidentialité → Micro → cochez Safari."
        );
      }
      if (isMac && isFirefox) {
        return (
          "🎤 Micro refusé (Firefox macOS).\n\n" +
          "Cliquez sur l'icône 🎤 dans la barre d'adresse → Autoriser\n" +
          "macOS : Préférences Système → Confidentialité → Micro → cochez Firefox\n" +
          "Puis redémarrez Firefox."
        );
      }
      // Chrome desktop (Windows/Linux/Mac) — most common desktop case
      return (
        "🎤 Accès micro refusé.\n\n" +
        "1. Cliquez sur l'icône 🔒 (ou 🎤) dans la barre d'adresse\n" +
        "2. Microphone → Autoriser\n" +
        "3. Rechargez la page\n\n" +
        (isMac ? "macOS : Préférences Système → Confidentialité → Micro → cochez Chrome\n\n" : "") +
        "💡 Si vous êtes dans la preview Replit, ouvrez l'app dans un nouvel onglet (lien ↗ ci-dessous)."
      );
    }

    if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
      return "🎤 Aucun microphone détecté.\nBranchez un micro ou vérifiez vos réglages audio.";
    }
    if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
      return "🎤 Le microphone est utilisé par une autre application.\nFermez les autres onglets ou apps qui utilisent le micro.";
    }
    if (err?.name === 'SecurityError') {
      return (
        "🎤 Micro bloqué par la sécurité du navigateur.\n\n" +
        "Cela arrive dans les iframes. Ouvrez l'app dans un nouvel onglet\n" +
        "(lien ↗ ci-dessous) pour autoriser le micro directement."
      );
    }
    return "🎤 Micro indisponible : " + (err?.message || err?.name || String(err));
  };

  const startRecording = async () => {
    setRecError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setRecError("Votre navigateur ne supporte pas l'enregistrement audio.\nUtilisez Chrome, Firefox ou Safari récent.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: { ideal: 44100 } as any,
          channelCount: { ideal: 1 } as any,
        },
      });
      setPermState('granted');
      startRecordingWithStream(stream);
    } catch (e: any) {
      console.error('[SampleLoaderModal] getUserMedia error:', e.name, e.message);

      if (e?.name === 'OverconstrainedError') {
        try {
          const fallback = await navigator.mediaDevices.getUserMedia({ audio: true });
          setPermState('granted');
          startRecordingWithStream(fallback);
          return;
        } catch (e2: any) {
          setRecError(buildMicErrorMessage(e2));
          return;
        }
      }

      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
        setPermState('denied');
      }
      setRecError(buildMicErrorMessage(e));
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recRef.current?.state === 'recording') recRef.current.stop();
    setIsRecording(false);
  };

  const trimBuffer = (buf: AudioBuffer, sPct: number, ePct: number, ctx: AudioContext): AudioBuffer => {
    const startS = Math.floor(buf.length * sPct);
    const endS = Math.floor(buf.length * ePct);
    const length = Math.max(1, endS - startS);
    const trimmed = ctx.createBuffer(buf.numberOfChannels, length, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const src = buf.getChannelData(ch);
      const dst = trimmed.getChannelData(ch);
      for (let i = 0; i < length; i++) dst[i] = src[startS + i];
    }
    return trimmed;
  };

  const preview = () => {
    const ctx = initAudioCtx();
    if (!buffer || !ctx) return;
    stopPreviewNode();
    const trimmed = trimBuffer(buffer, startPct, endPct, ctx);
    const src = ctx.createBufferSource();
    src.buffer = trimmed;
    src.connect(ctx.destination);
    if (ctx.state === 'suspended') ctx.resume();
    src.start();
    src.onended = () => setPreviewNode(null);
    setPreviewNode(src);
  };

  const validate = () => {
    const ctx = initAudioCtx();
    if (!buffer || !ctx) return;
    stopPreviewNode();
    const trimmed = trimBuffer(buffer, startPct, endPct, ctx);
    onBufferLoaded(trackId, trimmed, `Rec: ${trackLabel}`);
  };

  const onHandleDown = (e: React.PointerEvent, handle: 'start' | 'end') => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    let rafId: number;

    const onMove = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (handle === 'start') setStartPct(Math.min(x, endPctRef.current - 0.02));
        else setEndPct(Math.max(x, startPctRef.current + 0.02));
      });
    };
    const onUp = () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!open) return null;

  const bg = th?.bg ?? '#111';
  const dim = th?.dim ?? 'rgba(255,255,255,0.4)';
  const surface = th?.surface ?? 'rgba(255,255,255,0.05)';

  const btn = (color: string, active = false, small = false) => ({
    padding: small ? '6px 12px' : '10px 16px',
    borderRadius: 8,
    border: `1px solid ${active ? color + '66' : 'rgba(255,255,255,0.1)'}`,
    background: active ? color + '20' : 'rgba(255,255,255,0.04)',
    color: active ? color : 'rgba(255,255,255,0.75)',
    fontSize: small ? 9 : 11,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
  });

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // Direct app URL for opening outside iframe
  const appUrl = window.location.origin + window.location.pathname;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: bg, borderRadius: 16, padding: 20, maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto', position: 'relative', border: `1px solid ${trackColor}33` }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.12em', color: dim, marginBottom: 2 }}>CHARGER SAMPLE</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: trackColor, letterSpacing: '0.08em' }}>{trackLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: dim, fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Error banner — FIX: now includes "open in new tab" button inline */}
        {recError && (
          <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,45,85,0.08)', border: '1px solid rgba(255,45,85,0.3)', color: '#FF2D55', fontSize: 10, fontWeight: 600, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
            {recError}
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a
                href={appUrl}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-block', padding: '7px 12px', borderRadius: 7, background: 'rgba(100,210,255,0.12)', border: '1px solid rgba(100,210,255,0.3)', color: '#64D2FF', fontSize: 9, fontWeight: 700, textDecoration: 'none', letterSpacing: '0.06em', cursor: 'pointer' }}
              >
                ↗ OUVRIR DANS UN NOUVEL ONGLET
              </a>
              <button
                onClick={() => setRecError(null)}
                style={{ padding: '7px 12px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em' }}
              >
                RÉESSAYER
              </button>
            </div>
          </div>
        )}

        {/* ── CHOICE ── */}
        {step === 'choice' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => { onClose(); onFileLocal(trackId); }}
              style={{ background: surface, border: `1px solid rgba(255,149,0,0.25)`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: '#FF9500' }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>📁 Fichier local</div>
              <div style={{ fontSize: 9, color: dim }}>MP3, WAV, OGG, FLAC, M4A</div>
            </button>
            <button
              onClick={() => { setRecError(null); setStep('recording'); }}
              style={{ background: surface, border: `1px solid rgba(255,45,85,0.25)`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: '#FF2D55' }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>🎤 Enregistrer avec le micro</div>
              <div style={{ fontSize: 9, color: dim }}>
                Battements, voix, percussions live · Trimming waveform inclus
                {/* FIX: show pre-emptive warning if permission already denied */}
                {permState === 'denied' && (
                  <span style={{ color: '#FF9500', display: 'block', marginTop: 4 }}>
                    ⚠️ Permission micro refusée — autorisez-la dans les réglages du navigateur
                  </span>
                )}
                {permState === 'granted' && (
                  <span style={{ color: '#30D158', display: 'block', marginTop: 4 }}>
                    ✓ Micro autorisé
                  </span>
                )}
              </div>
            </button>
          </div>
        )}

        {/* ── RECORDING ── */}
        {step === 'recording' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '8px 0' }}>

            {/* FIX: always show direct URL link — useful for iframe/Replit context */}
            {!isRecording && (
              <div style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(30,30,40,0.6)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 8, color: dim, letterSpacing: '0.08em' }}>PROBLÈME DE MICRO ? OUVRIR L'APP DIRECTEMENT</div>
                <a
                  href={appUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 9, color: '#64D2FF', wordBreak: 'break-all', textDecoration: 'underline', cursor: 'pointer' }}
                >{appUrl} ↗</a>
                <div style={{ fontSize: 8, color: dim, lineHeight: 1.5 }}>
                  Dans la preview Replit, le navigateur peut bloquer le micro. Ouvre ce lien dans un nouvel onglet pour un accès direct.
                </div>
              </div>
            )}

            <div style={{ fontSize: 40, fontWeight: 900, fontFamily: 'monospace', color: isRecording ? '#FF2D55' : dim }}>
              {fmt(recSeconds)}
            </div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 18 }}>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} style={{ width: 5, height: 4 + i * 1.8, borderRadius: 2, background: isRecording ? (i < 5 ? '#30D158' : i < 7 ? '#FF9500' : '#FF2D55') : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
              ))}
            </div>
            <div style={{ fontSize: 9, letterSpacing: '0.15em', color: isRecording ? '#FF2D55' : dim }}>
              {isRecording ? '● EN COURS' : 'PRÊT À ENREGISTRER'}
            </div>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              {!isRecording && (
                <button onClick={startRecording} style={{ ...btn('#FF2D55', true), flex: 1 }}>● REC</button>
              )}
              {isRecording && (
                <button onClick={stopRecording} style={{ ...btn('#FF9500', true), flex: 1 }}>■ STOP</button>
              )}
              <button
                onClick={() => { if (isRecording) stopRecording(); setStep('choice'); }}
                style={{ ...btn('#888', false, true), flexShrink: 0 }}
              >↩</button>
            </div>
          </div>
        )}

        {/* ── TRIM ── */}
        {step === 'trim' && buffer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 9, color: dim }}>
              {buffer.duration.toFixed(2)}s · {buffer.sampleRate}Hz — Drag les curseurs vert/rouge pour trimmer
            </div>
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
              <canvas ref={canvasRef} width={440} height={90} style={{ width: '100%', height: 90, display: 'block' }} />
              <div
                onPointerDown={e => onHandleDown(e, 'start')}
                style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${startPct * 100}% - 12px)`, width: 24, cursor: 'ew-resize', zIndex: 3, touchAction: 'none' }}
              />
              <div
                onPointerDown={e => onHandleDown(e, 'end')}
                style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${endPct * 100}% - 12px)`, width: 24, cursor: 'ew-resize', zIndex: 3, touchAction: 'none' }}
              />
            </div>
            <div style={{ fontSize: 9, color: dim, fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#30D158' }}>▶ {(buffer.duration * startPct).toFixed(2)}s</span>
              <span>{(buffer.duration * (endPct - startPct)).toFixed(2)}s sélectionnés</span>
              <span style={{ color: '#FF2D55' }}>{(buffer.duration * endPct).toFixed(2)}s ◀</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button onClick={preview} style={{ ...btn('#64D2FF', !!previewNode), flex: 1 }}>
                {previewNode ? '◼ Stop' : '▶ Preview'}
              </button>
              <button onClick={validate} style={{ ...btn('#30D158', false), flex: 1 }}>✓ Utiliser ce sample</button>
              <button onClick={() => { stopPreviewNode(); setStep('recording'); setBuffer(null); }} style={{ ...btn('#888', false, true), flexShrink: 0 }}>↩</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

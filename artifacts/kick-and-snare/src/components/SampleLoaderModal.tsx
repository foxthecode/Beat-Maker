import { useState, useRef, useEffect } from 'react';

interface SampleLoaderModalProps {
  open: boolean;
  trackId: string;
  trackLabel: string;
  trackColor: string;
  onClose: () => void;
  onFileLocal: (trackId: string) => void;
  onBufferLoaded: (trackId: string, buffer: AudioBuffer, name: string) => void;
  audioCtx: AudioContext | null;
  th: any;
}

type Step = 'choice' | 'recording' | 'trim';

export default function SampleLoaderModal({
  open, trackId, trackLabel, trackColor,
  onClose, onFileLocal, onBufferLoaded, audioCtx, th,
}: SampleLoaderModalProps) {
  const [step, setStep] = useState<Step>('choice');
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [startPct, setStartPct] = useState(0);
  const [endPct, setEndPct] = useState(1);
  const [previewNode, setPreviewNode] = useState<AudioBufferSourceNode | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startPctRef = useRef(0);
  const endPctRef = useRef(1);

  // Keep refs in sync for closure-safe access in handle drag
  startPctRef.current = startPct;
  endPctRef.current = endPct;

  const stopPreviewNode = () => {
    if (previewNode) { try { previewNode.stop(); } catch {} setPreviewNode(null); }
  };

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setStep('choice'); setIsRecording(false); setRecSeconds(0);
      setBuffer(null); setStartPct(0); setEndPct(1);
    }
    return () => { stopPreviewNode(); };
  }, [open]);

  // Draw waveform when buffer or handles change
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
    const step = Math.max(1, Math.ceil(data.length / W));

    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, 0, W, H);

    // Highlighted selection
    ctx2d.fillStyle = trackColor + '22';
    ctx2d.fillRect(W * sPct, 0, W * (ePct - sPct), H);

    // Waveform
    ctx2d.beginPath();
    ctx2d.strokeStyle = trackColor;
    ctx2d.lineWidth = 1;
    for (let x = 0; x < W; x++) {
      const base = Math.floor((x / W) * data.length);
      let min = 1, max = -1;
      for (let j = 0; j < step && base + j < data.length; j++) {
        const v = data[base + j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const yMax = ((1 - max) / 2) * H;
      const yMin = ((1 - min) / 2) * H;
      ctx2d.moveTo(x + 0.5, yMax);
      ctx2d.lineTo(x + 0.5, yMin);
    }
    ctx2d.stroke();

    // Start handle (green)
    ctx2d.fillStyle = '#30D158';
    ctx2d.fillRect(W * sPct - 2, 0, 4, H);
    ctx2d.fillStyle = '#30D15888';
    ctx2d.fillRect(W * sPct, 0, W * (ePct - sPct) * 0.02, H);

    // End handle (red)
    ctx2d.fillStyle = '#FF2D55';
    ctx2d.fillRect(W * ePct - 2, 0, 4, H);
  };

  const startRecording = async () => {
    if (!audioCtx) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', '']
        .find(t => !t || MediaRecorder.isTypeSupported(t)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      chunksRef.current = [];

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        try {
          const ab = await blob.arrayBuffer();
          const decoded = await audioCtx.decodeAudioData(ab);
          setBuffer(decoded);
          setStartPct(0);
          setEndPct(1);
          setStep('trim');
        } catch (e) {
          console.error('[SampleLoaderModal] decodeAudioData failed', e);
        }
      };

      recRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch (e) {
      console.error('[SampleLoaderModal] getUserMedia failed', e);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recRef.current?.stop();
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
    if (!buffer || !audioCtx) return;
    stopPreviewNode();
    const trimmed = trimBuffer(buffer, startPct, endPct, audioCtx);
    const src = audioCtx.createBufferSource();
    src.buffer = trimmed;
    src.connect(audioCtx.destination);
    src.start();
    src.onended = () => setPreviewNode(null);
    setPreviewNode(src);
  };

  const validate = () => {
    if (!buffer || !audioCtx) return;
    stopPreviewNode();
    const trimmed = trimBuffer(buffer, startPct, endPct, audioCtx);
    onBufferLoaded(trackId, trimmed, `Rec: ${trackLabel}`);
  };

  const onHandleDown = (e: React.PointerEvent, handle: 'start' | 'end') => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    let rafId: number;
    let pendingX = handle === 'start' ? startPctRef.current : endPctRef.current;

    const onMove = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      pendingX = x;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (handle === 'start') {
          const clamped = Math.min(pendingX, endPctRef.current - 0.02);
          setStartPct(clamped);
        } else {
          const clamped = Math.max(pendingX, startPctRef.current + 0.02);
          setEndPct(clamped);
        }
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
              onClick={() => setStep('recording')}
              disabled={!audioCtx}
              style={{ background: surface, border: `1px solid rgba(255,45,85,0.25)`, borderRadius: 10, padding: '14px 16px', cursor: audioCtx ? 'pointer' : 'not-allowed', fontFamily: 'inherit', textAlign: 'left', color: audioCtx ? '#FF2D55' : dim, opacity: audioCtx ? 1 : 0.5 }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>🎤 Enregistrer avec le micro</div>
              <div style={{ fontSize: 9, color: dim }}>Battements, voix, percussions live · Trimming waveform inclus</div>
            </button>
          </div>
        )}

        {/* ── RECORDING ── */}
        {step === 'recording' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '8px 0' }}>
            {/* Timer */}
            <div style={{ fontSize: 40, fontWeight: 900, fontFamily: 'monospace', color: isRecording ? '#FF2D55' : dim, letterSpacing: '0.05em' }}>
              {fmt(recSeconds)}
            </div>
            {/* VU indicator */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 16 }}>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} style={{ width: 6, height: 6 + i * 1.5, borderRadius: 2, background: isRecording ? (i < 5 ? '#30D158' : i < 7 ? '#FF9500' : '#FF2D55') : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
              ))}
            </div>
            <div style={{ fontSize: 9, letterSpacing: '0.15em', color: isRecording ? '#FF2D55' : dim }}>
              {isRecording ? '● EN COURS' : 'PRÊT À ENREGISTRER'}
            </div>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              {!isRecording && <button onClick={startRecording} style={{ ...btn('#FF2D55', true), flex: 1 }}>● REC</button>}
              {isRecording && <button onClick={stopRecording} style={{ ...btn('#FF9500', true), flex: 1 }}>■ STOP</button>}
              <button onClick={() => { if (isRecording) stopRecording(); setStep('choice'); }} style={{ ...btn('#888', false, true), flexShrink: 0 }}>↩ Retour</button>
            </div>
          </div>
        )}

        {/* ── TRIM ── */}
        {step === 'trim' && buffer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 9, color: dim, marginBottom: 2 }}>
              Durée totale : {buffer.duration.toFixed(2)}s · {buffer.sampleRate}Hz — Drag les curseurs vert/rouge pour trimmer
            </div>
            {/* Waveform + drag handles */}
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
              <canvas
                ref={canvasRef}
                width={440}
                height={90}
                style={{ width: '100%', height: 90, display: 'block' }}
              />
              {/* Invisible drag zones over handles */}
              <div
                onPointerDown={e => onHandleDown(e, 'start')}
                style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${startPct * 100}% - 12px)`, width: 24, cursor: 'ew-resize', zIndex: 3, touchAction: 'none' }}
              />
              <div
                onPointerDown={e => onHandleDown(e, 'end')}
                style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${endPct * 100}% - 12px)`, width: 24, cursor: 'ew-resize', zIndex: 3, touchAction: 'none' }}
              />
            </div>
            {/* Selection info */}
            <div style={{ fontSize: 9, color: dim, fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#30D158' }}>▶ {(buffer.duration * startPct).toFixed(2)}s</span>
              <span>durée sélectionnée : {(buffer.duration * (endPct - startPct)).toFixed(2)}s</span>
              <span style={{ color: '#FF2D55' }}>{(buffer.duration * endPct).toFixed(2)}s ◀</span>
            </div>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button onClick={preview} style={{ ...btn('#64D2FF', !!previewNode), flex: 1 }}>
                {previewNode ? '◼ Stop' : '▶ Preview'}
              </button>
              <button
                onClick={() => { stopPreviewNode(); setStep('recording'); setBuffer(null); }}
                style={{ ...btn('#888', false, true), flexShrink: 0, padding: '10px 12px' }}
              >↩</button>
              <button onClick={validate} style={{ ...btn('#30D158', true), flex: 1 }}>✓ Valider</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

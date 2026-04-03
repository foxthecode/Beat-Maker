import { useState } from 'react';

interface Track { id: string; label: string; color: string; icon: string; }
interface QuickSampleFxProps {
  tracks: Track[];
  fx: Record<string, any>;
  setFx: (fn: (prev: Record<string, any>) => Record<string, any>) => void;
  engine: any;
  th: any;
  DEFAULT_FX: Record<string, any>;
}

export default function QuickSampleFx({ tracks, fx, setFx, engine, th, DEFAULT_FX }: QuickSampleFxProps) {
  const [selTrack, setSelTrack] = useState(tracks[0]?.id || '');
  const tr = tracks.find(t => t.id === selTrack) || tracks[0];
  const f = fx[tr?.id || ''] || { ...DEFAULT_FX };

  const update = (key: string, value: number | boolean) => {
    if (!tr) return;
    setFx((prev: Record<string, any>) => {
      const base = prev[tr.id] || { ...DEFAULT_FX };
      const extra: Record<string, any> = {};
      if (key === 'pitch') extra.onPitch = (value as number) !== 0;
      const nf = { ...base, ...extra, [key]: value };
      engine.uFx(tr.id, nf);
      return { ...prev, [tr.id]: nf };
    });
  };

  if (!tr) return null;

  const dim = th?.dim ?? 'rgba(255,255,255,0.4)';
  const surface = th?.surface ?? 'rgba(255,255,255,0.04)';
  const sBorder = th?.sBorder ?? 'rgba(255,255,255,0.1)';

  const Param = ({ label, k, value, min, max, step, unit, color, fmt }:
    { label: string; k: string; value: number; min: number; max: number; step: number; unit: string; color: string; fmt?: (v: number) => string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 7, fontWeight: 700, color: dim, letterSpacing: '0.08em' }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => update(k, Number(e.target.value))}
        style={{ width: '100%', accentColor: color, height: 4, cursor: 'pointer' }}
      />
      <span style={{ fontSize: 8, fontWeight: 800, color, fontFamily: 'monospace' }}>
        {fmt ? fmt(value) : value}{unit}
      </span>
    </div>
  );

  return (
    <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: surface, border: `1px solid rgba(191,90,242,0.18)` }}>
      {/* Track selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 7, color: dim, letterSpacing: '0.1em', marginRight: 2, flexShrink: 0 }}>SAMPLE FX</span>
        {tracks.map(t => (
          <button key={t.id} onClick={() => setSelTrack(t.id)} style={{
            padding: '3px 9px', borderRadius: 5, fontSize: 8, fontWeight: 700,
            border: `1px solid ${selTrack === t.id ? t.color + '55' : sBorder}`,
            background: selTrack === t.id ? t.color + '15' : 'transparent',
            color: selTrack === t.id ? t.color : dim,
            cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {/* Parameters row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <Param
          label="PITCH"
          k="pitch" value={f.pitch ?? 0} min={-12} max={12} step={1} unit="st"
          color={f.pitch !== 0 ? tr.color : dim}
          fmt={v => (v > 0 ? '+' : '') + v}
        />
        <Param
          label="FILTRE"
          k="cut" value={f.cut ?? 20000} min={80} max={20000} step={100} unit="Hz"
          color={f.cut < 18000 ? '#64D2FF' : dim}
          fmt={v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v)}
        />
        <Param
          label="DRIVE"
          k="drive" value={f.drive ?? 0} min={0} max={100} step={1} unit="%"
          color={f.drive > 0 ? '#FF9500' : dim}
        />
        <Param
          label="VOL"
          k="vol" value={f.vol ?? 80} min={0} max={100} step={1} unit="%"
          color="#888"
        />
      </div>
    </div>
  );
}

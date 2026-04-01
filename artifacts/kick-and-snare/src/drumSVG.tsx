import { memo } from "react";

export interface DrumSVGProps {
  id: string;
  color: string;
  hit?: boolean;
  sz?: number;
}

const DrumSVGInner = ({ id, color, hit = false, sz = 22 }: DrumSVGProps) => {
  const c = hit ? "#FF2D55" : color;
  const sw = hit ? 1.8 : 1.2;
  const bg = hit ? color + "22" : "none";
  const s: React.CSSProperties = { display: "block", overflow: "visible", flexShrink: 0, transition: "opacity 0.05s", pointerEvents: "none" };
  if (id === "kick") return (<svg width={sz} height={sz} viewBox="0 0 22 22" style={s}><ellipse cx="11" cy="15" rx="9" ry="6" fill={bg} stroke={c} strokeWidth={sw} /><ellipse cx="11" cy="15" rx="4.5" ry="2.8" fill="none" stroke={c} strokeWidth="0.5" opacity="0.45" /><line x1="2" y1="21" x2="2" y2="15" stroke={c} strokeWidth="1.1" /><line x1="20" y1="21" x2="20" y2="15" stroke={c} strokeWidth="1.1" /></svg>);
  if (id === "snare") return (<svg width={sz} height={sz} viewBox="0 0 22 22" style={s}><rect x="2" y="8" width="18" height="8" rx="2.5" fill={bg} stroke={c} strokeWidth={sw} /><line x1="5.5" y1="9" x2="5.5" y2="15" stroke={c} strokeWidth="0.4" opacity="0.5" /><line x1="9" y1="9" x2="9" y2="15" stroke={c} strokeWidth="0.4" opacity="0.5" /><line x1="13" y1="9" x2="13" y2="15" stroke={c} strokeWidth="0.4" opacity="0.5" /><line x1="16.5" y1="9" x2="16.5" y2="15" stroke={c} strokeWidth="0.4" opacity="0.5" /></svg>);
  if (id === "hihat") return (<svg width={sz} height={sz} viewBox="0 0 22 22" style={s}><line x1="11" y1="8" x2="11" y2="22" stroke={c} strokeWidth="0.9" /><ellipse cx="11" cy="8" rx="9" ry="2.5" fill={bg} stroke={c} strokeWidth={sw} /><ellipse cx="11" cy={hit ? "6" : "6.5"} rx="9" ry="2.5" fill="none" stroke={c} strokeWidth="0.8" opacity="0.65" /></svg>);
  if (id === "clap") return (<svg width={sz} height={sz} viewBox="0 0 22 22" style={s}><path d="M3,12 Q7.5,7 11,9.5 Q14.5,7 19,12" fill={bg} stroke={c} strokeWidth={sw} strokeLinecap="round" /><path d="M5.5,15.5 Q11,11 16.5,15.5" fill="none" stroke={c} strokeWidth="0.9" strokeLinecap="round" opacity="0.55" /></svg>);
  if (id === "tom") return (<svg width={sz} height={sz} viewBox="0 0 22 22" style={s}><ellipse cx="11" cy="11" rx="8" ry="5" fill={bg} stroke={c} strokeWidth={sw} /><line x1="4" y1="16" x2="4" y2="21" stroke={c} strokeWidth="1.1" /><line x1="18" y1="16" x2="18" y2="21" stroke={c} strokeWidth="1.1" /></svg>);
  if (id === "ride") return (<svg width={sz} height={sz} viewBox="0 0 22 22" style={s}><line x1="11" y1="7" x2="11" y2="22" stroke={c} strokeWidth="0.9" /><ellipse cx="11" cy="7" rx="10" ry="2.8" fill={bg} stroke={c} strokeWidth={sw} /></svg>);
  if (id === "crash") return (<svg width={sz} height={sz} viewBox="0 0 22 22" style={s}><line x1="11" y1="7" x2="11" y2="22" stroke={c} strokeWidth="0.9" /><ellipse cx="11" cy="7" rx="10" ry="2.5" fill={bg} stroke={c} strokeWidth={sw} /><line x1="5.5" y1="5" x2="3" y2="2" stroke={c} strokeWidth="0.9" opacity="0.7" /><line x1="16.5" y1="5" x2="19" y2="2" stroke={c} strokeWidth="0.9" opacity="0.7" /><line x1="11" y1="4.5" x2="11" y2="1.5" stroke={c} strokeWidth="0.9" opacity="0.7" /></svg>);
  if (id === "perc") return (<svg width={sz} height={sz} viewBox="0 0 22 22" style={s}><circle cx="11" cy="11" r="8" fill={bg} stroke={c} strokeWidth={sw} /><circle cx="11" cy="11" r="4" fill="none" stroke={c} strokeWidth="0.5" opacity="0.45" /></svg>);
  return (<svg width={sz} height={sz} viewBox="0 0 22 22" style={s}><circle cx="11" cy="11" r="8" fill={bg} stroke={c} strokeWidth={sw} /><line x1="3" y1="19" x2="3" y2="22" stroke={c} strokeWidth="1" /><line x1="19" y1="19" x2="19" y2="22" stroke={c} strokeWidth="1" /></svg>);
};

export const DrumSVG = memo(DrumSVGInner);

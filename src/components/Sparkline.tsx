interface SparklineProps {
  points: { dateMs: number; sohPct: number }[];
  width?: number;
  height?: number;
}

export function Sparkline({ points, width = 260, height = 80 }: SparklineProps) {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-[var(--color-ink-700)]" style={{ width, height }}>
        Not enough readings yet to draw a trend
      </div>
    );
  }

  const minX = points[0].dateMs;
  const maxX = points[points.length - 1].dateMs;
  const minY = Math.min(60, ...points.map((p) => p.sohPct)) - 2;
  const maxY = 100;

  const pad = 8;
  const toX = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (width - pad * 2);
  const toY = (y: number) => height - pad - ((y - minY) / (maxY - minY || 1)) * (height - pad * 2);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.dateMs)} ${toY(p.sohPct)}`).join(" ");
  const y80 = toY(80);
  const y60 = toY(60);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <line x1={pad} y1={y80} x2={width - pad} y2={y80} stroke="var(--color-status-warn)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <line x1={pad} y1={y60} x2={width - pad} y2={y60} stroke="var(--color-status-bad)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <path d={linePath} fill="none" stroke="var(--color-accent-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={toX(p.dateMs)} cy={toY(p.sohPct)} r="2.5" fill="var(--color-accent-400)" />
      ))}
    </svg>
  );
}
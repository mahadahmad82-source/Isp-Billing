import React from 'react';

// ─────────────────────────────────────────────
// Total Collection Revenue — 30-day bar chart for the water
// dashboard (2026-10-08, approved mockup v2). Reuses the same
// per-day `collected` series the Collection Analytics panel uses,
// so no new data fetching is needed. Bars match the existing chart
// visual language; y-axis labels adapt to the data range.
// ─────────────────────────────────────────────

export interface RevenueDay {
  date: string;      // YYYY-MM-DD
  collected: number; // Rs. collected that day
}

function fmtDay(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00');
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
}

function fmtAxis(v: number): string {
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return `${Math.round(v)}`;
}

export default function RevenueChart({ days }: { days: RevenueDay[] }): React.JSX.Element {
  const data = days.map(d => ({ date: d.date, value: typeof d.collected === 'number' && Number.isFinite(d.collected) ? d.collected : 0 }));
  const total = data.reduce((a, d) => a + d.value, 0);
  const max = Math.max(1, ...data.map(d => d.value)) * 1.12;

  if (data.length === 0) {
    return <p className="text-sm text-[#94a3b8] text-center py-8">No collection data yet</p>;
  }

  const W = 720, H = 210, padL = 36, padR = 8, padT = 10, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const bw = plotW / data.length;

  const grid = [0, 1, 2, 3, 4].map(g => {
    const y = padT + (plotH * g) / 4;
    const val = max * (1 - g / 4);
    return { y, label: fmtAxis(val) };
  });

  const labelIdx = [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-52 text-[#64748b] dark:text-[#94a3b8]" role="img" aria-label="Total collection revenue, last 30 days">
        <defs>
          <linearGradient id="wrev-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b82f6" />
            <stop offset="1" stopColor="#93c5fd" />
          </linearGradient>
        </defs>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={W - padR} y2={g.y} stroke="currentColor" strokeOpacity={0.16} strokeDasharray="3 4" />
            <text x={padL - 6} y={g.y + 4} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.7}>{g.label}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * plotH);
          const x = padL + i * bw + 1.5;
          const y = padT + plotH - h;
          const isToday = i === data.length - 1;
          return (
            <rect key={d.date + i} x={x} y={y} width={Math.max(2, bw - 3)} height={h} rx={3}
              fill={isToday ? '#2563eb' : 'url(#wrev-bar)'}
              opacity={isToday ? 1 : 0.55 + 0.45 * (d.value / max)}>
              <title>{`${fmtDay(d.date)} — Rs. ${Math.round(d.value).toLocaleString('en-US')}`}</title>
            </rect>
          );
        })}
        {labelIdx.map(i => (
          <text key={i} x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.7}>
            {fmtDay(data[i].date)}
          </text>
        ))}
      </svg>
      <p className="sr-only">Total collected in the last 30 days: Rs. {Math.round(total).toLocaleString('en-US')}</p>
    </div>
  );
}

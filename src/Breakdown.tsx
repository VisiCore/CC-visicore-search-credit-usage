import { useMemo } from 'react';
import { fmtCpuSeconds } from './format';

// Horizontal magnitude bars: single hue (sequential job), value at the tip.
export default function Breakdown({
  title,
  rows,
  maxRows = 8,
}: {
  title: string;
  rows: { label: string; value: number }[];
  maxRows?: number;
}) {
  const top = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    if (sorted.length <= maxRows) return sorted;
    const head = sorted.slice(0, maxRows - 1);
    const rest = sorted.slice(maxRows - 1).reduce((s, r) => s + r.value, 0);
    return [...head, { label: `Other (${sorted.length - maxRows + 1})`, value: rest }];
  }, [rows, maxRows]);

  const max = Math.max(0, ...top.map((r) => r.value));

  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      {top.length === 0 ? (
        <div className="empty-note">No data in range</div>
      ) : (
        <div className="hbar-list">
          {top.map((r) => (
            <div key={r.label} className="hbar-row" title={`${r.label}: ${fmtCpuSeconds(r.value)} CPU s`}>
              <span className="hbar-label">{r.label}</span>
              <span className="hbar-track">
                <span
                  className="hbar-fill"
                  style={{ width: max > 0 ? `${Math.max(0.75, (r.value / max) * 100)}%` : '0%' }}
                />
              </span>
              <span className="hbar-value">{fmtCpuSeconds(r.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

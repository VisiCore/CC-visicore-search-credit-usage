import { useMemo, useRef, useState } from 'react';
import type { SearchUsage } from './api';
import { fmtBucketLabel, fmtCpuSeconds, fmtTime } from './format';
import { TYPE_SERIES } from './series';

interface Bucket {
  t0: number;
  byType: Record<string, number>;
  count: number;
  total: number;
}

function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function pickBucketMs(spanMs: number): number {
  if (spanMs <= 3600_000) return 5 * 60_000;
  if (spanMs <= 4 * 3600_000) return 15 * 60_000;
  if (spanMs <= 26 * 3600_000) return 3600_000;
  if (spanMs <= 8 * 24 * 3600_000) return 6 * 3600_000;
  return 24 * 3600_000;
}

const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 48 };

export default function UsageChart({
  jobs,
  rangeStart,
  rangeEnd,
  metric,
}: {
  jobs: SearchUsage[];
  rangeStart: number;
  rangeEnd: number;
  metric: (j: SearchUsage) => number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);
  const width = 900; // viewBox width; scales to container

  const { buckets, bucketMs, maxTotal } = useMemo(() => {
    const bucketMs = pickBucketMs(rangeEnd - rangeStart);
    const start = Math.floor(rangeStart / bucketMs) * bucketMs;
    const n = Math.max(1, Math.ceil((rangeEnd - start) / bucketMs));
    const buckets: Bucket[] = Array.from({ length: n }, (_, i) => ({
      t0: start + i * bucketMs,
      byType: {},
      count: 0,
      total: 0,
    }));
    for (const j of jobs) {
      const i = Math.floor((j.timeCreated - start) / bucketMs);
      if (i < 0 || i >= n) continue;
      const v = metric(j);
      const b = buckets[i];
      b.byType[j.type] = (b.byType[j.type] ?? 0) + v;
      b.total += v;
      b.count += 1;
    }
    const maxTotal = Math.max(0, ...buckets.map((b) => b.total));
    return { buckets, bucketMs, maxTotal };
  }, [jobs, rangeStart, rangeEnd, metric]);

  const ticks = niceTicks(maxTotal);
  const yMax = ticks[ticks.length - 1];
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / buckets.length;
  const barW = Math.min(24, Math.max(2, band - 2));
  const y = (v: number) => PAD.top + plotH - (yMax > 0 ? (v / yMax) * plotH : 0);

  // x-axis labels: at most ~8, aligned to bucket starts
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));

  const hovered = hover ? buckets[hover.i] : null;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <div className="chart-legend" role="list" aria-label="Series legend">
        {TYPE_SERIES.map((s) => (
          <span key={s.key} className="legend-item" role="listitem">
            <span className="legend-swatch" style={{ background: s.varName }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        className="usage-chart"
        role="img"
        aria-label="CPU seconds over time by search type"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * width;
          const i = Math.floor((px - PAD.left) / band);
          if (i >= 0 && i < buckets.length) {
            setHover({ i, x: ((e.clientX - rect.left) / rect.width) * 100 });
          } else setHover(null);
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className={t === 0 ? 'axis-baseline' : 'gridline'}
            />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="axis-label">
              {fmtCpuSeconds(t)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const cx = PAD.left + i * band + band / 2;
          if (b.total <= 0) return null;
          let acc = 0;
          const segs = TYPE_SERIES.filter((s) => (b.byType[s.key] ?? 0) > 0);
          return (
            <g key={b.t0} opacity={hover && hover.i !== i ? 0.55 : 1}>
              {segs.map((s, si) => {
                const v = b.byType[s.key]!;
                const yTop = y(acc + v);
                const yBot = y(acc);
                acc += v;
                const isTop = si === segs.length - 1;
                // 2px surface gap between stacked segments
                const gap = si > 0 ? 2 : 0;
                const h = Math.max(0.5, yBot - yTop - gap);
                const r = isTop ? Math.min(4, barW / 2, h) : 0;
                const x0 = cx - barW / 2;
                const ySeg = yBot - gap - h;
                const d = isTop
                  ? `M${x0},${ySeg + h} L${x0},${ySeg + r} Q${x0},${ySeg} ${x0 + r},${ySeg} L${x0 + barW - r},${ySeg} Q${x0 + barW},${ySeg} ${x0 + barW},${ySeg + r} L${x0 + barW},${ySeg + h} Z`
                  : undefined;
                return isTop ? (
                  <path key={s.key} d={d} fill={s.varName} />
                ) : (
                  <rect key={s.key} x={x0} y={ySeg} width={barW} height={h} fill={s.varName} />
                );
              })}
            </g>
          );
        })}
        {buckets.map((b, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`l${b.t0}`}
              x={PAD.left + i * band + band / 2}
              y={H - 8}
              textAnchor="middle"
              className="axis-label"
            >
              {fmtBucketLabel(b.t0, bucketMs)}
            </text>
          ) : null,
        )}
        {/* invisible hover hit strip (bigger than the marks) */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          pointerEvents="all"
        />
      </svg>
      {hovered && hover && (
        <div
          className="chart-tooltip"
          style={{ left: `${Math.min(hover.x, 78)}%` }}
        >
          <div className="tooltip-title">
            {fmtTime(hovered.t0)} · {hovered.count} search{hovered.count === 1 ? '' : 'es'}
          </div>
          {TYPE_SERIES.map((s) =>
            hovered.byType[s.key] ? (
              <div key={s.key} className="tooltip-row">
                <span className="legend-swatch" style={{ background: s.varName }} />
                <span className="tooltip-label">{s.label}</span>
                <span className="tooltip-value">{fmtCpuSeconds(hovered.byType[s.key]!)}</span>
              </div>
            ) : null,
          )}
          <div className="tooltip-row tooltip-total">
            <span className="tooltip-label">Total CPU s</span>
            <span className="tooltip-value">{fmtCpuSeconds(hovered.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

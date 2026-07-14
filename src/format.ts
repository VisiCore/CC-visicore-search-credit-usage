export function fmtCompact(n: number): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(abs < 10 ? 2 : 1);
}

export function fmtBytes(n: number | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtCpuSeconds(s: number): string {
  if (s === 0) return '0';
  if (s < 0.01) return '<0.01';
  if (s < 10) return s.toFixed(2);
  if (s < 100) return s.toFixed(1);
  return fmtCompact(Math.round(s));
}

export function fmtCredits(c: number): string {
  if (c === 0) return '0';
  if (c < 0.01) return '<0.01';
  if (c < 100) return c.toFixed(2);
  return fmtCompact(c);
}

export function fmtTime(ts: number | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

export function fmtBucketLabel(ts: number, bucketMs: number): string {
  const d = new Date(ts);
  if (bucketMs >= 24 * 3600_000) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (bucketMs >= 3600_000) return time;
  return time;
}

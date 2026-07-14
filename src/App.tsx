import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SearchUsage } from './api';
import { fetchUsage } from './api';
import Breakdown from './Breakdown';
import { fmtBytes, fmtCompact, fmtCpuSeconds, fmtCredits, fmtDuration } from './format';
import JobsTable from './JobsTable';
import UsageChart from './UsageChart';

const RANGES: { key: string; label: string; ms: number | null }[] = [
  { key: '1h', label: '1h', ms: 3600_000 },
  { key: '4h', label: '4h', ms: 4 * 3600_000 },
  { key: '24h', label: '24h', ms: 24 * 3600_000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 3600_000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 3600_000 },
  { key: 'all', label: 'All', ms: null },
];

interface CreditSettings {
  basis: 'billable' | 'total';
  cpuSecPerCredit: number;
  /** flag searches consuming more than this many credits; null = off */
  flagThreshold: number | null;
}

const SETTINGS_KEY = 'search-credit-usage.settings';

function loadSettings(): CreditSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if ((p.basis === 'billable' || p.basis === 'total') && p.cpuSecPerCredit > 0) {
        return { flagThreshold: null, ...p };
      }
    }
  } catch {
    /* sandboxed storage unavailable — fall through to defaults */
  }
  return { basis: 'billable', cpuSecPerCredit: 60, flagThreshold: null };
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function App() {
  const [jobs, setJobs] = useState<SearchUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [range, setRange] = useState('24h');
  const [typeFilter, setTypeFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [settings, setSettings] = useState<CreditSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const inFlight = useRef(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const data = await fetchUsage();
      setJobs(data);
      setError(null);
      setLastFetched(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  const saveSettings = (s: CreditSettings) => {
    setSettings(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  };

  const now = lastFetched ?? Date.now();
  const rangeMs = RANGES.find((r) => r.key === range)?.ms ?? null;
  const oldest = useMemo(
    () => (jobs && jobs.length ? Math.min(...jobs.map((j) => j.timeCreated)) : now - 3600_000),
    [jobs, now],
  );
  const rangeStart = rangeMs != null ? now - rangeMs : oldest;

  const inRange = useMemo(
    () => (jobs ?? []).filter((j) => j.timeCreated >= rangeStart && j.timeCreated <= now),
    [jobs, rangeStart, now],
  );

  const users = useMemo(() => [...new Set(inRange.map((j) => j.user))].sort(), [inRange]);
  const statuses = useMemo(() => [...new Set(inRange.map((j) => j.status))].sort(), [inRange]);
  const types = useMemo(() => [...new Set(inRange.map((j) => j.type))].sort(), [inRange]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inRange.filter(
      (j) =>
        (typeFilter === 'all' || j.type === typeFilter) &&
        (userFilter === 'all' || j.user === userFilter) &&
        (statusFilter === 'all' || j.status === statusFilter) &&
        (!q ||
          j.query.toLowerCase().includes(q) ||
          (j.savedQueryName ?? '').toLowerCase().includes(q) ||
          j.id.toLowerCase().includes(q) ||
          j.datasets.some((d) => d.toLowerCase().includes(q))),
    );
  }, [inRange, typeFilter, userFilter, statusFilter, search]);

  const creditSecs = useCallback(
    (j: SearchUsage) => (settings.basis === 'billable' ? j.billableCPUSeconds : j.totalCPUSeconds),
    [settings.basis],
  );

  const creditsOf = useCallback(
    (j: SearchUsage) => creditSecs(j) / settings.cpuSecPerCredit,
    [creditSecs, settings.cpuSecPerCredit],
  );

  const isFlagged = useCallback(
    (j: SearchUsage) => settings.flagThreshold != null && creditsOf(j) > settings.flagThreshold,
    [creditsOf, settings.flagThreshold],
  );

  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const tableJobs = useMemo(
    () => (flaggedOnly ? filtered.filter(isFlagged) : filtered),
    [filtered, flaggedOnly, isFlagged],
  );
  const flaggedCount = useMemo(() => filtered.filter(isFlagged).length, [filtered, isFlagged]);

  const totals = useMemo(() => {
    let runtime = 0;
    let cpu = 0;
    let billable = 0;
    let bytes = 0;
    let events = 0;
    let creditCpu = 0;
    for (const j of filtered) {
      runtime += j.durationMs ?? 0;
      cpu += j.totalCPUSeconds;
      billable += j.billableCPUSeconds;
      bytes += j.bytesIn ?? 0;
      events += j.eventsIn ?? 0;
      creditCpu += creditSecs(j);
    }
    return {
      count: filtered.length,
      runtime,
      cpu,
      billable,
      bytes,
      events,
      credits: creditCpu / settings.cpuSecPerCredit,
      avgRuntime: filtered.length ? runtime / filtered.length : 0,
    };
  }, [filtered, creditSecs, settings.cpuSecPerCredit]);

  const byUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of filtered) m.set(j.user, (m.get(j.user) ?? 0) + j.totalCPUSeconds);
    return [...m].map(([label, value]) => ({ label, value }));
  }, [filtered]);

  const byDataset = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of filtered) {
      const ds = j.datasets.length ? j.datasets : ['(none)'];
      // attribute the job's full CPU to each dataset it touched
      for (const d of ds) m.set(d, (m.get(d) ?? 0) + j.totalCPUSeconds);
    }
    return [...m].map(([label, value]) => ({ label, value }));
  }, [filtered]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="title-block">
          <h1>Search Credit Usage</h1>
          <span className="subtitle">
            CPU-second consumption per Cribl Search job
            {lastFetched && (
              <> · updated {new Date(lastFetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</>
            )}
          </span>
        </div>
        <div className="controls">
          <div className="range-picker" role="tablist" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                role="tab"
                aria-selected={range === r.key}
                className={`range-btn ${range === r.key ? 'active' : ''}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className="auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto
          </label>
          <button className="btn" onClick={refresh} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button className="btn" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
            ⚙ Credits
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="settings-panel card">
          <h2 className="card-title">Credit estimation</h2>
          <p className="settings-note">
            The Search API reports CPU seconds, not credits. Set the conversion that matches your
            Cribl plan; the estimate updates everywhere.
          </p>
          <div className="settings-row">
            <label>
              Basis
              <select
                value={settings.basis}
                onChange={(e) => saveSettings({ ...settings, basis: e.target.value as CreditSettings['basis'] })}
              >
                <option value="billable">Billable CPU seconds</option>
                <option value="total">Total CPU seconds</option>
              </select>
            </label>
            <label>
              CPU seconds per credit
              <input
                type="number"
                min={1}
                value={settings.cpuSecPerCredit}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v > 0) saveSettings({ ...settings, cpuSecPerCredit: v });
                }}
              />
            </label>
            <label>
              Flag searches over (credits)
              <input
                type="number"
                min={0}
                step="any"
                placeholder="off"
                value={settings.flagThreshold ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const v = Number(raw);
                  saveSettings({
                    ...settings,
                    flagThreshold: raw === '' || !isFinite(v) || v < 0 ? null : v,
                  });
                }}
              />
            </label>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <strong>Couldn't load search jobs.</strong> {error}
        </div>
      )}

      <section className="stat-row">
        <StatTile label="Searches" value={fmtCompact(totals.count)} />
        <StatTile label="Total runtime" value={fmtDuration(totals.runtime)} sub={`avg ${fmtDuration(totals.avgRuntime)}`} />
        <StatTile label="CPU seconds" value={fmtCpuSeconds(totals.cpu)} />
        <StatTile label="Billable CPU seconds" value={fmtCpuSeconds(totals.billable)} />
        <StatTile
          label="Est. credits"
          value={fmtCredits(totals.credits)}
          sub={`${settings.basis} ÷ ${settings.cpuSecPerCredit}s`}
        />
        <StatTile label="Data scanned" value={fmtBytes(totals.bytes)} sub={`${fmtCompact(totals.events)} events`} />
        {settings.flagThreshold != null && (
          <button
            type="button"
            className={`stat-tile stat-tile-button ${flaggedCount > 0 ? 'stat-tile-flagged' : ''}`}
            onClick={() => {
              const next = !flaggedOnly;
              setFlaggedOnly(next);
              if (next) tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            aria-pressed={flaggedOnly}
            title={flaggedOnly ? 'Show all searches' : 'Drill into flagged searches'}
          >
            <div className="stat-label">Flagged searches</div>
            <div className="stat-value">
              {flaggedCount > 0 && <span className="flag-icon">⚑ </span>}
              {fmtCompact(flaggedCount)}
            </div>
            <div className="stat-sub">
              over {settings.flagThreshold} credits · {flaggedOnly ? 'showing flagged — click to reset' : 'click to drill down'}
            </div>
          </button>
        )}
      </section>

      <section className="card chart-card">
        <h2 className="card-title">CPU seconds over time</h2>
        <UsageChart
          jobs={filtered}
          rangeStart={rangeStart}
          rangeEnd={now}
          metric={(j) => j.totalCPUSeconds}
        />
      </section>

      <section className="breakdown-row">
        <Breakdown title="CPU seconds by user" rows={byUser} />
        <Breakdown title="CPU seconds by dataset" rows={byDataset} />
      </section>

      <section className="filter-row">
        <input
          type="search"
          className="search-input"
          placeholder="Filter by query text, dataset, or job ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type filter">
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} aria-label="User filter">
          <option value="all">All users</option>
          {users.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {settings.flagThreshold != null && (
          <label className="flagged-only">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => setFlaggedOnly(e.target.checked)}
            />
            ⚑ Flagged only
          </label>
        )}
      </section>

      <div ref={tableRef}>
        <JobsTable jobs={tableJobs} creditsOf={creditsOf} isFlagged={isFlagged} />
      </div>

      {jobs === null && !error && <div className="loading-note">Loading search jobs…</div>}
    </div>
  );
}

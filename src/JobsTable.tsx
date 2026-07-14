import { useMemo, useState } from 'react';
import type { SearchUsage } from './api';
import JobDetail from './JobDetail';
import { TYPE_SERIES } from './series';
import { fmtBytes, fmtCompact, fmtCpuSeconds, fmtCredits, fmtDuration, fmtTime } from './format';

type SortKey =
  | 'timeCreated'
  | 'durationMs'
  | 'totalCPUSeconds'
  | 'billableCPUSeconds'
  | 'credits'
  | 'bytesIn'
  | 'eventsIn';

const NUM_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'durationMs', label: 'Duration' },
  { key: 'totalCPUSeconds', label: 'CPU s' },
  { key: 'billableCPUSeconds', label: 'Billable CPU s' },
  { key: 'credits', label: 'Est. credits' },
  { key: 'bytesIn', label: 'Data scanned' },
  { key: 'eventsIn', label: 'Events' },
];

function typeColor(type: string): string | undefined {
  return TYPE_SERIES.find((s) => s.key === type)?.varName;
}

function statusClass(status: string): string {
  if (status === 'failed') return 'status-failed';
  if (status === 'running') return 'status-running';
  if (status === 'canceled' || status === 'cancelled' || status === 'queued') return 'status-muted';
  return 'status-ok';
}

function statusIcon(status: string): string {
  if (status === 'failed') return '✕';
  if (status === 'running') return '●';
  if (status === 'canceled' || status === 'cancelled') return '⊘';
  if (status === 'queued') return '○';
  return '✓';
}

export default function JobsTable({
  jobs,
  creditsOf,
  isFlagged,
}: {
  jobs: SearchUsage[];
  creditsOf: (j: SearchUsage) => number;
  isFlagged: (j: SearchUsage) => boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('timeCreated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<SearchUsage | null>(null);

  const sorted = useMemo(() => {
    const val = (j: SearchUsage): number =>
      sortKey === 'credits' ? creditsOf(j) : ((j[sortKey] as number | null | undefined) ?? -1);
    const arr = [...jobs];
    arr.sort((a, b) => (sortDir === 'asc' ? val(a) - val(b) : val(b) - val(a)));
    return arr;
  }, [jobs, sortKey, sortDir, creditsOf]);

  const visible = sorted.slice(0, limit);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div className="card table-card">
      <h2 className="card-title">
        Searches <span className="count-note">({jobs.length} in range)</span>
      </h2>
      <div className="table-scroll">
        <table className="jobs-table">
          <thead>
            <tr>
              <th
                className="sortable"
                onClick={() => onSort('timeCreated')}
                aria-sort={sortKey === 'timeCreated' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                Started {sortKey === 'timeCreated' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th>Query</th>
              <th>Type</th>
              <th>User</th>
              <th>Status</th>
              {NUM_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="sortable num"
                  onClick={() => onSort(c.key)}
                  aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.label} {sortKey === c.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((j) => (
              <tr
                key={j.id}
                className={`row-clickable ${isFlagged(j) ? 'row-flagged' : ''}`}
                onClick={() => setSelected(j)}
                title="Click for details"
              >
                <td className="nowrap">{fmtTime(j.timeCreated)}</td>
                <td className="query-cell">
                  <span className="query-link">{j.savedQueryName || j.query || j.id}</span>
                </td>
                <td className="nowrap">
                  <span className="type-dot" style={{ background: typeColor(j.type) }} />
                  {j.type}
                </td>
                <td className="nowrap user-cell" title={j.user}>
                  {j.user}
                </td>
                <td className={`nowrap ${statusClass(j.status)}`}>
                  {statusIcon(j.status)} {j.status}
                </td>
                <td className="num">{fmtDuration(j.durationMs)}</td>
                <td className="num">{fmtCpuSeconds(j.totalCPUSeconds)}</td>
                <td className="num">{fmtCpuSeconds(j.billableCPUSeconds)}</td>
                <td className="num">
                  {isFlagged(j) && (
                    <span className="flag-icon" title="Over credit threshold">
                      ⚑{' '}
                    </span>
                  )}
                  {fmtCredits(creditsOf(j))}
                </td>
                <td className="num">{fmtBytes(j.bytesIn)}</td>
                <td className="num">{j.eventsIn != null ? fmtCompact(j.eventsIn) : '—'}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={11} className="empty-note">
                  No searches match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <button className="btn show-more" onClick={() => setLimit((l) => l + 100)}>
          Show more ({sorted.length - limit} remaining)
        </button>
      )}
      {selected && (
        <JobDetail
          job={selected}
          credits={creditsOf(selected)}
          flagged={isFlagged(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

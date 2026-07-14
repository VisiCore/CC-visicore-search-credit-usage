import { useEffect } from 'react';
import type { SearchUsage } from './api';
import { jobUrl } from './api';
import { TYPE_SERIES } from './series';
import { fmtBytes, fmtCompact, fmtCpuSeconds, fmtCredits, fmtDuration, fmtTime } from './format';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail-field">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children}</div>
    </div>
  );
}

export default function JobDetail({
  job,
  credits,
  flagged,
  onClose,
}: {
  job: SearchUsage;
  credits: number;
  flagged: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const typeColor = TYPE_SERIES.find((s) => s.key === job.type)?.varName;
  const executors = Object.entries(job.executorsCPUSeconds ?? {}).sort((a, b) => b[1] - a[1]);
  const shownExecutors = executors.slice(0, 10);
  const restExecutors = executors.slice(10);
  const restSecs = restExecutors.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-panel card"
        role="dialog"
        aria-label="Search details"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-head">
          <h2 className="card-title">
            {job.savedQueryName || 'Search details'}
            {flagged && <span className="flag-icon"> ⚑ over threshold</span>}
          </h2>
          <button className="btn detail-close" onClick={onClose} aria-label="Close details">
            ✕
          </button>
        </div>

        <div className="detail-usage-row">
          <div className="detail-stat">
            <div className="stat-label">Est. credits</div>
            <div className={`stat-value ${flagged ? 'flagged-value' : ''}`}>{fmtCredits(credits)}</div>
          </div>
          <div className="detail-stat">
            <div className="stat-label">CPU seconds</div>
            <div className="stat-value">{fmtCpuSeconds(job.totalCPUSeconds)}</div>
            <div className="stat-sub">{fmtCpuSeconds(job.billableCPUSeconds)} billable</div>
          </div>
          <div className="detail-stat">
            <div className="stat-label">Duration</div>
            <div className="stat-value">{fmtDuration(job.durationMs)}</div>
            {job.launchMs != null && <div className="stat-sub">launch {fmtDuration(job.launchMs)}</div>}
          </div>
          <div className="detail-stat">
            <div className="stat-label">Data scanned</div>
            <div className="stat-value">{fmtBytes(job.bytesIn)}</div>
            <div className="stat-sub">
              {job.eventsIn != null ? `${fmtCompact(job.eventsIn)} events in` : '—'}
              {job.eventsOut != null ? ` · ${fmtCompact(job.eventsOut)} out` : ''}
            </div>
          </div>
        </div>

        <div className="detail-grid">
          <Field label="Job ID">{job.id}</Field>
          <Field label="User">{job.user}</Field>
          <Field label="Type">
            <span className="type-dot" style={{ background: typeColor }} />
            {job.type}
          </Field>
          <Field label="Status">{job.status}</Field>
          <Field label="Created">{fmtTime(job.timeCreated)}</Field>
          <Field label="Started">{fmtTime(job.timeStarted)}</Field>
          <Field label="Completed">{fmtTime(job.timeCompleted)}</Field>
          <Field label="Search window">
            {job.earliest || '—'} → {job.latest || '—'}
          </Field>
          <Field label="Datasets">{job.datasets.length ? job.datasets.join(', ') : '—'}</Field>
          {executors.length > 0 && (
            <Field label={`CPU by executor (${executors.length})`}>
              {shownExecutors.map(([name, secs]) => (
                <div key={name} className="executor-row">
                  <span>{name}</span>
                  <span className="executor-secs">{fmtCpuSeconds(secs)}s</span>
                </div>
              ))}
              {restExecutors.length > 0 && (
                <div className="executor-row executor-rest">
                  <span>+ {restExecutors.length} more</span>
                  <span className="executor-secs">{fmtCpuSeconds(restSecs)}s</span>
                </div>
              )}
            </Field>
          )}
        </div>

        <div className="detail-field">
          <div className="detail-label">Query</div>
          <pre className="detail-query">{job.query || '—'}</pre>
        </div>

        <a className="btn open-in-search" href={jobUrl(job.id)} target="_top">
          Open in Cribl Search ↗
        </a>
      </div>
    </div>
  );
}

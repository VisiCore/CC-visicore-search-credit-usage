// Data layer: fetches search jobs + job metrics from the Cribl API and joins
// them into slim SearchUsage records. Runs inside the Cribl app iframe, where
// fetch() to CRIBL_API_URL is proxied and authenticated by the platform.

export type JobType = 'standard' | 'dashboard' | 'scheduled' | string;

export interface SearchUsage {
  id: string;
  query: string;
  savedQueryName?: string;
  user: string;
  type: JobType;
  status: string;
  timeCreated: number;
  timeStarted?: number;
  timeCompleted?: number;
  /** wall-clock runtime in ms (running jobs measured against `now` at fetch time) */
  durationMs: number | null;
  totalCPUSeconds: number;
  billableCPUSeconds: number;
  executorsCPUSeconds?: Record<string, number>;
  earliest?: string;
  latest?: string;
  datasets: string[];
  // joined from /search/job-metrics (may be absent for old jobs)
  bytesIn?: number;
  eventsIn?: number;
  eventsOut?: number;
  launchMs?: number;
}

declare global {
  interface Window {
    CRIBL_API_URL?: string;
    CRIBL_BASE_PATH?: string;
  }
}

const GROUP = 'default_search';
const PAGE_SIZE = 100;
const MAX_JOBS = 1000;

function apiBase(): string {
  if (!window.CRIBL_API_URL) {
    throw new Error(
      'CRIBL_API_URL is not set. Run this app inside Cribl (installed or via `npm run dev` live preview).',
    );
  }
  return window.CRIBL_API_URL;
}

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${apiBase()}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

interface RawJob {
  id: string;
  query?: string;
  user?: string;
  displayUsername?: string;
  type?: string;
  status?: string;
  timeCreated: number;
  timeStarted?: number;
  timeCompleted?: number;
  earliest?: string;
  latest?: string;
  cpuMetrics?: {
    totalCPUSeconds?: number;
    billableCPUSeconds?: number;
    executorsCPUSeconds?: Record<string, number>;
  };
  // dict of datasetId -> reference count (or an array in some payloads)
  metadata?: { datasets?: Record<string, number> | string[] };
  datasetIds?: string[];
  savedQueryName?: string;
}

function datasetsOf(raw: RawJob): string[] {
  const md = raw.metadata?.datasets;
  if (Array.isArray(md)) return md;
  if (md && typeof md === 'object') return Object.keys(md);
  return raw.datasetIds ?? [];
}

function slim(raw: RawJob, now: number): SearchUsage {
  const started = raw.timeStarted;
  const completed = raw.timeCompleted;
  let durationMs: number | null = null;
  if (started) {
    durationMs = (raw.status === 'running' ? now : (completed ?? now)) - started;
    if (durationMs < 0) durationMs = 0;
  }
  return {
    id: raw.id,
    query: raw.query ?? '',
    savedQueryName: raw.savedQueryName,
    user: raw.displayUsername || raw.user || 'unknown',
    type: raw.type ?? 'standard',
    status: raw.status ?? 'unknown',
    timeCreated: raw.timeCreated,
    timeStarted: started,
    timeCompleted: completed,
    durationMs,
    totalCPUSeconds: raw.cpuMetrics?.totalCPUSeconds ?? 0,
    billableCPUSeconds: raw.cpuMetrics?.billableCPUSeconds ?? 0,
    executorsCPUSeconds: raw.cpuMetrics?.executorsCPUSeconds,
    earliest: raw.earliest,
    latest: raw.latest,
    datasets: datasetsOf(raw),
  };
}

async function fetchAllJobs(): Promise<SearchUsage[]> {
  const now = Date.now();
  const out: SearchUsage[] = [];
  let offset = 0;
  for (;;) {
    const page = await getJson(
      `/m/${GROUP}/search/jobs?limit=${PAGE_SIZE}&offset=${offset}&sortExp=timeCreated&sortDir=desc`,
    );
    const items: RawJob[] = page.items ?? [];
    for (const it of items) out.push(slim(it, now));
    offset += items.length;
    const total = typeof page.totalCount === 'number' ? page.totalCount : offset;
    if (items.length === 0 || offset >= total || offset >= MAX_JOBS) break;
  }
  return out;
}

async function fetchJobMetrics(): Promise<Map<string, Partial<SearchUsage>>> {
  const map = new Map<string, Partial<SearchUsage>>();
  try {
    const data = await getJson(`/m/${GROUP}/search/job-metrics`);
    for (const m of data.items ?? []) {
      map.set(m.id, {
        bytesIn: m.totalMetrics?.bytesIn,
        eventsIn: m.totalMetrics?.eventsIn,
        eventsOut: m.totalMetrics?.eventsOut,
        launchMs: m.launch?.totalMs,
      });
    }
  } catch {
    // job-metrics is Cribl.Cloud-only; the dashboard still works without it
  }
  return map;
}

export async function fetchUsage(): Promise<SearchUsage[]> {
  const [jobs, metrics] = await Promise.all([fetchAllJobs(), fetchJobMetrics()]);
  for (const j of jobs) {
    const m = metrics.get(j.id);
    if (m) Object.assign(j, m);
  }
  return jobs;
}

/** Link into the Cribl Search UI for a given job (open with target="_top"). */
export function jobUrl(id: string): string {
  return `/search/${GROUP}?queryId=${encodeURIComponent(id)}`;
}

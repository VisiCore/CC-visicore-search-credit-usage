// Fixed series order + colors (CSS vars resolve per light/dark theme).
// Color follows the entity: a type keeps its slot even when filtered out.
export const TYPE_SERIES: { key: string; label: string; varName: string }[] = [
  { key: 'standard', label: 'Standard', varName: 'var(--series-1)' },
  { key: 'dashboard', label: 'Dashboard', varName: 'var(--series-2)' },
  { key: 'scheduled', label: 'Scheduled', varName: 'var(--series-3)' },
];

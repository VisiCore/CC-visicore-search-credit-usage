# Search Credit Usage

A [Cribl App](https://docs.cribl.io/apps) that shows credit/CPU consumption per Cribl Search job — like the built-in Search monitoring dashboard, but focused on what each search costs.

![Search Credit Usage dashboard](screenshots/dashboard.png?v=2)

## Features

- **Usage stat tiles** — search count, total/average runtime, CPU seconds, billable CPU seconds, estimated credits, and data/events scanned for the selected time range.
- **CPU seconds over time** — stacked column chart broken down by search type (standard / dashboard / scheduled) with hover tooltips.
- **Breakdowns** — top consumers by user and by dataset.
- **Searches table** — every job with duration, CPU s, billable CPU s, estimated credits, data scanned, and events; sortable columns and filters for query text, type, user, and status.
- **Credit flagging** — set a credit threshold in the ⚙ Credits panel; searches over it are flagged with a warning stripe, counted in a "Flagged searches" tile, and can be isolated with one click.
- **Drilldown** — click the Flagged tile to jump to flagged searches, and click any row for full details: complete query text, timestamps, search window, datasets, launch time, data/events scanned, per-executor CPU breakdown, and an "Open in Cribl Search" link.

  <img src="screenshots/search-details.png?v=1" alt="Search details drilldown panel" width="640">
- **Time ranges & refresh** — 1h / 4h / 24h / 7d / 30d / All presets, manual refresh, and optional 60-second auto-refresh.

## How it works

The app runs inside the Cribl App Platform (sandboxed iframe; the platform proxies and authenticates all API calls). It reads:

| Endpoint | Used for |
|---|---|
| `GET /m/default_search/search/jobs` | Job list with `cpuMetrics` (total/billable/per-executor CPU seconds), status, user, type, timestamps. Paginated with `limit`/`offset`, sorted by `timeCreated`. |
| `GET /m/default_search/search/job-metrics` | Per-job bytes/events scanned and launch timing (Cribl.Cloud only; the app degrades gracefully without it). |

Both paths are declared in [`config/policies.yml`](config/policies.yml).

### Credit estimation

The Search API reports **CPU seconds**, not credits, so the app estimates credits using a conversion you control in the ⚙ Credits panel:

- **Basis** — billable CPU seconds (default) or total CPU seconds (useful in dev environments where coordinator-only searches report 0 billable).
- **CPU seconds per credit** — default 3600 (1 credit per CPU-hour).
- **Flag threshold** — flag any search whose estimated credits exceed this value.

Settings persist in the browser via `localStorage`.

#### What Cribl actually bills

- Search compute is metered in **CPU-hours** — the billing line item is *"Search Total Compute (CPU × Hours)"* — and in Cribl.Cloud **1 credit = $1** ([FinOps Center docs](https://docs.cribl.io/billing-licensing/finops-center/), [Cribl Pricing Guide](https://assets.ctfassets.net/xnqwd8kotbaj/a0Q1zUZPkkwSa31kMr5DL/6545d082ceb23313f91a758d9acde0b4/BGDE-0002-EN-Pricing_Guide-3-1125.pdf)).
- On **usage-based (pay-as-you-go)** plans, that works out to 1 credit per CPU-hour — the app's default of 3600 CPU-seconds per credit ([How Cribl's Cloud pricing works](https://cribl.io/blog/cribl-cloud-pricing/)).
- On **tiered / Search Subscription** plans, you buy a monthly credit bundle for a data-access tier rather than paying per search ([Search pricing](https://cribl.io/pricing/search/)), so there's no single per-search rate — the estimate is still useful for relative cost comparison, but calibrate the multiplier to your contract.

#### How to find your account's real number

1. In Cribl.Cloud, open **Organization → FinOps Center → Search tab**, which shows billed Search compute in CPU-hours alongside credit consumption ([docs](https://docs.cribl.io/billing-licensing/finops-center/)).
2. For a representative month: **credits consumed ÷ CPU-hours = credits per CPU-hour** for your contract.
3. In the app's ⚙ Credits panel, set **CPU seconds per credit = 3600 ÷ that number** (exactly 1 credit/CPU-hour → 3600).

## Development

```bash
npm install
npm run dev       # live preview
npm run lint      # oxlint
npm run build     # type-check + production build
npm run package   # build + create installable app archive (bumps version)
```

Built with React 19, TypeScript, and Vite. Charts are hand-rolled SVG — no chart library.

To install in Cribl: run `npm run package` and upload the generated archive to your Cribl workspace.

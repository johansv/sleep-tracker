# Sleep Tracker

A calm, responsive app for recording bedtime and wake-up for your household. It tracks **time in bed**, not actual sleep. Complete nights feed coverage-aware insights; incomplete and missing nights stay visible without becoming zeroes.

## Run locally

Use Node **24.18.0** (Node 24 LTS) and **pnpm 11.9.0**, pinned in `.node-version` and `package.json`. TypeScript 6 is used within the supported `typescript-eslint` peer range. Dependencies are locked in `pnpm-lock.yaml`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm db:reset
pnpm dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`). No Cloudflare account, credentials, remote database or application login is needed. The SPA and Worker API run together against local D1.

`db:reset` explicitly deletes only this checkout’s `.local/state` before applying migrations and seeding. Stop the app before resetting. Ordinary restarts preserve your records. For an empty household instead of demo data, use `pnpm db:migrate` on a fresh checkout.

The deterministic demo covers **1 January–24 September 2026**: Alex has a long, mostly consistent history, Jamie has later and more variable nights with gaps, and Robin has a sparse history. It includes before/after-midnight bedtimes and both kinds of incomplete night. Choose **24 September 2026** in History or Insights to explore the reference period. Alex’s last seven days there contain six complete nights averaging eight hours, plus one incomplete night. Today always uses your actual local date.

## Commands

| Command           | Purpose                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| `pnpm dev`        | Full local React + Worker app; persistent developer D1                      |
| `pnpm db:migrate` | Apply schema migrations to developer-local D1                               |
| `pnpm db:seed`    | Add deterministic demo records without overwriting existing IDs/nights      |
| `pnpm db:reset`   | Recreate developer-local D1, migrate and seed                               |
| `pnpm build`      | Build the SPA and Worker into `dist/`                                       |
| `pnpm preview`    | Build, then serve that output locally in the Workers runtime                |
| `pnpm test`       | Pure domain and component tests                                             |
| `pnpm test:e2e`   | Fresh isolated D1, complete production build, app process and browser tests |
| `pnpm lint`       | ESLint                                                                      |
| `pnpm typecheck`  | Strict TypeScript check                                                     |
| `pnpm check`      | Lint, types, unit/component tests, build and E2E                            |
| `pnpm types`      | Regenerate Worker binding/runtime declarations after config changes         |

Install the test browser once before running E2E:

```sh
pnpm exec playwright install chromium
pnpm check
```

On Linux CI use `pnpm exec playwright install --with-deps chromium`. GitHub Actions runs the same quality gate without Cloudflare secrets.

## Test isolation and browser evidence

Automated checks never use the developer’s `.local/state`. Every E2E invocation creates a unique ignored `.test-runs/run-*` workspace with its own source snapshot, D1, build artifacts, Wrangler metadata, ephemeral server port and screenshots/traces. This also isolates Cloudflare’s build redirection metadata during concurrent runs. Test state is local-only; no remote D1 commands are used. Ignored run artifacts are retained for diagnosis and can be removed when no test is running.

The browser suite exercises profile create/edit/inactivation, quick logging, incomplete completion, historical add/edit/delete, validation, persistence, statistics and comparison, PWA assets, connection failure/retry and keyboard dialog behavior. It runs at **430×932**, **360×800** and **1440×1000**, saving screenshots under each run’s `results/` directory. Domain tests cover civil-time/DST semantics, period boundaries, circular means/deviations, missing coverage and fixture aggregates.

## Product and code map

- **Today:** one-tap local-time logging and recent nights.
- **History:** records and missing dates, with a full date/time editor.
- **Insights:** rolling seven days, ISO week, month or year; averages, median, trends, typical times, variability, weekday breakdown and household comparisons.
- **Profiles:** tracked people, including inactive profiles whose history is retained.

`src/domain` owns temporal and statistical rules; `src/worker` owns validated API routes and parameterized D1 queries; `src/api` owns browser requests; `src/app`, `src/components` and `src/design` own the responsive UI. `migrations` owns schema history and `scripts/fixtures.ts` owns the canonical demo dataset. Fonts and PWA icons are bundled locally; `node scripts/icons.ts` regenerates the PNG icons.

The app has a standalone web manifest, touch icon and safe-area-aware navigation. Use your browser’s install/add-to-home-screen action. V1 is online-only: there is no service worker, offline record store or mutation queue. Failed connections are displayed explicitly and unsaved editor inputs remain available for retry.

Canonical requirements live in [PRODUCT.md](PRODUCT.md) and [ARCHITECTURE.md](ARCHITECTURE.md); agent workflow lives in [AGENTS.md](AGENTS.md). Implementations branch from and target `dev`; `main` is release-only. This milestone contains no remote provisioning or deployment. The placeholder D1 identifier is for local operation; a public deployment with real personal records requires a separately configured access-control boundary.

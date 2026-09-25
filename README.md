# Sleep Tracker

Sleep Tracker is a responsive consumer application for manually recording bedtime and wake-up for multiple profiles and analysing time-in-bed patterns over time.

The product intentionally records local wall-clock values rather than wearable-derived sleep stages or actual asleep time. Daily logging is mobile-first; larger screens provide richer history and analytics.

Canonical orientation:

- [docs/PRODUCT.md](docs/PRODUCT.md) — product purpose, domain/time semantics, V1 capabilities, statistics and UX/design requirements.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — technical architecture, data model, testing, agent operability, CI and Git workflow.
- AGENTS.md — concise navigation/execution guidance for coding agents.

## Stack

React + TypeScript SPA built with Vite, served together with a same-origin `/api` Worker on Cloudflare Workers (via `@cloudflare/vite-plugin`) and persisted in Cloudflare D1. Wall-clock time uses Temporal (`temporal-polyfill`), charts use Recharts, API input is validated with Zod. The app is an installable, online-only PWA.

Everything runs locally without a Cloudflare account, credentials, remote resources or an application login. Remote deployment to the dev, staging and production environments is an explicit, separate step (see [Deploying](#deploying)).

## Getting started

Requirements: Node 22 (see `.nvmrc`) and pnpm 10.33.0 (pinned via `packageManager`; `corepack enable` picks it up).

```sh
pnpm install
pnpm db:reset   # create the local developer database, apply migrations, load demo data
pnpm dev        # SPA + Worker API + local D1 at http://localhost:5173
```

## Commands

| Command                 | What it does                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev`              | Full local app (Vite + Workers runtime) against the developer D1 store in `.wrangler/state`.   |
| `pnpm db:migrate`       | Apply `migrations/` to the developer store.                                                    |
| `pnpm db:seed`          | (Re)load the demo profiles and their nights. Other profiles you entered are left untouched.    |
| `pnpm db:reset`         | Destroy **only** the local developer D1 store, re-apply migrations and seed it.                |
| `pnpm build`            | Production build (`dist/client` assets + `dist/sleep_tracker` Worker).                         |
| `pnpm preview`          | Build, then run the built app locally in the Workers runtime (developer store).                |
| `pnpm fix`              | Mutating cleanup: Prettier, safe ESLint fixes, Prettier again.                                 |
| `pnpm check`            | Read-only fast gate: format check → lint → typecheck → `pnpm test` → build. No browser needed. |
| `pnpm test`             | Fast deterministic unit and component tests (domain, demo data, client logic, components).     |
| `pnpm test:integration` | Worker API against a fresh in-memory D1 per test (Miniflare).                                  |
| `pnpm test:e2e`         | Self-contained Playwright journeys with their own isolated D1 state and server (see below).    |
| `pnpm verify`           | Full review-candidate verification: `check` + `test:integration` + `test:e2e`.                 |

Validate progressively: while implementing, run the narrowest relevant command with a file, spec or project filter (`pnpm test src/domain/stats.test.ts`, `pnpm test:e2e tests/e2e/logging.spec.ts --project=desktop`), use `pnpm check` as the fast gate, and run `pnpm verify` once for a review candidate. CI runs the fast gate on every push; integration and browser E2E follow only for non-draft PRs and pushes to `dev`/`main`, so keep a PR in draft while iterating.

### Demo data

The demo dataset is deterministic for a given anchor date ("today" of the dataset). By default it is anchored at your current local date so current periods look alive; set `SEED_ANCHOR=YYYY-MM-DD` to pin it. It contains:

- **Alex** — ~14 months of fairly consistent nights, later on weekends, rare gaps.
- **Sam** — later, irregular bedtimes on both sides of midnight, a calm stretch then a chaotic one, missing days, bedtime-only and wake-only nights.
- **Mia** — a new profile with sparse recent data.
- **Olle** — an inactive profile whose history remains viewable.

The ISO week before the anchor's week is a hand-authored fixture week with known aggregates (`scripts/demo-data.ts`), used by unit and E2E tests.

### Test isolation

Automated tests never touch the developer database or remote D1:

- `pnpm test:integration` creates a fresh in-memory D1 database per test with Miniflare.
- Every E2E journey runs at the primary iPhone 15 Pro Max viewport; journeys tagged `@responsive` also run at a small phone and desktop.
- `pnpm test:e2e` creates a disposable state directory under `.e2e-state/<run>/`, applies migrations, seeds the demo data at a fixed anchor (2026-09-24), builds the app into that directory and serves the production build with `wrangler dev` on free ports against that state. The directory is removed afterwards (`E2E_KEEP_STATE=1` keeps it). Runs need no pre-started server, and parallel runs don't share mutable state. Tests fix the browser clock and time zone, so results do not depend on the real date.
- Extra arguments are passed to Playwright, e.g. `pnpm test:e2e --project desktop`.
- Playwright uses its own Chromium (`pnpm exec playwright install chromium`); set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use a preinstalled one.

## Repository map

- `src/domain` — pure civil-time, period, coverage, circular and statistics rules
- `src/worker` — Worker entry, routes, input schemas, D1 persistence; `context.ts` is where future auth plugs in
- `src/api` — typed browser API client and minimal online-only data loading
- `src/app` — app shell, routing and the Today / History / Insights / People screens
- `src/components` — product components (session editor, time field, charts, calendar…)
- `src/design` — semantic tokens (`tokens.css`) and visual primitives (button, surface, sheet, toast…)
- `src/shared` — browser/Worker API types
- `migrations` — D1 schema history
- `scripts` — demo data, DB and E2E runners, icon generation
- `tests/e2e` — Playwright flows

## Delivery model

main is the release branch and dev is the integration branch. Non-trivial implementation is normally described by a GitHub Issue, implemented on a branch from dev and reviewed through a PR back to dev. Releases are explicit dev-to-main integrations. CI (`.github/workflows/ci.yml`) runs the fast gate on every push and integration + E2E for review-ready PRs and pushes to dev/main, without any Cloudflare secrets. Deployment is manual and separate from CI; see below.

## Deploying

Three permanent Cloudflare environments, each with its own Worker and D1 database: **dev** (`https://sleep-dev.jscodelab.uk`), **staging** (`https://sleep-staging.jscodelab.uk`) and **production** (`https://sleep.jscodelab.uk`). The model, safety rules and release semantics are in [docs/ARCHITECTURE.md → Remote environments](docs/ARCHITECTURE.md#remote-environments). All remote operations go through `pnpm cf <command> <env>`, locally and in GitHub Actions.

### Locally

```sh
pnpm install
pnpm exec wrangler login                # or export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID

pnpm cf provision staging --write       # once: create the D1 database, write its id to wrangler.jsonc — commit it
pnpm cf doctor staging                  # read-only config/auth/D1 preflight
pnpm cf migrate staging                 # apply migrations to the remote database
pnpm cf seed staging                    # deterministic canonical demo data (dev/staging only)
pnpm cf seed staging --anchor today     # intentionally move demo data to today's date
pnpm cf reset staging --confirm staging # destructive: drop all tables and re-migrate (add --seed to reload demo data)

pnpm cf release staging                 # exact-revision validation → migrate → clean build/deploy → smoke
pnpm cf deploy-only staging             # exceptional: deploy code without migrations
pnpm cf status staging                  # deployed revision/source, Worker version, pending migrations
pnpm cf status-all                      # inspect all three permanent environments
pnpm cf tail staging                    # live Worker logs; Ctrl-C to stop
pnpm cf help                            # compact command reference
```

`release`/`deploy-only` deploy the committed `HEAD` (a dirty tree is refused) and label it `local:<branch>` unless `--source` is given; production additionally requires `HEAD` to be on `main`. `seed` and `reset` are refused for production. Remote seed defaults to the stable canonical anchor `2026-09-24`; pass `--anchor today` only when a moving demo dataset is intentional.

### From GitHub Actions (Actions → Run workflow)

- **Deploy revision (dev/staging)** — a PR number (its current head; PRs from forks are refused) or branch (its tip), `release` or `deploy-only`, optionally seeding afterwards. The run summary and a single PR comment show the deployed SHA, URL and Worker version.
- **Environment operations** — `doctor`, `status`, `provision`, `migrate`, `seed`, `reset`, `reset-and-seed` (reset asks you to type the environment name; seed anchor is explicit and deterministic).
- **Release production** — from `main`: releases the main tip or a given commit on main.

One-time setup: create GitHub Environments `dev`, `staging` and `production` (protect `production` with required reviewers and main-only deployments), each with secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1 and Workers Routes/custom domain edit for the `jscodelab.uk` zone) and `CLOUDFLARE_ACCOUNT_ID`; add `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` if the hostnames sit behind Cloudflare Access. Then run **Environment operations → provision** for each environment and commit the reported database id to `wrangler.jsonc`.

### Rollback

`pnpm exec wrangler rollback --name sleep-tracker-<env>` rolls back code only. Data/schema recovery uses D1 Time Travel on the named database (`pnpm exec wrangler d1 time-travel info|restore sleep-tracker-<env>`); see the architecture doc before restoring.

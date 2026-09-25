# Sleep Tracker — Architecture

Status: Canonical V1 architecture baseline.
Product semantics and UX requirements live in docs/PRODUCT.md.

## Goals

Optimize for a small understandable full-stack codebase, Cloudflare-compatible deployment, reliable local development, deterministic data/tests, polished responsive UX, and agentic development where an agent can run and inspect everything without login or hidden manual setup.

Prefer simple direct solutions over abstractions that do not earn their cost.

## Technology baseline

Use one TypeScript package unless implementation evidence demonstrates a real need to split it.

- React + TypeScript client
- Vite development/build
- pnpm package manager and scripts
- Cloudflare Workers API/runtime
- @cloudflare/vite-plugin for React/Vite + Workers local/build integration
- Cloudflare D1 persistence with committed SQL migrations
- installable PWA metadata, without offline application-data storage

Use current stable dependency versions when implementation starts and commit the pnpm lockfile. Pin the intended Node major/LTS contract and exact pnpm version in repository metadata so local agents and CI converge on the same toolchain. Do not introduce SSR without a concrete later requirement; V1 is a client-side SPA.

Cloudflare's current official React/Vite path supports a React SPA plus Worker API through the Vite plugin, and D1 supports local Wrangler-backed development and versioned SQL migrations. Revalidate provider details if they materially change before implementation.

## Deployment shape

Browser / installed PWA → same-origin Cloudflare Worker → D1.

The Worker serves built SPA assets and handles /api routes. Keep one deployable application unless a concrete constraint makes separation valuable.

No Cloudflare account, remote D1 database or deployment credentials may be required to develop, build, test or run the application locally. `pnpm preview` must build and run the resulting application locally in the Workers runtime as a production-like validation path. Remote deployment is described below and is always an explicit, separate action.

## Remote environments

Three permanent environments, each with its own Worker and its own D1 database bound as `DB`:

| Environment | Public hostname              | Worker / D1 database       |
| ----------- | ---------------------------- | -------------------------- |
| dev         | `sleep-dev.jscodelab.uk`     | `sleep-tracker-dev`        |
| staging     | `sleep-staging.jscodelab.uk` | `sleep-tracker-staging`    |
| production  | `sleep.jscodelab.uk`         | `sleep-tracker-production` |

There are no per-PR Workers, databases or hostnames; a deployment replaces what runs in the target environment.

### Configuration

`wrangler.jsonc` is the source of truth. Its top level is the local development/test configuration (placeholder D1 id, `APP_ENV=local`); `env.dev`, `env.staging` and `env.production` each repeat the non-inheritable bindings (`DB`, `vars.APP_ENV`, version metadata) with their own D1 database and a custom-domain route. An all-zero `database_id` means the environment is not provisioned yet.

The environment is always selected explicitly — `CLOUDFLARE_ENV=<env>` for the Cloudflare Vite plugin build and `--env <env>` for Wrangler D1 commands — never inferred from the checked-out branch. Tooling refuses to deploy a build whose generated config does not name the expected Worker, D1 database and `APP_ENV`.

### Command surface

`pnpm cf <command> <env>` (`scripts/cloudflare.ts`, rules in `scripts/remote/policy.ts`) is the only implementation of remote operations; local use and GitHub Actions call the same commands.

| Command                                | dev / staging | production | What it does                                                                   |
| -------------------------------------- | ------------- | ---------- | ------------------------------------------------------------------------------ |
| `provision <env> [--write]`            | ✓             | ✓          | Create the D1 database if missing; report (or write) the id for wrangler.jsonc |
| `status <env>`                         | ✓             | ✓          | Health/revision/source/Worker version, active deployment, pending migrations   |
| `migrate <env>`                        | ✓             | ✓          | Apply committed migrations to the remote D1                                    |
| `seed <env>`                           | ✓             | refused    | Idempotently (re)load the deterministic demo data (`SEED_ANCHOR` pins it)      |
| `reset <env> --confirm <env> [--seed]` | ✓             | refused    | Drop every application table, re-migrate (then seed)                           |
| `deploy-only <env>`                    | ✓             | main only  | Clean build + deploy of `HEAD` without migrations (exceptional)                |
| `release <env>`                        | ✓             | main only  | Validation evidence → migrate → clean build + deploy → smoke                   |
| `smoke <env>`                          | ✓             | ✓          | Revision-aware remote health check                                             |

Seed and reset are programmatic refusals for production, not conventions. A release never seeds; seeding is a separate explicit step. Remote seed uses the stable canonical anchor `2026-09-24` by default so repeated runs are reproducible; `--anchor today` is an explicit opt-in to a moving dataset. Destructive commands print the target environment and database before mutating and act only on remote D1 (`--remote --env`), never on the local developer or test stores.

### Release semantics

`release` is the normal deployment and always runs migrations; there is no "skip migrations" flag. `deploy-only` is the explicit escape hatch for redeploying code without touching schema, and `migrate` stays available on its own. A release:

1. requires a clean working tree and records the exact `HEAD` SHA (production: the SHA must be on `main`);
2. requires validation evidence for that exact SHA: only a successful **push** CI run for the SHA is reusable because GitHub `pull_request` CI checks the synthetic merge ref by default. PR merge-ref CI remains valuable integration evidence but is not treated as exact-head release evidence. Without reusable exact-SHA evidence, release runs `pnpm verify` on the selected revision before deploying;
3. applies pending migrations — a failed migration stops before any code is deployed;
4. performs a clean `CLOUDFLARE_ENV=<env>` production build into `.deploy/<env>` and deploys it with `APP_REVISION`/`APP_SOURCE` vars and the SHA as Worker version tag/message, so each Worker version traces to its source revision;
5. smoke-checks `https://<host>/api/health` until it reports the expected environment, the exact revision, a reachable D1 binding and the newest committed migration, and the app page is served. Failure is reported with the environment and revision; success is never claimed without it.

`GET /api/health` is the safe deployment signal: environment, revision, source label, Worker version metadata and D1 reachability/latest applied migration, with no secrets or application data.

Migrations run before the new code goes live, so the old revision briefly runs against the new schema. Author migrations to be compatible with both (additive/expand–contract: add nullable columns/tables first, remove or tighten in a later release once no deployed code depends on the old shape).

### Operational ergonomics

`pnpm cf doctor <env>` is a read-only preflight for repository config, Cloudflare authentication and D1 reachability. `pnpm cf status-all` inspects all permanent environments, and `pnpm cf tail <env>` is a thin local wrapper around Wrangler live logs. These helpers do not change deployment semantics or create additional infrastructure.

Remote dev/staging builds show a deliberately subtle environment marker. It is fixed-position, pointer-events-none and outside document flow, so it has **zero layout footprint**: it must not change spacing, wrapping, breakpoints, scroll dimensions or component geometry compared with production. Production renders no marker at all. The browser title also includes the non-production environment name.

### GitHub Actions

Manually triggered workflows provide the whole remote lifecycle without a developer workstation:

- **Deploy revision (dev/staging)** (`deploy-revision.yml`) — choose `dev` or `staging`, a same-repository PR number (its current head; fork PRs are refused) or a branch (its tip at workflow start), and `release` (default) or `deploy-only`, optionally seeding afterwards. The SHA is resolved once and used throughout. The job summary — and for PRs a single upserted PR comment — shows source, SHA, environment, URL and Worker version. It cannot target production.
- **Release production** (`release-production.yml`) — run from `main`; releases the main tip or a given commit on main. No seed/reset.
- **Environment operations** (`environment-operations.yml`) — `status`, `provision`, `migrate`, `seed`, `reset`, `reset-and-seed` for a chosen environment; migrations/seed come from the branch the workflow runs from, production only from `main`; seed/reset refused for production. Reset requires typing the environment name.

Deploy jobs run in the reusable `cloudflare-deploy.yml`. Every mutating job uses the GitHub Environment of its target (`dev`, `staging`, `production`) for `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets and protection rules, and the shared concurrency group `cloudflare-<env>` so releases, migrations and resets never race on one environment. Protect `production` with required reviewers and a `main`-only deployment branch policy. Production deployment is never automatic.

Credential trust boundary: a deployment executes the selected revision's own install, build and deploy tooling, so only revisions from this repository are deployable — `pnpm cf resolve` refuses fork PRs (the PR head repository must be this repository). Cloudflare/Access secrets are scoped to the individual steps that talk to Cloudflare, never job-wide: checkout, `pnpm install` and a fallback `pnpm verify` run without them, and `release --verified` then records that validation instead of re-running it. Deploying arbitrary external PRs would need a trusted control plane that never runs PR-owned tooling with credentials; that is out of scope.

### Bootstrap versus routine operation

Bootstrap is one-time per environment: `provision` creates the D1 database and reports its id, which is committed to `wrangler.jsonc` (locally `--write` edits the file; in Actions the id appears in the job summary). The custom domain is attached by the first deploy (the `jscodelab.uk` zone must be in the same Cloudflare account). Everything after that — status, migrate, seed/reset where allowed, deploy-only and release — runs from GitHub Actions or locally with identical behavior.

### Rollback and database recovery

These are separate concerns.

- **Code rollback**: `pnpm exec wrangler rollback --name sleep-tracker-<env> [<version-id>]` (or the dashboard) restores an earlier Worker version; `status` and the version tag/message identify the revision each version came from. This does not touch D1: only roll back code that is compatible with the current schema, otherwise roll forward with a fix.
- **Database recovery**: for genuine data/schema incidents use D1 Time Travel, naming the environment's database explicitly — `pnpm exec wrangler d1 time-travel info sleep-tracker-<env>` then `… d1 time-travel restore sleep-tracker-<env> --timestamp=<time>`. Restores are deliberate manual operations; ordinary releases never roll back D1.

### Access control

Deployment plumbing is not an access-control boundary. Before production holds real personal data, put the hostnames behind an appropriate boundary (for example Cloudflare Access); smoke/status then authenticate with an Access service token via the optional `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` environment secrets. No application auth bypass exists or may be added for deployment tooling.

## Intended repository map

- src/app — React app shell, routing and screens
- src/components — reusable product/UI components
- src/design — semantic tokens and low-level visual primitives/styles
- src/domain — pure temporal, period, coverage and statistics rules
- src/api — typed browser/API boundary
- src/worker — Worker entry, routes and D1 persistence adapters
- src/shared — only genuinely shared schemas/types
- migrations — versioned D1 SQL migrations
- scripts — seed/reset helpers and the `pnpm cf` remote operations (`scripts/remote` holds its pure rules)
- public — PWA manifest assets/icons
- tests/e2e — Playwright browser flows

Avoid catch-all utility modules. Domain calculations and D1 concerns must remain clearly separated.

## Persistence model

Persist a lightweight household boundary even though V1 has no login UI.

Minimum conceptual schema:

Households:

- id
- name
- created_at
- updated_at

Profiles:

- id
- household_id → households.id
- name
- color (identity color key, presentation only)
- is_active
- created_at
- updated_at

Sleep sessions:

- id
- profile_id → profiles.id
- night_date: YYYY-MM-DD local date on which the night ends
- bedtime_local: nullable local date-time with no timezone/offset
- wake_time_local: nullable local date-time with no timezone/offset
- created_at
- updated_at

Use stable opaque IDs, enforce D1 foreign keys, and enforce one logical session per profile + night_date. Technical created/updated timestamps may use normal machine timestamps; they do not define sleep semantics.

Future authenticated users/accounts can be mapped to households/profiles without changing session meaning.

## Temporal implementation

Persist sleep endpoints as ISO-like local text such as 2026-09-24T23:35, never with Z or numeric offset.

Use civil/PlainDateTime semantics. Prefer Temporal PlainDate/PlainTime/PlainDateTime semantics; if target runtimes lack consistent native Temporal support, use the standard Temporal polyfill rather than timezone-sensitive JavaScript Date arithmetic.

For complete sessions:

- wake local date equals night_date;
- wake is later than bedtime in local civil ordering;
- time in bed = civil-time difference, with no DST offset adjustment.

Incomplete sessions retain explicit night_date. UI may infer a default, but persisted state is explicit and editable.

Hard validation should reject malformed/structurally impossible state: bad local formats, missing profile relationships, no endpoints at all, wake date inconsistent with night_date, wake not after bedtime, and duplicate profile/night pairs. Unusually short/long durations should generally warn rather than be arbitrarily rejected.

Validate all API input at runtime with a small TypeScript schema/validation library. Use parameterized SQL.

## Statistics

Persistence obtains sessions; pure deterministic domain functions decide inclusion and aggregation.

Invariants:

- only complete sessions participate;
- missing dates never become zero duration;
- aggregates expose sample count/coverage;
- period boundaries use local calendar dates;
- ISO weeks are Monday–Sunday;
- rolling seven days means seven local dates ending on the selected/current local date;
- bedtime/wake aggregation uses circular clock arithmetic;
- typical clock time = circular mean;
- variability = median absolute circular deviation in minutes;
- duration summaries expose arithmetic mean and median.

Keep calculations in one domain/service layer, not duplicated across React components. API statistics responses may expose computed aggregates while history APIs expose raw sessions.

## API boundary

Use JSON over same-origin /api routes with consistent safe error objects.

Expected capabilities, without freezing exact URLs prematurely:

- list/create/update profiles
- list/create/update/delete sleep sessions, filterable by profile/date range
- statistics endpoint for period/profile selectors

V1 has no auth middleware. Structure request handling so future authentication/authorization can be inserted before resource access without rewriting domain logic.

## Client shape

Expose four clear jobs:

1. Log/Today — fastest route to record/complete the current night for a selected profile.
2. History — inspect/edit complete, incomplete and missing nights.
3. Insights — duration, trends, consistency, weekday analysis and profile comparison.
4. Profiles/Settings — profile administration and later presentation preferences.

Compact screens should use an app-like navigation pattern; desktop should adapt composition to use additional space.

Do not add a heavy global-state framework by default. Keep local UI state local and add dedicated state infrastructure only when demonstrated complexity requires it.

## Design system implementation

Start with semantic CSS custom-property tokens for typography, spacing, radii, elevation, surfaces/text/borders, accent/selection, success/warning/error, chart series/selection and motion where used.

Build reusable React primitives from actual product needs. Prefer ordinary CSS/CSS Modules plus tokens over a generic enterprise component framework or large theme that dictates visual character. Focused accessibility primitives are acceptable when they improve behavior without taking over visual design.

Use a maintained React-capable chart library rather than hand-building chart infrastructure; centralize chart styling/configuration so it shares the product palette, typography and interaction language.

## PWA

Include manifest, product icons/theme metadata, standalone display configuration and iOS-appropriate metadata/safe-area handling. Do not add offline persistence, background sync or mutation queues. Do not add a service worker solely for checklist compliance; add one only if a concrete capability needs it.

## Deterministic development environment

A fresh checkout should converge on this small command surface:

- pnpm install
- pnpm dev — full local SPA/API against the developer-local D1 store
- pnpm db:migrate — apply migrations to the developer-local D1 store
- pnpm db:seed — load canonical deterministic demo data into the developer-local D1 store
- pnpm db:reset — destructively recreate only the developer-local D1 store, apply migrations and seed it
- pnpm build
- pnpm preview — build and run the built app locally in the Workers runtime

Verification is progressive. Mutating cleanup comes before read-only validation, cheap checks fail first, and every test command stays targetable (file, spec, project or grep) so the narrowest relevant check can run during implementation:

- pnpm fix — mutating cleanup: format, apply safe lint fixes, format again
- pnpm check — read-only fast gate: format check → lint → typecheck → fast deterministic tests → production build
- pnpm test — fast deterministic unit/component tests; never needs a Worker/D1 runtime or browser
- pnpm test:integration — Worker/API boundary tests against fresh test-owned D1
- pnpm test:e2e — self-contained browser suite that provisions its own isolated D1 state and app process
- pnpm verify — full review-candidate verification: fast gate, integration and critical browser journeys

Run `verify` at coherent review/integration boundaries, not after every implementation step. CI never mutates files.

Common local development must not require manual Cloudflare dashboard work, a Cloudflare account, remote resources or interactive login. Seed data must never be automatically inserted into production.

### Local-state isolation

Developer data and automated-test data are separate trust domains.

- Human/manual development may use a persistent local D1 store so personally entered local data survives normal restarts.
- `db:migrate`, `db:seed` and `db:reset` act only on that developer-local store; destructive reset must be explicit.
- Unit/integration tests that need persistence use fresh test-owned state rather than the developer store.
- Every E2E run creates or selects a disposable isolated D1 persistence directory/database, applies migrations, loads deterministic fixtures, starts its own app against that state, and tears it down or leaves only ignored disposable artifacts.
- E2E must not assume an already-running server or pre-existing database.
- Parallel agents/runs must not share mutable test state; use per-run isolation or an equivalently safe mechanism.
- Tests and agent validation must never opt into remote D1 or use developer/production credentials.
- All generated local database/test state is git-ignored.

Use Wrangler/local-runtime mechanisms such as explicit local persistence directories where useful; the invariant is isolation, not a specific folder name.

If auth is added later, local/E2E environments retain a deterministic development identity/auth strategy with no real credentials or interactive login, and that bypass must be impossible to enable accidentally in production.

## Testing and UI validation

Use Vitest (or the current Vite-aligned equivalent) for fast domain tests. Cover at least wall-clock duration across midnight, bedtime after midnight, DST dates behaving as ordinary wall-clock dates, incomplete exclusion, period/ISO-week boundaries, missing-day coverage, circular aggregation, weekday grouping and profile comparisons.

Use React Testing Library or equivalent for meaningful component behavior; avoid markup-freezing snapshot-heavy suites.

Put Worker/D1 persistence tests behind `test:integration`. Reserve Playwright for behavior where the browser/end-to-end boundary adds confidence: profile administration, bedtime/wake logging through the reviewed night editor, incomplete completion, historical add/edit/delete, statistics coverage/exclusion, representative profile comparison and app-shell/PWA navigation. Prefer the cheapest layer that gives equivalent confidence; keep tests that protect non-trivial behavior, domain invariants, integration boundaries, critical journeys or demonstrated regressions.

Browser journeys run at the primary iPhone 15 Pro Max-equivalent viewport. Only layout-sensitive journeys (tagged `@responsive`) also run at a smaller mobile viewport and normal desktop; functional flows are not multiplied across viewports.

During iteration validate UI changes in a real browser at the viewports the change affects. Broader canonical coverage (iPhone 15 Pro Max-equivalent, a smaller mobile viewport and normal desktop) is for changes with responsive blast radius and for final review acceptance. There is no mandatory screenshot matrix; produce targeted visual evidence when a UI change benefits from visual review.

Green unit/CI output is not proof of responsive interaction quality. Browser evidence should cover relevant loading, empty, incomplete and error states when those states are affected.

## CI

GitHub Actions CI runs for PRs to dev/main and relevant pushes, reusing repository commands rather than CI-only rules. Every push gets the fast gate (`pnpm check`) without browser infrastructure. Integration and browser E2E run as a dependent job only after it passes, and only for review candidates (non-draft PRs, including when a draft is marked ready for review) and pushes to dev/main; draft PR pushes stop at the fast gate.

CI must be able to validate V1 without Cloudflare secrets or remote resources and must use isolated disposable local D1 state for persistence-dependent tests. Deployment is separate from ordinary CI: remote workflows are manual (see Remote environments) and reuse green CI runs as release evidence.

## Git and delivery model

- main is the release branch.
- dev is the integration branch.
- ordinary feature/fix branches start from current dev and target dev.
- releases are explicit dev → main integrations.
- dev/staging environments take any PR head or branch tip on demand; production only takes revisions on main.

After this baseline, dev should point at the same commit as main before implementation begins.

For non-trivial implementation work the normal lifecycle is:

Issue → branch from dev → coherent implementation/validation → push → linked PR to dev → CI/review → revisions on same PR → re-review current head → merge when ready.

Prefer squash merge for ordinary feature/fix PRs into dev. For release, preserve an explicit dev → main integration boundary; afterwards advance dev to include the resulting main release commit so subsequent work shares the release baseline.

Feature/fix work must not target main directly except explicitly authorized exceptional/bootstrap administration. Merge, release and deployment are separate consequential actions and are not implied by implementation completion.

## Security posture

V1 has no application auth, but still requires parameterized D1 statements, runtime validation, safe browser errors, no committed secrets and appropriate environment-specific Cloudflare configuration. The API also bounds JSON request bodies (safe `413`), rejects browser mutations whose `Origin` differs from the app's own origin (requests without `Origin` are allowed) and sends `X-Content-Type-Options: nosniff` on JSON responses.

A public deployment containing real personal data requires an appropriate access-control boundary even before future application-level auth exists. Agent convenience must never become a production auth bypass.

## Documentation authority

docs/PRODUCT.md owns accepted product meaning and UX requirements. docs/ARCHITECTURE.md owns implementation-shaping architecture/testing/delivery constraints. AGENTS.md is a concise navigator and must not grow into a duplicate specification. Task/review state belongs in GitHub Issues/PRs.

If implementation exposes a genuinely better or conflicting direction, do not silently drift: persist accepted conclusions in the natural canonical owner.

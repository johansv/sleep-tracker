# Sleep Tracker — Architecture

Status: Canonical V1 architecture baseline.
Product semantics and UX requirements live in PRODUCT.md.

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

The V1 implementation milestone is local-only: no Cloudflare account, remote D1 database or deployment credentials may be required to develop, build, test or run the application locally. `pnpm preview` must build and run the resulting application locally in the Workers runtime as a production-like validation path. Remote Cloudflare provisioning/deployment is a later task.

## Intended repository map

- src/app — React app shell, routing and screens
- src/components — reusable product/UI components
- src/design — semantic tokens and low-level visual primitives/styles
- src/domain — pure temporal, period, coverage and statistics rules
- src/api — typed browser/API boundary
- src/worker — Worker entry, routes and D1 persistence adapters
- src/shared — only genuinely shared schemas/types
- migrations — versioned D1 SQL migrations
- scripts — seed/reset helpers when useful
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
- pnpm test — deterministic unit/integration tests using test-owned state only
- pnpm test:e2e — self-contained browser suite that provisions its own isolated D1 state and app process
- pnpm lint
- pnpm typecheck
- pnpm build
- pnpm preview — build and run the built app locally in the Workers runtime
- pnpm check — non-interactive aggregate quality gate covering lint, typecheck, tests, build and the repository's required E2E/smoke validation

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

Use Playwright for critical end-to-end flows: profile administration, bedtime/wake logging, incomplete completion, historical add/edit/delete, statistics coverage/exclusion, representative profile comparison and app-shell/PWA navigation.

For meaningful layout/interaction changes validate a real browser at:

- iPhone 15 Pro Max-equivalent viewport;
- a smaller mobile viewport;
- normal desktop.

Green unit/CI output is not proof of responsive interaction quality. Browser evidence should cover relevant loading, empty, incomplete and error states when those states are affected.

## CI

Implementation adds GitHub Actions CI for PRs to dev/main and relevant pushes. Reuse repository commands rather than inventing CI-only rules. At minimum run frozen pnpm install, lint, typecheck, deterministic tests and production build; include Playwright smoke/E2E where practical within normal CI budget.

CI must be able to validate V1 without Cloudflare secrets or remote resources and must use isolated disposable local D1 state for persistence-dependent tests. Deployment is separate from ordinary CI unless explicitly configured later.

## Git and delivery model

- main is the release branch.
- dev is the integration branch.
- ordinary feature/fix branches start from current dev and target dev.
- releases are explicit dev → main integrations.

After this baseline, dev should point at the same commit as main before implementation begins.

For non-trivial implementation work the normal lifecycle is:

Issue → branch from dev → coherent implementation/validation → push → linked PR to dev → CI/review → revisions on same PR → re-review current head → merge when ready.

Prefer squash merge for ordinary feature/fix PRs into dev. For release, preserve an explicit dev → main integration boundary; afterwards advance dev to include the resulting main release commit so subsequent work shares the release baseline.

Feature/fix work must not target main directly except explicitly authorized exceptional/bootstrap administration. Merge, release and deployment are separate consequential actions and are not implied by implementation completion.

## Security posture

V1 has no application auth, but still requires parameterized D1 statements, runtime validation, safe browser errors, no committed secrets and appropriate environment-specific Cloudflare configuration.

A public deployment containing real personal data requires an appropriate access-control boundary even before future application-level auth exists. Agent convenience must never become a production auth bypass.

## Documentation authority

PRODUCT.md owns accepted product meaning and UX requirements. ARCHITECTURE.md owns implementation-shaping architecture/testing/delivery constraints. AGENTS.md is a concise navigator and must not grow into a duplicate specification. Task/review state belongs in GitHub Issues/PRs.

If implementation exposes a genuinely better or conflicting direction, do not silently drift: persist accepted conclusions in the natural canonical owner.

# Agent Guide

This repo is optimized for coding-agent development. Keep context small and use durable repository/GitHub state rather than chat history.

## Read in this order

1. Active Issue/PR for task-specific scope and acceptance.
2. PRODUCT.md for product semantics, UX and V1 scope.
3. ARCHITECTURE.md for architecture, data, testing and Git constraints.
4. Only the relevant implementation/tests.

README is orientation, not a parallel specification.

## V1 invariants

Preserve these unless the task explicitly changes accepted product direction:

- Track time in bed, not actual sleep.
- Bedtime/wake-up are local wall-clock date-times; never UTC-normalize them or use timezone-sensitive Date arithmetic for sleep duration.
- A night is keyed by its wake-up/end date.
- Incomplete sessions remain editable but never enter statistics.
- Missing data is never zero; statistics expose coverage.
- Default time display is 24-hour; future AM/PM is presentation only.
- Profiles are tracked people, not future login identities; preserve household/profile separation.
- V1 has no application auth and no offline data storage/sync.
- Mobile logging must feel like a polished consumer/native app; desktop uses extra space for richer analysis.
- Color/form are coherent and functional, not decorative clutter.
- Deterministic seed data and login-free local/E2E operation are required development capabilities.

## Intended code ownership

- src/domain — temporal, period, coverage and statistics rules
- src/worker — Worker routes and D1 persistence
- src/api — browser/API boundary
- src/app — routes, screens and app shell
- src/components — reusable product components
- src/design — tokens and visual primitives
- migrations — D1 schema history
- tests/e2e — browser flows

ARCHITECTURE.md is authoritative if the implemented map intentionally evolves.

## Git workflow

main is release-only; dev is integration. Ordinary implementation branches start from current dev and PR back to dev. Releases integrate dev to main separately.

For non-trivial Issue-backed work:

Issue → branch from dev → implement/test → push → linked PR to dev → review → revise → re-review current head → merge.

Do not merge, release or deploy unless that consequential action is explicitly delegated. Keep task-specific detail in Issue/PR rather than copying generic rules into every task.

## Implementation discipline

- Prefer the smallest architecture that satisfies the accepted product.
- Keep domain calculations pure and strongly tested.
- Validate API input at runtime and use parameterized SQL.
- Do not add an ORM, heavy global state/design framework, SSR, service worker, auth layer or other large dependency unless it earns concrete value and remains consistent with ARCHITECTURE.md.
- Extend the design system from real component needs and reuse semantic tokens rather than one-off visual values.
- Reuse deterministic seed scenarios for statistics/browser validation where practical.
- Keep durable knowledge in its natural owner; do not create extra planning/state docs when Issue/PR/commits already carry that state.

## Validation

Run repository-owned checks relevant to the change. The implemented repo must provide the command surface defined in ARCHITECTURE.md, including pnpm check, tests/build/E2E and DB seed/reset.

For UI/interaction changes inspect the running app in a real browser. When layout is affected, validate the primary mobile target, another mobile size and desktop. Green CI alone does not prove responsive interaction quality.

Review evidence is revision-specific; after material changes ensure conclusions apply to the current PR head.

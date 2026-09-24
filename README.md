# Sleep Tracker

Sleep Tracker is a responsive consumer application for manually recording bedtime and wake-up for multiple profiles and analysing time-in-bed patterns over time.

The product intentionally records local wall-clock values rather than wearable-derived sleep stages or actual asleep time. Daily logging is mobile-first; larger screens provide richer history and analytics.

## Repository status

This repository currently contains the canonical V1 product and architecture baseline. Application implementation is the next development task.

Canonical orientation:

- PRODUCT.md — product purpose, domain/time semantics, V1 capabilities, statistics and UX/design requirements.
- ARCHITECTURE.md — technical architecture, data model, testing, agent operability, CI and Git workflow.
- AGENTS.md — concise navigation/execution guidance for coding agents.

## Intended stack

React + TypeScript + Vite + pnpm, deployed as a React SPA and same-origin API on Cloudflare Workers with D1 persistence. The app is an installable online-only PWA.

## Delivery model

main is the release branch and dev is the integration branch. Non-trivial implementation is normally described by a GitHub Issue, implemented on a branch from dev and reviewed through a PR back to dev. Releases are explicit dev-to-main integrations.

The project is optimized for agentic development: local execution must require no interactive login or Cloudflare account, deterministic seed/reset data must be available, and agents must be able to run and inspect the UI in a real browser. Automated tests and E2E runs own disposable isolated D1 state and must never depend on or mutate a developer's persisted local data.

## Expected command surface after implementation

- pnpm install
- pnpm db:reset
- pnpm dev
- pnpm build
- pnpm preview
- pnpm check
- pnpm test:e2e

See ARCHITECTURE.md for the full expected development and validation surface.

# Sleep Tracker — Product Definition

Status: Canonical V1 product definition.
Repository: johansv/sleep-tracker

## Purpose

Sleep Tracker manually records when people go to bed and when they get up, then turns that history into understandable time-in-bed statistics. The primary household use case is to replace subjective recollection with inspectable data for several family members.

The product measures time in bed, not actual sleep. It does not know when someone falls asleep, wakes during the night, or enters a sleep stage.

## Domain language

- Household: ownership boundary for profiles. V1 has one household and no login UI; the boundary exists for future account/profile authorization.
- Profile: a tracked person. Profiles can be active or inactive; inactivation never deletes history.
- Night: the local calendar date on which the tracked night ends. For a complete session this is the wake-up/get-up date.
- Bedtime: local date and clock time when the person goes to bed, not when they actually fall asleep.
- Wake-up time: manually recorded local date and clock time when the person gets up / the tracked time-in-bed interval ends, not sensor-detected awakening.
- Sleep session: one profile's record for one night, containing bedtime, wake-up, or both.
- Complete session: both endpoints are present and form a valid wall-clock interval.
- Incomplete session: exactly one endpoint is present. It remains editable but is excluded from statistics.
- Time in bed: wall-clock duration from bedtime to wake-up. UI copy should not claim that this is actual time asleep.

## Time semantics

These rules are product semantics and must not be silently changed by implementation choices.

- Persist bedtime and wake-up as local calendar date plus local clock time.
- Do not convert them to UTC and do not apply timezone offsets.
- Calculate duration using local civil/wall-clock arithmetic.
- DST changes and timezone travel can therefore differ from physical elapsed time. This is an accepted V1 limitation.
- A complete session belongs to its wake-up date. UI should remove ambiguity where useful, for example “Night ending 25 Sep”.
- Incomplete sessions store an explicit night date so they can be found and completed later. When wake-up exists, its local date must equal the night date.
- Default display/input is 24-hour time. A future AM/PM preference is presentation only and must never change stored values or calculations.

Examples:

- 24 Sep 23:35 → 25 Sep 07:10 = 7 h 35 min
- 25 Sep 00:40 → 25 Sep 08:15 = 7 h 35 min

## V1 capabilities

### Profiles

The user can create, rename/edit, activate/deactivate and select profiles, and can inspect history for inactive profiles. Profiles are tracked people, not login identities.

### Logging and history

For any profile the user can:

- record bedtime and wake-up, in either order;
- save and later complete an incomplete session;
- add historical sessions;
- edit both date and clock time of either endpoint;
- delete a session with an appropriately safe confirmation/undo interaction;
- inspect chronological history.

The current-night flow should be exceptionally quick on mobile and require minimal navigation and typing.

### Missing data

- No session for a date means missing data, never zero hours.
- An incomplete session remains visible and easy to correct.
- Only complete sessions participate in duration, averages, consistency, comparisons and other statistics.
- Every statistical view exposes coverage, for example “24 complete nights of 30”.

### Statistics

Required periods:

- current/calendar ISO week, Monday–Sunday;
- calendar month;
- calendar year;
- rolling last 7 local calendar days.

Period handling should allow later rolling/custom ranges without redesigning the domain.

Required perspectives:

- arithmetic mean and median time in bed;
- per-night time-in-bed trend;
- typical bedtime and wake-up;
- bedtime and wake-up consistency/variability;
- weekday breakdown over the selected period;
- complete-night count and coverage;
- comparison of multiple profiles over the same period when understandable at the current screen size.

Clock times are circular values: 23:30 and 00:30 must aggregate around midnight, never around noon. In V1:

- typical bedtime/wake-up = circular mean of clock time;
- variability = median absolute circular deviation from that typical time, reported in minutes rather than as an opaque score;
- every grouped statistic carries sample count/coverage.

## UX and visual quality

The product should feel like a polished modern consumer health application, comparable to or better than companion apps for current wearables and sleep/time trackers. It must not feel like an enterprise admin panel, generic dashboard template or dense forms application.

Desired qualities: calm, clear, personal, immediately understandable, touch-friendly, visually polished without clutter, and data-rich when useful.

All important states should look intentional: loading, empty, incomplete-data, success and error states.

### Responsive behavior

- Primary logging target: iPhone 15 Pro Max.
- Also validate a smaller mobile viewport; do not overfit one device.
- Compact layouts should feel native-app-like: app shell, touch-first controls, safe-area awareness, clear primary actions and suitable mobile navigation.
- Desktop should use extra space for richer history, analytics and comparison rather than merely stretching mobile UI.
- Mobile and desktop remain one coherent product identity.

### Visual system

Color, typography, spacing, shape, elevation, motion and charts form one system.

- Color primarily communicates hierarchy, selection, identity, state, comparison or feedback; it is not arbitrary decoration.
- Color is never the only carrier of meaning.
- Use a restrained semantic palette rather than ad-hoc component colors or rainbow charts.
- Typography and spacing should carry hierarchy; avoid excessive borders/chrome.
- Reuse radii, elevation and interaction feedback consistently.
- Charts use the same visual language as the rest of the product.
- Build the design system incrementally from real screen/component needs rather than creating a speculative library up front.
- Follow normal accessible web practices: semantic controls, meaningful labels, visible focus, keyboard accessibility where applicable and adequate contrast.

## PWA and connectivity

V1 is an installable PWA with appropriate manifest, icons/metadata and standalone behavior. It is online-only:

- no offline data store;
- no offline mutation queue/synchronization;
- failed connectivity is shown clearly instead of pretending stale data is current.

## Authentication and future accounts

V1 has no application-level authentication or authorization. This is a scope decision, not a waiver of normal security.

- Local development and automated UI evaluation must require no interactive login.
- The architecture must allow future authenticated accounts to administer/access one or more household profiles without replacing the profile/session model.
- Real personal data must not intentionally be exposed through a public deployment without an appropriate access-control layer. External deployment protection can be used independently before application auth exists.

## Deterministic example data

The repository must provide easy seed/reset of a canonical deterministic demo dataset usable by humans, agents, tests and chart/statistics development.

It should include at least:

- one profile with long, fairly consistent history;
- one later/more irregular profile with missing days;
- one sparse/new profile;
- bedtimes before and after midnight;
- weekday variation and several months of history;
- bedtime-only and wake-only sessions;
- periods of both high and low consistency.

Selected fixture periods should have testable expected aggregates.

## V1 non-goals

Unless later accepted requirements change scope, V1 excludes wearable integration, automatic sleep detection, actual asleep-time estimation, sleep stages, naps as a separate model, health/medical recommendations, notifications, application login/auth, multi-household management UI, offline-first synchronization and permanent audit/soft-delete history.

## V1 completion boundary

A fresh local environment is V1-complete when it can be started and deterministically seeded, then used end-to-end to:

1. administer multiple profiles;
2. add, complete, edit and delete nightly records with the wall-clock semantics above;
3. inspect history including missing/incomplete states;
4. view correct coverage-aware statistics for required periods;
5. compare profiles where useful;
6. use primary flows comfortably on iPhone 15 Pro Max, smaller mobile and normal desktop;
7. install/open with PWA-style standalone behavior while remaining online-only;
8. deliver a coherent polished consumer-grade experience rather than a generic administrative UI.

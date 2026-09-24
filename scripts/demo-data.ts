import { Temporal } from 'temporal-polyfill';
import { addDays, addMinutes, datesInRange, isoWeekday, type LocalDate } from '../src/domain/civil';
import type { ProfileColor } from '../src/shared/api';

/**
 * Canonical deterministic demo dataset.
 *
 * Everything is derived from an anchor date ("today" of the dataset) and fixed PRNG seeds, so
 * the same anchor always yields the same rows. Development seeds relative to the real local
 * date so current periods look alive; tests and E2E pass a fixed anchor.
 *
 * The ISO week before the anchor's week is a hand-authored fixture week with known aggregates
 * (see `FIXTURE_WEEK_EXPECTATIONS`).
 */

export const DEMO_HOUSEHOLD_ID = 'hh_default';

export interface DemoProfile {
  id: string;
  name: string;
  color: ProfileColor;
  isActive: boolean;
}

export interface DemoSession {
  id: string;
  profileId: string;
  nightDate: LocalDate;
  bedtime: string | null;
  wakeTime: string | null;
}

export const DEMO_PROFILES = {
  alex: { id: 'prf_demo_alex', name: 'Alex', color: 'lavender', isActive: true },
  sam: { id: 'prf_demo_sam', name: 'Sam', color: 'teal', isActive: true },
  mia: { id: 'prf_demo_mia', name: 'Mia', color: 'amber', isActive: true },
  olle: { id: 'prf_demo_olle', name: 'Olle', color: 'sky', isActive: false },
} as const satisfies Record<string, DemoProfile>;

/** Clock offsets relative to 00:00 on the night date: -75 = 22:45 the evening before. */
type Night = { bed: number | null; wake: number | null } | null;

/** Fixture week nights, Monday → Sunday (null = missing). */
const FIXTURE_WEEK: Record<'alex' | 'sam', Night[]> = {
  alex: [
    { bed: -90, wake: 405 }, // 22:30 → 06:45  8 h 15
    { bed: -75, wake: 405 }, // 22:45 → 06:45  8 h 00
    { bed: -60, wake: 410 }, // 23:00 → 06:50  7 h 50
    { bed: -80, wake: 400 }, // 22:40 → 06:40  8 h 00
    { bed: -70, wake: 405 }, // 22:50 → 06:45  7 h 55
    { bed: -30, wake: 480 }, // 23:30 → 08:00  8 h 30
    { bed: -45, wake: 465 }, // 23:15 → 07:45  8 h 30
  ],
  sam: [
    { bed: 20, wake: 490 }, //   00:20 → 08:10  7 h 50
    { bed: -20, wake: 450 }, //  23:40 → 07:30  7 h 50
    null, //                     missing
    { bed: 65, wake: null }, //  bedtime-only 01:05
    { bed: 50, wake: 560 }, //   00:50 → 09:20  8 h 30
    { bed: 90, wake: 600 }, //   01:30 → 10:00  8 h 30
    { bed: null, wake: 555 }, // wake-only 09:15
  ],
};

export const FIXTURE_WEEK_EXPECTATIONS = {
  alex: {
    completeNights: 7,
    incompleteNights: 0,
    missingNights: 0,
    meanMinutes: 3420 / 7,
    medianMinutes: 480,
  },
  sam: {
    completeNights: 4,
    incompleteNights: 2,
    missingNights: 1,
    meanMinutes: 490,
    medianMinutes: 490,
  },
} as const;

/** Monday of the ISO week before the anchor's week. */
export function fixtureWeekStart(anchor: LocalDate): LocalDate {
  return addDays(anchor, -(isoWeekday(anchor) - 1) - 7);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Symmetric noise in [-spread, spread], rounded to 5 minutes. */
function jitter(rand: () => number, spread: number): number {
  return Math.round(((rand() * 2 - 1) * spread) / 5) * 5;
}

function isWeekendNight(date: LocalDate): boolean {
  const wd = isoWeekday(date);
  return wd === 6 || wd === 7;
}

function toSession(profileId: string, nightDate: LocalDate, night: NonNullable<Night>): DemoSession {
  const midnight = `${nightDate}T00:00`;
  return {
    id: `ses_demo_${profileId.slice(9)}_${nightDate.replaceAll('-', '')}`,
    profileId,
    nightDate,
    bedtime: night.bed === null ? null : addMinutes(midnight, night.bed),
    wakeTime: night.wake === null ? null : addMinutes(midnight, night.wake),
  };
}

function generate(
  profileId: string,
  from: LocalDate,
  to: LocalDate,
  seed: number,
  nightFor: (date: LocalDate, rand: () => number, index: number) => Night,
  fixture?: { start: LocalDate; nights: Night[] },
): DemoSession[] {
  const rand = mulberry32(seed);
  const sessions: DemoSession[] = [];
  datesInRange(from, to).forEach((date, index) => {
    // Always draw, so fixture overrides never shift the rest of the random sequence.
    let night = nightFor(date, rand, index);
    if (fixture) {
      const offset = Temporal.PlainDate.from(fixture.start).until(date).days;
      if (offset >= 0 && offset < 7) night = fixture.nights[offset]!;
    }
    if (night) sessions.push(toSession(profileId, date, night));
  });
  return sessions;
}

export function buildDemoDataset(anchor: LocalDate): { profiles: DemoProfile[]; sessions: DemoSession[] } {
  const fixtureStart = fixtureWeekStart(anchor);

  // Alex: long, fairly consistent history, later on weekends, very few gaps.
  const alex = generate(
    DEMO_PROFILES.alex.id,
    addDays(anchor, -420),
    anchor,
    1001,
    (date, rand) => {
      const weekend = isWeekendNight(date);
      const bed = (weekend ? -35 : -75) + jitter(rand, 25);
      const wake = (weekend ? 470 : 405) + jitter(rand, 15);
      const roll = rand();
      if (roll < 0.03) return null;
      if (roll < 0.035) return { bed, wake: null };
      return { bed, wake };
    },
    { start: fixtureStart, nights: FIXTURE_WEEK.alex },
  );

  // Sam: later and more irregular, bedtimes both sides of midnight, many gaps, some incomplete.
  // A calm, consistent stretch is followed by a noticeably chaotic one.
  const samFrom = addDays(anchor, -150);
  const sam = generate(
    DEMO_PROFILES.sam.id,
    samFrom,
    addDays(anchor, -1),
    2002,
    (date, rand, index) => {
      const calm = index < 45;
      const weekend = isWeekendNight(date);
      const bed = (weekend ? 50 : 10) + jitter(rand, calm ? 15 : 95);
      const wake = (weekend ? 580 : 475) + jitter(rand, calm ? 15 : 70);
      const roll = rand();
      if (roll < (calm ? 0.06 : 0.2)) return null;
      if (roll < (calm ? 0.07 : 0.24)) return { bed, wake: null };
      if (roll < (calm ? 0.08 : 0.27)) return { bed: null, wake };
      return { bed, wake };
    },
    { start: fixtureStart, nights: FIXTURE_WEEK.sam },
  );

  // Mia: new profile with sparse, recent data.
  const mia = generate(DEMO_PROFILES.mia.id, addDays(anchor, -20), addDays(anchor, -1), 3003, (_, rand) => {
    const bed = -105 + jitter(rand, 20);
    const wake = 400 + jitter(rand, 20);
    const roll = rand();
    if (roll < 0.55) return null;
    if (roll < 0.62) return { bed: null, wake };
    return { bed, wake };
  });

  // Olle: inactive profile whose historical data stays inspectable.
  const olle = generate(DEMO_PROFILES.olle.id, addDays(anchor, -220), addDays(anchor, -120), 4004, (_, rand) => {
    const bed = -150 + jitter(rand, 15);
    const wake = 345 + jitter(rand, 10);
    return rand() < 0.08 ? null : { bed, wake };
  });

  return {
    profiles: [DEMO_PROFILES.alex, DEMO_PROFILES.sam, DEMO_PROFILES.mia, DEMO_PROFILES.olle],
    sessions: [...alex, ...sam, ...mia, ...olle],
  };
}

function sqlString(value: string | null): string {
  return value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`;
}

/**
 * Idempotent SQL that (re)loads the demo profiles and their sessions. Rows belonging to other
 * profiles (for example data a developer entered by hand) are left untouched.
 */
export function demoSeedSql(anchor: LocalDate): string {
  const { profiles, sessions } = buildDemoDataset(anchor);
  const created = '2026-01-01T00:00:00.000Z';
  const ids = profiles.map((p) => sqlString(p.id)).join(', ');
  const lines = [
    `DELETE FROM sleep_sessions WHERE profile_id IN (${ids});`,
    ...profiles.map(
      (p, i) =>
        `INSERT INTO profiles (id, household_id, name, color, is_active, created_at, updated_at) VALUES (${sqlString(p.id)}, ${sqlString(DEMO_HOUSEHOLD_ID)}, ${sqlString(p.name)}, ${sqlString(p.color)}, ${p.isActive ? 1 : 0}, '2026-01-01T00:00:0${i}.000Z', '2026-01-01T00:00:0${i}.000Z') ON CONFLICT (id) DO UPDATE SET name = excluded.name, color = excluded.color, is_active = excluded.is_active, updated_at = excluded.updated_at;`,
    ),
  ];
  for (let i = 0; i < sessions.length; i += 100) {
    const values = sessions
      .slice(i, i + 100)
      .map(
        (s) =>
          `(${sqlString(s.id)}, ${sqlString(s.profileId)}, ${sqlString(s.nightDate)}, ${sqlString(s.bedtime)}, ${sqlString(s.wakeTime)}, '${created}', '${created}')`,
      );
    lines.push(
      `INSERT INTO sleep_sessions (id, profile_id, night_date, bedtime_local, wake_time_local, created_at, updated_at) VALUES\n${values.join(',\n')};`,
    );
  }
  return lines.join('\n') + '\n';
}

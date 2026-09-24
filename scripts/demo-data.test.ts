import { describe, expect, it } from 'vitest';
import { periodRange } from '../src/domain/period';
import { validateSession } from '../src/domain/session';
import { computePeriodStats } from '../src/domain/stats';
import { buildDemoDataset, DEMO_PROFILES, demoSeedSql, FIXTURE_WEEK_EXPECTATIONS, fixtureWeekStart } from './demo-data';

const ANCHOR = '2026-09-24';

describe('demo dataset', () => {
  const data = buildDemoDataset(ANCHOR);

  it('is deterministic for a given anchor', () => {
    expect(buildDemoDataset(ANCHOR)).toEqual(data);
    expect(demoSeedSql(ANCHOR)).toBe(demoSeedSql(ANCHOR));
  });

  it('contains only valid sessions with unique nights per profile', () => {
    for (const s of data.sessions) expect(validateSession(s)).toEqual([]);
    const keys = data.sessions.map((s) => `${s.profileId}:${s.nightDate}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers the required scenarios', () => {
    const of = (id: string) => data.sessions.filter((s) => s.profileId === id);
    expect(of(DEMO_PROFILES.alex.id).length).toBeGreaterThan(300);
    expect(of(DEMO_PROFILES.mia.id).length).toBeLessThan(20);
    expect(data.profiles.some((p) => !p.isActive)).toBe(true);
    expect(data.sessions.some((s) => s.bedtime && s.bedtime.slice(11) < '12:00')).toBe(true); // after midnight
    expect(data.sessions.some((s) => s.bedtime && s.bedtime.slice(11) > '20:00')).toBe(true); // before midnight
    expect(data.sessions.some((s) => s.bedtime && !s.wakeTime)).toBe(true);
    expect(data.sessions.some((s) => !s.bedtime && s.wakeTime)).toBe(true);
  });

  it('has a fixture week with known aggregates', () => {
    const range = periodRange({ kind: 'week', anchor: fixtureWeekStart(ANCHOR) });
    expect(range).toEqual({ from: '2026-09-14', to: '2026-09-20' });
    for (const [key, expected] of Object.entries(FIXTURE_WEEK_EXPECTATIONS)) {
      const id = DEMO_PROFILES[key as keyof typeof FIXTURE_WEEK_EXPECTATIONS].id;
      const stats = computePeriodStats(
        data.sessions.filter((s) => s.profileId === id),
        range,
      );
      expect(stats.coverage).toMatchObject({
        completeNights: expected.completeNights,
        incompleteNights: expected.incompleteNights,
        missingNights: expected.missingNights,
      });
      expect(stats.duration.meanMinutes).toBeCloseTo(expected.meanMinutes, 6);
      expect(stats.duration.medianMinutes).toBe(expected.medianMinutes);
    }
    const sam = computePeriodStats(
      data.sessions.filter((s) => s.profileId === DEMO_PROFILES.sam.id),
      range,
    );
    // Bedtimes 00:20, 23:40, 00:50, 01:30 aggregate to about 00:35, not to midday.
    expect(Math.round(sam.bedtime.typicalMinutes!)).toBe(35);
  });

  it('shows high and low consistency periods for Sam', () => {
    const sam = data.sessions.filter((s) => s.profileId === DEMO_PROFILES.sam.id);
    const calm = computePeriodStats(sam, { from: '2026-04-28', to: '2026-06-05' });
    const chaotic = computePeriodStats(sam, { from: '2026-07-01', to: '2026-08-31' });
    expect(calm.bedtime.variabilityMinutes!).toBeLessThan(chaotic.bedtime.variabilityMinutes!);
  });
});

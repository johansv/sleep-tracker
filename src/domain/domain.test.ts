import { describe, expect, it } from 'vitest';
import { addDays, duration, formatClock, periodFor, suggestedNight } from './time';
import { circularMean, statistics, variability } from './statistics';
import { sessionSchema } from './validation';
import type { Session } from '../shared/models';
import { demoSessions } from '../../scripts/fixtures';

function session(night: string, bed: string | null, wake: string | null): Session {
  return {
    id: night,
    profile_id: 'p',
    night_date: night,
    bedtime_local: bed,
    wake_time_local: wake,
    created_at: '',
    updated_at: '',
  };
}
describe('civil time', () => {
  it.each([
    ['2026-09-24T23:35', '2026-09-25T07:10', 455],
    ['2026-09-25T00:40', '2026-09-25T08:15', 455],
    ['2026-03-29T01:30', '2026-03-29T04:30', 180],
    ['2026-10-25T01:30', '2026-10-25T04:30', 180],
    ['2026-09-24T12:00', '2026-09-26T13:00', 2940],
  ])('measures %s → %s without time zones', (bed, wake, minutes) =>
    expect(duration(session(wake.slice(0, 10), bed, wake))).toBe(minutes),
  );
  it('keeps incomplete sessions null and suggests explicit end dates', () => {
    expect(duration(session('2026-09-25', '2026-09-24T23:35', null))).toBeNull();
    expect(suggestedNight('2026-09-24T23:00')).toBe('2026-09-25');
    expect(suggestedNight('2026-09-25T00:40')).toBe('2026-09-25');
  });
  it('handles leap years and ISO weeks spanning year boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(periodFor('week', '2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' });
    expect(periodFor('month', '2024-02-17')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(periodFor('year', '2026-09-25')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(periodFor('rolling', '2026-01-02')).toEqual({ start: '2025-12-27', end: '2026-01-02' });
  });
});
describe('validation', () => {
  it.each([
    { night_date: '2026-02-30', bedtime_local: null, wake_time_local: '2026-02-30T07:00' },
    { night_date: '2026-09-25', bedtime_local: null, wake_time_local: null },
    { night_date: '2026-09-25', bedtime_local: null, wake_time_local: '2026-09-24T07:00' },
    {
      night_date: '2026-09-25',
      bedtime_local: '2026-09-25T08:00',
      wake_time_local: '2026-09-25T07:00',
    },
    { night_date: '2026-09-25', bedtime_local: '2026-09-24T23:00Z', wake_time_local: null },
    { night_date: '2026-09-25', bedtime_local: '2026-09-24T25:00', wake_time_local: null },
  ])('rejects structurally impossible inputs %#', (input) =>
    expect(sessionSchema.safeParse(input).success).toBe(false),
  );
  it('allows unusually long intervals and either incomplete endpoint', () => {
    expect(
      sessionSchema.safeParse({
        night_date: '2026-09-25',
        bedtime_local: '2026-09-23T23:00',
        wake_time_local: '2026-09-25T07:00',
      }).success,
    ).toBe(true);
    expect(
      sessionSchema.safeParse({
        night_date: '2026-09-25',
        bedtime_local: null,
        wake_time_local: '2026-09-25T07:00',
      }).success,
    ).toBe(true);
  });
});
describe('coverage and circular statistics', () => {
  it('aggregates around midnight, including median circular deviation', () => {
    const typical = circularMean([1410, 30]);
    expect(formatClock(typical)).toBe('00:00');
    expect(variability([1410, 30], typical)).toBeCloseTo(30);
    expect(circularMean([0, 720])).toBeNull();
    expect(variability([], null)).toBeNull();
  });
  it('does not mistake missing/incomplete data for zeros; groups by wake weekday', () => {
    const rows = [
      session('2026-09-21', '2026-09-20T23:00', '2026-09-21T07:00'),
      session('2026-09-22', '2026-09-22T00:00', '2026-09-22T07:00'),
      session('2026-09-23', null, '2026-09-23T08:00'),
    ];
    const s = statistics(rows, periodFor('rolling', '2026-09-24'));
    expect(s).toMatchObject({
      count: 2,
      total: 7,
      mean: 450,
      median: 450,
      incomplete: 1,
      missing: 4,
    });
    expect(s.weekdays[0]).toMatchObject({ mean: 480, count: 1, total: 1 });
    expect(s.weekdays[2]).toMatchObject({ mean: null, count: 0, total: 1 });
    expect(s.trend.find((t) => t.date === '2026-09-23')).toMatchObject({
      state: 'incomplete',
      minutes: null,
    });
  });
  it('returns null rather than NaN for empty periods', () =>
    expect(statistics([], periodFor('month', '2026-09-24'))).toMatchObject({
      count: 0,
      total: 30,
      mean: null,
      median: null,
      bedtime: null,
      wake: null,
      missing: 30,
    }));
  it('has reproducible fixtures and independently comparable profiles', () => {
    const rows = demoSessions();
    const period = periodFor('rolling', '2026-09-24');
    const alex = statistics(
      rows.filter((s) => s.profile_id === 'demo-alex'),
      period,
    );
    const jamie = statistics(
      rows.filter((s) => s.profile_id === 'demo-jamie'),
      period,
    );
    expect(alex).toMatchObject({ count: 6, incomplete: 1, total: 7, mean: 480, median: 480 });
    expect(jamie.count).toBeLessThan(alex.count);
    expect(jamie.total).toBe(alex.total);
    expect(jamie.mean).not.toBe(alex.mean);
  });
});

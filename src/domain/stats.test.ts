import { describe, expect, it } from 'vitest';
import type { SessionEndpoints } from './session';
import { computePeriodStats, nightAxis } from './stats';

const night = (nightDate: string, bed: string | null, wake: string | null): SessionEndpoints => ({
  nightDate,
  bedtime: bed,
  wakeTime: wake,
});

const week = { from: '2026-09-21', to: '2026-09-27' };

describe('computePeriodStats', () => {
  const sessions = [
    night('2026-09-21', '2026-09-20T23:00', '2026-09-21T07:00'), // Mon 480
    night('2026-09-22', '2026-09-22T00:30', '2026-09-22T07:30'), // Tue 420
    night('2026-09-23', '2026-09-22T23:30', null), // Wed incomplete
    // Thu missing
    night('2026-09-25', null, '2026-09-25T08:00'), // Fri incomplete
    night('2026-09-26', '2026-09-26T00:00', '2026-09-26T09:00'), // Sat 540
    night('2026-09-27', '2026-09-26T23:30', '2026-09-27T08:30'), // Sun 540
    night('2026-09-28', '2026-09-27T23:00', '2026-09-28T07:00'), // outside range
  ];
  const stats = computePeriodStats(sessions, week);

  it('exposes coverage with missing never counted as zero', () => {
    expect(stats.coverage).toEqual({ nights: 7, completeNights: 4, incompleteNights: 2, missingNights: 1 });
    expect(stats.duration.minMinutes).toBe(420);
    expect(stats.duration.sampleCount).toBe(4);
  });

  it('uses only complete sessions for mean and median', () => {
    expect(stats.duration.meanMinutes).toBe((480 + 420 + 540 + 540) / 4);
    expect(stats.duration.medianMinutes).toBe((480 + 540) / 2);
  });

  it('aggregates bedtime around midnight', () => {
    // 23:00, 00:30, 00:00, 23:30 → circular mean 23:45 (offsets -60, +30, 0, -30).
    expect(Math.round(stats.bedtime.typicalMinutes!)).toBe(23 * 60 + 45);
    expect(stats.bedtime.sampleCount).toBe(4);
  });

  it('produces a per-night series with statuses and axis offsets', () => {
    expect(stats.series.map((p) => p.status)).toEqual([
      'complete',
      'complete',
      'incomplete',
      'missing',
      'incomplete',
      'complete',
      'complete',
    ]);
    expect(stats.series[0]).toMatchObject({ minutes: 480, bedtimeOffset: 660, wakeOffset: 1140 });
    expect(stats.series[3]).toMatchObject({ minutes: null, bedtimeOffset: null });
  });

  it('draws a night that ends before midnight on its night date as an evening interval', () => {
    // Night ending 23 Sep, 19:30 → 23:25 the same day: 19:30 = 450, 23:25 = 685 on the clock axis.
    const evening = night('2026-09-23', '2026-09-23T19:30', '2026-09-23T23:25');
    expect(nightAxis(evening)).toEqual({ bedtimeOffset: 450, wakeOffset: 685 });
    const [point] = computePeriodStats([evening], { from: '2026-09-23', to: '2026-09-23' }).series;
    expect(point).toMatchObject({ status: 'complete', minutes: 235, bedtimeOffset: 450, wakeOffset: 685 });
    // Ordinary and after-midnight nights keep their positions; long nights keep their full length.
    expect(nightAxis(night('2026-09-22', '2026-09-22T00:30', '2026-09-22T07:30'))).toEqual({
      bedtimeOffset: 750,
      wakeOffset: 1170,
    });
    expect(nightAxis(night('2026-09-25', '2026-09-23T21:00', '2026-09-25T07:00'))).toEqual({
      bedtimeOffset: 540,
      wakeOffset: 540 + 34 * 60,
    });
    // Single endpoints are placed by their clock.
    expect(nightAxis(night('2026-09-23', null, '2026-09-23T23:25'))).toEqual({ bedtimeOffset: null, wakeOffset: 685 });
  });

  it('groups by weekday of the night date with per-group coverage', () => {
    const monday = stats.weekdays[0]!;
    const thursday = stats.weekdays[3]!;
    expect(monday).toMatchObject({ weekday: 1, nights: 1, completeNights: 1, meanMinutes: 480 });
    expect(thursday).toMatchObject({ weekday: 4, nights: 1, completeNights: 0, meanMinutes: null });
  });

  it('handles an empty period without inventing values', () => {
    const empty = computePeriodStats([], week);
    expect(empty.coverage).toEqual({ nights: 7, completeNights: 0, incompleteNights: 0, missingNights: 7 });
    expect(empty.duration.meanMinutes).toBeNull();
    expect(empty.bedtime.typicalMinutes).toBeNull();
    expect(empty.bedtime.variabilityMinutes).toBeNull();
  });

  it('compares profiles over the same range', () => {
    const other = computePeriodStats([night('2026-09-21', '2026-09-20T22:00', '2026-09-21T06:00')], week);
    expect(other.range).toEqual(stats.range);
    expect(other.coverage.completeNights).toBe(1);
    expect(other.duration.meanMinutes).toBe(480);
  });
});

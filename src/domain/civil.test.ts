import { describe, expect, it } from 'vitest';
import {
  addDays,
  civilMinutesBetween,
  clockFromMinuteOfDay,
  datesInRange,
  isClockTime,
  isLocalDate,
  isLocalDateTime,
  isoWeekday,
} from './civil';

describe('civil date-time validation', () => {
  it('accepts real local dates and date-times without offsets', () => {
    expect(isLocalDate('2026-09-25')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDateTime('2026-09-24T23:35')).toBe(true);
  });

  it('rejects impossible or zoned values', () => {
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-9-5')).toBe(false);
    expect(isLocalDateTime('2026-09-24T24:00')).toBe(false);
    expect(isLocalDateTime('2026-09-24T23:35Z')).toBe(false);
    expect(isLocalDateTime('2026-09-24T23:35+02:00')).toBe(false);
    expect(isLocalDateTime('2026-09-24T23:35:00')).toBe(false);
    expect(isClockTime('23:60')).toBe(false);
    expect(isClockTime('00:00')).toBe(true);
  });
});

describe('wall-clock arithmetic', () => {
  it('measures across midnight', () => {
    expect(civilMinutesBetween('2026-09-24T23:35', '2026-09-25T07:10')).toBe(7 * 60 + 35);
  });

  it('measures a bedtime after midnight', () => {
    expect(civilMinutesBetween('2026-09-25T00:40', '2026-09-25T08:15')).toBe(7 * 60 + 35);
  });

  it('treats DST transition nights as ordinary wall-clock nights', () => {
    // EU spring forward (29 Mar 2026) and fall back (25 Oct 2026); US spring forward (8 Mar 2026).
    expect(civilMinutesBetween('2026-03-28T23:00', '2026-03-29T07:00')).toBe(480);
    expect(civilMinutesBetween('2026-10-24T23:00', '2026-10-25T07:00')).toBe(480);
    expect(civilMinutesBetween('2026-03-07T23:00', '2026-03-08T07:00')).toBe(480);
    expect(civilMinutesBetween('2026-03-29T01:30', '2026-03-29T03:30')).toBe(120);
  });

  it('adds days across month and leap-year boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('knows ISO weekdays and ranges', () => {
    expect(isoWeekday('2026-09-21')).toBe(1);
    expect(isoWeekday('2026-09-27')).toBe(7);
    expect(datesInRange('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('wraps clock minutes', () => {
    expect(clockFromMinuteOfDay(-25)).toBe('23:35');
    expect(clockFromMinuteOfDay(1440 + 70)).toBe('01:10');
  });
});

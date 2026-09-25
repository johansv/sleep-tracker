import { describe, expect, it } from 'vitest';
import {
  inferBedtimeOffset,
  nightForBedtime,
  openNightState,
  resolveBedtime,
  nightForWake,
  sessionStatus,
  sessionWarnings,
  timeInBedMinutes,
  validateSession,
} from './session';

const codes = (s: Parameters<typeof validateSession>[0]) => validateSession(s).map((i) => i.code);

describe('session validation', () => {
  it('accepts complete and incomplete sessions', () => {
    expect(codes({ nightDate: '2026-09-25', bedtime: '2026-09-24T23:35', wakeTime: '2026-09-25T07:10' })).toEqual([]);
    expect(codes({ nightDate: '2026-09-25', bedtime: '2026-09-24T23:35', wakeTime: null })).toEqual([]);
    expect(codes({ nightDate: '2026-09-25', bedtime: null, wakeTime: '2026-09-25T07:10' })).toEqual([]);
  });

  it('rejects structurally impossible sessions', () => {
    expect(codes({ nightDate: '2026-09-25', bedtime: null, wakeTime: null })).toEqual(['no_endpoints']);
    expect(codes({ nightDate: '2026-09-25', bedtime: null, wakeTime: '2026-09-26T07:10' })).toEqual([
      'wake_date_mismatch',
    ]);
    expect(codes({ nightDate: '2026-09-25', bedtime: '2026-09-25T08:00', wakeTime: '2026-09-25T07:10' })).toEqual([
      'wake_not_after_bedtime',
    ]);
    expect(codes({ nightDate: '2026-09-25', bedtime: '2026-09-25T07:10', wakeTime: '2026-09-25T07:10' })).toEqual([
      'wake_not_after_bedtime',
    ]);
    expect(codes({ nightDate: '2026-13-01', bedtime: 'x', wakeTime: null })).toEqual([
      'invalid_night_date',
      'invalid_bedtime',
    ]);
  });

  it('computes wall-clock time in bed only for complete sessions', () => {
    expect(
      timeInBedMinutes({ nightDate: '2026-09-25', bedtime: '2026-09-24T23:35', wakeTime: '2026-09-25T07:10' }),
    ).toBe(455);
    expect(timeInBedMinutes({ nightDate: '2026-09-25', bedtime: '2026-09-24T23:35', wakeTime: null })).toBeNull();
    expect(sessionStatus({ nightDate: '2026-09-25', bedtime: null, wakeTime: '2026-09-25T07:10' })).toBe('incomplete');
  });

  it('warns about unusual but possible durations instead of rejecting', () => {
    expect(
      sessionWarnings({ nightDate: '2026-09-25', bedtime: '2026-09-25T05:00', wakeTime: '2026-09-25T07:00' }),
    ).toEqual(['short_night']);
    expect(
      sessionWarnings({ nightDate: '2026-09-25', bedtime: '2026-09-24T15:00', wakeTime: '2026-09-25T09:30' }),
    ).toEqual(['long_night']);
  });

  it('allows arbitrarily early historical bedtimes, with a warning instead of a rejection', () => {
    const bedOnly = { nightDate: '2026-09-25', bedtime: '2026-09-22T21:00', wakeTime: null };
    expect(validateSession(bedOnly)).toEqual([]);
    expect(sessionWarnings(bedOnly)).toEqual(['early_bedtime']);
    const complete = { nightDate: '2026-09-25', bedtime: '2026-09-23T21:00', wakeTime: '2026-09-25T07:00' };
    expect(validateSession(complete)).toEqual([]);
    expect(timeInBedMinutes(complete)).toBe(34 * 60);
    expect(sessionWarnings(complete)).toEqual(['long_night']);
    expect(sessionWarnings({ nightDate: '2026-09-25', bedtime: '2026-09-24T23:00', wakeTime: null })).toEqual([]);
  });

  it('assigns quick-logged endpoints to the night they end on', () => {
    expect(nightForBedtime('2026-09-24T23:35')).toBe('2026-09-25');
    expect(nightForBedtime('2026-09-25T00:40')).toBe('2026-09-25');
    expect(nightForWake('2026-09-25T07:10')).toBe('2026-09-25');
  });

  it('derives ordinary bedtime dates from clock times around midnight', () => {
    expect(resolveBedtime('2026-09-24', '23:30', '07:00')).toBe('2026-09-23T23:30');
    expect(resolveBedtime('2026-09-24', '01:30', '07:00')).toBe('2026-09-24T01:30');
    expect(resolveBedtime('2026-09-24', '00:00', '07:00')).toBe('2026-09-24T00:00');
    // Day sleepers: bedtime is the latest occurrence of its clock before wake-up.
    expect(resolveBedtime('2026-09-24', '08:00', '15:00')).toBe('2026-09-24T08:00');
    // Equal clocks are ambiguous (nothing, or a full day): never guessed.
    expect(inferBedtimeOffset('07:00', '07:00')).toBeNull();
    expect(resolveBedtime('2026-09-24', '07:00', '07:00')).toBeNull();
    // Without a wake-up, noon splits the evening before from after midnight.
    expect(inferBedtimeOffset('12:00', null)).toBe(-1);
    expect(inferBedtimeOffset('11:59', null)).toBe(0);
    expect(inferBedtimeOffset('22:40', null)).toBe(-1);
  });

  it('distinguishes an in-progress bedtime-only night from a stale one', () => {
    expect(openNightState('2026-09-24T22:40', '2026-09-24T22:30')).toBe('upcoming');
    expect(openNightState('2026-09-24T22:40', '2026-09-24T22:40')).toBe('in_progress');
    expect(openNightState('2026-09-24T22:40', '2026-09-25T06:55')).toBe('in_progress');
    expect(openNightState('2026-09-24T22:40', '2026-09-25T12:40')).toBe('in_progress');
    expect(openNightState('2026-09-24T22:40', '2026-09-25T12:41')).toBe('stale');
  });
});

import { describe, expect, it } from 'vitest';
import {
  nightForBedtime,
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

  it('assigns quick-logged endpoints to the night they end on', () => {
    expect(nightForBedtime('2026-09-24T23:35')).toBe('2026-09-25');
    expect(nightForBedtime('2026-09-25T00:40')).toBe('2026-09-25');
    expect(nightForWake('2026-09-25T07:10')).toBe('2026-09-25');
  });
});

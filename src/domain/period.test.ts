import { describe, expect, it } from 'vitest';
import { elapsedRange, periodRange, rangeLength, shiftPeriod } from './period';

describe('periods', () => {
  it('uses Monday–Sunday ISO weeks', () => {
    expect(periodRange({ kind: 'week', anchor: '2026-09-24' })).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(periodRange({ kind: 'week', anchor: '2026-09-27' })).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(periodRange({ kind: 'week', anchor: '2026-09-21' })).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    // ISO week spanning a year boundary.
    expect(periodRange({ kind: 'week', anchor: '2027-01-01' })).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('uses calendar months and years', () => {
    expect(periodRange({ kind: 'month', anchor: '2028-02-10' })).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange({ kind: 'year', anchor: '2026-09-24' })).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('rolling 7 days ends on and includes the anchor date', () => {
    const range = periodRange({ kind: 'rolling7', anchor: '2026-09-24' });
    expect(range).toEqual({ from: '2026-09-18', to: '2026-09-24' });
    expect(rangeLength(range)).toBe(7);
  });

  it('shifts periods', () => {
    expect(shiftPeriod({ kind: 'week', anchor: '2026-09-24' }, -1).anchor).toBe('2026-09-17');
    expect(shiftPeriod({ kind: 'month', anchor: '2026-03-31' }, -1).anchor).toBe('2026-02-28');
    expect(shiftPeriod({ kind: 'rolling7', anchor: '2026-09-24' }, -1).anchor).toBe('2026-09-17');
  });

  it('clips future nights out of coverage', () => {
    expect(elapsedRange({ from: '2026-09-21', to: '2026-09-27' }, '2026-09-24')).toEqual({
      from: '2026-09-21',
      to: '2026-09-24',
    });
    expect(elapsedRange({ from: '2026-10-01', to: '2026-10-31' }, '2026-09-24')).toBeNull();
  });
});

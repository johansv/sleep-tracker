import { describe, expect, it } from 'vitest';
import { circularDifference, circularMeanMinutes, summarizeClockTimes } from './circular';

const t = (hh: number, mm = 0) => hh * 60 + mm;

describe('circular clock statistics', () => {
  it('averages around midnight, never around noon', () => {
    expect(circularMeanMinutes([t(23, 30), t(0, 30)])).toBeCloseTo(0, 6);
    expect(circularMeanMinutes([t(23), t(1)])! % 1440).toBeCloseTo(0, 6);
  });

  it('matches the arithmetic mean for times on the same side of midnight', () => {
    expect(circularMeanMinutes([t(22), t(23)])).toBeCloseTo(t(22, 30), 6);
  });

  it('returns null when directions cancel or there is no data', () => {
    expect(circularMeanMinutes([])).toBeNull();
    expect(circularMeanMinutes([t(0), t(12)])).toBeNull();
  });

  it('computes shortest signed differences on the clock face', () => {
    expect(circularDifference(t(23, 30), t(0, 30))).toBe(60);
    expect(circularDifference(t(0, 30), t(23, 30))).toBe(-60);
  });

  it('reports variability as median absolute circular deviation in minutes', () => {
    const summary = summarizeClockTimes([t(23, 0), t(23, 30), t(0, 0), t(0, 30), t(1, 0)]);
    expect(summary.typicalMinutes).toBeCloseTo(0, 6);
    // Deviations 60, 30, 0, 30, 60 → median 30.
    expect(summary.variabilityMinutes).toBeCloseTo(30, 6);
    expect(summary.sampleCount).toBe(5);
  });
});

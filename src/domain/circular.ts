import { MINUTES_PER_DAY } from './civil';
import { median } from './numeric';

/**
 * Clock times are circular: 23:30 and 00:30 average to midnight, never to noon.
 * Values are minutes since local midnight in [0, 1440).
 */

const TAU = 2 * Math.PI;
/** Below this mean resultant length the directions cancel out and no typical time exists. */
const MIN_RESULTANT_LENGTH = 1e-6;

function toAngle(minutes: number): number {
  return (minutes / MINUTES_PER_DAY) * TAU;
}

function normalize(minutes: number): number {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Circular mean in minutes since midnight, or null when undefined (no data or cancelling). */
export function circularMeanMinutes(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sin = 0;
  let cos = 0;
  for (const v of values) {
    sin += Math.sin(toAngle(v));
    cos += Math.cos(toAngle(v));
  }
  if (Math.hypot(sin, cos) / values.length < MIN_RESULTANT_LENGTH) return null;
  return normalize((Math.atan2(sin, cos) / TAU) * MINUTES_PER_DAY);
}

/** Signed shortest difference `b − a` on the clock face, in (−720, 720]. */
export function circularDifference(a: number, b: number): number {
  const d = normalize(b - a);
  return d > MINUTES_PER_DAY / 2 ? d - MINUTES_PER_DAY : d;
}

/** Median absolute circular deviation (minutes) from `center`. */
export function medianAbsoluteCircularDeviation(values: readonly number[], center: number): number | null {
  return median(values.map((v) => Math.abs(circularDifference(center, v))));
}

export interface ClockSummary {
  /** Circular mean clock time as minutes since midnight. */
  typicalMinutes: number | null;
  /** Median absolute circular deviation from the typical time, in minutes. */
  variabilityMinutes: number | null;
  sampleCount: number;
}

export function summarizeClockTimes(values: readonly number[]): ClockSummary {
  const typical = circularMeanMinutes(values);
  return {
    typicalMinutes: typical,
    variabilityMinutes: typical === null ? null : medianAbsoluteCircularDeviation(values, typical),
    sampleCount: values.length,
  };
}

import type { Period, Session } from '../shared/models.ts';
import { clockMinutes, datesIn, duration, weekday } from './time.ts';

export const mean = (values: number[]) =>
  values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
export function circularMean(values: number[]): number | null {
  if (!values.length) return null;
  const sin = values.reduce((sum, n) => sum + Math.sin((n / 1440) * 2 * Math.PI), 0);
  const cos = values.reduce((sum, n) => sum + Math.cos((n / 1440) * 2 * Math.PI), 0);
  // Opposing times have no meaningful typical clock time.
  if (Math.hypot(sin, cos) / values.length < 1e-8) return null;
  return ((Math.atan2(sin, cos) / (2 * Math.PI)) * 1440 + 1440) % 1440;
}
export function variability(values: number[], typical: number | null): number | null {
  return typical === null
    ? null
    : median(values.map((n) => Math.min(Math.abs(n - typical), 1440 - Math.abs(n - typical))));
}
export function statistics(sessions: Session[], period: Period) {
  const dates = datesIn(period);
  const inPeriod = sessions.filter(
    (s) => s.night_date >= period.start && s.night_date <= period.end,
  );
  const complete = inPeriod.filter((s) => duration(s) !== null);
  const durations = complete.map((s) => duration(s)!);
  const beds = complete.map((s) => clockMinutes(s.bedtime_local!));
  const wakes = complete.map((s) => clockMinutes(s.wake_time_local!));
  const bedtime = circularMean(beds);
  const wake = circularMean(wakes);
  const byDate = new Map(inPeriod.map((s) => [s.night_date, s]));
  return {
    period,
    count: complete.length,
    total: dates.length,
    incomplete: inPeriod.length - complete.length,
    missing: dates.length - inPeriod.length,
    mean: mean(durations),
    median: median(durations),
    bedtime,
    wake,
    bedtimeVariability: variability(beds, bedtime),
    wakeVariability: variability(wakes, wake),
    trend: dates.map((date) => ({
      date,
      minutes: byDate.has(date) ? duration(byDate.get(date)!) : null,
      state: !byDate.has(date)
        ? 'missing'
        : duration(byDate.get(date)!) === null
          ? 'incomplete'
          : 'complete',
    })),
    weekdays: Array.from({ length: 7 }, (_, i) => {
      const subset = complete.filter((s) => weekday(s.night_date) === i + 1);
      return {
        day: i + 1,
        mean: mean(subset.map((s) => duration(s)!)),
        count: subset.length,
        total: dates.filter((d) => weekday(d) === i + 1).length,
      };
    }),
  };
}
export type Statistics = ReturnType<typeof statistics>;

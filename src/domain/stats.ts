import {
  addDays,
  civilMinutesBetween,
  datesInRange,
  isoWeekday,
  MINUTES_PER_DAY,
  minuteOfDay,
  timePart,
  type LocalDate,
} from './civil';
import { summarizeClockTimes, type ClockSummary } from './circular';
import { mean, median } from './numeric';
import { containsDate, type DateRange } from './period';
import { sessionStatus, timeInBedMinutes, type SessionEndpoints } from './session';

export type NightStatus = 'complete' | 'incomplete' | 'missing';

export interface NightPoint {
  date: LocalDate;
  status: NightStatus;
  /** Time in bed; only set for complete nights. */
  minutes: number | null;
  /**
   * Endpoint clock positions in minutes since noon, giving one continuous evening→morning axis
   * (18:00 = 360, 00:00 = 720, 07:00 = 1140). A complete night's wake-up is its bedtime plus its
   * duration (see `nightAxis`).
   */
  bedtimeOffset: number | null;
  wakeOffset: number | null;
}

export interface DurationSummary {
  meanMinutes: number | null;
  medianMinutes: number | null;
  minMinutes: number | null;
  maxMinutes: number | null;
  sampleCount: number;
}

export interface WeekdayStats {
  /** ISO weekday of the night date: Monday = 1 … Sunday = 7. */
  weekday: number;
  /** Nights of this weekday in the range (coverage denominator). */
  nights: number;
  completeNights: number;
  meanMinutes: number | null;
  medianMinutes: number | null;
  typicalBedtimeMinutes: number | null;
  typicalWakeMinutes: number | null;
}

export interface Coverage {
  /** Calendar nights in the range. */
  nights: number;
  completeNights: number;
  incompleteNights: number;
  missingNights: number;
}

export interface PeriodStats {
  range: DateRange;
  coverage: Coverage;
  duration: DurationSummary;
  bedtime: ClockSummary;
  wake: ClockSummary;
  weekdays: WeekdayStats[];
  series: NightPoint[];
}

export function axisOffset(nightDate: LocalDate, value: string): number {
  return civilMinutesBetween(`${addDays(nightDate, -1)}T12:00`, value);
}

const wrapDay = (minutes: number) => ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

/**
 * Where a night is drawn on the noon→noon clock axis used by timelines and charts. The axis shows
 * clock times, so an endpoint is placed by its clock and a complete night spans its real duration
 * from bedtime: 19:30 → 23:25 on the night date is drawn as an evening interval rather than falling
 * off the axis. Stored values and durations are untouched.
 */
export function nightAxis(s: SessionEndpoints): Pick<NightPoint, 'bedtimeOffset' | 'wakeOffset'> {
  const minutes = timeInBedMinutes(s);
  const bedtimeOffset = s.bedtime ? wrapDay(axisOffset(s.nightDate, s.bedtime)) : null;
  if (minutes !== null && bedtimeOffset !== null) return { bedtimeOffset, wakeOffset: bedtimeOffset + minutes };
  return { bedtimeOffset, wakeOffset: s.wakeTime ? wrapDay(axisOffset(s.nightDate, s.wakeTime)) : null };
}

function summarizeDurations(values: number[]): DurationSummary {
  return {
    meanMinutes: mean(values),
    medianMinutes: median(values),
    minMinutes: values.length ? Math.min(...values) : null,
    maxMinutes: values.length ? Math.max(...values) : null,
    sampleCount: values.length,
  };
}

/**
 * Aggregate one profile's sessions over a local-date range.
 * Only complete sessions contribute to statistics; dates without a session are missing,
 * never zero; every aggregate carries its sample count.
 */
export function computePeriodStats(sessions: readonly SessionEndpoints[], range: DateRange): PeriodStats {
  const byNight = new Map<LocalDate, SessionEndpoints>();
  for (const s of sessions) if (containsDate(range, s.nightDate)) byNight.set(s.nightDate, s);

  const series: NightPoint[] = datesInRange(range.from, range.to).map((date) => {
    const s = byNight.get(date);
    if (!s) return { date, status: 'missing', minutes: null, bedtimeOffset: null, wakeOffset: null };
    return {
      date,
      status: sessionStatus(s),
      minutes: timeInBedMinutes(s),
      ...nightAxis(s),
    };
  });

  const complete = series.filter((p) => p.status === 'complete');
  const completeSessions = complete.map((p) => byNight.get(p.date)!);

  const weekdays: WeekdayStats[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const nights = series.filter((p) => isoWeekday(p.date) === weekday);
    const done = completeSessions.filter((s) => isoWeekday(s.nightDate) === weekday);
    const minutes = done.map((s) => timeInBedMinutes(s)!);
    return {
      weekday,
      nights: nights.length,
      completeNights: done.length,
      meanMinutes: mean(minutes),
      medianMinutes: median(minutes),
      typicalBedtimeMinutes: summarizeClockTimes(done.map((s) => minuteOfDay(timePart(s.bedtime!)))).typicalMinutes,
      typicalWakeMinutes: summarizeClockTimes(done.map((s) => minuteOfDay(timePart(s.wakeTime!)))).typicalMinutes,
    };
  });

  return {
    range,
    coverage: {
      nights: series.length,
      completeNights: complete.length,
      incompleteNights: series.filter((p) => p.status === 'incomplete').length,
      missingNights: series.filter((p) => p.status === 'missing').length,
    },
    duration: summarizeDurations(complete.map((p) => p.minutes!)),
    bedtime: summarizeClockTimes(completeSessions.map((s) => minuteOfDay(timePart(s.bedtime!)))),
    wake: summarizeClockTimes(completeSessions.map((s) => minuteOfDay(timePart(s.wakeTime!)))),
    weekdays,
    series,
  };
}

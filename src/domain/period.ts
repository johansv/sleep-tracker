import { Temporal } from 'temporal-polyfill';
import { addDays, compareDates, daysBetween, type LocalDate } from './civil';

/** Inclusive local-date range. */
export interface DateRange {
  from: LocalDate;
  to: LocalDate;
}

/**
 * Period selectors. Every kind resolves to a plain `DateRange`, so rolling or custom
 * ranges can be added later without changing statistics or persistence.
 */
export type PeriodKind = 'week' | 'month' | 'year' | 'rolling7';

export interface Period {
  kind: PeriodKind;
  /** Any local date inside the calendar period, or the last date of a rolling period. */
  anchor: LocalDate;
}

export const PERIOD_KINDS: readonly PeriodKind[] = ['week', 'month', 'year', 'rolling7'];

export function periodRange({ kind, anchor }: Period): DateRange {
  const d = Temporal.PlainDate.from(anchor);
  switch (kind) {
    case 'week': {
      // ISO week: Monday–Sunday.
      const monday = d.subtract({ days: d.dayOfWeek - 1 });
      return { from: monday.toString(), to: monday.add({ days: 6 }).toString() };
    }
    case 'month': {
      const first = d.with({ day: 1 });
      return { from: first.toString(), to: first.add({ months: 1 }).subtract({ days: 1 }).toString() };
    }
    case 'year': {
      const first = d.with({ month: 1, day: 1 });
      return { from: first.toString(), to: first.with({ month: 12, day: 31 }).toString() };
    }
    case 'rolling7':
      // Seven local dates ending on (and including) the anchor date.
      return { from: addDays(anchor, -6), to: anchor };
  }
}

/** Move to the previous (-1) or next (+1) period of the same kind. */
export function shiftPeriod(period: Period, direction: -1 | 1): Period {
  const d = Temporal.PlainDate.from(period.anchor);
  switch (period.kind) {
    case 'week':
      return { ...period, anchor: d.add({ weeks: direction }).toString() };
    case 'month':
      return { ...period, anchor: d.add({ months: direction }).toString() };
    case 'year':
      return { ...period, anchor: d.add({ years: direction }).toString() };
    case 'rolling7':
      return { ...period, anchor: d.add({ days: 7 * direction }).toString() };
  }
}

export function containsDate(range: DateRange, date: LocalDate): boolean {
  return compareDates(range.from, date) <= 0 && compareDates(date, range.to) <= 0;
}

export function rangeLength(range: DateRange): number {
  return daysBetween(range.from, range.to) + 1;
}

/**
 * Nights after `today` have not happened yet and must not count as missing.
 * Returns null when the whole range lies in the future.
 */
export function elapsedRange(range: DateRange, today: LocalDate): DateRange | null {
  if (compareDates(range.from, today) > 0) return null;
  return compareDates(range.to, today) > 0 ? { from: range.from, to: today } : range;
}

export function isCurrentPeriod(period: Period, today: LocalDate): boolean {
  return containsDate(periodRange(period), today);
}

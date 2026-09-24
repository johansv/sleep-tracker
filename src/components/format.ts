import { Temporal } from 'temporal-polyfill';
import { clockFromMinuteOfDay, type LocalDate, type LocalDateTime } from '../domain/civil';
import type { DateRange } from '../domain/period';

/**
 * Presentation formatting. Display is 24-hour by default; a future AM/PM preference would live
 * here and never touch stored values or calculations.
 */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatDuration(minutes: number | null, style: 'long' | 'short' = 'long'): string {
  if (minutes === null) return '–';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (style === 'short') return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}`;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatClock(value: LocalDateTime | number | null): string {
  if (value === null) return '–';
  return typeof value === 'number' ? clockFromMinuteOfDay(value) : value.slice(11, 16);
}

export function formatVariability(minutes: number | null): string {
  return minutes === null ? '–' : `± ${Math.round(minutes)} min`;
}

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Dates are formatted from their civil fields directly: no Date objects, no time zones.
function parts(date: LocalDate) {
  const d = Temporal.PlainDate.from(date);
  return { day: d.day, month: d.month - 1, year: d.year, weekday: d.dayOfWeek - 1 };
}

/** "Thu 25 Sep" */
export function formatShortDate(date: LocalDate): string {
  const p = parts(date);
  return `${WEEKDAY_SHORT[p.weekday]} ${p.day} ${MONTHS_SHORT[p.month]}`;
}

/** "25 Sep" */
export function formatDayMonth(date: LocalDate): string {
  const p = parts(date);
  return `${p.day} ${MONTHS_SHORT[p.month]}`;
}

export function formatWeekdayShort(date: LocalDate): string {
  return WEEKDAY_SHORT[parts(date).weekday]!;
}

/** "September 2026" */
export function formatMonthYear(date: LocalDate): string {
  const p = parts(date);
  return `${MONTHS_LONG[p.month]} ${p.year}`;
}

export function formatMonthShort(date: LocalDate): string {
  return MONTHS_SHORT[parts(date).month]!;
}

/** "14–20 Sep 2026", "28 Sep – 4 Oct 2026", "29 Dec 2025 – 4 Jan 2026". */
export function formatRange({ from, to }: DateRange): string {
  const a = parts(from);
  const b = parts(to);
  const full = (p: typeof a) => `${p.day} ${MONTHS_SHORT[p.month]} ${p.year}`;
  if (from === to) return full(b);
  if (a.year === b.year && a.month === b.month) return `${a.day}–${full(b)}`;
  if (a.year === b.year) return `${a.day} ${MONTHS_SHORT[a.month]} – ${full(b)}`;
  return `${full(a)} – ${full(b)}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Axis offsets (minutes since noon of the previous day) → clock label. */
export function formatAxisOffset(offset: number): string {
  return clockFromMinuteOfDay(offset + 12 * 60);
}

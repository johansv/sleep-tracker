import { Temporal } from 'temporal-polyfill';

/**
 * Civil (wall-clock) date/time helpers.
 *
 * Sleep endpoints are local calendar date + local clock time with no zone or offset.
 * All arithmetic here uses Temporal Plain* types, so DST transitions and travel never
 * change stored values or durations: a DST night is just an ordinary wall-clock night.
 */

/** `YYYY-MM-DD` local calendar date. */
export type LocalDate = string;
/** `YYYY-MM-DDTHH:MM` local wall-clock date-time, never with `Z` or an offset. */
export type LocalDateTime = string;
/** `HH:MM` local clock time (24-hour). */
export type ClockTime = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export const MINUTES_PER_DAY = 1440;

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  try {
    Temporal.PlainDate.from(value, { overflow: 'reject' });
    return true;
  } catch {
    return false;
  }
}

export function isLocalDateTime(value: unknown): value is LocalDateTime {
  if (typeof value !== 'string' || !DATE_TIME_RE.test(value)) return false;
  try {
    Temporal.PlainDateTime.from(value, { overflow: 'reject' });
    return true;
  } catch {
    return false;
  }
}

export function isClockTime(value: unknown): value is ClockTime {
  if (typeof value !== 'string' || !TIME_RE.test(value)) return false;
  const [h, m] = value.split(':').map(Number);
  return h! < 24 && m! < 60;
}

export function datePart(value: LocalDateTime): LocalDate {
  return value.slice(0, 10);
}

export function timePart(value: LocalDateTime): ClockTime {
  return value.slice(11, 16);
}

export function combine(date: LocalDate, time: ClockTime): LocalDateTime {
  return `${date}T${time}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b), { largestUnit: 'days' }).days;
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return Temporal.PlainDate.compare(Temporal.PlainDate.from(a), Temporal.PlainDate.from(b));
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: LocalDate): number {
  return Temporal.PlainDate.from(date).dayOfWeek;
}

/** Inclusive list of dates from `from` to `to`. */
export function datesInRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  let d = Temporal.PlainDate.from(from);
  const end = Temporal.PlainDate.from(to);
  while (Temporal.PlainDate.compare(d, end) <= 0) {
    out.push(d.toString());
    d = d.add({ days: 1 });
  }
  return out;
}

/** Civil minutes from `start` to `end`; no timezone or DST adjustment is ever applied. */
export function civilMinutesBetween(start: LocalDateTime, end: LocalDateTime): number {
  const a = Temporal.PlainDateTime.from(start);
  const b = Temporal.PlainDateTime.from(end);
  return a.until(b, { largestUnit: 'minutes' }).minutes;
}

export function addMinutes(value: LocalDateTime, minutes: number): LocalDateTime {
  return Temporal.PlainDateTime.from(value).add({ minutes }).toString({ smallestUnit: 'minute' });
}

export function minuteOfDay(time: ClockTime): number {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

export function clockFromMinuteOfDay(minutes: number): ClockTime {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * The device's current local wall-clock date-time.
 *
 * The instant always comes from `Date.now()` and only the time zone from Temporal. temporal-polyfill
 * defers to native Temporal where a browser ships it, and native `Temporal.Now` does not follow
 * `Date` — so reading the instant here keeps one clock source everywhere (including controlled
 * test clocks).
 */
function nowPlainDateTime(): Temporal.PlainDateTime {
  return Temporal.Instant.fromEpochMilliseconds(Date.now())
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDateTime();
}

/** Current local wall-clock date-time of the device, truncated to the minute. */
export function nowLocal(): LocalDateTime {
  return nowPlainDateTime().toString({ smallestUnit: 'minute' });
}

export function todayLocal(): LocalDate {
  return nowPlainDateTime().toPlainDate().toString();
}

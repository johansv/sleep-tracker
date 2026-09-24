import { Temporal } from '@js-temporal/polyfill';
import type { Period, PeriodKind, SessionInput } from '../shared/models.ts';

export { Temporal };
export const today = () => Temporal.Now.plainDateISO().toString();
export const nowLocal = () => Temporal.Now.plainDateTimeISO().toString({ smallestUnit: 'minute' });
export const addDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();
export const weekday = (date: string) => Temporal.PlainDate.from(date).dayOfWeek;
export function datesIn({ start, end }: Period): string[] {
  const dates: string[] = [];
  const last = Temporal.PlainDate.from(end);
  for (
    let date = Temporal.PlainDate.from(start);
    Temporal.PlainDate.compare(date, last) <= 0;
    date = date.add({ days: 1 })
  ) {
    dates.push(date.toString());
    if (date.equals(last)) break;
  }
  return dates;
}
export function periodFor(kind: PeriodKind, anchor: string): Period {
  const date = Temporal.PlainDate.from(anchor);
  if (kind === 'rolling') return { start: addDays(anchor, -6), end: anchor };
  if (kind === 'week')
    return { start: addDays(anchor, 1 - date.dayOfWeek), end: addDays(anchor, 7 - date.dayOfWeek) };
  const start = kind === 'month' ? date.with({ day: 1 }) : date.with({ month: 1, day: 1 });
  return {
    start: start.toString(),
    end: start
      .add(kind === 'month' ? { months: 1 } : { years: 1 })
      .subtract({ days: 1 })
      .toString(),
  };
}
export function duration(session: SessionInput): number | null {
  if (!session.bedtime_local || !session.wake_time_local) return null;
  return Temporal.PlainDateTime.from(session.bedtime_local)
    .until(Temporal.PlainDateTime.from(session.wake_time_local))
    .total('minutes');
}
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)} h ${rounded % 60} min`;
}
export function formatClock(minutes: number | null): string {
  if (minutes === null) return '—';
  const rounded = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}
export const clockMinutes = (local: string) => {
  const time = Temporal.PlainDateTime.from(local);
  return time.hour * 60 + time.minute;
};
export const formatDate = (date: string, long = false) =>
  Temporal.PlainDate.from(date).toLocaleString('en-GB', {
    day: 'numeric',
    month: long ? 'long' : 'short',
    ...(long ? { year: 'numeric' } : {}),
  });

// Late evening belongs to the upcoming night; after midnight belongs to today.
export function suggestedNight(local: string): string {
  const date = Temporal.PlainDateTime.from(local);
  return date
    .toPlainDate()
    .add({ days: date.hour >= 12 ? 1 : 0 })
    .toString();
}

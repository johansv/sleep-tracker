import type { NightPoint } from '../../domain/stats';
import { formatDayMonth, formatMonthShort, formatWeekdayShort } from '../format';

/** Readable x-axis ticks for week (every day), month (weekly) and year (monthly) ranges. */
export function dateTicks(series: readonly NightPoint[]): string[] {
  if (series.length <= 10) return series.map((p) => p.date);
  if (series.length <= 45) return series.filter((_, i) => i % 7 === 0).map((p) => p.date);
  return series.filter((p) => p.date.endsWith('-01')).map((p) => p.date);
}

export function dateTickFormatter(series: readonly NightPoint[]) {
  return (date: string) => {
    if (series.length <= 10) return formatWeekdayShort(date);
    if (series.length <= 45) return formatDayMonth(date);
    return formatMonthShort(date);
  };
}

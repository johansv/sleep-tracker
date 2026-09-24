import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { datesInRange, isoWeekday, compareDates, type LocalDate } from '../domain/civil';
import { periodRange } from '../domain/period';
import { sessionStatus, timeInBedMinutes } from '../domain/session';
import { IconButton } from '../design/Button';
import type { SleepSession } from '../shared/api';
import { WEEKDAY_SHORT, formatDuration, formatMonthYear, formatShortDate } from './format';
import styles from './MonthCalendar.module.css';

export interface MonthCalendarProps {
  month: LocalDate;
  today: LocalDate;
  sessions: readonly SleepSession[];
  onSelectDate: (date: LocalDate) => void;
  /** Whether days without a record can be added (false for inactive profiles). */
  canAdd?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}

/** Month grid of nights (Mon–Sun). Fill encodes time in bed; status also has text/shape. */
export function MonthCalendar({
  month,
  today,
  sessions,
  onSelectDate,
  onPrev,
  onNext,
  canAdd = true,
}: MonthCalendarProps) {
  const range = periodRange({ kind: 'month', anchor: month });
  const byNight = new Map(sessions.map((s) => [s.nightDate, s]));
  const dates = datesInRange(range.from, range.to);
  const leading = isoWeekday(range.from) - 1;

  return (
    <div className={styles.calendar}>
      <div className={styles.header}>
        <h2 className={styles.title}>{formatMonthYear(month)}</h2>
        <div className={styles.nav}>
          <IconButton label="Previous month" icon={<ChevronLeft />} onClick={onPrev} disabled={!onPrev} />
          <IconButton label="Next month" icon={<ChevronRight />} onClick={onNext} disabled={!onNext} />
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.weekdays} aria-hidden="true">
          {WEEKDAY_SHORT.map((d) => (
            <span key={d} className={styles.weekday}>
              {d.charAt(0)}
            </span>
          ))}
        </div>
        <div className={styles.days}>
          {Array.from({ length: leading }, (_, i) => (
            <span key={`pad-${i}`} aria-hidden="true" />
          ))}
          {dates.map((date) => {
            const session = byNight.get(date);
            const unavailable = !session && (!canAdd || compareDates(date, today) > 0);
            const status = session ? sessionStatus(session) : 'missing';
            const minutes = session ? timeInBedMinutes(session) : null;
            const intensity = minutes === null ? 0 : Math.min(1, Math.max(0.25, (minutes - 300) / 300));
            const label = `${formatShortDate(date)}: ${
              status === 'complete' ? formatDuration(minutes) : status === 'incomplete' ? 'incomplete' : 'no record'
            }`;
            return (
              <button
                key={date}
                type="button"
                className={[styles.day, styles[status], date === today && styles.today].filter(Boolean).join(' ')}
                style={status === 'complete' ? ({ '--intensity': intensity } as CSSProperties) : undefined}
                aria-label={label}
                title={label}
                disabled={unavailable}
                onClick={() => onSelectDate(date)}
              >
                <span className="num">{Number(date.slice(8))}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <i className={[styles.swatch, styles.complete].join(' ')} style={{ '--intensity': 0.8 } as CSSProperties} />{' '}
          Complete
        </span>
        <span>
          <i className={[styles.swatch, styles.incomplete].join(' ')} /> Incomplete
        </span>
        <span>
          <i className={[styles.swatch, styles.missing].join(' ')} /> No record
        </span>
      </div>
    </div>
  );
}

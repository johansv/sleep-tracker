import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronDown, Plus } from 'lucide-react';
import { Temporal } from 'temporal-polyfill';
import { api } from '../../api/client';
import { useQuery } from '../../api/query';
import { MonthCalendar } from '../../components/MonthCalendar';
import { NightBar } from '../../components/NightBar';
import { NightStatusBadge } from '../../components/NightStatusBadge';
import {
  formatClock,
  formatDayMonth,
  formatDuration,
  formatMonthYear,
  formatShortDate,
  formatVariability,
  formatWeekdayShort,
} from '../../components/format';
import { addDays, compareDates, datePart, type LocalDate } from '../../domain/civil';
import { elapsedRange, periodRange } from '../../domain/period';
import { computePeriodStats, type NightPoint, type PeriodStats } from '../../domain/stats';
import { Button } from '../../design/Button';
import { LoadingBlock, Skeleton } from '../../design/Skeleton';
import { StateMessage } from '../../design/StateMessage';
import { Surface } from '../../design/Surface';
import type { Profile, SleepSession } from '../../shared/api';
import { useNightEditor } from '../NightEditor';
import { useNow } from '../useNow';
import { ErrorState, WithSelectedProfile } from './common';
import styles from './HistoryScreen.module.css';

/** Runs of this many missing nights or more collapse into one expandable row. */
const COLLAPSE_MISSING_RUN = 3;

export function HistoryScreen() {
  const { openEditor } = useNightEditor();
  const today = datePart(useNow());
  return (
    <WithSelectedProfile
      title="History"
      actions={(profile) =>
        profile.isActive ? (
          <Button variant="primary" size="sm" icon={<Plus />} onClick={() => openEditor({ profile, nightDate: today })}>
            Add night
          </Button>
        ) : null
      }
    >
      {(profile) => <HistoryForProfile key={profile.id} profile={profile} today={today} />}
    </WithSelectedProfile>
  );
}

function monthStart(date: LocalDate, monthsBack: number): LocalDate {
  return Temporal.PlainDate.from(date).with({ day: 1 }).subtract({ months: monthsBack }).toString();
}

function HistoryForProfile({ profile, today }: { profile: Profile; today: LocalDate }) {
  const [monthsBack, setMonthsBack] = useState(1);
  // Inactive profiles whose records ended long ago start at their latest record instead of today.
  const [end, setEnd] = useState<LocalDate | null>(null);
  const last = end ?? today;
  const from = monthStart(last, monthsBack);
  const to = addDays(last, 1);
  const query = useQuery(`sessions:${profile.id}:${from}:${to}`, () => api.listSessions(profile.id, { from, to }));
  const [selectedMonth, setCalendarMonth] = useState<LocalDate | null>(null);
  const calendarMonth = selectedMonth ?? monthStart(last, 0);

  if (query.status === 'success' && end === null && !profile.isActive) {
    const latest = query.data.latestNightDate;
    if (latest && compareDates(latest, from) < 0) setEnd(latest);
  }

  if (query.status === 'loading') {
    return (
      <LoadingBlock label="Loading history">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={64} radius="var(--radius-md)" />
        ))}
      </LoadingBlock>
    );
  }
  if (query.status === 'error') {
    return (
      <Surface>
        <ErrorState error={query.error} onRetry={query.retry} />
      </Surface>
    );
  }

  const { sessions, earliestNightDate } = query.data;
  if (!earliestNightDate) {
    return <EmptyHistory profile={profile} today={today} />;
  }
  const hasEarlier = compareDates(earliestNightDate, from) < 0;
  const ensureLoaded = (month: LocalDate) => {
    const needed = Temporal.PlainDate.from(monthStart(last, 0)).since(Temporal.PlainDate.from(month), {
      largestUnit: 'months',
    }).months;
    if (needed > monthsBack) setMonthsBack(needed);
  };

  return (
    <div className={styles.layout}>
      <div className={styles.list}>
        <HistoryList
          profile={profile}
          sessions={sessions}
          today={today}
          last={end}
          from={from}
          earliest={earliestNightDate}
        />
        {hasEarlier && (
          <Button variant="secondary" block icon={<ChevronDown />} onClick={() => setMonthsBack((m) => m + 2)}>
            Show earlier months
          </Button>
        )}
        {!hasEarlier && (
          <p className={styles.endNote}>First record: night ending {formatShortDate(earliestNightDate)}</p>
        )}
      </div>
      <aside className={styles.side} aria-label="Month overview">
        <MonthOverview
          profile={profile}
          month={calendarMonth}
          sessions={sessions}
          today={today}
          earliest={earliestNightDate}
          onMonthChange={(m) => {
            ensureLoaded(m);
            setCalendarMonth(m);
          }}
        />
      </aside>
    </div>
  );
}

function EmptyHistory({ profile, today }: { profile: Profile; today: LocalDate }) {
  const { openEditor } = useNightEditor();
  return (
    <Surface>
      <StateMessage
        icon={<CalendarPlus />}
        title={`No nights for ${profile.name} yet`}
        action={
          profile.isActive ? (
            <Button variant="primary" icon={<Plus />} onClick={() => openEditor({ profile, nightDate: today })}>
              Add a night
            </Button>
          ) : undefined
        }
      >
        Log tonight from the Today tab, or add past nights here.
      </StateMessage>
    </Surface>
  );
}

type Row =
  | { kind: 'night'; point: NightPoint; session: SleepSession }
  | { kind: 'missing'; date: LocalDate }
  | { kind: 'gap'; from: LocalDate; to: LocalDate; dates: LocalDate[] };

interface MonthGroup {
  month: LocalDate;
  stats: PeriodStats;
  rows: Row[];
}

function buildMonths(
  sessions: SleepSession[],
  today: LocalDate,
  end: LocalDate | null,
  from: LocalDate,
  earliest: LocalDate,
): MonthGroup[] {
  const byNight = new Map(sessions.map((s) => [s.nightDate, s]));
  const tomorrow = addDays(today, 1);
  const last = end ?? (byNight.has(tomorrow) ? tomorrow : today);
  const start = compareDates(earliest, from) > 0 ? earliest : from;
  const groups: MonthGroup[] = [];

  let month = monthStart(last, 0);
  while (compareDates(periodRange({ kind: 'month', anchor: month }).to, start) >= 0) {
    const range = periodRange({ kind: 'month', anchor: month });
    const visible = {
      from: compareDates(range.from, start) < 0 ? start : range.from,
      to: compareDates(range.to, last) > 0 ? last : range.to,
    };
    const statsRange = elapsedRange(visible, today) ?? visible;
    const stats = computePeriodStats(sessions, statsRange);
    const points = computePeriodStats(sessions, visible).series.slice().reverse();

    const rows: Row[] = [];
    let run: LocalDate[] = [];
    const flush = () => {
      if (run.length >= COLLAPSE_MISSING_RUN)
        rows.push({ kind: 'gap', from: run[run.length - 1]!, to: run[0]!, dates: run });
      else rows.push(...run.map((date) => ({ kind: 'missing' as const, date })));
      run = [];
    };
    for (const point of points) {
      const session = byNight.get(point.date);
      if (session) {
        flush();
        rows.push({ kind: 'night', point, session });
      } else {
        run.push(point.date);
      }
    }
    flush();
    groups.push({ month, stats, rows });
    month = monthStart(month, 1);
  }
  return groups;
}

function HistoryList({
  profile,
  sessions,
  today,
  last,
  from,
  earliest,
}: {
  profile: Profile;
  sessions: SleepSession[];
  today: LocalDate;
  last: LocalDate | null;
  from: LocalDate;
  earliest: LocalDate;
}) {
  const months = useMemo(
    () => buildMonths(sessions, today, last, from, earliest),
    [sessions, today, last, from, earliest],
  );
  return (
    <>
      {months.map((group) => (
        <section key={group.month} className={styles.month} aria-labelledby={`month-${group.month}`}>
          <header className={styles.monthHeader}>
            <h2 id={`month-${group.month}`} className={styles.monthTitle}>
              {formatMonthYear(group.month)}
            </h2>
            <p className={styles.monthMeta}>
              <span className="num">
                {group.stats.coverage.completeNights} of {group.stats.coverage.nights}
              </span>{' '}
              complete
              {group.stats.duration.meanMinutes !== null && (
                <>
                  {' · avg '}
                  <span className="num">{formatDuration(group.stats.duration.meanMinutes)}</span>
                </>
              )}
            </p>
          </header>
          <Surface padding="none">
            <ul className={styles.rows}>
              {group.rows.map((row) => (
                <HistoryRow
                  key={
                    row.kind === 'night' ? row.session.id : row.kind === 'gap' ? `gap-${row.to}` : `missing-${row.date}`
                  }
                  row={row}
                  profile={profile}
                />
              ))}
            </ul>
          </Surface>
        </section>
      ))}
    </>
  );
}

function DateBlock({ date }: { date: LocalDate }) {
  return (
    <span className={styles.dateBlock} aria-hidden="true">
      <span className={styles.dateWeekday}>{formatWeekdayShort(date)}</span>
      <span className={styles.dateDay}>{Number(date.slice(8, 10))}</span>
    </span>
  );
}

function HistoryRow({ row, profile }: { row: Row; profile: Profile }) {
  const { openEditor } = useNightEditor();
  const [expanded, setExpanded] = useState(false);

  if (row.kind === 'gap') {
    if (expanded) {
      return (
        <>
          {row.dates.map((date) => (
            <HistoryRow key={date} row={{ kind: 'missing', date }} profile={profile} />
          ))}
        </>
      );
    }
    return (
      <li>
        <button type="button" className={[styles.row, styles.gapRow].join(' ')} onClick={() => setExpanded(true)}>
          <span className={styles.gapLine} aria-hidden="true" />
          <span className={styles.rowMain}>
            <span className={styles.rowTitle}>{row.dates.length} nights without records</span>
            <span className={styles.rowMeta}>
              {formatDayMonth(row.from)} – {formatDayMonth(row.to)} · missing data is never counted as zero
            </span>
          </span>
          <span className={styles.rowAction}>Show</span>
        </button>
      </li>
    );
  }

  if (row.kind === 'missing') {
    if (!profile.isActive) {
      // Inactive profiles keep inspectable history but take no new nights.
      return (
        <li className={[styles.row, styles.missingRow].join(' ')}>
          <DateBlock date={row.date} />
          <span className={styles.rowMain}>
            <span className={styles.rowMuted}>No record</span>
          </span>
          <span className="visually-hidden">Night ending {formatShortDate(row.date)}: no record</span>
        </li>
      );
    }
    return (
      <li>
        <button
          type="button"
          className={[styles.row, styles.missingRow].join(' ')}
          onClick={() => openEditor({ profile, nightDate: row.date })}
          aria-label={`Night ending ${formatShortDate(row.date)}: no record. Add night`}
        >
          <DateBlock date={row.date} />
          <span className={styles.rowMain}>
            <span className={styles.rowMuted}>No record</span>
          </span>
          <span className={styles.rowAction}>
            <Plus aria-hidden="true" /> Add
          </span>
        </button>
      </li>
    );
  }

  const { point, session } = row;
  const complete = point.status === 'complete';
  const times = `${session.bedtime ? formatClock(session.bedtime) : '––:––'} → ${session.wakeTime ? formatClock(session.wakeTime) : '––:––'}`;
  return (
    <li>
      <button
        type="button"
        className={[styles.row, complete ? '' : styles.incompleteRow].join(' ')}
        onClick={() => openEditor({ profile, session })}
        aria-label={`Night ending ${formatShortDate(point.date)}: ${complete ? `${formatDuration(point.minutes)}, ` : 'incomplete, '}${times.replace('→', 'to')}. Edit`}
      >
        <DateBlock date={point.date} />
        <span className={styles.rowMain}>
          <span className={[styles.rowTimes, 'num'].join(' ')}>{times}</span>
          <NightBar status={point.status} bedtimeOffset={point.bedtimeOffset} wakeOffset={point.wakeOffset} />
        </span>
        <span className={styles.rowValue}>
          {complete ? (
            <span className="num">{formatDuration(point.minutes, 'short')}</span>
          ) : (
            <NightStatusBadge session={session} />
          )}
        </span>
      </button>
    </li>
  );
}

function MonthOverview({
  profile,
  month,
  sessions,
  today,
  earliest,
  onMonthChange,
}: {
  profile: Profile;
  month: LocalDate;
  sessions: SleepSession[];
  today: LocalDate;
  earliest: LocalDate;
  onMonthChange: (month: LocalDate) => void;
}) {
  const { openEditor } = useNightEditor();
  const range = periodRange({ kind: 'month', anchor: month });
  const elapsed = elapsedRange(range, today);
  const stats = elapsed ? computePeriodStats(sessions, elapsed) : null;
  const canGoBack = compareDates(range.from, earliest) > 0;
  const canGoForward = compareDates(range.to, today) < 0;
  return (
    <Surface padding="lg" className={styles.overview}>
      <MonthCalendar
        month={month}
        today={today}
        sessions={sessions}
        onPrev={canGoBack ? () => onMonthChange(monthStart(month, 1)) : undefined}
        onNext={canGoForward ? () => onMonthChange(monthStart(month, -1)) : undefined}
        canAdd={profile.isActive}
        onSelectDate={(date) => {
          const session = sessions.find((s) => s.nightDate === date);
          if (session) openEditor({ profile, session });
          else if (profile.isActive) openEditor({ profile, nightDate: date });
        }}
      />
      {stats && (
        <dl className={styles.overviewStats}>
          <div>
            <dt>Complete nights</dt>
            <dd className="num">
              {stats.coverage.completeNights} of {stats.coverage.nights}
            </dd>
          </div>
          <div>
            <dt>Average</dt>
            <dd className="num">{formatDuration(stats.duration.meanMinutes)}</dd>
          </div>
          <div>
            <dt>Typical bedtime</dt>
            <dd className="num">
              {formatClock(stats.bedtime.typicalMinutes)}{' '}
              <small>{formatVariability(stats.bedtime.variabilityMinutes)}</small>
            </dd>
          </div>
          <div>
            <dt>Typical wake-up</dt>
            <dd className="num">
              {formatClock(stats.wake.typicalMinutes)} <small>{formatVariability(stats.wake.variabilityMinutes)}</small>
            </dd>
          </div>
        </dl>
      )}
    </Surface>
  );
}

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { ChartNoAxesColumn, ChevronLeft, ChevronRight } from 'lucide-react';
import { Temporal } from 'temporal-polyfill';
import { api } from '../../api/client';
import { useQuery } from '../../api/query';
import { ClockRangeChart } from '../../components/charts/ClockRangeChart';
import { ComparisonChart } from '../../components/charts/ComparisonChart';
import { DurationChart } from '../../components/charts/DurationChart';
import { WeekdayChart } from '../../components/charts/WeekdayChart';
import { ProfileAvatar, identityColor } from '../../components/ProfileAvatar';
import {
  formatClock,
  formatDuration,
  formatMonthYear,
  formatRange,
  formatVariability,
  pluralize,
} from '../../components/format';
import { datePart, type LocalDate } from '../../domain/civil';
import {
  elapsedRange,
  isCurrentPeriod,
  periodRange,
  shiftPeriod,
  type DateRange,
  type Period,
  type PeriodKind,
} from '../../domain/period';
import type { PeriodStats } from '../../domain/stats';
import { IconButton } from '../../design/Button';
import { Segmented } from '../../design/Segmented';
import { LoadingBlock, Skeleton } from '../../design/Skeleton';
import { StateMessage } from '../../design/StateMessage';
import { SectionHeader, Surface } from '../../design/Surface';
import type { Profile } from '../../shared/api';
import { useProfiles } from '../ProfileContext';
import { useNow } from '../useNow';
import { ErrorState, WithSelectedProfile } from './common';
import styles from './InsightsScreen.module.css';

const PERIOD_OPTIONS: Array<{ value: PeriodKind; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'rolling7', label: '7 days' },
];

function periodTitle(period: Period, today: LocalDate): string {
  const range = periodRange(period);
  const current = isCurrentPeriod(period, today);
  switch (period.kind) {
    case 'week': {
      const week = Temporal.PlainDate.from(range.from).weekOfYear;
      return current ? 'This week' : `Week ${week}`;
    }
    case 'month':
      return formatMonthYear(range.from);
    case 'year':
      return String(Temporal.PlainDate.from(range.from).year);
    case 'rolling7':
      return range.to === today ? 'Last 7 days' : '7 days';
  }
}

export function InsightsScreen() {
  const today = datePart(useNow());
  const [period, setPeriod] = useState<Period>({ kind: 'week', anchor: today });
  return (
    <WithSelectedProfile title="Insights">
      {(profile) => <InsightsForProfile profile={profile} period={period} onPeriodChange={setPeriod} today={today} />}
    </WithSelectedProfile>
  );
}

function InsightsForProfile({
  profile,
  period,
  onPeriodChange,
  today,
}: {
  profile: Profile;
  period: Period;
  onPeriodChange: (period: Period) => void;
  today: LocalDate;
}) {
  const { profiles } = useProfiles();
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const comparable = profiles.filter((p) => p.isActive || p.id === profile.id);
  const compareIds = comparable.filter((p) => p.id === profile.id || !excluded.has(p.id)).map((p) => p.id);
  const ids = [profile.id, ...compareIds.filter((id) => id !== profile.id)];

  const fullRange = periodRange(period);
  const range = elapsedRange(fullRange, today) ?? fullRange;
  const clipped = range.to !== fullRange.to;
  const next = shiftPeriod(period, 1);
  const canGoForward = elapsedRange(periodRange(next), today) !== null;

  const key = `stats:${ids.join(',')}:${range.from}:${range.to}`;
  const query = useQuery(key, () => api.stats(ids, range));

  return (
    <div className={styles.page}>
      <div className={styles.controls}>
        <Segmented
          label="Period"
          options={PERIOD_OPTIONS}
          value={period.kind}
          onChange={(kind) => onPeriodChange({ kind, anchor: today })}
        />
        <div className={styles.periodNav}>
          <IconButton
            label="Previous period"
            icon={<ChevronLeft />}
            onClick={() => onPeriodChange(shiftPeriod(period, -1))}
          />
          <div className={styles.periodLabel} aria-live="polite">
            <span className={styles.periodTitle}>{periodTitle(period, today)}</span>
            <span className={styles.periodRange}>
              {formatRange(range)}
              {clipped && ' · so far'}
            </span>
          </div>
          <IconButton
            label="Next period"
            icon={<ChevronRight />}
            onClick={() => onPeriodChange(next)}
            disabled={!canGoForward}
          />
        </div>
      </div>

      {query.status === 'loading' && (
        <LoadingBlock label="Calculating statistics">
          <div className={styles.tiles}>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} height={104} radius="var(--radius-lg)" />
            ))}
          </div>
          <Skeleton height={280} radius="var(--radius-lg)" />
        </LoadingBlock>
      )}
      {query.status === 'error' && (
        <Surface>
          <ErrorState error={query.error} onRetry={query.retry} />
        </Surface>
      )}
      {query.status === 'success' && (
        <InsightsContent
          profile={profile}
          stats={query.data.profiles[0]!.stats}
          comparison={query.data.profiles.map((p) => ({
            profile: comparable.find((c) => c.id === p.profileId)!,
            stats: p.stats,
          }))}
          comparable={comparable}
          excluded={excluded}
          onToggleCompare={(id) =>
            setExcluded((prev) => {
              const nextSet = new Set(prev);
              if (nextSet.has(id)) nextSet.delete(id);
              else nextSet.add(id);
              return nextSet;
            })
          }
          range={range}
        />
      )}
    </div>
  );
}

function InsightsContent({
  profile,
  stats,
  comparison,
  comparable,
  excluded,
  onToggleCompare,
  range,
}: {
  profile: Profile;
  stats: PeriodStats;
  comparison: Array<{ profile: Profile; stats: PeriodStats }>;
  comparable: Profile[];
  excluded: ReadonlySet<string>;
  onToggleCompare: (id: string) => void;
  range: DateRange;
}) {
  const { coverage, duration, bedtime, wake } = stats;
  const hasData = coverage.completeNights > 0;
  const excludedCount = coverage.incompleteNights + coverage.missingNights;

  return (
    <>
      <p className={styles.coverageNote} data-testid="coverage-note">
        Based on{' '}
        <strong className="num">
          {coverage.completeNights} complete {coverage.completeNights === 1 ? 'night' : 'nights'} of {coverage.nights}
        </strong>
        {excludedCount > 0 && (
          <>
            {' · '}
            {[
              coverage.incompleteNights > 0 && `${pluralize(coverage.incompleteNights, 'incomplete night')}`,
              coverage.missingNights > 0 && `${pluralize(coverage.missingNights, 'night')} without records`,
            ]
              .filter(Boolean)
              .join(' and ')}{' '}
            not counted
          </>
        )}
      </p>

      <div className={styles.tiles}>
        <StatTile
          label="Avg in bed"
          value={formatDuration(duration.meanMinutes)}
          detail={`Median ${formatDuration(duration.medianMinutes)}`}
        />
        <StatTile
          label="Bedtime"
          value={formatClock(bedtime.typicalMinutes)}
          detail={
            bedtime.variabilityMinutes === null ? 'No data' : `Varies ${formatVariability(bedtime.variabilityMinutes)}`
          }
          accent="bedtime"
        />
        <StatTile
          label="Wake-up"
          value={formatClock(wake.typicalMinutes)}
          detail={wake.variabilityMinutes === null ? 'No data' : `Varies ${formatVariability(wake.variabilityMinutes)}`}
          accent="wake"
        />
        <StatTile
          label="Complete"
          value={`${coverage.completeNights} of ${coverage.nights}`}
          detail={
            <CoverageMeter
              complete={coverage.completeNights}
              incomplete={coverage.incompleteNights}
              total={coverage.nights}
            />
          }
        />
      </div>

      {hasData ? (
        <div className={styles.charts}>
          <Surface className={styles.wide} aria-labelledby="trend-title">
            <SectionHeader id="trend-title" title="Time in bed per night" />
            <DurationChart series={stats.series} meanMinutes={duration.meanMinutes} />
          </Surface>
          <Surface aria-labelledby="clock-title">
            <SectionHeader id="clock-title" title="Bedtime & wake-up" />
            <ClockRangeChart
              series={stats.series}
              typicalBedtime={bedtime.typicalMinutes}
              typicalWake={wake.typicalMinutes}
            />
          </Surface>
          <Surface aria-labelledby="weekday-title">
            <SectionHeader id="weekday-title" title="By weekday" />
            <WeekdayChart weekdays={stats.weekdays} />
          </Surface>
        </div>
      ) : (
        <Surface>
          <StateMessage icon={<ChartNoAxesColumn />} title="No complete nights in this period">
            Statistics use nights with both a bedtime and a wake-up. {formatRange(range)} has{' '}
            {pluralize(coverage.incompleteNights, 'incomplete night')} and {pluralize(coverage.missingNights, 'night')}{' '}
            without records.
          </StateMessage>
        </Surface>
      )}

      <Comparison
        profile={profile}
        comparison={comparison}
        comparable={comparable}
        excluded={excluded}
        onToggle={onToggleCompare}
      />
    </>
  );
}

function StatTile({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: ReactNode;
  accent?: 'bedtime' | 'wake';
}) {
  const id = useId();
  return (
    <Surface as="div" role="group" aria-labelledby={id} className={styles.tile}>
      <p id={id} className={styles.tileLabel}>
        {accent && <span className={[styles.tileDot, styles[accent]].join(' ')} aria-hidden="true" />}
        {label}
      </p>
      <p className={[styles.tileValue, 'num'].join(' ')}>{value}</p>
      <div className={styles.tileDetail}>{detail}</div>
    </Surface>
  );
}

function CoverageMeter({ complete, incomplete, total }: { complete: number; incomplete: number; total: number }) {
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  return (
    <span className={styles.meter} aria-hidden="true">
      <span className={styles.meterComplete} style={{ width: `${pct(complete)}%` }} />
      <span className={styles.meterIncomplete} style={{ width: `${pct(incomplete)}%` }} />
    </span>
  );
}

function Comparison({
  profile,
  comparison,
  comparable,
  excluded,
  onToggle,
}: {
  profile: Profile;
  comparison: Array<{ profile: Profile; stats: PeriodStats }>;
  comparable: Profile[];
  excluded: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const others = comparable.filter((p) => p.id !== profile.id);
  const rows = comparison;
  if (others.length === 0) return null;

  return (
    <Surface aria-labelledby="compare-title" className={styles.compare}>
      <SectionHeader id="compare-title" title="Compare people" />
      <div className={styles.compareToggles} role="group" aria-label="People to compare">
        {others.map((p) => (
          <label key={p.id} className={styles.compareToggle}>
            <input type="checkbox" checked={!excluded.has(p.id)} onChange={() => onToggle(p.id)} />
            <ProfileAvatar profile={p} size="sm" />
            {p.name}
          </label>
        ))}
      </div>
      {rows.length > 1 ? (
        <div className={styles.compareBody}>
          <div className={styles.compareChart}>
            <ComparisonChart
              data={rows.map((r) => ({
                name: r.profile.name,
                color: identityColor(r.profile),
                meanMinutes: r.stats.duration.meanMinutes,
              }))}
            />
          </div>
          <ul className={styles.compareList} aria-label="Comparison">
            {rows.map(({ profile: p, stats }) => (
              <li key={p.id} className={styles.compareRow} style={{ '--row-color': identityColor(p) } as CSSProperties}>
                <span className={styles.compareName}>
                  <ProfileAvatar profile={p} size="sm" />
                  {p.name}
                </span>
                <dl className={styles.compareStats}>
                  <div>
                    <dt>Average</dt>
                    <dd className="num">{formatDuration(stats.duration.meanMinutes)}</dd>
                  </div>
                  <div>
                    <dt>Bedtime</dt>
                    <dd className="num">
                      {formatClock(stats.bedtime.typicalMinutes)}{' '}
                      <small>{formatVariability(stats.bedtime.variabilityMinutes)}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Wake-up</dt>
                    <dd className="num">
                      {formatClock(stats.wake.typicalMinutes)}{' '}
                      <small>{formatVariability(stats.wake.variabilityMinutes)}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Complete</dt>
                    <dd className="num">
                      {stats.coverage.completeNights} of {stats.coverage.nights}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={styles.compareEmpty}>Select at least one other person to compare the same period.</p>
      )}
    </Surface>
  );
}

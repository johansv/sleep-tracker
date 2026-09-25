import { useMemo } from 'react';
import { ArrowRight, BedDouble, ChevronRight, Moon, Pencil, Sun, TriangleAlert } from 'lucide-react';
import { api } from '../../api/client';
import { invalidateAll, useQuery } from '../../api/query';
import { NightBar } from '../../components/NightBar';
import type { EditorSuggestion } from '../../components/SessionEditor';
import { formatClock, formatDuration, formatShortDate } from '../../components/format';
import { addDays, civilMinutesBetween, datePart, type LocalDate, type LocalDateTime } from '../../domain/civil';
import { periodRange } from '../../domain/period';
import {
  EVENING_STARTS_AT_HOUR,
  nightForBedtime,
  openNightState,
  sessionStatus,
  timeInBedMinutes,
} from '../../domain/session';
import { axisOffset, computePeriodStats } from '../../domain/stats';
import { Button } from '../../design/Button';
import { LoadingBlock, Skeleton } from '../../design/Skeleton';
import { Surface, SectionHeader } from '../../design/Surface';
import { useToast } from '../../design/Toast';
import type { Profile, SleepSession } from '../../shared/api';
import { useNightEditor } from '../NightEditor';
import { Link } from '../router';
import { useNow } from '../useNow';
import { ErrorState, WithSelectedProfile } from './common';
import styles from './TodayScreen.module.css';

const LOOKBACK_DAYS = 13;

export function TodayScreen() {
  return (
    <WithSelectedProfile title="Today">
      {(profile) => <TodayForProfile key={profile.id} profile={profile} />}
    </WithSelectedProfile>
  );
}

function TodayForProfile({ profile }: { profile: Profile }) {
  const now = useNow();
  const today = datePart(now);
  const from = addDays(today, -LOOKBACK_DAYS);
  const to = addDays(today, 1);
  const query = useQuery(`sessions:${profile.id}:${from}:${to}`, () =>
    api.listSessions(profile.id, { from, to }).then((r) => r.sessions),
  );

  if (query.status === 'loading') {
    return (
      <LoadingBlock label="Loading nights">
        <Skeleton height={260} radius="var(--radius-xl)" />
        <Skeleton height={140} radius="var(--radius-lg)" />
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
  return <TodayContent profile={profile} sessions={query.data} refreshing={query.refreshing} now={now} />;
}

function TodayContent({
  profile,
  sessions,
  refreshing,
  now,
}: {
  profile: Profile;
  sessions: SleepSession[];
  refreshing: boolean;
  now: LocalDateTime;
}) {
  const today = datePart(now);
  const hour = Number(now.slice(11, 13));
  const evening = hour >= EVENING_STARTS_AT_HOUR;
  const heroNight = evening ? addDays(today, 1) : today;
  const byNight = useMemo(() => new Map(sessions.map((s) => [s.nightDate, s])), [sessions]);
  const lastNight = evening ? byNight.get(today) : undefined;
  const { openEditor } = useNightEditor();

  const attention = sessions.filter(
    (s) => sessionStatus(s) === 'incomplete' && s.nightDate !== heroNight && !(evening && s.nightDate === today),
  );
  const week = computePeriodStats(sessions, periodRange({ kind: 'rolling7', anchor: today }));

  return (
    <div className={styles.layout}>
      <div className={styles.primary}>
        {profile.isActive ? (
          <Hero profile={profile} sessions={sessions} now={now} settling={refreshing} />
        ) : (
          <InactiveCard profile={profile} />
        )}
        {evening && (
          <LastNightCard
            night={today}
            session={lastNight}
            onOpen={() =>
              openEditor(lastNight ? { profile, session: lastNight } : { profile, nightDate: today, kind: 'past' })
            }
          />
        )}
      </div>
      <div className={styles.secondary}>
        {attention.length > 0 && (
          <Surface aria-labelledby="attention-title">
            <SectionHeader id="attention-title" title="Needs completing" />
            <ul className={styles.attentionList}>
              {attention.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={styles.attentionItem}
                    onClick={() => openEditor({ profile, session: s })}
                  >
                    <TriangleAlert aria-hidden="true" className={styles.warnIcon} />
                    <span className={styles.attentionText}>
                      <strong>Night ending {formatShortDate(s.nightDate)}</strong>
                      <span>
                        {s.bedtime
                          ? `Bedtime ${formatClock(s.bedtime)} · wake-up missing`
                          : `Wake-up ${formatClock(s.wakeTime)} · bedtime missing`}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className={styles.chevron} />
                  </button>
                </li>
              ))}
            </ul>
          </Surface>
        )}
        <Surface aria-labelledby="week-title">
          <SectionHeader
            id="week-title"
            title="Last 7 nights"
            action={
              <Link to="/insights" className={styles.textLink}>
                Insights <ArrowRight aria-hidden="true" />
              </Link>
            }
          />
          <div className={styles.weekSummary}>
            <div>
              <p className={styles.metricValue}>
                <span className="num">{formatDuration(week.duration.meanMinutes)}</span>
              </p>
              <p className={styles.metricLabel}>average time in bed</p>
            </div>
            <p className={styles.coverage}>
              <span className="num">
                {week.coverage.completeNights} of {week.coverage.nights}
              </span>{' '}
              complete nights
            </p>
          </div>
          <MiniWeek points={week.series} />
        </Surface>
      </div>
    </div>
  );
}

/**
 * The selected profile's current night. "Going to bed" and "I'm up" open the night editor with the
 * current time suggested; nothing is written until the user saves there.
 */
function Hero({
  profile,
  sessions,
  now,
  settling,
}: {
  profile: Profile;
  sessions: SleepSession[];
  now: LocalDateTime;
  /** The data is being refreshed; hold actions until it is current. */
  settling: boolean;
}) {
  const { openEditor } = useNightEditor();
  const hour = Number(now.slice(11, 13));
  const today = datePart(now);
  const night = nightForBedtime(now);
  const session = sessions.find((s) => s.nightDate === night);
  const nightIsToday = night === today;
  const open = (suggest?: EditorSuggestion) =>
    openEditor(session ? { profile, session, suggest } : { profile, nightDate: night, kind: 'current', suggest });

  const bedButton = (
    <Button
      variant="primary"
      size="lg"
      block
      icon={<Moon />}
      disabled={settling}
      onClick={() => open({ bedtime: now })}
    >
      Going to bed
    </Button>
  );
  const wakeButton = (
    <Button
      variant="primary"
      size="lg"
      block
      icon={<Sun />}
      disabled={settling}
      onClick={() => open({ wakeTime: now })}
    >
      I'm up
    </Button>
  );
  const editButton = (label = 'Edit times') => (
    <Button variant="ghost" icon={<Pencil />} disabled={settling} onClick={() => open()}>
      {label}
    </Button>
  );

  let content;
  if (!session) {
    const lateNight = hour < 5;
    const morning = !lateNight && hour < EVENING_STARTS_AT_HOUR;
    content = (
      <>
        <HeroIcon kind={morning ? 'sun' : 'moon'} />
        <h2 className={styles.heroTitle}>
          {morning ? `Good morning, ${profile.name}` : lateNight ? 'Still up?' : 'Ready for bed?'}
        </h2>
        <p className={styles.heroText}>
          {morning
            ? 'Log when you got up together with last night’s bedtime.'
            : 'Starts from the current time — adjust it before saving.'}
        </p>
        <div className={styles.heroActions}>
          {morning ? wakeButton : bedButton}
          <div className={styles.heroSecondary}>{editButton('Enter times')}</div>
        </div>
      </>
    );
  } else if (session.bedtime && !session.wakeTime && openNightState(session.bedtime, now) === 'stale') {
    content = (
      <>
        <HeroIcon kind="moon" />
        <p className={styles.heroEyebrow}>Wake-up missing</p>
        <p className={styles.heroValue}>
          <span className="num">{formatClock(session.bedtime)}</span>
        </p>
        <p className={styles.heroText}>Bedtime is recorded. Add when you got up to complete this night.</p>
        <div className={styles.heroActions}>
          <Button variant="primary" size="lg" block icon={<Sun />} disabled={settling} onClick={() => open()}>
            Add wake-up
          </Button>
        </div>
      </>
    );
  } else if (session.bedtime && !session.wakeTime) {
    const upcoming = openNightState(session.bedtime, now) === 'upcoming';
    content = (
      <>
        <HeroIcon kind="moon" />
        <p className={styles.heroEyebrow}>{upcoming ? 'Going to bed at' : 'In bed since'}</p>
        <p className={styles.heroValue}>
          <span className="num">{formatClock(session.bedtime)}</span>
        </p>
        {!upcoming && (
          <p className={styles.heroText}>
            <span className="num">{formatDuration(civilMinutesBetween(session.bedtime, now))}</span> in bed so far
          </p>
        )}
        <div className={styles.heroActions}>
          {nightIsToday ? wakeButton : <p className={styles.heroText}>Sleep well. Tap “I'm up” in the morning.</p>}
          <div className={styles.heroSecondary}>{editButton()}</div>
        </div>
      </>
    );
  } else if (!session.bedtime && session.wakeTime) {
    content = (
      <>
        <HeroIcon kind="sun" />
        <p className={styles.heroEyebrow}>Up at</p>
        <p className={styles.heroValue}>
          <span className="num">{formatClock(session.wakeTime)}</span>
        </p>
        <p className={styles.heroText}>Add your bedtime to complete this night.</p>
        <div className={styles.heroActions}>
          <Button variant="primary" size="lg" block icon={<Moon />} disabled={settling} onClick={() => open()}>
            Add bedtime
          </Button>
        </div>
      </>
    );
  } else {
    const minutes = timeInBedMinutes(session);
    content = (
      <>
        <HeroIcon kind="bed" />
        <p className={styles.heroEyebrow}>Time in bed</p>
        <p className={styles.heroValue}>
          <span className="num">{formatDuration(minutes)}</span>
        </p>
        <p className={styles.heroText}>
          <span className="num">
            {formatClock(session.bedtime)} → {formatClock(session.wakeTime)}
          </span>
        </p>
        <div className={styles.heroBar}>
          <NightBar
            status="complete"
            bedtimeOffset={axisOffset(session.nightDate, session.bedtime!)}
            wakeOffset={axisOffset(session.nightDate, session.wakeTime!)}
          />
          <div className={styles.heroBarLabels} aria-hidden="true">
            <span>18:00</span>
            <span>00:00</span>
            <span>12:00</span>
          </div>
        </div>
        <div className={styles.heroActions}>
          <div className={styles.heroSecondary}>{editButton()}</div>
        </div>
      </>
    );
  }

  return (
    <Surface tone="accent" padding="lg" className={styles.hero} aria-labelledby="hero-night">
      <p id="hero-night" className={styles.heroNight}>
        {profile.name} · night ending {formatShortDate(night)}
      </p>
      {content}
    </Surface>
  );
}

function HeroIcon({ kind }: { kind: 'moon' | 'sun' | 'bed' }) {
  const Icon = kind === 'moon' ? Moon : kind === 'sun' ? Sun : BedDouble;
  return (
    <span className={[styles.heroIcon, styles[kind]].join(' ')} aria-hidden="true">
      <Icon />
    </span>
  );
}

function InactiveCard({ profile }: { profile: Profile }) {
  const toast = useToast();
  return (
    <Surface padding="lg" className={styles.hero}>
      <h2 className={styles.heroTitle}>{profile.name} is inactive</h2>
      <p className={styles.heroText}>History stays available. Reactivate to log new nights.</p>
      <div className={styles.heroActions}>
        <Button
          variant="primary"
          onClick={() =>
            api.updateProfile(profile.id, { isActive: true }).then(
              () => invalidateAll(),
              (error: unknown) =>
                toast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not update.' }),
            )
          }
        >
          Reactivate {profile.name}
        </Button>
      </div>
    </Surface>
  );
}

function LastNightCard({
  night,
  session,
  onOpen,
}: {
  night: LocalDate;
  session: SleepSession | undefined;
  onOpen: () => void;
}) {
  const status = session ? sessionStatus(session) : 'missing';
  return (
    <Surface aria-labelledby="last-night-title">
      <SectionHeader id="last-night-title" title="Last night" />
      <button type="button" className={styles.lastNight} onClick={onOpen}>
        <span className={styles.lastNightMain}>
          <span className={styles.lastNightDate}>Night ending {formatShortDate(night)}</span>
          {status === 'complete' && session ? (
            <span className="num">
              {formatDuration(timeInBedMinutes(session))} · {formatClock(session.bedtime)} →{' '}
              {formatClock(session.wakeTime)}
            </span>
          ) : status === 'incomplete' && session ? (
            <span className={styles.warnText}>
              {session.bedtime ? 'Bedtime only — add your wake-up' : 'Wake-up only — add your bedtime'}
            </span>
          ) : (
            <span className={styles.mutedText}>No record — tap to add</span>
          )}
        </span>
        <ChevronRight aria-hidden="true" className={styles.chevron} />
      </button>
    </Surface>
  );
}

function MiniWeek({ points }: { points: ReturnType<typeof computePeriodStats>['series'] }) {
  const max = Math.max(10 * 60, ...points.map((p) => p.minutes ?? 0));
  return (
    <ol className={styles.miniWeek} aria-label="Time in bed per night">
      {points.map((p) => (
        <li key={p.date} className={styles.miniDay}>
          <span className={styles.miniTrack}>
            {p.status === 'complete' ? (
              <span className={styles.miniBar} style={{ height: `${((p.minutes ?? 0) / max) * 100}%` }} />
            ) : (
              <span className={p.status === 'incomplete' ? styles.miniIncomplete : styles.miniMissing} />
            )}
          </span>
          <span className={styles.miniLabel} aria-hidden="true">
            {formatShortDate(p.date).slice(0, 2)}
          </span>
          <span className="visually-hidden">
            {formatShortDate(p.date)}:{' '}
            {p.status === 'complete'
              ? formatDuration(p.minutes)
              : p.status === 'incomplete'
                ? 'incomplete'
                : 'no record'}
          </span>
        </li>
      ))}
    </ol>
  );
}

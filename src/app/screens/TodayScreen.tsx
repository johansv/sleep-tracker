import { useMemo, useState } from 'react';
import { ArrowRight, BedDouble, ChevronRight, Moon, Pencil, Sun, TriangleAlert } from 'lucide-react';
import { api } from '../../api/client';
import { invalidateAll, useQuery } from '../../api/query';
import { NightBar } from '../../components/NightBar';
import { formatClock, formatDuration, formatShortDate } from '../../components/format';
import { addDays, civilMinutesBetween, datePart, type LocalDate, type LocalDateTime } from '../../domain/civil';
import { periodRange } from '../../domain/period';
import { nightForBedtime, sessionStatus, timeInBedMinutes } from '../../domain/session';
import { axisOffset, computePeriodStats } from '../../domain/stats';
import { Button } from '../../design/Button';
import { LoadingBlock, Skeleton } from '../../design/Skeleton';
import { Surface, SectionHeader } from '../../design/Surface';
import { useToast } from '../../design/Toast';
import type { Profile, SessionBody, SleepSession } from '../../shared/api';
import { useNightEditor } from '../NightEditor';
import { Link } from '../router';
import { useNow } from '../useNow';
import { ErrorState, WithSelectedProfile } from './common';
import styles from './TodayScreen.module.css';

const LOOKBACK_DAYS = 13;

export function TodayScreen() {
  return <WithSelectedProfile title="Today">{(profile) => <TodayForProfile profile={profile} />}</WithSelectedProfile>;
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
  return <TodayContent profile={profile} sessions={query.data} now={now} />;
}

function TodayContent({ profile, sessions, now }: { profile: Profile; sessions: SleepSession[]; now: LocalDateTime }) {
  const today = datePart(now);
  const hour = Number(now.slice(11, 13));
  const evening = hour >= 15;
  const heroNight = evening ? addDays(today, 1) : today;
  const byNight = useMemo(() => new Map(sessions.map((s) => [s.nightDate, s])), [sessions]);
  const hero = byNight.get(heroNight);
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
          <HeroCard profile={profile} night={heroNight} session={hero} now={now} byNight={byNight} />
        ) : (
          <InactiveCard profile={profile} />
        )}
        {evening && (
          <LastNightCard
            night={today}
            session={lastNight}
            onOpen={() => openEditor(lastNight ? { profile, session: lastNight } : { profile, nightDate: today })}
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

function useQuickLog(profile: Profile, byNight: Map<LocalDate, SleepSession>) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const record = async (nightDate: LocalDate, patch: Partial<SessionBody>, label: string) => {
    const existing = byNight.get(nightDate);
    const body: SessionBody = {
      nightDate,
      bedtime: existing?.bedtime ?? null,
      wakeTime: existing?.wakeTime ?? null,
      ...patch,
    };
    setBusy(true);
    try {
      const saved = existing
        ? await api.updateSession(existing.id, body)
        : await api.createSession({ profileId: profile.id, ...body });
      invalidateAll();
      toast({
        tone: 'success',
        message: label,
        action: {
          label: 'Undo',
          onAction: () => {
            const revert = existing
              ? api.updateSession(saved.id, {
                  nightDate: existing.nightDate,
                  bedtime: existing.bedtime,
                  wakeTime: existing.wakeTime,
                })
              : api.deleteSession(saved.id);
            revert.then(invalidateAll, (error: unknown) =>
              toast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not undo.' }),
            );
          },
        },
      });
    } catch (error) {
      toast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    bedtimeNow: (now: LocalDateTime) =>
      record(nightForBedtime(now), { bedtime: now }, `Bedtime ${formatClock(now)} saved. Sleep well.`),
    wakeNow: (now: LocalDateTime) =>
      record(datePart(now), { wakeTime: now }, `Wake-up ${formatClock(now)} saved. Good morning!`),
  };
}

function HeroCard({
  profile,
  night,
  session,
  now,
  byNight,
}: {
  profile: Profile;
  night: LocalDate;
  session: SleepSession | undefined;
  now: LocalDateTime;
  byNight: Map<LocalDate, SleepSession>;
}) {
  const { openEditor } = useNightEditor();
  const quick = useQuickLog(profile, byNight);
  const hour = Number(now.slice(11, 13));
  const today = datePart(now);
  const nightIsToday = night === today;
  const edit = () => openEditor(session ? { profile, session } : { profile, nightDate: night });

  const bedButton = (primary: boolean) => (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      size={primary ? 'lg' : 'md'}
      block={primary}
      icon={<Moon />}
      busy={quick.busy}
      onClick={() => quick.bedtimeNow(now)}
    >
      Going to bed
    </Button>
  );
  const wakeButton = (primary: boolean) => (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      size={primary ? 'lg' : 'md'}
      block={primary}
      icon={<Sun />}
      busy={quick.busy}
      onClick={() => quick.wakeNow(now)}
    >
      I'm up
    </Button>
  );
  const editButton = (label = 'Edit times') => (
    <Button variant="ghost" icon={<Pencil />} onClick={edit}>
      {label}
    </Button>
  );

  let content;
  if (!session) {
    const lateNight = hour < 5;
    const morning = !lateNight && hour < 15;
    content = (
      <>
        <HeroIcon kind={morning ? 'sun' : 'moon'} />
        <h2 className={styles.heroTitle}>
          {morning ? `Good morning, ${profile.name}` : lateNight ? 'Still up?' : 'Ready for bed?'}
        </h2>
        <p className={styles.heroText}>
          {morning
            ? 'Log when you got up — you can add last night’s bedtime too.'
            : 'One tap records the time. You can adjust it afterwards.'}
        </p>
        <div className={styles.heroActions}>
          {morning ? wakeButton(true) : bedButton(true)}
          <div className={styles.heroSecondary}>
            {morning ? bedButton(false) : null}
            {editButton('Enter times')}
          </div>
        </div>
      </>
    );
  } else if (session.bedtime && !session.wakeTime) {
    const elapsed = civilMinutesBetween(session.bedtime, now);
    content = (
      <>
        <HeroIcon kind="moon" />
        <p className={styles.heroEyebrow}>In bed since</p>
        <p className={styles.heroValue}>
          <span className="num">{formatClock(session.bedtime)}</span>
        </p>
        {elapsed > 0 && elapsed < 20 * 60 && (
          <p className={styles.heroText}>
            <span className="num">{formatDuration(elapsed)}</span> so far
          </p>
        )}
        <div className={styles.heroActions}>
          {nightIsToday ? (
            wakeButton(true)
          ) : (
            <p className={styles.heroText}>Sleep well. Tap “I'm up” in the morning.</p>
          )}
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
          <Button variant="primary" size="lg" block icon={<Moon />} onClick={edit}>
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
        Night ending {formatShortDate(night)}
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

import { ArrowRight, Check, Moon, Sun } from 'lucide-react';
import {
  addDays,
  duration,
  formatDate,
  formatDuration,
  periodFor,
  Temporal,
  today,
} from '../domain/time';
import { statistics } from '../domain/statistics';
import type { Session } from '../shared/models';
import { NightRow } from '../components/NightRow';

export function Today({
  sessions,
  onEdit,
  onQuick,
  saving,
  onHistory,
  onInsights,
}: {
  sessions: Session[];
  onEdit: (d: string, s?: Session) => void;
  onQuick: (e: 'bed' | 'wake') => Promise<void>;
  saving: boolean;
  onHistory: () => void;
  onInsights: () => void;
}) {
  const date = today();
  const current = sessions.find((s) => s.night_date === date);
  const minutes = current ? duration(current) : null;
  const recent = statistics(sessions, periodFor('rolling', date));
  const unfinished = sessions.filter((s) => duration(s) === null);
  return (
    <div className="today-grid">
      <section className="night-hero">
        <div className="hero-top">
          <span className="pill">
            <span className="status-dot" />{' '}
            {minutes !== null
              ? 'NIGHT COMPLETE'
              : current
                ? 'A NIGHT IN PROGRESS'
                : 'A FRESH START'}
          </span>
          <Moon className="hero-moon" strokeWidth={1.1} />
        </div>
        <p className="hero-date">Night ending {formatDate(date)}</p>
        <h2>
          {minutes !== null
            ? formatDuration(minutes)
            : current
              ? 'A night to finish.'
              : 'How was your night?'}
        </h2>
        <p className="hero-description">
          {minutes !== null
            ? 'Time in bed. One more piece of your rhythm.'
            : current
              ? 'One time is saved. Add the other when you’re ready.'
              : 'Your next insight starts with a simple check-in.'}
        </p>
        <div className="hero-endpoints">
          <div>
            <Moon size={18} />
            <span>
              Bedtime<strong>{current?.bedtime_local?.slice(11) ?? '—'}</strong>
            </span>
          </div>
          <div>
            <Sun size={19} />
            <span>
              Wake-up<strong>{current?.wake_time_local?.slice(11) ?? '—'}</strong>
            </span>
          </div>
        </div>
        <button className="hero-link" onClick={() => onEdit(date, current)}>
          {current ? 'Review this night' : 'Add this night'}
          <ArrowRight size={18} />
        </button>
      </section>
      <section className="card check-in">
        <p className="eyebrow">RIGHT HERE, RIGHT NOW</p>
        <h2>A moment to check in</h2>
        <p className="muted">Save the current local time with a tap.</p>
        <button
          className="quick-action bed-action"
          disabled={saving}
          onClick={() => void onQuick('bed')}
        >
          <span className="action-icon">
            <Moon />
          </span>
          <span>
            <strong>I’m going to bed</strong>
            <small>Record bedtime now</small>
          </span>
          <ArrowRight size={19} />
        </button>
        <button className="quick-action" disabled={saving} onClick={() => void onQuick('wake')}>
          <span className="action-icon">
            <Sun />
          </span>
          <span>
            <strong>I’m up</strong>
            <small>Record wake-up now</small>
          </span>
          <ArrowRight size={19} />
        </button>
        <button className="text-button add-manually" onClick={() => onEdit(date, current)}>
          Or enter dates and times manually
        </button>
      </section>
      {unfinished.length > 0 && (
        <section className="unfinished-card">
          <span className="unfinished-icon">
            <Moon size={21} />
          </span>
          <div>
            <h3>
              {unfinished.length === 1
                ? 'One night needs a finishing touch'
                : `${unfinished.length} nights need a finishing touch`}
            </h3>
            <p>Incomplete nights stay out of your insights.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => onEdit(unfinished[0].night_date, unfinished[0])}
          >
            Complete {formatDate(unfinished[0].night_date)} <ArrowRight size={16} />
          </button>
        </section>
      )}
      <section className="card week-glance">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A LITTLE PERSPECTIVE</p>
            <h2>Your last seven nights</h2>
          </div>
          <button className="icon-button" aria-label="See insights" onClick={onInsights}>
            <ArrowRight />
          </button>
        </div>
        <div className="glance-values">
          <strong>{formatDuration(recent.mean)}</strong>
          <span>
            average time in bed
            <br />
            <b>{recent.count} complete nights of 7</b>
          </span>
        </div>
        <div className="night-dots">
          {recent.trend.map((t) => (
            <button
              key={t.date}
              aria-label={`${formatDate(t.date)}: ${t.state}${t.minutes === null ? '' : `, ${formatDuration(t.minutes)}`}`}
              onClick={() =>
                onEdit(
                  t.date,
                  sessions.find((s) => s.night_date === t.date),
                )
              }
            >
              <span className={`night-dot ${t.state}`}>
                {t.state === 'complete' ? (
                  <Check size={18} />
                ) : t.state === 'incomplete' ? (
                  <Moon size={17} />
                ) : (
                  '–'
                )}
              </span>
              <small>
                {Temporal.PlainDate.from(t.date).toLocaleString('en-GB', { weekday: 'short' })}
              </small>
            </button>
          ))}
        </div>
        <p className="helper">✓ Complete · ☾ Incomplete · – Missing</p>
      </section>
      <section className="card recent-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE SMALL DETAILS</p>
            <h2>Recent nights</h2>
          </div>
          <button className="text-button" onClick={onHistory}>
            View all <ArrowRight size={15} />
          </button>
        </div>
        {[0, -1, -2].map((offset) => {
          const d = addDays(date, offset);
          return (
            <NightRow
              key={d}
              date={d}
              session={sessions.find((s) => s.night_date === d)}
              onEdit={onEdit}
            />
          );
        })}
      </section>
    </div>
  );
}

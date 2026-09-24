import { datesIn, periodFor } from '../domain/time';
import { statistics } from '../domain/statistics';
import type { PeriodKind, Session } from '../shared/models';
import { NightRow } from '../components/NightRow';

export function HistoryView({
  sessions,
  kind,
  anchor,
  onEdit,
}: {
  sessions: Session[];
  kind: PeriodKind;
  anchor: string;
  onEdit: (d: string, s?: Session) => void;
}) {
  const stats = statistics(sessions, periodFor(kind, anchor));
  return (
    <section className="card history-card">
      <div className="section-heading">
        <div>
          <h2>A record of your nights</h2>
          <p className="helper">
            {stats.count} complete nights of {stats.total} · {stats.incomplete} incomplete ·{' '}
            {stats.missing} missing
          </p>
        </div>
        <span className="pill neutral">TIME IN BED</span>
      </div>
      <div className="history-list">
        {datesIn(stats.period)
          .reverse()
          .map((date) => (
            <NightRow
              key={date}
              date={date}
              session={sessions.find((s) => s.night_date === date)}
              onEdit={onEdit}
            />
          ))}
      </div>
    </section>
  );
}

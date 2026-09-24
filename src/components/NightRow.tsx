import { Check, ChevronRight, Moon } from 'lucide-react';
import { duration, formatDate, formatDuration } from '../domain/time';
import type { Session } from '../shared/models';

export function NightRow({
  date,
  session,
  onEdit,
}: {
  date: string;
  session?: Session;
  onEdit: (d: string, s?: Session) => void;
}) {
  const minutes = session ? duration(session) : null;
  return (
    <button
      className="night-row"
      onClick={() => onEdit(date, session)}
      aria-label={`${session ? 'Edit' : 'Add'} night ending ${date}`}
    >
      <span className={`row-symbol ${minutes !== null ? 'complete' : session ? 'incomplete' : ''}`}>
        {minutes !== null ? <Check size={17} /> : <Moon size={17} />}
      </span>
      <span className="night-row-date">
        <strong>{formatDate(date)}</strong>
        <small>
          {session
            ? `${session.bedtime_local?.slice(11) ?? '—'} → ${session.wake_time_local?.slice(11) ?? '—'}`
            : 'No record yet'}
        </small>
      </span>
      <span className="night-row-value">
        {minutes !== null ? (
          formatDuration(minutes)
        ) : session ? (
          <span className="status-label">Incomplete</span>
        ) : (
          <span className="muted">Missing</span>
        )}
      </span>
      <ChevronRight size={16} />
    </button>
  );
}

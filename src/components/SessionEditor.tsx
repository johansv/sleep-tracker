import { useState } from 'react';
import { Moon, Sun, Trash2 } from 'lucide-react';
import type { Session, SessionInput } from '../shared/models';
import { addDays, duration, formatDuration } from '../domain/time';
import { sessionSchema } from '../domain/validation';
import { api } from '../api/client';
import { Modal } from './Modal';

function clockInput(value: string) {
  // Numeric mobile keyboards do not have a colon key.
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

export function SessionEditor({
  profileId,
  date,
  session,
  onClose,
  onSaved,
}: {
  profileId: string;
  date: string;
  session?: Session;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [night, setNight] = useState(session?.night_date ?? date);
  const [bedDate, setBedDate] = useState(session?.bedtime_local?.slice(0, 10) ?? addDays(date, -1));
  const [bedTime, setBedTime] = useState(session?.bedtime_local?.slice(11) ?? '');
  const [wakeDate, setWakeDate] = useState(session?.wake_time_local?.slice(0, 10) ?? date);
  const [wakeTime, setWakeTime] = useState(session?.wake_time_local?.slice(11) ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const data: SessionInput = {
    night_date: night,
    bedtime_local: bedTime ? `${bedDate}T${bedTime}` : null,
    wake_time_local: wakeTime ? `${wakeDate}T${wakeTime}` : null,
  };
  const parsed = sessionSchema.safeParse(data);
  const minutes = parsed.success ? duration(parsed.data) : null;
  async function save() {
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(' '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.saveSession(profileId, data, session?.id);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api.deleteSession(profileId, session!.id);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={session ? 'Edit your night' : 'Add a night'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          Night ending
          <input
            type="date"
            value={night}
            required
            onChange={(e) => {
              setNight(e.target.value);
              setWakeDate(e.target.value);
            }}
          />
        </label>
        <p className="helper">
          A night belongs to the date you get up. Leave either time blank to finish it later.
        </p>
        <fieldset>
          <legend>
            <Moon size={17} /> Bedtime
          </legend>
          <div className="endpoint-fields">
            <label>
              Date
              <input
                aria-label="Bedtime date"
                type="date"
                required={Boolean(bedTime)}
                value={bedDate}
                onChange={(e) => setBedDate(e.target.value)}
              />
            </label>
            <label>
              Time · 24 h
              <input
                aria-label="Bedtime time"
                type="text"
                inputMode="numeric"
                placeholder="23:00"
                pattern="[0-2][0-9]:[0-5][0-9]"
                value={bedTime}
                onChange={(e) => setBedTime(clockInput(e.target.value))}
              />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>
            <Sun size={17} /> Wake-up
          </legend>
          <div className="endpoint-fields">
            <label>
              Date
              <input
                aria-label="Wake-up date"
                type="date"
                required={Boolean(wakeTime)}
                value={wakeDate}
                onChange={(e) => {
                  setWakeDate(e.target.value);
                  setNight(e.target.value);
                }}
              />
            </label>
            <label>
              Time · 24 h
              <input
                aria-label="Wake-up time"
                type="text"
                inputMode="numeric"
                placeholder="07:00"
                pattern="[0-2][0-9]:[0-5][0-9]"
                value={wakeTime}
                onChange={(e) => setWakeTime(clockInput(e.target.value))}
              />
            </label>
          </div>
        </fieldset>
        <div className="record-summary">
          <span>
            {minutes === null ? 'An unfinished night is still worth recording.' : 'Time in bed'}
          </span>
          {minutes !== null && <strong>{formatDuration(minutes)}</strong>}
        </div>
        {minutes !== null && (minutes < 120 || minutes > 960) && (
          <p className="notice">
            This is an unusually {minutes < 120 ? 'short' : 'long'} interval. Check the dates and
            times before saving.
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? 'Saving…' : 'Save night'}
        </button>
        {session && !deleting && (
          <button
            type="button"
            className="button text-button danger full"
            disabled={busy}
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={17} /> Delete night
          </button>
        )}
        {deleting && (
          <div className="delete-confirm">
            <p>Delete this night permanently? Its time in bed will be removed from insights.</p>
            <div className="button-row">
              <button
                type="button"
                className="button danger-fill"
                disabled={busy}
                onClick={() => void remove()}
              >
                Confirm delete
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                Keep night
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

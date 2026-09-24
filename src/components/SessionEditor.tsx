import { useId, useMemo, useState, type FormEvent } from 'react';
import { CircleAlert, Moon, Sun, Trash2, TriangleAlert } from 'lucide-react';
import { addDays, combine, datePart, daysBetween, isLocalDate, timePart, type LocalDate } from '../domain/civil';
import { sessionWarnings, timeInBedMinutes, validateSession, type SessionWarningCode } from '../domain/session';
import type { SessionBody } from '../shared/api';
import { Button } from '../design/Button';
import { Segmented } from '../design/Segmented';
import { Switch } from '../design/Switch';
import { TimeField } from './TimeField';
import { formatDuration, formatShortDate } from './format';
import styles from './SessionEditor.module.css';

export interface SessionEditorProps {
  /** Existing values, or a new night with a suggested date. */
  initial: SessionBody;
  isNew: boolean;
  /** Latest date that may be chosen as night date (usually tomorrow). */
  maxNightDate: LocalDate;
  onSubmit: (body: SessionBody) => Promise<void>;
  onDelete?: () => void;
  onCancel: () => void;
}

const WARNING_TEXT: Record<SessionWarningCode, string> = {
  short_night: 'That is a very short night. Double-check the times.',
  long_night: 'That is a very long time in bed. Double-check the dates.',
  early_bedtime: 'Bedtime is more than a day before the night ends.',
};

export function SessionEditor({ initial, isNew, maxNightDate, onSubmit, onDelete, onCancel }: SessionEditorProps) {
  const formId = useId();
  const [nightDate, setNightDate] = useState(initial.nightDate);
  const [hasBed, setHasBed] = useState(initial.bedtime !== null || isNew);
  const [bedOffset, setBedOffset] = useState(() =>
    initial.bedtime ? daysBetween(initial.nightDate, datePart(initial.bedtime)) : -1,
  );
  const [bedClock, setBedClock] = useState(initial.bedtime ? timePart(initial.bedtime) : '23:00');
  const [hasWake, setHasWake] = useState(initial.wakeTime !== null || isNew);
  const [wakeClock, setWakeClock] = useState(initial.wakeTime ? timePart(initial.wakeTime) : '07:00');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validDate = isLocalDate(nightDate);
  const body: SessionBody = {
    nightDate,
    bedtime: hasBed && validDate ? combine(addDays(nightDate, bedOffset), bedClock) : null,
    wakeTime: hasWake && validDate ? combine(nightDate, wakeClock) : null,
  };
  const issues = validDate ? validateSession(body) : [{ code: 'invalid_night_date', message: 'Choose a valid date.' }];
  const warnings = issues.length === 0 ? sessionWarnings(body) : [];
  const minutes = issues.length === 0 ? timeInBedMinutes(body) : null;

  const bedDayOptions = useMemo(() => {
    const offsets = [...new Set([-1, 0, bedOffset])].sort((a, b) => a - b);
    return offsets.map((offset) => ({
      value: String(offset),
      label: validDate ? formatShortDate(addDays(nightDate, offset)) : offset === 0 ? 'Same day' : 'Day before',
    }));
  }, [bedOffset, nightDate, validDate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (issues.length > 0) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await onSubmit(body);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Could not save this night.');
      setSubmitting(false);
    }
  };

  return (
    <form id={formId} className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.dateRow}>
        <span className={styles.label}>Night ending</span>
        <input
          type="date"
          className={styles.dateInput}
          value={nightDate}
          max={maxNightDate}
          required
          onChange={(event) => setNightDate(event.target.value)}
        />
      </label>

      <fieldset className={styles.endpoint}>
        <legend className="visually-hidden">Bedtime</legend>
        <div className={styles.endpointHeader}>
          <span className={[styles.endpointIcon, styles.bed].join(' ')} aria-hidden="true">
            <Moon />
          </span>
          <span className={styles.endpointTitle}>Went to bed</span>
          <Switch checked={hasBed} onChange={setHasBed} label="Bedtime recorded" />
        </div>
        {hasBed ? (
          <div className={styles.endpointBody}>
            <Segmented
              size="sm"
              label="Bedtime date"
              options={bedDayOptions}
              value={String(bedOffset)}
              onChange={(v) => setBedOffset(Number(v))}
            />
            <TimeField label="Bedtime" value={bedClock} onChange={setBedClock} />
          </div>
        ) : (
          <p className={styles.endpointEmpty}>Not recorded — the night stays incomplete.</p>
        )}
      </fieldset>

      <fieldset className={styles.endpoint}>
        <legend className="visually-hidden">Wake-up</legend>
        <div className={styles.endpointHeader}>
          <span className={[styles.endpointIcon, styles.wake].join(' ')} aria-hidden="true">
            <Sun />
          </span>
          <span className={styles.endpointTitle}>
            Got up{validDate && <span className={styles.endpointDate}> · {formatShortDate(nightDate)}</span>}
          </span>
          <Switch checked={hasWake} onChange={setHasWake} label="Wake-up recorded" />
        </div>
        {hasWake ? (
          <div className={styles.endpointBody}>
            <TimeField label="Wake-up" value={wakeClock} onChange={setWakeClock} />
          </div>
        ) : (
          <p className={styles.endpointEmpty}>Not recorded — the night stays incomplete.</p>
        )}
      </fieldset>

      <div className={styles.summary} aria-live="polite">
        {issues.length > 0 ? (
          <p className={[styles.message, styles.error].join(' ')}>
            <CircleAlert aria-hidden="true" /> {issues[0]!.message}
          </p>
        ) : minutes !== null ? (
          <p className={styles.duration}>
            <span className="num">{formatDuration(minutes)}</span> in bed
          </p>
        ) : (
          <p className={[styles.message, styles.warning].join(' ')}>
            <TriangleAlert aria-hidden="true" /> Incomplete nights are kept but not included in statistics.
          </p>
        )}
        {warnings.map((w) => (
          <p key={w} className={[styles.message, styles.warning].join(' ')}>
            <TriangleAlert aria-hidden="true" /> {WARNING_TEXT[w]}
          </p>
        ))}
        {serverError && (
          <p className={[styles.message, styles.error].join(' ')} role="alert">
            <CircleAlert aria-hidden="true" /> {serverError}
          </p>
        )}
      </div>

      <div className={styles.actions}>
        {!isNew && onDelete && (
          <Button variant="danger" icon={<Trash2 />} onClick={onDelete} className={styles.delete}>
            Delete
          </Button>
        )}
        <span className={styles.spacer} />
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" busy={submitting} disabled={issues.length > 0}>
          {isNew ? 'Save night' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

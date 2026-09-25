import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { CircleAlert, Info, Moon, Sun, Trash2, TriangleAlert } from 'lucide-react';
import {
  addDays,
  combine,
  datePart,
  daysBetween,
  isLocalDate,
  timePart,
  type ClockTime,
  type LocalDate,
  type LocalDateTime,
} from '../domain/civil';
import {
  inferBedtimeOffset,
  sessionWarnings,
  timeInBedMinutes,
  validateSession,
  type SessionEndpoints,
  type SessionWarningCode,
} from '../domain/session';
import type { SessionBody } from '../shared/api';
import { Button } from '../design/Button';
import { TimeField } from './TimeField';
import { formatDuration, formatShortDate } from './format';
import styles from './SessionEditor.module.css';

export interface EditorSuggestion {
  bedtime?: LocalDateTime;
  wakeTime?: LocalDateTime;
}

export interface SessionEditorProps {
  /** The persisted record being edited, or null for a new night. */
  recorded: SessionEndpoints | null;
  /** Night the editor opens on (the record's night when editing). */
  nightDate: LocalDate;
  /** Values proposed by the entry point (e.g. "now"); shown editable and never saved until Save. */
  suggest?: EditorSuggestion;
  /** A wake-up is required to save (a new past night is entered complete). */
  requireWake?: boolean;
  /** Whether the night itself can be changed here. */
  nightDateEditable?: boolean;
  /** Latest date that may be chosen as night date (usually tomorrow). */
  maxNightDate: LocalDate;
  onSubmit: (body: SessionBody) => Promise<void>;
  onDelete?: () => void;
  onCancel: () => void;
  /** Whose night this is (fixed; nights are never moved between people here). */
  person?: ReactNode;
  /** Context from the host (e.g. this person already has a record for the chosen night). */
  notice?: ReactNode;
  /** Host-side reason saving is not possible right now (lookup pending or conflict). */
  submitBlocked?: boolean;
  onNightDateChange?: (nightDate: LocalDate) => void;
}

const WARNING_TEXT: Record<SessionWarningCode, string> = {
  short_night: 'That is a very short night. Double-check the times.',
  long_night: 'That is a very long time in bed. Double-check the times and dates.',
  early_bedtime: 'Bedtime is more than a day before the night ends. Double-check the date.',
};

/** Where an endpoint's current value comes from, so unsaved values never pass as recorded facts. */
type EndpointState = 'missing' | 'recorded' | 'suggested' | 'unsaved' | 'removed';

const STATE_TEXT: Record<EndpointState, string> = {
  missing: 'Not recorded',
  recorded: 'Recorded',
  suggested: 'Suggested · not saved',
  unsaved: 'Not saved yet',
  removed: 'Will be removed',
};

function endpointState(
  value: LocalDateTime | null,
  recorded: LocalDateTime | null,
  suggested: LocalDateTime | undefined,
): EndpointState {
  if (value === null) return recorded !== null ? 'removed' : 'missing';
  if (value === recorded) return 'recorded';
  if (value === suggested) return 'suggested';
  return 'unsaved';
}

/** Day offset of a stored/suggested bedtime relative to the night it belongs to. */
function offsetOf(nightDate: LocalDate, bedtime: LocalDateTime): number {
  return daysBetween(nightDate, datePart(bedtime));
}

/**
 * Add/edit one night as "a night plus clock times". The bedtime's calendar date is derived for
 * ordinary overnight cases; a date that was already stored (or suggested) is kept as-is until the
 * bedtime itself is edited, and unusual dates stay reachable behind "Change date".
 */
export function SessionEditor({
  recorded,
  nightDate: initialNight,
  suggest,
  requireWake = false,
  nightDateEditable = true,
  maxNightDate,
  onSubmit,
  onDelete,
  onCancel,
  person,
  notice,
  submitBlocked,
  onNightDateChange,
}: SessionEditorProps) {
  const formId = useId();
  const bedDateId = useId();
  const isNew = recorded === null;
  const initialBed = recorded?.bedtime ?? suggest?.bedtime ?? null;
  const initialWake = recorded?.wakeTime ?? suggest?.wakeTime ?? null;

  const [nightDate, setNightDate] = useState(initialNight);
  const [bedClock, setBedClock] = useState<ClockTime | null>(initialBed ? timePart(initialBed) : null);
  // A known bedtime date is kept (null = derive it from the clock times).
  const [bedOffset, setBedOffset] = useState<number | null>(initialBed ? offsetOf(initialNight, initialBed) : null);
  // An unusual date, or one chosen by hand, survives edits to the bedtime clock.
  const [bedDateManual, setBedDateManual] = useState(bedOffset !== null && bedOffset < -1);
  const [wakeClock, setWakeClock] = useState<ClockTime | null>(initialWake ? timePart(initialWake) : null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validDate = isLocalDate(nightDate);
  const effectiveOffset = bedClock === null ? null : (bedOffset ?? inferBedtimeOffset(bedClock, wakeClock));
  const bedtime = validDate && bedClock !== null ? combine(addDays(nightDate, effectiveOffset!), bedClock) : null;
  const wakeTime = validDate && wakeClock !== null ? combine(nightDate, wakeClock) : null;
  const body: SessionBody = { nightDate, bedtime, wakeTime };

  const bedState = endpointState(bedtime, recorded?.bedtime ?? null, suggest?.bedtime);
  const wakeState = endpointState(wakeTime, recorded?.wakeTime ?? null, suggest?.wakeTime);

  // Missing required input is guidance, not an error; impossible combinations are errors.
  let needs: string | null = null;
  let error: string | null = null;
  if (!validDate) error = 'Choose a valid night.';
  else if (bedClock === null) {
    needs =
      wakeClock !== null
        ? 'Add the bedtime to save this night.'
        : 'Add a bedtime to save — the wake-up can follow later.';
    if (requireWake) needs = 'Add the bedtime and wake-up to save this night.';
  } else if (requireWake && wakeClock === null) needs = 'Add the wake-up time to save this night.';
  else error = validateSession(body)[0]?.message ?? null;

  const savable = needs === null && error === null;
  const warnings = savable ? sessionWarnings(body) : [];
  const minutes = savable ? timeInBedMinutes(body) : null;

  const changeBedClock = (clock: ClockTime) => {
    setBedClock(clock);
    // Editing the bedtime re-derives an ordinary date; a deliberately unusual one is kept.
    if (!bedDateManual) setBedOffset(null);
  };

  const changeNight = (value: string) => {
    setNightDate(value);
    if (isLocalDate(value)) onNightDateChange?.(value);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!savable || submitBlocked) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await onSubmit(body);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save this night.');
      setSubmitting(false);
    }
  };

  return (
    <form id={formId} onSubmit={submit} noValidate>
      {/* While saving, everything is locked so the sheet never shows values other than those being written. */}
      <fieldset className={styles.form} disabled={submitting} aria-busy={submitting || undefined}>
        {person}
        {nightDateEditable ? (
          <label className={styles.dateRow}>
            <span className={styles.label}>Night ending</span>
            <input
              type="date"
              className={styles.dateInput}
              value={nightDate}
              max={maxNightDate}
              required
              onChange={(event) => changeNight(event.target.value)}
            />
          </label>
        ) : (
          <p className={styles.dateRow}>
            <span className={styles.label}>Night ending</span>
            <span className={styles.nightFixed}>{formatShortDate(nightDate)}</span>
          </p>
        )}
        {notice}

        <Endpoint kind="bed" title="Went to bed" date={bedtime ? datePart(bedtime) : null} state={bedState}>
          <TimeField label="Bedtime" value={bedClock} onChange={changeBedClock} emptyStart="22:00" />
          {bedClock !== null && validDate && (
            <>
              {bedDateManual ? (
                <label className={styles.dateRow} htmlFor={bedDateId}>
                  <span className={styles.label}>Bedtime date</span>
                  <input
                    id={bedDateId}
                    type="date"
                    className={styles.dateInput}
                    value={addDays(nightDate, effectiveOffset!)}
                    max={nightDate}
                    onChange={(event) => {
                      if (isLocalDate(event.target.value)) setBedOffset(daysBetween(nightDate, event.target.value));
                    }}
                  />
                </label>
              ) : (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => {
                    setBedOffset(effectiveOffset);
                    setBedDateManual(true);
                  }}
                >
                  Change bedtime date
                </button>
              )}
            </>
          )}
        </Endpoint>

        <Endpoint
          kind="wake"
          title="Got up"
          date={validDate ? nightDate : null}
          state={wakeState}
          onClear={() => setWakeClock(null)}
          onRestore={recorded?.wakeTime ? () => setWakeClock(timePart(recorded.wakeTime!)) : undefined}
        >
          <TimeField label="Wake-up" value={wakeClock} onChange={setWakeClock} emptyStart="07:00" />
        </Endpoint>

        <div className={styles.summary} aria-live="polite">
          {error ? (
            <p className={[styles.message, styles.error].join(' ')}>
              <CircleAlert aria-hidden="true" /> {error}
            </p>
          ) : needs ? (
            <p className={[styles.message, styles.hint].join(' ')}>
              <Info aria-hidden="true" /> {needs}
            </p>
          ) : minutes !== null ? (
            <p className={styles.duration}>
              <span className="num">{formatDuration(minutes)}</span> in bed
            </p>
          ) : (
            <p className={[styles.message, styles.hint].join(' ')}>
              <Moon aria-hidden="true" /> Saved as in progress — add the wake-up later. Incomplete nights are not
              included in statistics.
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
              Delete <span className={styles.deleteNoun}>night</span>
            </Button>
          )}
          <span className={styles.spacer} />
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" busy={submitting} disabled={!savable || submitBlocked}>
            {warnings.length > 0 ? 'Save anyway' : isNew ? 'Save night' : 'Save'}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function Endpoint({
  kind,
  title,
  date,
  state,
  onClear,
  onRestore,
  children,
}: {
  kind: 'bed' | 'wake';
  title: string;
  date: LocalDate | null;
  state: EndpointState;
  /** Omitted for the bedtime: every saved night has one, so it is edited rather than removed. */
  onClear?: () => void;
  onRestore?: () => void;
  children: ReactNode;
}) {
  const empty = state === 'missing' || state === 'removed';
  return (
    <fieldset className={[styles.endpoint, empty ? styles.endpointEmpty : ''].join(' ')}>
      <legend className="visually-hidden">{title}</legend>
      <div className={styles.endpointHeader}>
        <span className={[styles.endpointIcon, styles[kind]].join(' ')} aria-hidden="true">
          {kind === 'bed' ? <Moon /> : <Sun />}
        </span>
        <span className={styles.endpointTitle}>
          {title}
          {date && <span className={styles.endpointDate}>{formatShortDate(date)}</span>}
        </span>
        <span className={[styles.state, styles[state]].join(' ')}>{STATE_TEXT[state]}</span>
      </div>
      <div className={styles.endpointBody}>{children}</div>
      {state === 'removed' && onRestore ? (
        <button type="button" className={styles.textButton} onClick={onRestore}>
          Keep the recorded {kind === 'bed' ? 'bedtime' : 'wake-up'}
        </button>
      ) : (
        !empty &&
        onClear && (
          <button type="button" className={styles.textButton} onClick={onClear}>
            {state === 'recorded' ? 'Remove' : 'Clear'} {kind === 'bed' ? 'bedtime' : 'wake-up'}
          </button>
        )
      )}
    </fieldset>
  );
}

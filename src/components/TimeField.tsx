import { useId, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { clockFromMinuteOfDay, isClockTime, minuteOfDay, type ClockTime } from '../domain/civil';
import styles from './TimeField.module.css';

/**
 * Parse relaxed 24-hour input: "7", "730", "0730", "7:30", "07.30", "23 35".
 * Returns null when the text is not a valid clock time.
 */
export function parseClockInput(text: string): ClockTime | null {
  const trimmed = text.trim();
  let h: string;
  let m: string;
  const separated = /^(\d{1,2})\s*[:.\sh]\s*(\d{2})$/.exec(trimmed);
  if (separated) {
    h = separated[1]!;
    m = separated[2]!;
  } else if (/^\d{1,2}$/.test(trimmed)) {
    h = trimmed;
    m = '00';
  } else if (/^\d{3,4}$/.test(trimmed)) {
    h = trimmed.slice(0, trimmed.length - 2);
    m = trimmed.slice(-2);
  } else {
    return null;
  }
  const value = `${h.padStart(2, '0')}:${m}`;
  return isClockTime(value) ? value : null;
}

export interface TimeFieldProps {
  label: string;
  /** Null when nothing is entered: the field stays visibly empty rather than showing a guess. */
  value: ClockTime | null;
  onChange: (value: ClockTime) => void;
  /** Minutes per step for the − / + buttons. */
  step?: number;
  /** Value the first − / + tap on an empty field starts from. */
  emptyStart?: ClockTime;
}

/** 24-hour time entry with large step buttons for quick one-handed adjustment. */
export function TimeField({ label, value, onChange, step = 5, emptyStart = '12:00' }: TimeFieldProps) {
  const id = useId();
  const [text, setText] = useState(value ?? '');
  const [invalid, setInvalid] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);

  // Adopt external changes (steppers, parent resets) during render.
  if (syncedValue !== value) {
    setSyncedValue(value);
    setText(value ?? '');
    setInvalid(false);
  }

  const commit = () => {
    if (text.trim() === '') {
      // Emptying the text is not a value; removing an endpoint is an explicit action elsewhere.
      setInvalid(false);
      setText(value ?? '');
      return;
    }
    const parsed = parseClockInput(text);
    if (parsed) {
      setInvalid(false);
      setText(parsed);
      if (parsed !== value) onChange(parsed);
    } else {
      setInvalid(true);
    }
  };

  const stepBy = (delta: number) => {
    const current = parseClockInput(text) ?? value;
    if (current === null) {
      onChange(emptyStart);
      return;
    }
    const base = minuteOfDay(current);
    // Snap to the step grid first so 07:12 → 07:15 / 07:10.
    const snapped = delta > 0 ? Math.floor(base / step) * step + step : Math.ceil(base / step) * step - step;
    onChange(clockFromMinuteOfDay(snapped));
  };

  return (
    <div className={styles.field}>
      <IconStep label={`${label} ${step} minutes earlier`} onClick={() => stepBy(-step)}>
        <Minus />
      </IconStep>
      <input
        id={id}
        className={styles.input}
        aria-label={label}
        aria-invalid={invalid || undefined}
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={5}
        placeholder="––:––"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      <IconStep label={`${label} ${step} minutes later`} onClick={() => stepBy(step)}>
        <Plus />
      </IconStep>
      {invalid && (
        <p className={styles.error} role="alert">
          Use 24-hour time, e.g. 23:35
        </p>
      )}
    </div>
  );
}

function IconStep({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={styles.step} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

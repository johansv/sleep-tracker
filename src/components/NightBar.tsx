import type { NightStatus } from '../domain/stats';
import styles from './NightBar.module.css';

/** Axis window: 18:00 the evening before → 12:00 on the night date (offsets since previous noon). */
export const AXIS_START = 6 * 60;
export const AXIS_END = 24 * 60;

function position(offset: number): number {
  const clamped = Math.min(AXIS_END, Math.max(AXIS_START, offset));
  return ((clamped - AXIS_START) / (AXIS_END - AXIS_START)) * 100;
}

export interface NightBarProps {
  status: NightStatus;
  bedtimeOffset: number | null;
  wakeOffset: number | null;
}

/** Compact evening→morning timeline for one night. Decorative: the row carries the text. */
export function NightBar({ status, bedtimeOffset, wakeOffset }: NightBarProps) {
  return (
    <div className={styles.track} aria-hidden="true">
      <span className={styles.midnight} style={{ left: `${position(24 * 60 - 12 * 60)}%` }} />
      {status === 'complete' && bedtimeOffset !== null && wakeOffset !== null && (
        <span
          className={styles.bar}
          style={{ left: `${position(bedtimeOffset)}%`, right: `${100 - position(wakeOffset)}%` }}
        />
      )}
      {status === 'incomplete' && bedtimeOffset !== null && (
        <span className={[styles.dot, styles.bed].join(' ')} style={{ left: `${position(bedtimeOffset)}%` }} />
      )}
      {status === 'incomplete' && wakeOffset !== null && (
        <span className={[styles.dot, styles.wake].join(' ')} style={{ left: `${position(wakeOffset)}%` }} />
      )}
    </div>
  );
}

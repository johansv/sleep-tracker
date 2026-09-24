import { Moon, Sun } from 'lucide-react';
import type { SleepSession } from '../shared/api';
import styles from './NightStatusBadge.module.css';

/** Labels an incomplete night with text + icon (never color alone). */
export function NightStatusBadge({ session }: { session: Pick<SleepSession, 'bedtime' | 'wakeTime'> }) {
  const bedOnly = session.bedtime !== null && session.wakeTime === null;
  return (
    <span className={styles.badge}>
      {bedOnly ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
      {bedOnly ? 'Bedtime only' : 'Wake-up only'}
    </span>
  );
}

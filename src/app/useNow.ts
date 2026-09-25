import { useEffect, useState } from 'react';
import { nowLocal, type LocalDateTime } from '../domain/civil';

/** Current local wall-clock time, refreshed periodically and when the app becomes visible. */
export function useNow(intervalMs = 30_000): LocalDateTime {
  const [now, setNow] = useState(nowLocal);
  useEffect(() => {
    const tick = () => setNow(nowLocal());
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
  return now;
}

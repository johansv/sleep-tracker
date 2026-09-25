import type { ReactNode } from 'react';
import styles from './charts.module.css';

export function TooltipCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{title}</div>
      {children}
    </div>
  );
}

export function TooltipRow({ label, value, swatch }: { label: string; value: ReactNode; swatch?: string }) {
  return (
    <div className={styles.tooltipRow}>
      {swatch && <span className={styles.swatch} style={{ background: swatch }} />}
      <span className={styles.tooltipLabel}>{label}</span>
      <span className={styles.tooltipValue}>{value}</span>
    </div>
  );
}

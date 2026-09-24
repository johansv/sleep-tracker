import type { ReactNode } from 'react';
import styles from './StateMessage.module.css';

export interface StateMessageProps {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'error';
  compact?: boolean;
}

/** Intentional empty/error/zero-data state used across screens. */
export function StateMessage({ icon, title, children, action, tone = 'neutral', compact }: StateMessageProps) {
  return (
    <div
      className={[styles.state, styles[tone], compact && styles.compact].filter(Boolean).join(' ')}
      role={tone === 'error' ? 'alert' : undefined}
    >
      {icon && (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className={styles.title}>{title}</h3>
      {children && <div className={styles.body}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

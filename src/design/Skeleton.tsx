import type { CSSProperties, ReactNode } from 'react';
import styles from './Skeleton.module.css';

export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: string;
  style?: CSSProperties;
}) {
  return (
    <span aria-hidden="true" className={styles.skeleton} style={{ width, height, borderRadius: radius, ...style }} />
  );
}

/** Accessible wrapper announcing a loading region while showing placeholder shapes. */
export function LoadingBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={styles.block}>
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  );
}

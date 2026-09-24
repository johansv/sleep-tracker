import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Surface.module.css';

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article';
  padding?: 'md' | 'lg' | 'none';
  tone?: 'default' | 'raised' | 'accent';
  children?: ReactNode;
}

/** The product's card: a quiet rounded surface with no heavy borders. */
export function Surface({ as: Tag = 'section', padding = 'md', tone = 'default', className, ...rest }: SurfaceProps) {
  return (
    <Tag className={[styles.surface, styles[padding], styles[tone], className].filter(Boolean).join(' ')} {...rest} />
  );
}

export function SectionHeader({ title, action, id }: { title: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className={styles.header}>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      {action}
    </div>
  );
}

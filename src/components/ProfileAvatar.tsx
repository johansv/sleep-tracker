import type { CSSProperties } from 'react';
import type { Profile } from '../shared/api';
import styles from './ProfileAvatar.module.css';

export function identityColor(profile: Pick<Profile, 'color'>): string {
  return `var(--identity-${profile.color})`;
}

export function ProfileAvatar({
  profile,
  size = 'md',
}: {
  profile: Pick<Profile, 'name' | 'color'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span
      aria-hidden="true"
      className={[styles.avatar, styles[size]].join(' ')}
      style={{ '--avatar-color': identityColor(profile) } as CSSProperties}
    >
      {profile.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

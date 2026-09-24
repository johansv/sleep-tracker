import type { Profile } from '../shared/api';
import { ProfileAvatar } from './ProfileAvatar';
import styles from './ProfileChips.module.css';

export interface ProfileChipsProps {
  profiles: readonly Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label?: string;
}

/** One-tap person switcher. Inactive profiles appear only when selected (for history). */
export function ProfileChips({ profiles, selectedId, onSelect, label = 'Person' }: ProfileChipsProps) {
  const visible = profiles.filter((p) => p.isActive || p.id === selectedId);
  return (
    <div className={styles.row} role="radiogroup" aria-label={label}>
      {visible.map((profile) => (
        <button
          key={profile.id}
          type="button"
          role="radio"
          aria-checked={profile.id === selectedId}
          className={styles.chip}
          onClick={() => onSelect(profile.id)}
        >
          <ProfileAvatar profile={profile} size="sm" />
          <span className={styles.name}>{profile.name}</span>
          {!profile.isActive && <span className={styles.badge}>Inactive</span>}
        </button>
      ))}
    </div>
  );
}

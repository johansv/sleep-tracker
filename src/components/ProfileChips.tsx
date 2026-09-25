import type { KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import type { Profile } from '../shared/api';
import { ProfileAvatar } from './ProfileAvatar';
import styles from './ProfileChips.module.css';

export interface ProfileChipsProps {
  profiles: readonly Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Accessible name of the radio group, e.g. "Viewing". The checked chip is the visible cue. */
  label: string;
}

/**
 * One-tap person picker (radio group with arrow-key navigation). The chosen person is marked by
 * a check mark, outline and weight, never by identity color alone. Inactive profiles appear only
 * while selected.
 */
export function ProfileChips({ profiles, selectedId, onSelect, label }: ProfileChipsProps) {
  const visible = profiles.filter((p) => p.isActive || p.id === selectedId);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta || visible.length === 0) return;
    event.preventDefault();
    const index = Math.max(
      0,
      visible.findIndex((p) => p.id === selectedId),
    );
    const next = visible[(index + delta + visible.length) % visible.length]!;
    onSelect(next.id);
    (event.currentTarget.querySelector(`[data-id="${next.id}"]`) as HTMLElement | null)?.focus();
  };

  const focusable = visible.some((p) => p.id === selectedId) ? selectedId : visible[0]?.id;

  return (
    <div className={styles.row} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {visible.map((profile) => {
        const checked = profile.id === selectedId;
        return (
          <button
            key={profile.id}
            type="button"
            role="radio"
            data-id={profile.id}
            aria-checked={checked}
            tabIndex={profile.id === focusable ? 0 : -1}
            className={styles.chip}
            onClick={() => onSelect(profile.id)}
          >
            <ProfileAvatar profile={profile} size="sm" />
            <span className={styles.name}>{profile.name}</span>
            {!profile.isActive && <span className={styles.badge}>Inactive</span>}
            {checked && <Check aria-hidden="true" className={styles.check} />}
          </button>
        );
      })}
    </div>
  );
}

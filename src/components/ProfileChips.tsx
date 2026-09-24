import { useId, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import type { Profile } from '../shared/api';
import { ProfileAvatar } from './ProfileAvatar';
import styles from './ProfileChips.module.css';

export interface ProfileChipsProps {
  profiles: readonly Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Visible caption that also names the radio group, e.g. "Viewing" or "Log for". */
  label: string;
  /** Only offer active profiles (logging targets). Otherwise inactive ones appear when selected. */
  activeOnly?: boolean;
  disabled?: boolean;
  size?: 'md' | 'sm';
}

/**
 * One-tap person picker (radio group with arrow-key navigation). The chosen person is marked by
 * a check mark, outline and weight, never by identity color alone.
 */
export function ProfileChips({
  profiles,
  selectedId,
  onSelect,
  label,
  activeOnly,
  disabled,
  size = 'md',
}: ProfileChipsProps) {
  const visible = profiles.filter((p) => p.isActive || (!activeOnly && p.id === selectedId));

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

  const labelId = useId();
  const focusable = visible.some((p) => p.id === selectedId) ? selectedId : visible[0]?.id;

  return (
    <div className={[styles.wrapper, styles[size]].join(' ')}>
      <span id={labelId} className={styles.caption}>
        {label}
      </span>
      <div className={styles.row} role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown}>
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
              disabled={disabled}
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
    </div>
  );
}

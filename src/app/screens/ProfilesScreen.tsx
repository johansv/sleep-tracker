import { useState, type CSSProperties, type FormEvent } from 'react';
import { Check, History, Info, Pencil, UserPlus, Users } from 'lucide-react';
import { api } from '../../api/client';
import { invalidateAll } from '../../api/query';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { Button } from '../../design/Button';
import { Sheet } from '../../design/Sheet';
import { LoadingBlock, Skeleton } from '../../design/Skeleton';
import { StateMessage } from '../../design/StateMessage';
import { SectionHeader, Surface } from '../../design/Surface';
import { useToast } from '../../design/Toast';
import { PROFILE_COLORS, type Profile, type ProfileColor } from '../../shared/api';
import { useProfiles } from '../ProfileContext';
import { navigate } from '../router';
import { ErrorState, PageHeader } from './common';
import styles from './ProfilesScreen.module.css';

type EditorState = { mode: 'create' } | { mode: 'edit'; profile: Profile } | null;

export function ProfilesScreen() {
  const { query, profiles, selected, select } = useProfiles();
  const [editor, setEditor] = useState<EditorState>(null);
  const toast = useToast();
  const active = profiles.filter((p) => p.isActive);
  const inactive = profiles.filter((p) => !p.isActive);

  const setActive = async (profile: Profile, isActive: boolean) => {
    try {
      await api.updateProfile(profile.id, { isActive });
      invalidateAll();
      toast({
        tone: 'success',
        message: isActive ? `${profile.name} is active again` : `${profile.name} is inactive. History is kept.`,
      });
    } catch (error) {
      toast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not update.' });
    }
  };

  const addButton = (
    <Button variant="primary" size="sm" icon={<UserPlus />} onClick={() => setEditor({ mode: 'create' })}>
      Add person
    </Button>
  );

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Everyone whose nights you track in this household."
        actions={query.status === 'success' ? addButton : undefined}
      />
      {query.status === 'loading' && (
        <LoadingBlock label="Loading people">
          <Skeleton height={72} radius="var(--radius-lg)" />
          <Skeleton height={72} radius="var(--radius-lg)" />
        </LoadingBlock>
      )}
      {query.status === 'error' && (
        <Surface>
          <ErrorState error={query.error} onRetry={query.retry} />
        </Surface>
      )}
      {query.status === 'success' && (
        <div className={styles.layout}>
          <div className={styles.lists}>
            {profiles.length === 0 ? (
              <Surface>
                <StateMessage
                  icon={<Users />}
                  title="No one here yet"
                  action={
                    <Button variant="primary" icon={<UserPlus />} onClick={() => setEditor({ mode: 'create' })}>
                      Add the first person
                    </Button>
                  }
                >
                  Profiles are the people you track — they don’t need an account or a login.
                </StateMessage>
              </Surface>
            ) : (
              <>
                <section aria-labelledby="active-title">
                  <SectionHeader id="active-title" title="Active" />
                  {active.length === 0 ? (
                    <p className={styles.muted}>No active people. Reactivate someone below or add a new person.</p>
                  ) : (
                    <ul className={styles.list}>
                      {active.map((profile) => (
                        <ProfileRow
                          key={profile.id}
                          profile={profile}
                          selected={selected?.id === profile.id}
                          onEdit={() => setEditor({ mode: 'edit', profile })}
                          onToggleActive={() => setActive(profile, false)}
                          onHistory={() => {
                            select(profile.id);
                            navigate('/history');
                          }}
                        />
                      ))}
                    </ul>
                  )}
                </section>
                {inactive.length > 0 && (
                  <section aria-labelledby="inactive-title">
                    <SectionHeader id="inactive-title" title="Inactive" />
                    <p className={styles.muted}>
                      Inactive people are hidden from logging. Their history is kept and viewable.
                    </p>
                    <ul className={styles.list}>
                      {inactive.map((profile) => (
                        <ProfileRow
                          key={profile.id}
                          profile={profile}
                          selected={selected?.id === profile.id}
                          onEdit={() => setEditor({ mode: 'edit', profile })}
                          onToggleActive={() => setActive(profile, true)}
                          onHistory={() => {
                            select(profile.id);
                            navigate('/history');
                          }}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
          <Surface className={styles.about} aria-labelledby="about-title">
            <div className={styles.aboutIcon} aria-hidden="true">
              <Info />
            </div>
            <h2 id="about-title" className={styles.aboutTitle}>
              About the numbers
            </h2>
            <ul className={styles.aboutList}>
              <li>Sleep Tracker measures time in bed — from going to bed until getting up — not actual sleep.</li>
              <li>Times are local wall-clock times shown in 24-hour format. A night belongs to the date you get up.</li>
              <li>
                Nights missing a bedtime or wake-up stay editable but are left out of statistics. Days without records
                are never counted as zero.
              </li>
              <li>Data is stored online. The app needs a connection to load and save nights.</li>
            </ul>
          </Surface>
        </div>
      )}
      <ProfileEditorSheet
        state={editor}
        onClose={() => setEditor(null)}
        onSaved={(profile, created) => {
          setEditor(null);
          invalidateAll();
          if (created) select(profile.id);
          toast({ tone: 'success', message: created ? `${profile.name} added` : 'Changes saved' });
        }}
        takenColors={active.map((p) => p.color)}
      />
    </>
  );
}

function ProfileRow({
  profile,
  selected,
  onEdit,
  onToggleActive,
  onHistory,
}: {
  profile: Profile;
  selected: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onHistory: () => void;
}) {
  return (
    <li className={styles.row}>
      <ProfileAvatar profile={profile} size="lg" />
      <div className={styles.rowMain}>
        <span className={styles.rowName}>{profile.name}</span>
        <span className={styles.rowMeta}>
          {profile.isActive ? (selected ? 'Currently selected' : 'Active') : 'Inactive · history kept'}
        </span>
      </div>
      <div className={styles.rowActions}>
        <Button variant="ghost" size="sm" icon={<History />} onClick={onHistory}>
          History
        </Button>
        <Button variant="ghost" size="sm" icon={<Pencil />} onClick={onEdit} aria-label={`Edit ${profile.name}`}>
          Edit
        </Button>
        <Button variant="secondary" size="sm" onClick={onToggleActive}>
          {profile.isActive ? 'Deactivate' : 'Activate'}
        </Button>
      </div>
    </li>
  );
}

function ProfileEditorSheet({
  state,
  onClose,
  onSaved,
  takenColors,
}: {
  state: EditorState;
  onClose: () => void;
  onSaved: (profile: Profile, created: boolean) => void;
  takenColors: ProfileColor[];
}) {
  return (
    <Sheet
      open={state !== null}
      onClose={onClose}
      title={state?.mode === 'edit' ? `Edit ${state.profile.name}` : 'Add person'}
    >
      {state && (
        <ProfileForm
          key={state.mode === 'edit' ? state.profile.id : 'new'}
          profile={state.mode === 'edit' ? state.profile : null}
          defaultColor={PROFILE_COLORS.find((c) => !takenColors.includes(c)) ?? PROFILE_COLORS[0]}
          onCancel={onClose}
          onSaved={onSaved}
        />
      )}
    </Sheet>
  );
}

function ProfileForm({
  profile,
  defaultColor,
  onCancel,
  onSaved,
}: {
  profile: Profile | null;
  defaultColor: ProfileColor;
  onCancel: () => void;
  onSaved: (profile: Profile, created: boolean) => void;
}) {
  const [name, setName] = useState(profile?.name ?? '');
  const [color, setColor] = useState<ProfileColor>(profile?.color ?? defaultColor);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed) {
      setError('Enter a name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = profile
        ? await api.updateProfile(profile.id, { name: trimmed, color })
        : await api.createProfile({ name: trimmed, color });
      onSaved(saved, !profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Name</span>
        <input
          className={styles.input}
          value={name}
          maxLength={40}
          autoComplete="off"
          data-autofocus
          placeholder="e.g. Alex"
          aria-invalid={error ? true : undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <fieldset className={styles.colors}>
        <legend className={styles.fieldLabel}>Color</legend>
        <div className={styles.swatches}>
          {PROFILE_COLORS.map((c) => (
            <label key={c} className={styles.swatch} style={{ '--swatch': `var(--identity-${c})` } as CSSProperties}>
              <input
                type="radio"
                name="profile-color"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
                aria-label={c}
              />
              <span aria-hidden="true">{color === c && <Check />}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className={styles.preview}>
        <ProfileAvatar profile={{ name: trimmed || '?', color }} size="lg" />
        <span>{trimmed || 'New person'}</span>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" busy={busy}>
          {profile ? 'Save' : 'Add person'}
        </Button>
      </div>
    </form>
  );
}

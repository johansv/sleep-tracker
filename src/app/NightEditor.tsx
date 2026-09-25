import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { invalidateAll, useQuery } from '../api/query';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { SessionEditor, type EditorSuggestion } from '../components/SessionEditor';
import { formatShortDate } from '../components/format';
import { addDays, todayLocal, type LocalDate } from '../domain/civil';
import { sessionStatus } from '../domain/session';
import { Button } from '../design/Button';
import { Sheet } from '../design/Sheet';
import { useToast } from '../design/Toast';
import type { Profile, SessionBody, SleepSession } from '../shared/api';
import { useProfiles } from './ProfileContext';
import styles from './NightEditor.module.css';

/**
 * What the editor opens on. Existing records are edited in place. New nights are either the
 * profile's current night (from Today: bedtime alone is enough, the wake-up can follow) or a past
 * night (entered complete). Suggestions are shown as unsaved values until the user saves.
 */
export type EditorTarget =
  | { profile: Profile; session: SleepSession; suggest?: EditorSuggestion }
  | {
      profile: Profile;
      session?: undefined;
      nightDate: LocalDate;
      kind: 'current' | 'past';
      suggest?: EditorSuggestion;
    };

interface NightEditorValue {
  openEditor: (target: EditorTarget) => void;
  deleteWithUndo: (session: SleepSession) => Promise<void>;
}

const NightEditorContext = createContext<NightEditorValue | null>(null);

/** Hosts the single add/edit night sheet and the delete-with-undo flow for every screen. */
export function NightEditorProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const toast = useToast();
  const { profiles } = useProfiles();
  const ownerName = useCallback(
    (session: SleepSession) => profiles.find((p) => p.id === session.profileId)?.name ?? 'Night',
    [profiles],
  );

  const deleteWithUndo = useCallback(
    async (session: SleepSession) => {
      try {
        await api.deleteSession(session.id);
      } catch (error) {
        toast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not delete this night.' });
        return;
      }
      invalidateAll();
      toast({
        message: `${ownerName(session)}: night ending ${formatShortDate(session.nightDate)} deleted`,
        action: {
          label: 'Undo',
          onAction: () => {
            const { profileId, nightDate, bedtime, wakeTime } = session;
            api.createSession({ profileId, nightDate, bedtime, wakeTime }).then(
              () => {
                invalidateAll();
                toast({ tone: 'success', message: `${ownerName(session)}: night restored` });
              },
              (error: unknown) =>
                toast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not restore.' }),
            );
          },
        },
      });
    },
    [toast, ownerName],
  );

  const openEditor = useCallback((next: EditorTarget) => {
    setTarget(next);
    setOpenCount((c) => c + 1);
  }, []);

  const close = useCallback(() => setTarget(null), []);

  const value = useMemo(() => ({ openEditor, deleteWithUndo }), [openEditor, deleteWithUndo]);

  return (
    <NightEditorContext.Provider value={value}>
      {children}
      <Sheet
        open={target !== null}
        onClose={close}
        title={target?.session ? 'Edit night' : 'Add night'}
        description="Time in bed, not time asleep"
      >
        {target && (
          <EditorContent
            key={openCount}
            target={target}
            onClose={close}
            onSwitchToExisting={(session) => openEditor({ profile: target.profile, session, suggest: target.suggest })}
            onDelete={(session) => {
              setTarget(null);
              void deleteWithUndo(session);
            }}
          />
        )}
      </Sheet>
    </NightEditorContext.Provider>
  );
}

/**
 * One editor session for the owning profile, which is fixed: new nights belong to the profile the
 * editor was opened for and existing nights stay with their owner. A new night is looked up first
 * so an existing record is edited, never duplicated.
 */
function EditorContent({
  target,
  onClose,
  onSwitchToExisting,
  onDelete,
}: {
  target: EditorTarget;
  onClose: () => void;
  onSwitchToExisting: (session: SleepSession) => void;
  onDelete: (session: SleepSession) => void;
}) {
  const toast = useToast();
  const { profile } = target;
  const isNew = !target.session;
  const [lookupDate, setLookupDate] = useState(target.session ? target.session.nightDate : target.nightDate);

  const lookup = useQuery(isNew ? `night:${profile.id}:${lookupDate}` : null, () =>
    api.listSessions(profile.id, { from: lookupDate, to: lookupDate }).then((r) => r.sessions[0] ?? null),
  );
  const existing = isNew && lookup.status === 'success' ? lookup.data : null;
  const lookupPending = isNew && (lookup.status === 'loading' || (lookup.status === 'success' && lookup.refreshing));
  // Inactive profiles keep their history but never receive new nights.
  const closed = isNew && !profile.isActive;

  const submit = async (body: SessionBody) => {
    if (target.session) {
      await api.updateSession(target.session.id, body);
    } else {
      // Resolve again right before writing: never create a second record for this person/night.
      const current = await api.listSessions(profile.id, { from: body.nightDate, to: body.nightDate });
      if (current.sessions.length > 0) {
        setLookupDate(body.nightDate);
        invalidateAll();
        throw new Error(`${profile.name} already has a record for that night.`);
      }
      await api.createSession({ profileId: profile.id, ...body });
    }
    invalidateAll();
    onClose();
    toast({ tone: 'success', message: `${profile.name}: night ending ${formatShortDate(body.nightDate)} saved` });
  };

  const owner = (
    <p className={styles.owner}>
      <ProfileAvatar profile={profile} size="sm" /> <span>{profile.name}’s night</span>
    </p>
  );

  const notice = closed ? (
    <p className={styles.conflict} role="status">
      {profile.name} is inactive. Reactivate them to log new nights.
    </p>
  ) : isNew && existing ? (
    <div className={styles.conflict} role="status">
      <p>
        <strong>{profile.name}</strong> already has a record for this night
        {sessionStatus(existing) === 'incomplete' ? ' (incomplete)' : ''}.
      </p>
      <Button variant="secondary" size="sm" onClick={() => onSwitchToExisting(existing)}>
        Edit {profile.name}’s night
      </Button>
    </div>
  ) : isNew && lookup.status === 'error' ? (
    <p className={styles.conflict} role="alert">
      Couldn’t check {profile.name}’s existing nights. {lookup.error.message}
    </p>
  ) : null;

  const { session } = target;
  return (
    <SessionEditor
      recorded={session ? { nightDate: session.nightDate, bedtime: session.bedtime, wakeTime: session.wakeTime } : null}
      nightDate={session ? session.nightDate : target.nightDate}
      suggest={target.suggest}
      requireWake={!session && target.kind === 'past'}
      nightDateEditable={session !== undefined || target.kind === 'past'}
      maxNightDate={addDays(todayLocal(), 1)}
      onSubmit={submit}
      onCancel={onClose}
      person={owner}
      notice={notice}
      submitBlocked={closed || (isNew && (lookupPending || existing !== null || lookup.status === 'error'))}
      onNightDateChange={setLookupDate}
      onDelete={session ? () => onDelete(session) : undefined}
    />
  );
}

export function useNightEditor(): NightEditorValue {
  const value = useContext(NightEditorContext);
  if (!value) throw new Error('useNightEditor must be used inside NightEditorProvider');
  return value;
}

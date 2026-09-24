import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { api } from '../api/client';
import { invalidateAll, useQuery } from '../api/query';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { ProfileChips } from '../components/ProfileChips';
import { SessionEditor } from '../components/SessionEditor';
import { formatShortDate } from '../components/format';
import { addDays, todayLocal, type LocalDate } from '../domain/civil';
import { sessionStatus } from '../domain/session';
import { Button } from '../design/Button';
import { Sheet } from '../design/Sheet';
import { useToast } from '../design/Toast';
import type { Profile, SessionBody, SleepSession } from '../shared/api';
import { useProfiles } from './ProfileContext';
import styles from './NightEditor.module.css';

type EditorTarget =
  { profile: Profile; session: SleepSession } | { profile: Profile; session?: undefined; nightDate: LocalDate };

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
            onSwitchToExisting={(profile, session) => openEditor({ profile, session })}
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
 * One editor session. For a new night the person defaults to the opening profile but can be
 * changed for this save only (the viewing selection is untouched); the chosen person's record
 * for the chosen night is looked up first so an existing night is edited, never duplicated.
 * Existing nights always stay with their owner.
 */
function EditorContent({
  target,
  onClose,
  onSwitchToExisting,
  onDelete,
}: {
  target: EditorTarget;
  onClose: () => void;
  onSwitchToExisting: (profile: Profile, session: SleepSession) => void;
  onDelete: (session: SleepSession) => void;
}) {
  const { profiles, selected } = useProfiles();
  const toast = useToast();
  const isNew = !target.session;
  // Inactive profiles keep their history but never receive new nights.
  const [personId, setPersonId] = useState(() =>
    target.profile.isActive || target.session
      ? target.profile.id
      : (profiles.find((p) => p.isActive)?.id ?? target.profile.id),
  );
  const [lookupDate, setLookupDate] = useState(target.session ? target.session.nightDate : target.nightDate);
  const person = profiles.find((p) => p.id === personId) ?? target.profile;
  const differs = selected !== null && person.id !== selected.id;

  const lookup = useQuery(isNew ? `night:${person.id}:${lookupDate}` : null, () =>
    api.listSessions(person.id, { from: lookupDate, to: lookupDate }).then((r) => r.sessions[0] ?? null),
  );
  const existing = isNew && lookup.status === 'success' ? lookup.data : null;
  const lookupPending = isNew && (lookup.status === 'loading' || (lookup.status === 'success' && lookup.refreshing));

  const initial: SessionBody = target.session
    ? { nightDate: target.session.nightDate, bedtime: target.session.bedtime, wakeTime: target.session.wakeTime }
    : { nightDate: target.nightDate, bedtime: null, wakeTime: null };

  const submit = async (body: SessionBody) => {
    if (target.session) {
      await api.updateSession(target.session.id, body);
    } else {
      // Resolve again right before writing: never create a second record for this person/night.
      const current = await api.listSessions(person.id, { from: body.nightDate, to: body.nightDate });
      if (current.sessions.length > 0) {
        setLookupDate(body.nightDate);
        invalidateAll();
        throw new Error(`${person.name} already has a record for that night.`);
      }
      await api.createSession({ profileId: person.id, ...body });
    }
    invalidateAll();
    onClose();
    toast({ tone: 'success', message: `${person.name}: night ending ${formatShortDate(body.nightDate)} saved` });
  };

  const personField = isNew ? (
    <div className={styles.person}>
      <ProfileChips
        label="Log for"
        size="sm"
        activeOnly
        profiles={profiles}
        selectedId={person.id}
        onSelect={setPersonId}
      />
      {differs && (
        <p className={styles.personNote}>
          <Info aria-hidden="true" />
          <span>
            Saving for <strong>{person.name}</strong> — you’re viewing {selected?.name}.
          </span>
        </p>
      )}
    </div>
  ) : (
    <p className={styles.owner}>
      <ProfileAvatar profile={person} size="sm" /> {person.name}’s night
    </p>
  );

  const notice =
    isNew && existing ? (
      <div className={styles.conflict} role="status">
        <p>
          <strong>{person.name}</strong> already has a record for this night
          {sessionStatus(existing) === 'incomplete' ? ' (incomplete)' : ''}.
        </p>
        <Button variant="secondary" size="sm" onClick={() => onSwitchToExisting(person, existing)}>
          Edit {person.name}’s night
        </Button>
      </div>
    ) : isNew && lookup.status === 'error' ? (
      <p className={styles.personNote} role="alert">
        Couldn’t check {person.name}’s existing nights. {lookup.error.message}
      </p>
    ) : null;

  return (
    <SessionEditor
      initial={initial}
      isNew={isNew}
      maxNightDate={addDays(todayLocal(), 1)}
      onSubmit={submit}
      onCancel={onClose}
      person={personField}
      notice={notice}
      submitBlocked={isNew && (lookupPending || existing !== null || lookup.status === 'error')}
      onNightDateChange={setLookupDate}
      onDelete={target.session ? () => onDelete(target.session!) : undefined}
    />
  );
}

export function useNightEditor(): NightEditorValue {
  const value = useContext(NightEditorContext);
  if (!value) throw new Error('useNightEditor must be used inside NightEditorProvider');
  return value;
}

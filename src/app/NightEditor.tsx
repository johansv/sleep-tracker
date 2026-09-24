import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { invalidateAll } from '../api/query';
import { SessionEditor } from '../components/SessionEditor';
import { formatShortDate } from '../components/format';
import { addDays, todayLocal, type LocalDate } from '../domain/civil';
import { Sheet } from '../design/Sheet';
import { useToast } from '../design/Toast';
import type { Profile, SessionBody, SleepSession } from '../shared/api';

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
        message: `Night ending ${formatShortDate(session.nightDate)} deleted`,
        action: {
          label: 'Undo',
          onAction: () => {
            const { profileId, nightDate, bedtime, wakeTime } = session;
            api.createSession({ profileId, nightDate, bedtime, wakeTime }).then(
              () => {
                invalidateAll();
                toast({ tone: 'success', message: 'Night restored' });
              },
              (error: unknown) =>
                toast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not restore.' }),
            );
          },
        },
      });
    },
    [toast],
  );

  const openEditor = useCallback((next: EditorTarget) => {
    setTarget(next);
    setOpenCount((c) => c + 1);
  }, []);

  const close = useCallback(() => setTarget(null), []);

  const submit = useCallback(
    async (body: SessionBody) => {
      if (!target) return;
      if (target.session) await api.updateSession(target.session.id, body);
      else await api.createSession({ profileId: target.profile.id, ...body });
      invalidateAll();
      setTarget(null);
      toast({ tone: 'success', message: 'Night saved' });
    },
    [target, toast],
  );

  const value = useMemo(() => ({ openEditor, deleteWithUndo }), [openEditor, deleteWithUndo]);
  const initial: SessionBody | null = target
    ? target.session
      ? { nightDate: target.session.nightDate, bedtime: target.session.bedtime, wakeTime: target.session.wakeTime }
      : { nightDate: target.nightDate, bedtime: null, wakeTime: null }
    : null;

  return (
    <NightEditorContext.Provider value={value}>
      {children}
      <Sheet
        open={target !== null}
        onClose={close}
        title={target?.session ? 'Edit night' : 'Add night'}
        description={target ? `${target.profile.name} · time in bed, not time asleep` : undefined}
      >
        {target && initial && (
          <SessionEditor
            key={openCount}
            initial={initial}
            isNew={!target.session}
            maxNightDate={addDays(todayLocal(), 1)}
            onSubmit={submit}
            onCancel={close}
            onDelete={
              target.session
                ? () => {
                    const session = target.session;
                    setTarget(null);
                    void deleteWithUndo(session);
                  }
                : undefined
            }
          />
        )}
      </Sheet>
    </NightEditorContext.Provider>
  );
}

export function useNightEditor(): NightEditorValue {
  const value = useContext(NightEditorContext);
  if (!value) throw new Error('useNightEditor must be used inside NightEditorProvider');
  return value;
}

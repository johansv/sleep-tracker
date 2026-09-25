import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { useQuery, type QueryState } from '../api/query';
import type { Profile } from '../shared/api';

const STORAGE_KEY = 'sleep-tracker:selected-profile';

function readStoredSelection(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

interface ProfileContextValue {
  query: QueryState<Profile[]> & { retry: () => void };
  profiles: Profile[];
  selected: Profile | null;
  select: (id: string) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/** Profiles and the person currently being viewed/logged (a UI preference, not app data). */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const query = useQuery('profiles', api.listProfiles);
  const [selectedId, setSelectedId] = useState<string | null>(readStoredSelection);
  const profiles = useMemo(() => query.data ?? [], [query.data]);

  const selected = profiles.find((p) => p.id === selectedId) ?? profiles.find((p) => p.isActive) ?? profiles[0] ?? null;

  const select = useCallback((id: string) => {
    setSelectedId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Preference only; ignore unavailable storage.
    }
  }, []);

  const value = useMemo(() => ({ query, profiles, selected, select }), [query, profiles, selected, select]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfiles(): ProfileContextValue {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('useProfiles must be used inside ProfileProvider');
  return value;
}

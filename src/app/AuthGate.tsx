import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CloudOff } from 'lucide-react';
import { api, UNAUTHENTICATED_EVENT } from '../api/client';
import { clearAll } from '../api/query';
import { Button } from '../design/Button';
import { StateMessage } from '../design/StateMessage';
import type { AuthSessionResponse } from '../shared/api';
import { SignInScreen } from './SignInScreen';
import styles from './SignInScreen.module.css';

type Method = NonNullable<AuthSessionResponse['method']>;

type AuthState =
  | { status: 'checking' }
  | { status: 'error'; error: Error }
  | { status: 'signed-out' }
  | { status: 'signed-in'; method: Method };

interface AuthContextValue {
  /** `local` is the loopback-only development identity, which cannot sign out. */
  method: Method;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function stateFrom(response: AuthSessionResponse): AuthState {
  return response.authenticated && response.method
    ? { status: 'signed-in', method: response.method }
    : { status: 'signed-out' };
}

/**
 * Renders the app only for a signed-in caller. Any API answer of "not signed in" (for example an
 * expired session or a password rotation) returns to the sign-in screen and drops loaded data.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.session().then(
      (response) => {
        if (!cancelled) setState(stateFrom(response));
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const signedOut = () => {
      clearAll();
      setState({ status: 'signed-out' });
    };
    window.addEventListener(UNAUTHENTICATED_EVENT, signedOut);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, signedOut);
  }, []);

  const signOut = useCallback(async () => {
    const response = await api.logout();
    clearAll();
    setState(stateFrom(response));
  }, []);

  const method = state.status === 'signed-in' ? state.method : null;
  const value = useMemo(() => (method ? { method, signOut } : null), [method, signOut]);

  if (state.status === 'checking') return <div className={styles.page} aria-busy="true" />;
  if (state.status === 'error') {
    return (
      <main className={styles.page}>
        <StateMessage
          tone="error"
          icon={<CloudOff />}
          title="Can't reach Sleep Tracker"
          action={
            <Button
              onClick={() => {
                setState({ status: 'checking' });
                setAttempt((a) => a + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {state.error.message}
        </StateMessage>
      </main>
    );
  }
  if (state.status === 'signed-out' || !value) {
    return <SignInScreen onSignedIn={(response) => setState(stateFrom(response))} />;
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthGate');
  return value;
}

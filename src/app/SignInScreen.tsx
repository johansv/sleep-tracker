import { useId, useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../design/Button';
import type { AuthSessionResponse } from '../shared/api';
import { AppLogo } from './AppLogo';
import styles from './SignInScreen.module.css';

/** The one shared household password; there are no user accounts. */
export function SignInScreen({ onSignedIn }: { onSignedIn: (response: AuthSessionResponse) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError('Enter the password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.login(password));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not sign in.');
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.brand}>
          <AppLogo size={56} />
          <h1 className={styles.title}>Sleep Tracker</h1>
          <p className={styles.subtitle}>Enter your household password to continue.</p>
        </div>
        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input
              className={styles.input}
              type="password"
              name="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          {error && (
            <p id={errorId} className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" block busy={busy} icon={<LogIn />}>
            Sign in
          </Button>
        </form>
        <p className={styles.note}>Tracks time in bed — not actual sleep.</p>
      </div>
    </main>
  );
}

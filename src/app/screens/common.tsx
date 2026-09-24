import type { ReactNode } from 'react';
import { CloudOff, UserPlus } from 'lucide-react';
import { ProfileChips } from '../../components/ProfileChips';
import { Button } from '../../design/Button';
import { LoadingBlock, Skeleton } from '../../design/Skeleton';
import { StateMessage } from '../../design/StateMessage';
import { Surface } from '../../design/Surface';
import type { Profile } from '../../shared/api';
import { useProfiles } from '../ProfileContext';
import { navigate } from '../router';
import styles from './screens.module.css';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeading}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: Error; onRetry: () => void; compact?: boolean }) {
  return (
    <StateMessage
      tone="error"
      icon={<CloudOff />}
      title="Couldn't load your data"
      compact={compact}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {error.message}
    </StateMessage>
  );
}

/**
 * Resolves the selected profile for profile-scoped screens and renders intentional
 * loading / error / no-profile states around them.
 */
export function WithSelectedProfile({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: (profile: Profile) => ReactNode;
  children: (profile: Profile) => ReactNode;
}) {
  const { query, profiles, selected, select } = useProfiles();

  if (query.status === 'loading') {
    return (
      <>
        <PageHeader title={title} />
        <LoadingBlock label="Loading people">
          <div className={styles.chipsSkeleton}>
            <Skeleton width={96} height={44} radius="999px" />
            <Skeleton width={88} height={44} radius="999px" />
            <Skeleton width={92} height={44} radius="999px" />
          </div>
          <Skeleton height={220} radius="var(--radius-lg)" />
        </LoadingBlock>
      </>
    );
  }
  if (query.status === 'error') {
    return (
      <>
        <PageHeader title={title} />
        <Surface>
          <ErrorState error={query.error} onRetry={query.retry} />
        </Surface>
      </>
    );
  }
  if (!selected) {
    return (
      <>
        <PageHeader title={title} />
        <Surface>
          <StateMessage
            icon={<UserPlus />}
            title="Who are you tracking?"
            action={
              <Button variant="primary" onClick={() => navigate('/profiles')}>
                Add a person
              </Button>
            }
          >
            Add a person to start recording bedtimes and wake-ups.
          </StateMessage>
        </Surface>
      </>
    );
  }
  return (
    <>
      <PageHeader title={title} actions={actions?.(selected)} />
      <div className={styles.chips}>
        <ProfileChips profiles={profiles} selectedId={selected.id} onSelect={select} />
      </div>
      {children(selected)}
    </>
  );
}

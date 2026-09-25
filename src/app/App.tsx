import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { ChartColumn, CalendarDays, MoonStar, Users, WifiOff } from 'lucide-react';
import { useOnline } from '../api/connectivity';
import { invalidateAll } from '../api/query';
import { ToastProvider } from '../design/Toast';
import { NightEditorProvider } from './NightEditor';
import { ProfileProvider } from './ProfileContext';
import { Link, usePathname, type RoutePath } from './router';
import { HistoryScreen } from './screens/HistoryScreen';
import { ProfilesScreen } from './screens/ProfilesScreen';
import { TodayScreen } from './screens/TodayScreen';
import { LoadingBlock, Skeleton } from '../design/Skeleton';
import { AppLogo } from './AppLogo';
import styles from './App.module.css';

declare const __DEPLOY_ENV__: string;
const NON_PROD_ENV = __DEPLOY_ENV__ === 'dev' || __DEPLOY_ENV__ === 'staging' ? __DEPLOY_ENV__ : null;

const NAV: Array<{ path: RoutePath; label: string; icon: typeof MoonStar }> = [
  { path: '/', label: 'Today', icon: MoonStar },
  { path: '/history', label: 'History', icon: CalendarDays },
  { path: '/insights', label: 'Insights', icon: ChartColumn },
  { path: '/profiles', label: 'People', icon: Users },
];

// Charts are only needed on Insights; keep them out of the fast logging path.
const InsightsScreen = lazy(() => import('./screens/InsightsScreen').then((m) => ({ default: m.InsightsScreen })));

const SCREENS: Record<RoutePath, ComponentType> = {
  '/': TodayScreen,
  '/history': HistoryScreen,
  '/insights': InsightsScreen,
  '/profiles': ProfilesScreen,
};

export function App() {
  return (
    <ToastProvider>
      <ProfileProvider>
        <NightEditorProvider>
          <Shell />
        </NightEditorProvider>
      </ProfileProvider>
    </ToastProvider>
  );
}

function Shell() {
  const path = usePathname();
  const online = useOnline();
  const Screen = SCREENS[path];

  useEffect(() => {
    if (!NON_PROD_ENV) return;
    const previous = document.title;
    document.title = `${previous} · ${NON_PROD_ENV.toUpperCase()}`;
    return () => {
      document.title = previous;
    };
  }, []);

  // Online-only: refresh whenever the app regains focus or connectivity.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') invalidateAll();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, []);

  return (
    <div className={styles.shell}>
      {NON_PROD_ENV && (
        <div className={styles.environmentIndicator} aria-hidden="true" title={`Environment: ${NON_PROD_ENV}`}>
          {NON_PROD_ENV.toUpperCase()}
        </div>
      )}
      <nav className={styles.nav} aria-label="Main">
        <div className={styles.brand}>
          <AppLogo />
          <span>Sleep Tracker</span>
        </div>
        <ul className={styles.navList}>
          {NAV.map(({ path: to, label, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className={styles.navLink} aria-current={path === to ? 'page' : undefined}>
                <Icon aria-hidden="true" className={styles.navIcon} />
                <span>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.navNote}>Tracks time in bed — not actual sleep.</p>
      </nav>
      <main className={styles.main}>
        {!online && (
          <div className={styles.offline} role="alert">
            <WifiOff aria-hidden="true" />
            <span>You're offline. Sleep Tracker needs a connection to load and save nights.</span>
          </div>
        )}
        <Suspense
          fallback={
            <LoadingBlock label="Loading">
              <Skeleton height={44} width="40%" />
              <Skeleton height={280} radius="var(--radius-lg)" />
            </LoadingBlock>
          }
        >
          <Screen />
        </Suspense>
      </main>
    </div>
  );
}

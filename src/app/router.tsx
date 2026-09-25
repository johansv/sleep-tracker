import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/** Tiny client router for the four top-level screens; the Worker serves index.html for any path. */

export type RoutePath = '/' | '/history' | '/insights' | '/profiles';

export const ROUTES: readonly RoutePath[] = ['/', '/history', '/insights', '/profiles'];

const NAVIGATE_EVENT = 'app:navigate';

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback);
  window.addEventListener(NAVIGATE_EVENT, callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener(NAVIGATE_EVENT, callback);
  };
}

export function usePathname(): RoutePath {
  const path = useSyncExternalStore(subscribe, () => window.location.pathname);
  return (ROUTES as readonly string[]).includes(path) ? (path as RoutePath) : '/';
}

export function navigate(path: RoutePath): void {
  if (window.location.pathname === path) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  window.scrollTo({ top: 0 });
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: RoutePath }) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest} />;
}

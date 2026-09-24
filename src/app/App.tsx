import { useCallback, useEffect, useState } from 'react';
import { Check, History, Leaf, Moon, Plus, Sparkles, Users, X } from 'lucide-react';
import { api, type Comparison } from '../api/client';
import { addDays, formatDate, nowLocal, periodFor, suggestedNight, today } from '../domain/time';
import type { PeriodKind, Profile, Session } from '../shared/models';
import { SessionEditor } from '../components/SessionEditor';
import { Insights } from './Insights';
import { Profiles } from './Profiles';
import { Today } from './Today';
import { HistoryView } from './HistoryView';
import { PeriodControl } from '../components/PeriodControl';

type Page = 'today' | 'history' | 'insights' | 'profiles';
const navigation = [
  { id: 'today', label: 'Today', icon: Moon },
  { id: 'history', label: 'History', icon: History },
  { id: 'insights', label: 'Insights', icon: Sparkles },
  { id: 'profiles', label: 'Profiles', icon: Users },
] as const;
function currentPage(): Page {
  const hash = window.location.hash.slice(1);
  return navigation.some((n) => n.id === hash) ? (hash as Page) : 'today';
}

export function App() {
  const [page, setPage] = useState<Page>(currentPage);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [comparison, setComparison] = useState<Comparison>([]);
  const [anchor, setAnchor] = useState(today);
  const [kind, setKind] = useState<PeriodKind>('rolling');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{ date: string; session?: Session } | null>(null);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const profile = profiles.find((p) => p.id === selected);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  const go = (next: Page) => {
    window.location.hash = next;
    setPage(next);
  };

  useEffect(() => {
    const hash = () => setPage(currentPage());
    const connection = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) refresh();
    };
    window.addEventListener('hashchange', hash);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    return () => {
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
    };
  }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const people = await api.profiles();
        if (cancelled) return;
        const id = people.some((p) => p.id === selected)
          ? selected
          : ((people.find((p) => p.is_active) ?? people[0])?.id ?? '');
        setProfiles(people);
        if (id !== selected) {
          setSelected(id);
          return;
        }
        if (!id) {
          setSessions([]);
          setComparison([]);
          return;
        }
        const period = periodFor(kind, anchor);
        const start = page === 'today' ? addDays(today(), -30) : period.start;
        const end = page === 'today' ? addDays(today(), 1) : period.end;
        const [records, summaries] = await Promise.all([
          api.sessions(id, start, end),
          api.statistics(kind, anchor),
        ]);
        if (!cancelled) {
          setSessions(records);
          setComparison(summaries);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selected, kind, anchor, revision, page]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function quickLog(endpoint: 'bed' | 'wake') {
    const local = nowLocal();
    const night = endpoint === 'bed' ? suggestedNight(local) : local.slice(0, 10);
    const existing = sessions.find((s) => s.night_date === night);
    if (existing && (endpoint === 'bed' ? existing.bedtime_local : existing.wake_time_local)) {
      setEditor({ date: night, session: existing });
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.saveSession(
        selected,
        {
          night_date: night,
          bedtime_local: endpoint === 'bed' ? local : (existing?.bedtime_local ?? null),
          wake_time_local: endpoint === 'wake' ? local : (existing?.wake_time_local ?? null),
        },
        existing?.id,
      );
      setToast(endpoint === 'bed' ? 'Bedtime saved. Rest easy.' : 'Wake-up saved. Hello, new day.');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const stats = comparison.find((c) => c.profile.id === selected)?.statistics;
  const displayDate = formatDate(today(), true);
  return (
    <div className="app-shell">
      <a
        href="#main"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#today">
          <span className="brand-mark">
            <Moon size={23} />
          </span>
          <span>
            sleep tracker<small>A LITTLE MORE CLARITY</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`} aria-current={page === id ? 'page' : undefined}>
              <Icon size={21} />
              <span>{label}</span>
              {page === id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <Leaf size={24} />
          <p>
            Better understanding
            <br />
            starts with one night.
          </p>
          <span>TIME IN BED, THOUGHTFULLY TRACKED</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a className="mobile-brand" href="#today">
            <Moon size={22} /> sleep tracker
          </a>
          <span className="desktop-date">{displayDate}</span>
          <label className="profile-picker">
            <span className="sr-only">Selected profile</span>
            <span className="avatar small" aria-hidden="true">
              {profile?.name.slice(0, 1) ?? '＋'}
            </span>
            <select
              aria-label="Selected profile"
              value={selected}
              disabled={!profiles.length || saving}
              onChange={(e) => {
                setSelected(e.target.value);
                setEditor(null);
              }}
            >
              {!profiles.length && <option value="">Your household</option>}
              {profiles.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                  {p.is_active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </label>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === 'today'
                  ? 'MAKE ROOM FOR REST'
                  : page === 'history'
                    ? 'ONE NIGHT AT A TIME'
                    : page === 'insights'
                      ? 'GET TO KNOW YOUR PATTERNS'
                      : 'TOGETHER, AT YOUR OWN PACE'}
              </p>
              <h1>
                {page === 'today'
                  ? `A little more clarity${profile ? `, ${profile.name}` : ''}.`
                  : page === 'history'
                    ? 'Your nights, at a glance.'
                    : page === 'insights'
                      ? 'Find your rhythm.'
                      : 'Your people.'}
              </h1>
              <p className="heading-description">
                {page === 'today'
                  ? 'A simple record of your nights. A clearer view of your days.'
                  : page === 'history'
                    ? 'Every night has a place. Fill in the gaps whenever you’re ready.'
                    : page === 'insights'
                      ? 'Small details become patterns. See what your nights tell you.'
                      : 'Individual histories. One shared space.'}
              </p>
            </div>
            {page === 'history' && (
              <button
                className="button primary"
                onClick={() => setEditor({ date: today() })}
                disabled={!selected || loading || !online}
              >
                <Plus size={18} /> Add night
              </button>
            )}
          </div>
          {!online && (
            <div role="alert" className="error">
              You’re offline. Reconnect to view current records and save changes.
            </div>
          )}
          {error && (
            <div role="alert" className="error error-panel">
              <span>{error}</span>
              <button className="button secondary" onClick={refresh}>
                Try again
              </button>
            </div>
          )}
          {(page === 'history' || page === 'insights') && (
            <PeriodControl kind={kind} anchor={anchor} onKind={setKind} onAnchor={setAnchor} />
          )}
          {loading ? (
            <div role="status" className="loading-state">
              <div className="skeleton" />
              <div className="skeleton" />
              <span>Gathering your nights…</span>
            </div>
          ) : (
            online &&
            !error && (
              <>
                {page === 'profiles' ? (
                  <Profiles
                    profiles={profiles}
                    onSaved={() => {
                      refresh();
                      setToast('Profile saved.');
                    }}
                  />
                ) : !profile ? (
                  <section className="card welcome">
                    <Moon size={42} />
                    <h2>A calmer way to know your nights</h2>
                    <p>Start with a profile for yourself or someone in your household.</p>
                    <button className="button primary" onClick={() => go('profiles')}>
                      <Plus size={18} /> Create your first profile
                    </button>
                  </section>
                ) : (
                  <>
                    {!profile.is_active && (
                      <p className="notice">
                        This profile is inactive. Its history is preserved and can still be edited.
                      </p>
                    )}
                    {page === 'today' && (
                      <Today
                        sessions={sessions}
                        onEdit={(date, session) => setEditor({ date, session })}
                        onQuick={quickLog}
                        saving={saving}
                        onHistory={() => go('history')}
                        onInsights={() => {
                          setKind('rolling');
                          setAnchor(today());
                          go('insights');
                        }}
                      />
                    )}
                    {page === 'history' && (
                      <HistoryView
                        sessions={sessions}
                        kind={kind}
                        anchor={anchor}
                        onEdit={(date, session) => setEditor({ date, session })}
                      />
                    )}
                    {page === 'insights' && stats && (
                      <Insights stats={stats} comparison={comparison} profileId={selected} />
                    )}
                  </>
                )}
              </>
            )
          )}
          <footer className="page-footer">
            <Leaf size={14} /> Time in bed. A record, not a sleep score.
          </footer>
        </main>
      </div>
      {editor && profile && (
        <SessionEditor
          key={`${profile.id}-${editor.session?.id ?? editor.date}`}
          profileId={profile.id}
          {...editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            refresh();
            setToast('Your night has been updated.');
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

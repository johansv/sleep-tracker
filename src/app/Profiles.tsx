import { useState } from 'react';
import { Plus, Pencil, Users } from 'lucide-react';
import type { Profile } from '../shared/models';
import { api } from '../api/client';
import { Modal } from '../components/Modal';

export function Profiles({ profiles, onSaved }: { profiles: Profile[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  return (
    <>
      <section className="card profiles-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR HOUSEHOLD</p>
            <h2>A space for everyone</h2>
          </div>
          <Users />
        </div>
        <p className="muted">Keep each person’s nights and patterns together.</p>
        <div className="profile-list">
          {profiles.map((p) => (
            <div className="profile-row" key={p.id}>
              <div className="avatar">{p.name.slice(0, 1)}</div>
              <div className="person-summary">
                <strong>{p.name}</strong>
                <span>{p.is_active ? 'Active profile' : 'Inactive · history preserved'}</span>
              </div>
              <button
                className="icon-button"
                onClick={() => setEditing(p)}
                aria-label={`Edit ${p.name}`}
              >
                <Pencil size={18} />
              </button>
            </div>
          ))}
        </div>
        <button className="button primary" onClick={() => setEditing('new')}>
          <Plus size={18} /> Add profile
        </button>
      </section>
      <section className="card about-card">
        <p className="eyebrow">A LITTLE CLARITY</p>
        <h2>Your records, thoughtfully kept</h2>
        <p>
          Sleep Tracker measures <strong>time in bed</strong>, using the local dates and times you
          enter. It doesn’t estimate actual sleep.
        </p>
        <p>
          Times use a 24-hour clock. Daylight saving changes and travel don’t change the wall-clock
          calculation.
        </p>
        <p>
          This app needs a connection. Records aren’t saved offline. Add it to your home screen from
          your browser for a more app-like experience.
        </p>
      </section>
      {editing && (
        <ProfileEditor
          profile={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
        />
      )}
    </>
  );
}
function ProfileEditor({
  profile,
  onClose,
  onSaved,
}: {
  profile?: Profile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile?.name ?? '');
  const [active, setActive] = useState(profile ? Boolean(profile.is_active) : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal
      title={profile ? 'Edit profile' : 'Someone new'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api.saveProfile({ name, is_active: active }, profile?.id);
            onSaved();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            autoComplete="off"
            placeholder="Their first name"
          />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{' '}
          Active profile
        </label>
        <p className="helper">
          Inactive profiles keep all their history and remain available in the profile picker.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </Modal>
  );
}

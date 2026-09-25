import type { Profile, ProfileColor, SleepSession } from '../shared/api';

/** D1 persistence adapters. All statements are parameterized. */

interface ProfileRow {
  id: string;
  name: string;
  color: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  profile_id: string;
  night_date: string;
  bedtime_local: string | null;
  wake_time_local: string | null;
  created_at: string;
  updated_at: string;
}

const PROFILE_COLUMNS = 'id, name, color, is_active, created_at, updated_at';
const SESSION_COLUMNS =
  's.id, s.profile_id, s.night_date, s.bedtime_local, s.wake_time_local, s.created_at, s.updated_at';

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    color: row.color as ProfileColor,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSession(row: SessionRow): SleepSession {
  return {
    id: row.id,
    profileId: row.profile_id,
    nightDate: row.night_date,
    bedtime: row.bedtime_local,
    wakeTime: row.wake_time_local,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function newId(prefix: 'prf' | 'ses'): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

function timestamp(): string {
  return new Date().toISOString();
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

export async function listProfiles(db: D1Database, householdId: string): Promise<Profile[]> {
  const { results } = await db
    .prepare(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE household_id = ? ORDER BY created_at, id`)
    .bind(householdId)
    .all<ProfileRow>();
  return results.map(toProfile);
}

export async function getProfile(db: D1Database, householdId: string, id: string): Promise<Profile | null> {
  const row = await db
    .prepare(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE household_id = ? AND id = ?`)
    .bind(householdId, id)
    .first<ProfileRow>();
  return row ? toProfile(row) : null;
}

export async function insertProfile(
  db: D1Database,
  householdId: string,
  input: { name: string; color: ProfileColor },
): Promise<Profile> {
  const now = timestamp();
  const id = newId('prf');
  await db
    .prepare(
      'INSERT INTO profiles (id, household_id, name, color, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    )
    .bind(id, householdId, input.name, input.color, now, now)
    .run();
  return (await getProfile(db, householdId, id))!;
}

export async function updateProfile(
  db: D1Database,
  householdId: string,
  id: string,
  patch: { name?: string; color?: ProfileColor; isActive?: boolean },
): Promise<Profile | null> {
  const current = await getProfile(db, householdId, id);
  if (!current) return null;
  await db
    .prepare('UPDATE profiles SET name = ?, color = ?, is_active = ?, updated_at = ? WHERE household_id = ? AND id = ?')
    .bind(
      patch.name ?? current.name,
      patch.color ?? current.color,
      (patch.isActive ?? current.isActive) ? 1 : 0,
      timestamp(),
      householdId,
      id,
    )
    .run();
  return getProfile(db, householdId, id);
}

export async function listSessions(
  db: D1Database,
  householdId: string,
  profileIds: readonly string[],
  range: { from?: string; to?: string },
): Promise<SleepSession[]> {
  if (profileIds.length === 0) return [];
  const conditions = [`p.household_id = ?`, `s.profile_id IN (${profileIds.map(() => '?').join(', ')})`];
  const params: string[] = [householdId, ...profileIds];
  if (range.from) {
    conditions.push('s.night_date >= ?');
    params.push(range.from);
  }
  if (range.to) {
    conditions.push('s.night_date <= ?');
    params.push(range.to);
  }
  const { results } = await db
    .prepare(
      `SELECT ${SESSION_COLUMNS} FROM sleep_sessions s JOIN profiles p ON p.id = s.profile_id
       WHERE ${conditions.join(' AND ')} ORDER BY s.night_date DESC, s.profile_id`,
    )
    .bind(...params)
    .all<SessionRow>();
  return results.map(toSession);
}

export async function nightDateBounds(
  db: D1Database,
  profileId: string,
): Promise<{ earliest: string | null; latest: string | null }> {
  const row = await db
    .prepare('SELECT MIN(night_date) AS earliest, MAX(night_date) AS latest FROM sleep_sessions WHERE profile_id = ?')
    .bind(profileId)
    .first<{ earliest: string | null; latest: string | null }>();
  return { earliest: row?.earliest ?? null, latest: row?.latest ?? null };
}

export async function getSession(db: D1Database, householdId: string, id: string): Promise<SleepSession | null> {
  const row = await db
    .prepare(
      `SELECT ${SESSION_COLUMNS} FROM sleep_sessions s JOIN profiles p ON p.id = s.profile_id
       WHERE p.household_id = ? AND s.id = ?`,
    )
    .bind(householdId, id)
    .first<SessionRow>();
  return row ? toSession(row) : null;
}

export async function insertSession(
  db: D1Database,
  householdId: string,
  input: { profileId: string; nightDate: string; bedtime: string | null; wakeTime: string | null },
): Promise<SleepSession> {
  const now = timestamp();
  const id = newId('ses');
  await db
    .prepare(
      `INSERT INTO sleep_sessions (id, profile_id, night_date, bedtime_local, wake_time_local, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.profileId, input.nightDate, input.bedtime, input.wakeTime, now, now)
    .run();
  return (await getSession(db, householdId, id))!;
}

export async function updateSession(
  db: D1Database,
  householdId: string,
  id: string,
  input: { nightDate: string; bedtime: string | null; wakeTime: string | null },
): Promise<SleepSession | null> {
  const result = await db
    .prepare(
      `UPDATE sleep_sessions SET night_date = ?, bedtime_local = ?, wake_time_local = ?, updated_at = ?
       WHERE id = ? AND profile_id IN (SELECT id FROM profiles WHERE household_id = ?)`,
    )
    .bind(input.nightDate, input.bedtime, input.wakeTime, timestamp(), id, householdId)
    .run();
  if (result.meta.changes === 0) return null;
  return getSession(db, householdId, id);
}

export async function deleteSession(db: D1Database, householdId: string, id: string): Promise<boolean> {
  const result = await db
    .prepare(
      `DELETE FROM sleep_sessions WHERE id = ? AND profile_id IN (SELECT id FROM profiles WHERE household_id = ?)`,
    )
    .bind(id, householdId)
    .run();
  return result.meta.changes > 0;
}

/**
 * Proves the D1 binding answers and reports the newest migration Wrangler recorded as applied
 * (null when migrations were applied without Wrangler's `d1_migrations` table, e.g. in tests).
 */
export async function databaseHealth(db: D1Database): Promise<{ ok: boolean; latestMigration: string | null }> {
  try {
    const tracked = await db
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'")
      .first();
    if (!tracked) return { ok: true, latestMigration: null };
    const latest = await db
      .prepare('SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1')
      .first<{ name: string }>();
    return { ok: true, latestMigration: latest?.name ?? null };
  } catch (error) {
    console.error('D1 health check failed', error);
    return { ok: false, latestMigration: null };
  }
}

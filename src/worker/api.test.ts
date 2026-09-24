import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Profile, SessionListResponse, SleepSession, StatsResponse } from '../shared/api';
import { handleRequest } from './index';

/**
 * API integration tests against a real (in-memory, test-owned) D1 database. A fresh database is
 * created for every test; nothing touches the developer's persisted local store.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
let mf: Miniflare | undefined;
let db: D1Database;

async function freshDatabase(): Promise<D1Database> {
  await mf?.dispose();
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response(null, { status: 404 }); } }',
    d1Databases: { DB: `test-${crypto.randomUUID()}` },
  });
  const database = (await mf.getD1Database('DB')) as unknown as D1Database;
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    const statements = sql
      .split(/;\s*(?:\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean);
    await database.batch(statements.map((s) => database.prepare(s)));
  }
  return database;
}

async function call<T = unknown>(method: string, url: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await handleRequest(
    new Request(`http://local${url}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { DB: db },
  );
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T };
}

async function createProfile(name = 'Alex'): Promise<Profile> {
  const res = await call<{ profile: Profile }>('POST', '/api/profiles', { name, color: 'teal' });
  expect(res.status).toBe(201);
  return res.body.profile;
}

beforeEach(async () => {
  db = await freshDatabase();
});

afterAll(async () => {
  await mf?.dispose();
});

describe('profiles API', () => {
  it('creates, lists, renames and deactivates profiles', async () => {
    const alex = await createProfile('  Alex  ');
    expect(alex).toMatchObject({ name: 'Alex', color: 'teal', isActive: true });

    const renamed = await call<{ profile: Profile }>('PATCH', `/api/profiles/${alex.id}`, {
      name: 'Alexandra',
      isActive: false,
    });
    expect(renamed.body.profile).toMatchObject({ name: 'Alexandra', isActive: false });

    const list = await call<{ profiles: Profile[] }>('GET', '/api/profiles');
    expect(list.body.profiles).toHaveLength(1);
    expect(list.body.profiles[0]!.isActive).toBe(false);
  });

  it('validates input at runtime', async () => {
    expect((await call('POST', '/api/profiles', { name: '', color: 'teal' })).status).toBe(400);
    expect((await call('POST', '/api/profiles', { name: 'X', color: 'neon' })).status).toBe(400);
    expect((await call('POST', '/api/profiles', { name: 'X', color: 'teal', admin: true })).status).toBe(400);
    expect((await call('PATCH', '/api/profiles/prf_missing', { name: 'Y' })).status).toBe(404);
  });
});

describe('sessions API', () => {
  it('supports the full create → complete → edit → delete lifecycle', async () => {
    const p = await createProfile();
    const created = await call<{ session: SleepSession }>('POST', '/api/sessions', {
      profileId: p.id,
      nightDate: '2026-09-25',
      bedtime: '2026-09-24T23:35',
      wakeTime: null,
    });
    expect(created.status).toBe(201);
    const id = created.body.session.id;

    const completed = await call<{ session: SleepSession }>('PUT', `/api/sessions/${id}`, {
      nightDate: '2026-09-25',
      bedtime: '2026-09-24T23:35',
      wakeTime: '2026-09-25T07:10',
    });
    expect(completed.body.session).toMatchObject({ bedtime: '2026-09-24T23:35', wakeTime: '2026-09-25T07:10' });

    const moved = await call<{ session: SleepSession }>('PUT', `/api/sessions/${id}`, {
      nightDate: '2026-09-26',
      bedtime: '2026-09-26T00:40',
      wakeTime: '2026-09-26T08:15',
    });
    expect(moved.body.session.nightDate).toBe('2026-09-26');

    const listed = await call<SessionListResponse>(
      'GET',
      `/api/sessions?profileId=${p.id}&from=2026-09-01&to=2026-09-30`,
    );
    expect(listed.body.sessions).toHaveLength(1);
    expect(listed.body.earliestNightDate).toBe('2026-09-26');
    expect(listed.body.latestNightDate).toBe('2026-09-26');

    expect((await call('DELETE', `/api/sessions/${id}`)).status).toBe(204);
    expect((await call('DELETE', `/api/sessions/${id}`)).status).toBe(404);
  });

  it('stores local wall-clock text exactly as given', async () => {
    const p = await createProfile();
    await call('POST', '/api/sessions', {
      profileId: p.id,
      nightDate: '2026-03-29',
      bedtime: '2026-03-28T23:00',
      wakeTime: '2026-03-29T07:00',
    });
    const row = await db.prepare('SELECT bedtime_local, wake_time_local FROM sleep_sessions').first();
    expect(row).toEqual({ bedtime_local: '2026-03-28T23:00', wake_time_local: '2026-03-29T07:00' });
  });

  it('rejects invalid sessions and duplicate nights', async () => {
    const p = await createProfile();
    const base = { profileId: p.id, nightDate: '2026-09-25' };
    expect((await call('POST', '/api/sessions', { ...base, bedtime: null, wakeTime: null })).status).toBe(422);
    expect((await call('POST', '/api/sessions', { ...base, bedtime: null, wakeTime: '2026-09-24T07:00' })).status).toBe(
      422,
    );
    expect(
      (await call('POST', '/api/sessions', { ...base, bedtime: '2026-09-25T08:00', wakeTime: '2026-09-25T07:00' }))
        .status,
    ).toBe(422);
    expect(
      (await call('POST', '/api/sessions', { ...base, bedtime: '2026-09-24T23:00Z', wakeTime: null })).status,
    ).toBe(400);
    expect(
      (
        await call('POST', '/api/sessions', {
          ...base,
          profileId: 'prf_nope',
          bedtime: '2026-09-24T23:00',
          wakeTime: null,
        })
      ).status,
    ).toBe(404);

    expect((await call('POST', '/api/sessions', { ...base, bedtime: '2026-09-24T23:00', wakeTime: null })).status).toBe(
      201,
    );
    const dup = await call<{ error: { code: string } }>('POST', '/api/sessions', {
      ...base,
      bedtime: null,
      wakeTime: '2026-09-25T07:00',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('duplicate_night');
  });

  it('returns safe error objects for unknown routes and bad JSON', async () => {
    expect((await call('GET', '/api/nope')).status).toBe(404);
    expect((await call('PATCH', '/api/sessions')).status).toBe(405);
    const bad = await handleRequest(
      new Request('http://local/api/profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
      { DB: db },
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } });
  });
});

describe('stats API', () => {
  it('computes coverage-aware statistics for several profiles over the same range', async () => {
    const a = await createProfile('A');
    const b = await createProfile('B');
    const add = (profileId: string, nightDate: string, bedtime: string | null, wakeTime: string | null) =>
      call('POST', '/api/sessions', { profileId, nightDate, bedtime, wakeTime });
    await add(a.id, '2026-09-21', '2026-09-20T23:30', '2026-09-21T07:30');
    await add(a.id, '2026-09-22', '2026-09-22T00:30', '2026-09-22T07:30');
    await add(a.id, '2026-09-23', '2026-09-22T23:00', null);
    await add(b.id, '2026-09-21', '2026-09-20T22:00', '2026-09-21T06:00');

    const res = await call<StatsResponse>(
      'GET',
      `/api/stats?profileId=${a.id}&profileId=${b.id}&from=2026-09-21&to=2026-09-27`,
    );
    expect(res.status).toBe(200);
    const [sa, sb] = res.body.profiles;
    expect(sa!.stats.coverage).toEqual({ nights: 7, completeNights: 2, incompleteNights: 1, missingNights: 4 });
    expect(sa!.stats.duration.meanMinutes).toBe((480 + 420) / 2);
    expect(Math.round(sa!.stats.bedtime.typicalMinutes!)).toBe(0);
    expect(sb!.stats.coverage.completeNights).toBe(1);
  });

  it('validates ranges', async () => {
    const a = await createProfile();
    expect((await call('GET', `/api/stats?profileId=${a.id}&from=2026-09-27&to=2026-09-21`)).status).toBe(400);
    expect((await call('GET', `/api/stats?profileId=${a.id}&from=2020-01-01&to=2026-09-21`)).status).toBe(400);
    expect((await call('GET', `/api/stats?from=2026-09-01&to=2026-09-21`)).status).toBe(400);
  });
});

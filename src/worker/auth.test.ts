import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disposeDatabases, freshDatabase, sqlStatements } from '../test/d1';
import type { Profile } from '../shared/api';
import { handleRequest } from './index';
import { hashPassword, setPasswordSql, verifyPassword } from './password';
import type { Env } from './routes';

/**
 * Auth boundary against a real (in-memory, test-owned) D1, as a remote environment sees it:
 * APP_ENV=production on an HTTPS hostname, so the local development identity never applies.
 */

const REMOTE = 'https://sleep.example';
const PASSWORD = 'correct horse battery';
let db: D1Database;

beforeEach(async () => {
  db = await freshDatabase();
});

afterAll(disposeDatabases);

const remoteEnv = (): Env => ({ DB: db, APP_ENV: 'production' });

/** What `pnpm auth set-password` does to the environment's D1. */
async function setPassword(password: string) {
  const statements = sqlStatements(setPasswordSql(await hashPassword(password)));
  await db.batch(statements.map((s) => db.prepare(s)));
}

interface CallOptions {
  cookie?: string;
  body?: unknown;
  ip?: string;
  base?: string;
  env?: Env;
  headers?: Record<string, string>;
}

function remote(method: string, path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = { ...options.headers };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.ip) headers['cf-connecting-ip'] = options.ip;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return handleRequest(
    new Request(`${options.base ?? REMOTE}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    options.env ?? remoteEnv(),
  );
}

const login = (password: string, ip?: string) => remote('POST', '/api/auth/login', { body: { password }, ip });

/** Signs in and returns the `name=value` cookie pair the browser would send back. */
async function signIn(password = PASSWORD): Promise<string> {
  const response = await login(password);
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

const errorCode = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;
const count = async (table: string) =>
  (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

describe('password verifier', () => {
  it('round-trips and rejects wrong or malformed verifiers', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$[\w-]{22}\$[\w-]{43}$/);
    expect(hash).not.toContain(PASSWORD);
    expect(await hashPassword(PASSWORD)).not.toBe(hash);
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(await verifyPassword('correct horse batterx', hash)).toBe(false);
    expect(await verifyPassword(PASSWORD, hash.replace('100000', '100001'))).toBe(false);
    expect(await verifyPassword(PASSWORD, 'plain')).toBe(false);
    expect(() => setPasswordSql("x'); DROP TABLE profiles; --")).toThrow();
  });
});

describe('auth boundary', () => {
  it('fails closed while no password is configured', async () => {
    const denied = await remote('GET', '/api/profiles');
    expect(denied.status).toBe(401);
    expect(await errorCode(denied)).toBe('unauthenticated');
    expect((await remote('POST', '/api/profiles', { body: { name: 'X', color: 'teal' } })).status).toBe(401);
    expect((await remote('DELETE', '/api/sessions/ses_x')).status).toBe(401);
    expect((await remote('GET', '/api/stats?profileId=x&from=2026-09-01&to=2026-09-02')).status).toBe(401);
    expect(await count('profiles')).toBe(0);
    const attempt = await login('anything at all');
    expect(attempt.status).toBe(503);
    expect(await errorCode(attempt)).toBe('auth_not_configured');
    expect(await (await remote('GET', '/api/auth/session')).json()).toEqual({ authenticated: false, method: null });
    // Health stays public (and data-free) for deployment checks.
    expect((await remote('GET', '/api/health')).status).toBe(200);
  });

  it('grants the local identity only to APP_ENV=local on a loopback host, unless auth is enforced', async () => {
    const onLoopback = (env: Env) => remote('GET', '/api/profiles', { base: 'http://127.0.0.1:8787', env });
    expect((await onLoopback({ DB: db, APP_ENV: 'local' })).status).toBe(200);
    expect(
      await (
        await remote('GET', '/api/auth/session', { base: 'http://localhost:5173', env: { DB: db, APP_ENV: 'local' } })
      ).json(),
    ).toEqual({ authenticated: true, method: 'local' });
    for (const env of [remoteEnv(), { DB: db, APP_ENV: 'dev' }, { DB: db }]) {
      expect((await onLoopback(env)).status).toBe(401);
    }
    const lan = await remote('GET', '/api/profiles', {
      base: 'http://192.168.1.20:5173',
      env: { DB: db, APP_ENV: 'local' },
    });
    expect(lan.status).toBe(401);
    const enforced = await remote('GET', '/api/profiles', {
      base: 'http://localhost:5173',
      env: { DB: db, APP_ENV: 'local' },
      headers: { 'x-sleep-tracker-auth': 'enforce' },
    });
    expect(enforced.status).toBe(401);
  });

  it('rejects a wrong password and signs in with the right one using a hardened session cookie', async () => {
    await setPassword(PASSWORD);
    const wrong = await login('incorrect horse');
    expect(wrong.status).toBe(401);
    expect(await errorCode(wrong)).toBe('invalid_password');
    expect(wrong.headers.get('set-cookie')).toBeNull();

    const ok = await login(PASSWORD);
    expect(await ok.json()).toEqual({ authenticated: true, method: 'session' });
    const setCookie = ok.headers.get('set-cookie')!;
    expect(setCookie).toMatch(
      /^__Host-sleep_session=[\w-]{43}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Strict; Secure$/,
    );
    const cookie = setCookie.split(';')[0]!;
    const token = cookie.split('=')[1]!;

    // Only a hash of the token is stored.
    const stored = await db.prepare('SELECT token_hash FROM auth_sessions').all<{ token_hash: string }>();
    expect(stored.results).toHaveLength(1);
    expect(stored.results[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.results[0]!.token_hash).not.toContain(token);

    expect(await (await remote('GET', '/api/auth/session', { cookie })).json()).toEqual({
      authenticated: true,
      method: 'session',
    });
    expect((await remote('POST', '/api/profiles', { cookie, body: { name: 'Robin', color: 'teal' } })).status).toBe(
      201,
    );
    const list = (await (await remote('GET', '/api/profiles', { cookie })).json()) as { profiles: Profile[] };
    expect(list.profiles.map((p) => p.name)).toEqual(['Robin']);
    const forged = `${cookie.slice(0, -1)}${cookie.endsWith('A') ? 'B' : 'A'}`;
    expect((await remote('GET', '/api/profiles', { cookie: forged })).status).toBe(401);
  });

  it('logs out by deleting this session and clearing the cookie', async () => {
    await setPassword(PASSWORD);
    const cookie = await signIn();
    const other = await signIn();
    const out = await remote('POST', '/api/auth/logout', { cookie });
    expect(await out.json()).toEqual({ authenticated: false, method: null });
    expect(out.headers.get('set-cookie')).toMatch(/^__Host-sleep_session=; Path=\/; Max-Age=0;/);
    expect((await remote('GET', '/api/profiles', { cookie })).status).toBe(401);
    expect((await remote('GET', '/api/profiles', { cookie: other })).status).toBe(200);
  });

  it('invalidates every session when the password is rotated', async () => {
    await setPassword(PASSWORD);
    const cookie = await signIn();
    await setPassword('a different long secret');
    expect(await count('auth_sessions')).toBe(0);
    expect((await remote('GET', '/api/profiles', { cookie })).status).toBe(401);
    expect((await login(PASSWORD)).status).toBe(401);
    const fresh = await signIn('a different long secret');
    expect((await remote('GET', '/api/profiles', { cookie: fresh })).status).toBe(200);
  });

  it('treats sessions older than the password, or without one, as void', async () => {
    await setPassword(PASSWORD);
    const cookie = await signIn();
    await db.prepare("UPDATE auth_password SET updated_at = '9999-01-01T00:00:00.000Z'").run();
    expect((await remote('GET', '/api/profiles', { cookie })).status).toBe(401);
    await db.prepare('DELETE FROM auth_password').run();
    expect((await remote('GET', '/api/profiles', { cookie })).status).toBe(401);
  });

  it('expires sessions and slides them forward while in use', async () => {
    await setPassword(PASSWORD);
    const cookie = await signIn();
    const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.prepare('UPDATE auth_sessions SET expires_at = ?').bind(inOneDay).run();
    const renewed = await remote('GET', '/api/profiles', { cookie });
    expect(renewed.status).toBe(200);
    expect(renewed.headers.get('set-cookie')).toBe(
      `${cookie}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict; Secure`,
    );
    const row = await db.prepare('SELECT expires_at FROM auth_sessions').first<{ expires_at: string }>();
    expect(Date.parse(row!.expires_at)).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);

    const expired = new Date(Date.now() - 1000).toISOString();
    await db.prepare('UPDATE auth_sessions SET expires_at = ?').bind(expired).run();
    expect((await remote('GET', '/api/profiles', { cookie })).status).toBe(401);
    expect(await count('auth_sessions')).toBe(0);
  });

  it('throttles repeated failed logins per client', async () => {
    await setPassword(PASSWORD);
    for (let i = 0; i < 10; i++) expect((await login('wrong guess', '203.0.113.9')).status).toBe(401);
    const blocked = await login(PASSWORD, '203.0.113.9');
    expect(blocked.status).toBe(429);
    expect(await errorCode(blocked)).toBe('too_many_attempts');
    expect((await login(PASSWORD, '198.51.100.4')).status).toBe(200);
    // Setting the password clears the throttle.
    await setPassword(PASSWORD);
    expect((await login(PASSWORD, '203.0.113.9')).status).toBe(200);
  });

  it('refuses remote sign-in over plain HTTP and cross-origin sign-in attempts', async () => {
    await setPassword(PASSWORD);
    const plain = await remote('POST', '/api/auth/login', {
      base: 'http://sleep.example',
      body: { password: PASSWORD },
    });
    expect(plain.status).toBe(400);
    expect(await errorCode(plain)).toBe('https_required');
    const cross = await remote('POST', '/api/auth/login', {
      body: { password: PASSWORD },
      headers: { origin: 'https://evil.example' },
    });
    expect(cross.status).toBe(403);
    expect(await count('auth_sessions')).toBe(0);
  });
});

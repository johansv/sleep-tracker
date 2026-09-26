import { z } from 'zod';
import type { AuthSessionResponse } from '../shared/api';
import { ApiError, json, readJson } from './http';
import { base64url, verifyPassword } from './password';
import type { Env } from './routes';

/**
 * Application auth: one password per environment, opaque server-side sessions.
 *
 * - The password verifier lives in `auth_password` (set by `pnpm auth set-password <env>`, which
 *   also deletes every session). No row means auth is not configured: login is refused and every
 *   protected route answers 401 — remote environments fail closed.
 * - A login creates a random 256-bit token; only its SHA-256 is stored. The browser holds the token
 *   in an HttpOnly, SameSite=Strict (and on HTTPS `__Host-`/Secure) cookie. Sessions last
 *   SESSION_TTL and slide forward while in use. Sessions older than the current password are void.
 * - Local development/tests get a fixed identity without login, but only when the deployment says
 *   `APP_ENV=local` (the top-level wrangler.jsonc config, never a remote env) AND the request is
 *   addressed to a loopback host. Sending `x-sleep-tracker-auth: enforce` opts a local request out
 *   so the real login flow can be exercised locally.
 */

export type Authentication = { method: 'local' } | { method: 'session'; renewCookie: string | null };

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_WINDOW = 10;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
export const ENFORCE_AUTH_HEADER = 'x-sleep-tracker-auth';

const loginSchema = z.object({ password: z.string().min(1).max(256) }).strict();

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function localIdentityAllowed(request: Request, env: Env, url: URL): boolean {
  return (
    env.APP_ENV === 'local' &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    request.headers.get(ENFORCE_AUTH_HEADER) !== 'enforce'
  );
}

const cookieName = (url: URL) => (url.protocol === 'https:' ? '__Host-sleep_session' : 'sleep_session');

function sessionCookie(url: URL, token: string, maxAgeSeconds: number): string {
  return [
    `${cookieName(url)}=${token}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(url.protocol === 'https:' ? ['Secure'] : []),
  ].join('; ');
}

function readSessionToken(request: Request, url: URL): string | null {
  const name = cookieName(url);
  for (const part of request.headers.get('cookie')?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) {
      const token = value.join('=');
      return /^[\w-]{43}$/.test(token) ? token : null;
    }
  }
  return null;
}

/** Who is calling, or null when the request is not authenticated. */
export async function authenticate(request: Request, env: Env): Promise<Authentication | null> {
  const url = new URL(request.url);
  if (localIdentityAllowed(request, env, url)) return { method: 'local' };
  const token = readSessionToken(request, url);
  if (!token) return null;
  const tokenHash = await sha256(token);
  // A session is only valid while a password is configured and it was created after that password.
  const row = await env.DB.prepare(
    `SELECT s.expires_at FROM auth_sessions s JOIN auth_password p ON p.id = 1
     WHERE s.token_hash = ? AND s.created_at >= p.updated_at`,
  )
    .bind(tokenHash)
    .first<{ expires_at: string }>();
  const now = Date.now();
  const expires = row ? Date.parse(row.expires_at) : NaN;
  if (!(expires > now)) {
    if (row) await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  if (expires - now > SESSION_TTL_MS / 2) return { method: 'session', renewCookie: null };
  await env.DB.prepare('UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?')
    .bind(new Date(now + SESSION_TTL_MS).toISOString(), tokenHash)
    .run();
  return { method: 'session', renewCookie: sessionCookie(url, token, SESSION_TTL_MS / 1000) };
}

export const unauthenticated = () => new ApiError(401, 'unauthenticated', 'Please sign in to continue.');

function sessionBody(auth: Authentication | null): AuthSessionResponse {
  return { authenticated: auth !== null, method: auth?.method ?? null };
}

/** `GET /api/auth/session` */
export async function sessionStatus(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  const response = json(sessionBody(auth));
  if (auth?.method === 'session' && auth.renewCookie) response.headers.append('set-cookie', auth.renewCookie);
  return response;
}

/** `POST /api/auth/login` */
export async function login(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (env.APP_ENV !== 'local' && url.protocol !== 'https:') {
    throw new ApiError(400, 'https_required', 'Sign in over HTTPS.');
  }
  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new ApiError(400, 'invalid_request', 'Enter the password.');

  const clientKey = await sha256(request.headers.get('cf-connecting-ip') ?? 'unknown');
  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const failures = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM auth_login_failures WHERE client_key = ? AND failed_at > ?',
  )
    .bind(clientKey, windowStart)
    .first<{ n: number }>();
  if ((failures?.n ?? 0) >= MAX_FAILURES_PER_WINDOW) {
    throw new ApiError(429, 'too_many_attempts', 'Too many attempts. Wait 15 minutes and try again.');
  }

  const stored = await env.DB.prepare('SELECT hash FROM auth_password WHERE id = 1').first<{ hash: string }>();
  if (!stored) {
    throw new ApiError(503, 'auth_not_configured', 'Sign-in is not set up for this environment yet.');
  }
  if (!(await verifyPassword(parsed.data.password, stored.hash))) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM auth_login_failures WHERE failed_at <= ?').bind(windowStart),
      env.DB.prepare('INSERT INTO auth_login_failures (client_key, failed_at) VALUES (?, ?)').bind(
        clientKey,
        new Date().toISOString(),
      ),
    ]);
    throw new ApiError(401, 'invalid_password', 'That password is not right.');
  }

  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_login_failures WHERE client_key = ?').bind(clientKey),
    env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(new Date(now).toISOString()),
    env.DB.prepare('INSERT INTO auth_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)').bind(
      await sha256(token),
      new Date(now).toISOString(),
      new Date(now + SESSION_TTL_MS).toISOString(),
    ),
  ]);
  const response = json(sessionBody({ method: 'session', renewCookie: null }));
  response.headers.append('set-cookie', sessionCookie(url, token, SESSION_TTL_MS / 1000));
  return response;
}

/** `POST /api/auth/logout` — ends this browser's session (other sessions stay valid). */
export async function logout(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = readSessionToken(request, url);
  if (token)
    await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?')
      .bind(await sha256(token))
      .run();
  const response = json(sessionBody(localIdentityAllowed(request, env, url) ? { method: 'local' } : null));
  response.headers.append('set-cookie', sessionCookie(url, '', 0));
  return response;
}

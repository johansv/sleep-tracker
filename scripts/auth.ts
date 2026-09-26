import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { AuthSessionResponse, Profile, SessionListResponse, SleepSession } from '../src/shared/api';
import { hashPassword, MIN_PASSWORD_LENGTH, setPasswordSql } from '../src/worker/password';
import { d1Args, d1Query, passwordConfigured, requireCloudflareAuth, requireProvisioned, wrangler } from './remote/cli';
import { DeployError, ENVIRONMENTS, parseEnvironment, publicUrl, type EnvironmentName } from './remote/policy';

/**
 * Application password administration for the remote environments (`pnpm auth <command> <env>`).
 *
 *   set-password <env> [--password-stdin]  set or rotate the env's password; ends every session
 *   verify <env> [--password-stdin]        exercise the deployed auth boundary end to end
 *
 * Without --password-stdin the password is read from the terminal without echo (set-password asks
 * twice). With it, the password is the whole of stdin (one trailing newline is ignored), for
 * non-interactive use: `… --password-stdin < file-outside-the-repo`. The plaintext is never
 * printed, logged, passed as an argument or written to disk; only the salted PBKDF2 verifier is
 * sent to D1 (through a private temporary file that is removed immediately).
 */

const log = (message: string) => console.log(`[auth] ${message}`);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return Promise.reject(new DeployError('No terminal for password entry. Pipe it in with --password-stdin.'));
  }
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (result: () => void) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      result();
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish(() => resolve(value));
        if (char === '\u0003') return finish(() => reject(new DeployError('Cancelled.')));
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function readPassword(fromStdin: boolean, confirm: boolean): Promise<string> {
  if (fromStdin) return readStdin();
  const password = await promptHidden('Password: ');
  if (confirm && (await promptHidden('Repeat password: ')) !== password) {
    throw new DeployError('The passwords do not match; nothing was changed.');
  }
  return password;
}

function requireAuthSchema(env: EnvironmentName): void {
  const tables = d1Query<{ name: string }>(
    env,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('auth_password', 'auth_sessions')",
  );
  if (tables.length !== 2) {
    throw new DeployError(`The ${env} database has no auth tables yet. Run \`pnpm cf migrate ${env}\` first.`);
  }
}

async function setPassword(env: EnvironmentName, fromStdin: boolean): Promise<void> {
  const databaseId = requireProvisioned(env);
  requireCloudflareAuth();
  requireAuthSchema(env);
  log(`Target: ${env} · ${publicUrl(env)} · D1 ${ENVIRONMENTS[env].database} (${databaseId})`);
  log('Setting the password ends every existing session in this environment.');

  const password = await readPassword(fromStdin, true);
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new DeployError(`Use at least ${MIN_PASSWORD_LENGTH} characters; nothing was changed.`);
  }
  if (password.length > 256) throw new DeployError('Use at most 256 characters; nothing was changed.');

  const dir = mkdtempSync(path.join(tmpdir(), 'sleep-tracker-auth-'));
  try {
    const file = path.join(dir, 'set-password.sql');
    writeFileSync(file, setPasswordSql(await hashPassword(password)), { mode: 0o600 });
    wrangler(['d1', 'execute', ...d1Args(env), '--file', file, '--yes'], true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (!passwordConfigured(env)) throw new DeployError(`Could not confirm the new ${env} password in D1.`);
  const sessions = d1Query<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM auth_sessions')[0]?.n;
  log(`Password set for ${env}; ${sessions ?? '?'} sessions remain (all earlier sessions were ended).`);
}

// ---------------------------------------------------------------------------------------------
// Remote verification through the real HTTPS boundary

class Client {
  cookie: string | null = null;
  constructor(private readonly base: string) {}

  async call<T>(method: string, apiPath: string, body?: unknown): Promise<{ status: number; body: T }> {
    const response = await fetch(`${this.base}${apiPath}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0]!;
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed as T };
  }
}

function expectStatus(step: string, actual: number, expected: number): void {
  if (actual !== expected) throw new DeployError(`${step}: HTTP ${actual}, expected ${expected}.`);
  log(`✓ ${step} (HTTP ${actual})`);
}

/** Remove a verification profile and its nights directly in D1, and prove nothing is left. */
function removeVerificationProfile(env: EnvironmentName, profileId: string): void {
  if (!/^prf_[0-9a-f]{32}$/.test(profileId)) throw new DeployError(`Unexpected profile id ${profileId}.`);
  wrangler(
    [
      'd1',
      'execute',
      ...d1Args(env),
      '--yes',
      '--command',
      `DELETE FROM sleep_sessions WHERE profile_id = '${profileId}'; DELETE FROM profiles WHERE id = '${profileId}'`,
    ],
    true,
  );
  const left = d1Query<{ n: number }>(
    env,
    `SELECT (SELECT COUNT(*) FROM profiles WHERE id = '${profileId}') + (SELECT COUNT(*) FROM sleep_sessions WHERE profile_id = '${profileId}') AS n`,
  )[0]?.n;
  if (left !== 0) throw new DeployError(`Cleanup of verification profile ${profileId} is incomplete.`);
  log(`✓ verification profile removed (no rows left for ${profileId})`);
}

async function verify(env: EnvironmentName, fromStdin: boolean): Promise<void> {
  requireProvisioned(env);
  requireCloudflareAuth();
  const base = publicUrl(env);
  log(`Verifying the auth boundary of ${env} at ${base}`);
  const password = await readPassword(fromStdin, false);
  const client = new Client(base);

  expectStatus('health is public', (await client.call('GET', '/api/health')).status, 200);
  expectStatus('unauthenticated data read is refused', (await client.call('GET', '/api/profiles')).status, 401);
  expectStatus(
    'unauthenticated mutation is refused',
    (await client.call('POST', '/api/profiles', { name: 'Unauthenticated', color: 'teal' })).status,
    401,
  );
  const anonymous = await client.call<AuthSessionResponse>('GET', '/api/auth/session');
  if (anonymous.body.authenticated) throw new DeployError('An anonymous caller is reported as signed in.');

  const signIn = await client.call<AuthSessionResponse>('POST', '/api/auth/login', { password });
  expectStatus('sign-in with the password', signIn.status, 200);
  if (!client.cookie?.startsWith('__Host-sleep_session='))
    throw new DeployError('Sign-in set no secure session cookie.');
  const sessionCookie = client.cookie;

  const profiles = await client.call<{ profiles: Profile[] }>('GET', '/api/profiles');
  expectStatus(`authenticated read (${profiles.body.profiles?.length ?? '?'} profiles)`, profiles.status, 200);

  // Representative mutations on a temporary profile that is removed again, in every environment.
  const created = await client.call<{ profile: Profile }>('POST', '/api/profiles', {
    name: `Verify ${new Date().toISOString().slice(11, 19)}`,
    color: 'sky',
  });
  expectStatus('create a temporary profile', created.status, 201);
  const profileId = created.body.profile.id;
  try {
    const night = await client.call<{ session: SleepSession }>('POST', '/api/sessions', {
      profileId,
      nightDate: '2026-01-02',
      bedtime: '2026-01-01T23:15',
      wakeTime: '2026-01-02T07:05',
    });
    expectStatus('log a night', night.status, 201);
    const listed = await client.call<SessionListResponse>('GET', `/api/sessions?profileId=${profileId}`);
    expectStatus('read the night back', listed.status, 200);
    if (listed.body.sessions.map((s) => s.id).join() !== night.body.session.id) {
      throw new DeployError('The logged night is not observable through the API.');
    }
    expectStatus(
      'delete the night',
      (await client.call('DELETE', `/api/sessions/${night.body.session.id}`)).status,
      204,
    );
    const after = await client.call<SessionListResponse>('GET', `/api/sessions?profileId=${profileId}`);
    if (after.body.sessions.length !== 0) throw new DeployError('The deleted night is still listed.');
    log('✓ the deletion is observable');
  } finally {
    removeVerificationProfile(env, profileId);
  }

  expectStatus('sign out', (await client.call('POST', '/api/auth/logout')).status, 200);
  client.cookie = sessionCookie;
  expectStatus('the signed-out session is refused', (await client.call('GET', '/api/profiles')).status, 401);
  log(`Auth boundary verified for ${env}.`);
}

async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { 'password-stdin': { type: 'boolean', default: false } },
  });
  const [command, envName] = positionals;
  const fromStdin = values['password-stdin'];
  switch (command) {
    case 'set-password':
      return setPassword(parseEnvironment(envName), fromStdin);
    case 'verify':
      return verify(parseEnvironment(envName), fromStdin);
    default:
      console.log(`Usage: pnpm auth <command> <dev|staging|production> [--password-stdin]

  set-password <env>   set or rotate the application password (ends every session)
  verify <env>         check the deployed sign-in boundary end to end (cleans up after itself)`);
      if (command && command !== 'help') process.exitCode = 1;
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`[auth] ${error instanceof DeployError ? error.message : String(error)}`);
  if (!(error instanceof DeployError)) console.error(error);
  process.exit(1);
});

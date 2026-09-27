/**
 * Password verifier format shared by the Worker (login) and `pnpm auth set-password` (Node).
 * Both use WebCrypto only: PBKDF2-HMAC-SHA-256 with a random 16-byte salt, stored as
 * `pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>`. 100 000 iterations is the maximum
 * the Workers runtime accepts for PBKDF2.
 */

export const PBKDF2_ITERATIONS = 100_000;
const ALGORITHM = 'pbkdf2-sha256';
const HASH_BYTES = 32;

/** Minimum length accepted by `pnpm auth set-password`; the login itself only checks the hash. */
export const MIN_PASSWORD_LENGTH = 12;

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[\w-]*$/.test(value)) return null;
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return [ALGORITHM, PBKDF2_ITERATIONS, base64url(salt), base64url(hash)].join('$');
}

/**
 * SQL that `pnpm auth set-password` runs against an environment's D1: store the new verifier
 * (timestamped by D1 itself) and end every existing session and login-throttle entry.
 */
export function setPasswordSql(hash: string): string {
  if (!/^[\w$-]+$/.test(hash)) throw new Error('Refusing to write a malformed password hash.');
  return [
    `INSERT INTO auth_password (id, hash, updated_at) VALUES (1, '${hash}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    '  ON CONFLICT (id) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at;',
    'DELETE FROM auth_sessions;',
    'DELETE FROM auth_login_failures;',
    '',
  ].join('\n');
}

/** Constant-time comparison of equal-length byte arrays. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** False for a wrong password and for a malformed/unsupported stored verifier. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationText, saltText, hashText] = stored.split('$');
  const iterations = Number(iterationText);
  const salt = fromBase64url(saltText ?? '');
  const expected = fromBase64url(hashText ?? '');
  if (
    algorithm !== ALGORITHM ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > PBKDF2_ITERATIONS ||
    !salt?.length ||
    expected?.length !== HASH_BYTES
  ) {
    return false;
  }
  return equalBytes(await derive(password, salt, iterations), expected);
}

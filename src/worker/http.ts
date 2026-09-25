import type { ApiErrorBody } from '../shared/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
  }
}

/** Mutation payloads are a few hundred bytes; anything far larger is refused unread. */
export const MAX_JSON_BODY_BYTES = 4 * 1024;

const tooLarge = () => new ApiError(413, 'payload_too_large', 'Request body is too large.');

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function errorResponse(error: ApiError): Response {
  const body: ApiErrorBody = { error: { code: error.code, message: error.message } };
  if (error.details?.length) body.error.details = error.details;
  return json(body, error.status);
}

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError(415, 'unsupported_media_type', 'Expected a JSON request body.');
  }
  const declared = Number(request.headers.get('content-length'));
  if (declared > MAX_JSON_BODY_BYTES) throw tooLarge();
  const text = await readBounded(request);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body is not valid JSON.');
  }
}

/** Read the body but stop as soon as it exceeds the limit (covers chunked bodies without a length). */
async function readBounded(request: Request): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Browsers attach `Origin` to cross-site requests; mutations are accepted only from this app's
 * own origin. Requests without `Origin` (curl, scripts, local tooling) are unaffected.
 */
export function assertSameOriginMutation(request: Request): void {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== new URL(request.url).origin) {
    throw new ApiError(403, 'cross_origin', 'Cross-origin requests are not allowed.');
  }
}

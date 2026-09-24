import type {
  ApiErrorBody,
  CreateProfileInput,
  CreateSessionInput,
  Profile,
  SessionBody,
  SessionListResponse,
  SleepSession,
  StatsResponse,
  UpdateProfileInput,
} from '../shared/api';

/** Typed browser boundary to the same-origin Worker API. Online-only: nothing is cached offline. */

export class ApiRequestError extends Error {
  constructor(
    readonly kind: 'network' | 'http',
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const NETWORK_MESSAGE = "Can't reach Sleep Tracker. Check your connection and try again.";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError('network', NETWORK_MESSAGE);
  }
  if (response.status === 204) return undefined as T;
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiRequestError(
      response.ok ? 'http' : 'network',
      response.ok ? 'Unexpected response from the server.' : NETWORK_MESSAGE,
      response.status,
    );
  }
  if (!response.ok) {
    const error = (data as Partial<ApiErrorBody>).error;
    throw new ApiRequestError('http', error?.message ?? 'Something went wrong.', response.status, error?.code);
  }
  return data as T;
}

function query(params: Record<string, string | readonly string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const v of typeof value === 'string' ? [value] : value) search.append(key, v);
  }
  return search.toString();
}

export const api = {
  listProfiles: () => request<{ profiles: Profile[] }>('GET', '/api/profiles').then((r) => r.profiles),
  createProfile: (input: CreateProfileInput) =>
    request<{ profile: Profile }>('POST', '/api/profiles', input).then((r) => r.profile),
  updateProfile: (id: string, input: UpdateProfileInput) =>
    request<{ profile: Profile }>('PATCH', `/api/profiles/${encodeURIComponent(id)}`, input).then((r) => r.profile),

  listSessions: (profileId: string, range: { from?: string; to?: string } = {}) =>
    request<SessionListResponse>('GET', `/api/sessions?${query({ profileId, ...range })}`),
  createSession: (input: CreateSessionInput) =>
    request<{ session: SleepSession }>('POST', '/api/sessions', input).then((r) => r.session),
  updateSession: (id: string, input: SessionBody) =>
    request<{ session: SleepSession }>('PUT', `/api/sessions/${encodeURIComponent(id)}`, input).then((r) => r.session),
  deleteSession: (id: string) => request<void>('DELETE', `/api/sessions/${encodeURIComponent(id)}`),

  stats: (profileIds: readonly string[], range: { from: string; to: string }) =>
    request<StatsResponse>('GET', `/api/stats?${query({ profileId: profileIds, ...range })}`),
};

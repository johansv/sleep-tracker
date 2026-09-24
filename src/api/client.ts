import type { Profile, Session, SessionInput, PeriodKind } from '../shared/models.ts';
import type { Statistics } from '../domain/statistics.ts';
export type Comparison = { profile: Profile; statistics: Statistics }[];
async function request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      cache: 'no-store',
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    });
  } catch {
    throw new Error('Connection lost. Your changes have not been saved. Reconnect and try again.');
  }
  const result: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
        ? result.error
        : 'Something went wrong. Please try again.',
    );
  return result as T;
}
export const api = {
  profiles: () => request<Profile[]>('/profiles'),
  saveProfile: (data: { name: string; is_active: boolean }, id?: string) =>
    request<Profile>(`/profiles${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', data),
  sessions: (id: string, start: string, end: string) =>
    request<Session[]>(`/profiles/${id}/sessions?start=${start}&end=${end}`),
  saveSession: (profile: string, data: SessionInput, id?: string) =>
    request<Session>(
      `/profiles/${profile}/sessions${id ? `/${id}` : ''}`,
      id ? 'PUT' : 'POST',
      data,
    ),
  deleteSession: (profile: string, id: string) =>
    request(`/profiles/${profile}/sessions/${id}`, 'DELETE'),
  statistics: (kind: PeriodKind, anchor: string) =>
    request<Comparison>(`/statistics?kind=${kind}&anchor=${anchor}`),
};

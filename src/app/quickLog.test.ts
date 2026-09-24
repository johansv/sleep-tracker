import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../api/client';
import type { SleepSession } from '../shared/api';
import { writeNight } from './quickLog';

const session = (overrides: Partial<SleepSession>): SleepSession => ({
  id: 'ses_1',
  profileId: 'prf_sam',
  nightDate: '2026-09-25',
  bedtime: null,
  wakeTime: null,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

function fakeApi(existing: SleepSession[]) {
  return {
    listSessions: vi.fn(async () => ({ sessions: existing, earliestNightDate: null, latestNightDate: null })),
    createSession: vi.fn(async (input) => session({ ...input, id: 'ses_new' })),
    updateSession: vi.fn(async (id: string, body) => session({ ...body, id })),
  };
}

describe('writeNight', () => {
  it('completes the target’s existing night instead of creating a duplicate', async () => {
    const client = fakeApi([session({ bedtime: '2026-09-24T22:40' })]);
    const result = await writeNight(client, { id: 'prf_sam' }, '2026-09-25', { wakeTime: '2026-09-25T07:05' });
    expect(client.listSessions).toHaveBeenCalledWith('prf_sam', { from: '2026-09-25', to: '2026-09-25' });
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.updateSession).toHaveBeenCalledWith('ses_1', {
      nightDate: '2026-09-25',
      bedtime: '2026-09-24T22:40',
      wakeTime: '2026-09-25T07:05',
    });
    expect(result.previous?.wakeTime).toBeNull();
  });

  it('creates a new night for the target when none exists', async () => {
    const client = fakeApi([]);
    await writeNight(client, { id: 'prf_sam' }, '2026-09-25', { bedtime: '2026-09-24T22:40' });
    expect(client.createSession).toHaveBeenCalledWith({
      profileId: 'prf_sam',
      nightDate: '2026-09-25',
      bedtime: '2026-09-24T22:40',
      wakeTime: null,
    });
  });

  it('re-resolves and updates when a concurrent create wins the race', async () => {
    const client = fakeApi([]);
    client.createSession.mockRejectedValueOnce(new ApiRequestError('http', 'dup', 409, 'duplicate_night'));
    client.listSessions
      .mockResolvedValueOnce({ sessions: [], earliestNightDate: null, latestNightDate: null })
      .mockResolvedValueOnce({
        sessions: [session({ wakeTime: '2026-09-25T07:00' })],
        earliestNightDate: null,
        latestNightDate: null,
      });
    await writeNight(client, { id: 'prf_sam' }, '2026-09-25', { bedtime: '2026-09-24T22:40' });
    expect(client.updateSession).toHaveBeenCalledWith('ses_1', {
      nightDate: '2026-09-25',
      bedtime: '2026-09-24T22:40',
      wakeTime: '2026-09-25T07:00',
    });
  });
});

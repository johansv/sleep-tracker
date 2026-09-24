import { ApiRequestError, type api } from '../api/client';
import type { LocalDate } from '../domain/civil';
import type { Profile, SessionBody, SleepSession } from '../shared/api';

type SessionApi = Pick<typeof api, 'listSessions' | 'createSession' | 'updateSession'>;

export interface NightWrite {
  saved: SleepSession;
  /** The record as it was before this write, or null if the night was new (for undo). */
  previous: SleepSession | null;
}

/**
 * Record one endpoint for `target`'s night. The target's current record for that night is read
 * from the server immediately before writing, so a stale screen or a just-switched logging target
 * can never create a duplicate or touch another person's night. If a concurrent create wins the
 * race, the fresh record is resolved once more and updated instead.
 */
export async function writeNight(
  client: SessionApi,
  target: Pick<Profile, 'id'>,
  nightDate: LocalDate,
  patch: Partial<Pick<SessionBody, 'bedtime' | 'wakeTime'>>,
): Promise<NightWrite> {
  for (let attempt = 0; ; attempt++) {
    const { sessions } = await client.listSessions(target.id, { from: nightDate, to: nightDate });
    const previous = sessions.find((s) => s.profileId === target.id && s.nightDate === nightDate) ?? null;
    const body: SessionBody = {
      nightDate,
      bedtime: previous?.bedtime ?? null,
      wakeTime: previous?.wakeTime ?? null,
      ...patch,
    };
    try {
      const saved = previous
        ? await client.updateSession(previous.id, body)
        : await client.createSession({ profileId: target.id, ...body });
      return { saved, previous };
    } catch (error) {
      const raced = !previous && error instanceof ApiRequestError && error.code === 'duplicate_night';
      if (raced && attempt === 0) continue;
      throw error;
    }
  }
}

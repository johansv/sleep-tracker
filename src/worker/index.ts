import { z } from 'zod';
import {
  dateSchema,
  periodQuerySchema,
  profileSchema,
  sessionSchema,
} from '../domain/validation.ts';
import { periodFor } from '../domain/time.ts';
import { statistics } from '../domain/statistics.ts';
import type { Profile, Session } from '../shared/models.ts';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

// Bounded parsing also covers requests without a Content-Length header.
async function body(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new HttpError(415, 'Send JSON data.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Send JSON data.');
  let size = 0;
  let text = '';
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new HttpError(413, 'This record is too large.');
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new HttpError(400, 'Send valid JSON data.');
  }
}

async function profile(db: D1Database, id: string) {
  const row = await db
    .prepare('SELECT * FROM profiles WHERE id = ? AND household_id = ?')
    .bind(id, 'local-household')
    .first<Profile>();
  if (!row) throw new HttpError(404, 'Profile not found.');
  return row;
}
async function session(db: D1Database, id: string, profileId: string) {
  const row = await db
    .prepare('SELECT * FROM sessions WHERE id = ? AND profile_id = ?')
    .bind(id, profileId)
    .first<Session>();
  if (!row) throw new HttpError(404, 'Night not found. It may have been deleted.');
  return row;
}
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const method = request.method;
  const db = env.DB;
  if (parts[0] !== 'api') throw new HttpError(404, 'Not found.');
  if (!['GET', 'HEAD'].includes(method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'Use this app to save changes.');
  }
  if (url.pathname === '/api/profiles') {
    if (method === 'GET')
      return json(
        (
          await db
            .prepare('SELECT * FROM profiles WHERE household_id = ? ORDER BY created_at, id')
            .bind('local-household')
            .all<Profile>()
        ).results,
      );
    if (method === 'POST') {
      const input = profileSchema.parse(await body(request));
      const id = crypto.randomUUID();
      await db
        .prepare('INSERT INTO profiles (id, household_id, name, is_active) VALUES (?, ?, ?, ?)')
        .bind(id, 'local-household', input.name, Number(input.is_active))
        .run();
      return json(await profile(db, id), 201);
    }
  }
  if (parts[1] === 'profiles' && parts[2]) {
    const person = await profile(db, parts[2]);
    if (parts.length === 3 && method === 'PATCH') {
      const input = profileSchema.parse(await body(request));
      await db
        .prepare(
          "UPDATE profiles SET name = ?, is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        )
        .bind(input.name, Number(input.is_active), person.id)
        .run();
      return json(await profile(db, person.id));
    }
    if (parts[3] === 'sessions' && parts.length <= 5) {
      const id = parts[4];
      if (method === 'GET' && !id) {
        const start = dateSchema.parse(url.searchParams.get('start') ?? '0001-01-01');
        const end = dateSchema.parse(url.searchParams.get('end') ?? '9999-12-31');
        if (start > end) throw new HttpError(400, 'Start date must precede end date.');
        return json(
          (
            await db
              .prepare(
                'SELECT * FROM sessions WHERE profile_id = ? AND night_date BETWEEN ? AND ? ORDER BY night_date DESC',
              )
              .bind(person.id, start, end)
              .all<Session>()
          ).results,
        );
      }
      if ((method === 'POST' && !id) || (method === 'PUT' && id)) {
        const input = sessionSchema.parse(await body(request));
        if (id) await session(db, id, person.id);
        const sessionId = id ?? crypto.randomUUID();
        try {
          if (id)
            await db
              .prepare(
                "UPDATE sessions SET night_date = ?, bedtime_local = ?, wake_time_local = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND profile_id = ?",
              )
              .bind(input.night_date, input.bedtime_local, input.wake_time_local, id, person.id)
              .run();
          else
            await db
              .prepare(
                'INSERT INTO sessions (id, profile_id, night_date, bedtime_local, wake_time_local) VALUES (?, ?, ?, ?, ?)',
              )
              .bind(
                sessionId,
                person.id,
                input.night_date,
                input.bedtime_local,
                input.wake_time_local,
              )
              .run();
        } catch (error) {
          if (error instanceof Error && error.message.includes('UNIQUE constraint failed'))
            throw new HttpError(
              409,
              'A record already exists for this night. Open it from History to make changes.',
            );
          throw error;
        }
        return json(await session(db, sessionId, person.id), id ? 200 : 201);
      }
      if (method === 'DELETE' && id) {
        await session(db, id, person.id);
        await db
          .prepare('DELETE FROM sessions WHERE id = ? AND profile_id = ?')
          .bind(id, person.id)
          .run();
        return json({ deleted: true });
      }
    }
  }
  if (url.pathname === '/api/statistics' && method === 'GET') {
    const input = periodQuerySchema.parse(Object.fromEntries(url.searchParams));
    const period = periodFor(input.kind, input.anchor);
    const people = (
      await db
        .prepare('SELECT * FROM profiles WHERE household_id = ? ORDER BY created_at, id')
        .bind('local-household')
        .all<Profile>()
    ).results;
    const rows = (
      await db
        .prepare(
          'SELECT s.* FROM sessions s JOIN profiles p ON p.id = s.profile_id WHERE p.household_id = ? AND s.night_date BETWEEN ? AND ?',
        )
        .bind('local-household', period.start, period.end)
        .all<Session>()
    ).results;
    return json(
      people.map((p) => ({
        profile: p,
        statistics: statistics(
          rows.filter((s) => s.profile_id === p.id),
          period,
        ),
      })),
    );
  }
  throw new HttpError(404, 'This resource was not found.');
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof z.ZodError)
        return json({ error: error.issues.map((i) => i.message).join(' ') }, 400);
      console.error(
        JSON.stringify({
          event: 'request_failed',
          method: request.method,
          path: new URL(request.url).pathname,
        }),
      );
      return json({ error: 'We could not reach your records. Please try again.' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

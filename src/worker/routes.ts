import type { z } from 'zod';
import { rangeLength } from '../domain/period';
import { validateSession } from '../domain/session';
import { computePeriodStats } from '../domain/stats';
import type { HealthResponse, SessionBody, SessionListResponse, StatsResponse } from '../shared/api';
import type { RequestContext } from './context';
import * as db from './db';
import { ApiError, json, readJson } from './http';
import {
  createProfileSchema,
  createSessionSchema,
  sessionBodySchema,
  sessionQuerySchema,
  statsQuerySchema,
  updateProfileSchema,
} from './schemas';

export interface Env {
  DB: D1Database;
  /** Deployment identity (wrangler.jsonc `vars`, plus `--var` from `pnpm cf` deploys). */
  APP_ENV?: string;
  APP_REVISION?: string;
  APP_SOURCE?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
}

async function health(env: Env): Promise<Response> {
  const database = await db.databaseHealth(env.DB);
  const version = env.CF_VERSION_METADATA;
  const body: HealthResponse = {
    ok: database.ok,
    environment: env.APP_ENV ?? 'local',
    revision: env.APP_REVISION || null,
    source: env.APP_SOURCE || null,
    workerVersion: version?.id
      ? { id: version.id, tag: version.tag || null, timestamp: version.timestamp || null }
      : null,
    database,
  };
  return json(body, database.ok ? 200 : 503);
}

const MAX_RANGE_DAYS = 400;

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      400,
      'invalid_request',
      'The request is not valid.',
      result.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)),
    );
  }
  return result.data;
}

function assertValidSession(body: SessionBody): void {
  const issues = validateSession(body);
  if (issues.length > 0) {
    throw new ApiError(
      422,
      issues[0]!.code,
      issues[0]!.message,
      issues.map((i) => i.message),
    );
  }
}

const duplicateNight = () => new ApiError(409, 'duplicate_night', 'This profile already has a record for that night.');

async function requireProfile(env: Env, ctx: RequestContext, profileId: string) {
  const profile = await db.getProfile(env.DB, ctx.householdId, profileId);
  if (!profile) throw new ApiError(404, 'profile_not_found', 'Profile not found.');
  return profile;
}

function queryObject(url: URL, multi: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(url.searchParams.keys())) {
    out[key] = multi.includes(key) ? url.searchParams.getAll(key) : url.searchParams.get(key);
  }
  return out;
}

type Handler = (args: {
  request: Request;
  env: Env;
  ctx: RequestContext;
  url: URL;
  params: string[];
}) => Promise<Response>;

const routes: Array<[method: string, pattern: RegExp, handler: Handler]> = [
  ['GET', /^\/api\/health$/, async ({ env }) => health(env)],

  [
    'GET',
    /^\/api\/profiles$/,
    async ({ env, ctx }) => json({ profiles: await db.listProfiles(env.DB, ctx.householdId) }),
  ],
  [
    'POST',
    /^\/api\/profiles$/,
    async ({ request, env, ctx }) => {
      const input = parse(createProfileSchema, await readJson(request));
      return json({ profile: await db.insertProfile(env.DB, ctx.householdId, input) }, 201);
    },
  ],
  [
    'PATCH',
    /^\/api\/profiles\/([\w-]+)$/,
    async ({ request, env, ctx, params }) => {
      const input = parse(updateProfileSchema, await readJson(request));
      const profile = await db.updateProfile(env.DB, ctx.householdId, params[0]!, input);
      if (!profile) throw new ApiError(404, 'profile_not_found', 'Profile not found.');
      return json({ profile });
    },
  ],

  [
    'GET',
    /^\/api\/sessions$/,
    async ({ env, ctx, url }) => {
      const query = parse(sessionQuerySchema, queryObject(url));
      await requireProfile(env, ctx, query.profileId);
      const [sessions, bounds] = await Promise.all([
        db.listSessions(env.DB, ctx.householdId, [query.profileId], query),
        db.nightDateBounds(env.DB, query.profileId),
      ]);
      const body: SessionListResponse = {
        sessions,
        earliestNightDate: bounds.earliest,
        latestNightDate: bounds.latest,
      };
      return json(body);
    },
  ],
  [
    'POST',
    /^\/api\/sessions$/,
    async ({ request, env, ctx }) => {
      const input = parse(createSessionSchema, await readJson(request));
      assertValidSession(input);
      await requireProfile(env, ctx, input.profileId);
      try {
        return json({ session: await db.insertSession(env.DB, ctx.householdId, input) }, 201);
      } catch (error) {
        if (db.isUniqueViolation(error)) throw duplicateNight();
        throw error;
      }
    },
  ],
  [
    'PUT',
    /^\/api\/sessions\/([\w-]+)$/,
    async ({ request, env, ctx, params }) => {
      const input = parse(sessionBodySchema, await readJson(request));
      assertValidSession(input);
      try {
        const session = await db.updateSession(env.DB, ctx.householdId, params[0]!, input);
        if (!session) throw new ApiError(404, 'session_not_found', 'Record not found.');
        return json({ session });
      } catch (error) {
        if (db.isUniqueViolation(error)) throw duplicateNight();
        throw error;
      }
    },
  ],
  [
    'DELETE',
    /^\/api\/sessions\/([\w-]+)$/,
    async ({ env, ctx, params }) => {
      if (!(await db.deleteSession(env.DB, ctx.householdId, params[0]!))) {
        throw new ApiError(404, 'session_not_found', 'Record not found.');
      }
      return new Response(null, { status: 204 });
    },
  ],

  [
    'GET',
    /^\/api\/stats$/,
    async ({ env, ctx, url }) => {
      const query = parse(statsQuerySchema, queryObject(url, ['profileId']));
      const range = { from: query.from, to: query.to };
      const days = rangeLength(range);
      if (days < 1 || days > MAX_RANGE_DAYS) {
        throw new ApiError(400, 'invalid_range', `Range must cover 1–${MAX_RANGE_DAYS} days.`);
      }
      const profileIds = [...new Set(query.profileId)];
      for (const id of profileIds) await requireProfile(env, ctx, id);
      const sessions = await db.listSessions(env.DB, ctx.householdId, profileIds, range);
      const body: StatsResponse = {
        profiles: profileIds.map((profileId) => ({
          profileId,
          stats: computePeriodStats(
            sessions.filter((s) => s.profileId === profileId),
            range,
          ),
        })),
      };
      return json(body);
    },
  ],
];

export async function route(request: Request, env: Env, ctx: RequestContext): Promise<Response> {
  const url = new URL(request.url);
  let pathMatched = false;
  for (const [method, pattern, handler] of routes) {
    const match = pattern.exec(url.pathname);
    if (!match) continue;
    pathMatched = true;
    if (method === request.method) return handler({ request, env, ctx, url, params: match.slice(1) });
  }
  if (pathMatched) throw new ApiError(405, 'method_not_allowed', 'Method not allowed.');
  throw new ApiError(404, 'not_found', 'Not found.');
}

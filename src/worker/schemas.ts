import { z } from 'zod';
import { isLocalDate, isLocalDateTime } from '../domain/civil';
import {
  PROFILE_COLORS,
  type CreateProfileInput,
  type CreateSessionInput,
  type SessionBody,
  type UpdateProfileInput,
} from '../shared/api';

/** Runtime validation of untrusted API input. Schemas are checked against the shared API types. */

const localDate = z.string().refine(isLocalDate, 'Expected a YYYY-MM-DD local date');
const localDateTime = z.string().refine(isLocalDateTime, 'Expected a YYYY-MM-DDTHH:MM local date-time');
const profileName = z.string().trim().min(1, 'Name is required').max(40, 'Name is too long');

export const createProfileSchema = z.strictObject({
  name: profileName,
  color: z.enum(PROFILE_COLORS),
});

export const updateProfileSchema = z
  .strictObject({
    name: profileName.optional(),
    color: z.enum(PROFILE_COLORS).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const sessionBodySchema = z.strictObject({
  nightDate: localDate,
  bedtime: localDateTime.nullable(),
  wakeTime: localDateTime.nullable(),
});

export const createSessionSchema = sessionBodySchema.extend({ profileId: z.string().min(1) });

export const sessionQuerySchema = z.strictObject({
  profileId: z.string().min(1),
  from: localDate.optional(),
  to: localDate.optional(),
});

export const statsQuerySchema = z.strictObject({
  profileId: z.array(z.string().min(1)).min(1).max(50),
  from: localDate,
  to: localDate,
});

// Compile-time guarantees that validated input matches the shared browser/API contract.
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contracts: [
  Equals<z.infer<typeof createProfileSchema>, CreateProfileInput>,
  Equals<z.infer<typeof updateProfileSchema>, UpdateProfileInput>,
  Equals<z.infer<typeof sessionBodySchema>, SessionBody>,
  Equals<z.infer<typeof createSessionSchema>, CreateSessionInput>,
] = [true, true, true, true];
void contracts;

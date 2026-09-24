import { z } from 'zod';
import { Temporal } from './time.ts';

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.')
  .refine((value) => {
    try {
      return Temporal.PlainDate.from(value).toString() === value;
    } catch {
      return false;
    }
  }, 'Choose a valid calendar date.');
const localSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use a local date and 24-hour time.')
  .refine((value) => {
    try {
      return Temporal.PlainDateTime.from(value).toString({ smallestUnit: 'minute' }) === value;
    } catch {
      return false;
    }
  }, 'Choose a valid local date and time.');
export const profileSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name.').max(60, 'Use 60 characters or fewer.'),
    is_active: z.boolean(),
  })
  .strict();
export const sessionSchema = z
  .object({
    night_date: dateSchema,
    bedtime_local: localSchema.nullable(),
    wake_time_local: localSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (!value.bedtime_local && !value.wake_time_local) issue('Add a bedtime or wake-up time.');
    if (value.wake_time_local && value.wake_time_local.slice(0, 10) !== value.night_date)
      issue('Wake-up date must match the night ending date.');
    if (
      value.bedtime_local &&
      value.wake_time_local &&
      value.wake_time_local <= value.bedtime_local
    )
      issue('Wake-up must be later than bedtime. Check both dates.');
  });
export const periodQuerySchema = z.object({
  kind: z.enum(['rolling', 'week', 'month', 'year']),
  anchor: dateSchema,
});

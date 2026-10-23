import { z } from "zod";

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const optionalId = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(objectIdSchema.optional());

const blankToUndefined = (value: unknown) => (value === "" || value == null ? undefined : value);

export const listQuerySchema = z.object({
  page: z
    .preprocess(blankToUndefined, z.coerce.number().int().min(1).optional())
    .transform((value) => value ?? 1),
  limit: z
    .preprocess(blankToUndefined, z.coerce.number().int().min(1).max(100).optional())
    .transform((value) => value ?? 20),
  search: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  status: z.preprocess(blankToUndefined, z.string().trim().max(40).optional()),
  schoolId: optionalId,
  companyId: optionalId,
  fleetId: optionalId,
  role: z.preprocess(blankToUndefined, z.string().trim().max(40).optional()),
  direction: z.preprocess(blankToUndefined, z.enum(["PICKUP", "DROP"]).optional()),
  vehicleType: z.preprocess(blankToUndefined, z.enum(["BUS", "VAN"]).optional()),
});

export const latLngSchema = {
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
};

export const passwordSchema = z.string().superRefine((value, ctx) => {
  if (value.length >= 8 && value.length <= 80 && /[A-Za-z]/.test(value) && /[0-9]/.test(value)) return;
  ctx.addIssue({
    code: "custom",
    message: "Password must be at least 8 characters and include a letter and a number.",
  });
});

export function occurredAtSchema() {
  return z.iso.datetime({ offset: true }).or(z.iso.datetime());
}

import { z } from "zod";
import { requireSchoolId, tenantFilter } from "@/lib/auth/guard";
import { paginate } from "@/lib/mongodb/paginate";
import { AppError, notFound } from "@/lib/errors/app-error";
import { School } from "@/models/school";
import { writeAudit } from "@/modules/audit/audit.service";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { objectIdSchema, optionalId } from "@/lib/validation/common";
import { serialize } from "@/utils/serialize";
import { fromPoint, toPoint } from "@/utils/geo";

const settingsSchema = z.object({
  trackingIntervalSeconds: z.coerce.number().int().min(5).max(60).optional(),
  proximityRadiusMeters: z.coerce.number().int().min(50).max(2000).optional(),
  schoolGeofenceMeters: z.coerce.number().int().min(30).max(1000).optional(),
  gpsAccuracyMaxMeters: z.coerce.number().int().min(5).max(200).optional(),
  gpsMaxAgeSeconds: z.coerce.number().int().min(15).max(600).optional(),
  locationSampleSeconds: z.coerce.number().int().min(15).max(300).optional(),
  notificationTimezone: z.string().min(1).max(80).optional(),
  bleDetectionRetentionDays: z.coerce.number().int().min(1).max(180).optional(),
  notificationsEnabled: z.boolean().optional(),
});

export const createSchoolSchema = z.object({
  name: z.string().trim().min(2).max(160),
  schoolCode: z.string().trim().min(2).max(20),
  address: z.string().trim().max(300).optional().default(""),
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
  contactEmail: z.email(),
  contactPhone: z.string().trim().min(8).max(20),
  status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED"]).optional(),
  settings: settingsSchema.optional(),
  subscription: z
    .object({
      plan: z.string().trim().max(40).optional(),
      status: z.enum(["ACTIVE", "PAST_DUE", "CANCELLED"]).optional(),
      expiresAt: z.string().optional(),
    })
    .optional(),
});

export const updateSchoolSchema = createSchoolSchema.partial().extend({
  schoolId: optionalId,
});

function presentSchool(school: unknown) {
  const data = serialize(school) as { location?: { coordinates?: number[] } };
  const point = fromPoint(data.location);
  return { ...data, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null };
}

export async function listSchools(user: AuthUser, query: { page: number; limit: number; search?: string; status?: string; schoolId?: string }) {
  if (user.role !== ROLES.PLATFORM_ADMIN) {
    const school = await School.findById(requireSchoolId(user)).lean();
    return { items: school ? [presentSchool(school)] : [], meta: { page: 1, limit: 1, total: school ? 1 : 0, totalPages: 1 } };
  }
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.search) filter.name = { $regex: query.search, $options: "i" };
  const result = await paginate(School, filter, { page: query.page, limit: query.limit, sort: { name: 1 } });
  return { items: result.items.map(presentSchool), meta: result.meta };
}

export async function createSchool(user: AuthUser, input: z.infer<typeof createSchoolSchema>) {
  if (user.role !== ROLES.PLATFORM_ADMIN) {
    throw new AppError(403, "FORBIDDEN", "Only a platform admin can create schools.");
  }
  const school = await School.create({
    name: input.name,
    schoolCode: input.schoolCode.toUpperCase(),
    address: input.address,
    location: toPoint(input.latitude, input.longitude),
    contactEmail: input.contactEmail.toLowerCase(),
    contactPhone: input.contactPhone,
    status: input.status ?? "TRIAL",
    settings: input.settings,
    subscription: input.subscription
      ? {
          ...input.subscription,
          expiresAt: input.subscription.expiresAt ? new Date(input.subscription.expiresAt) : undefined,
        }
      : undefined,
  });
  await writeAudit({
    schoolId: String(school._id),
    actorId: user.id,
    action: "SCHOOL_CREATED",
    entityType: "School",
    entityId: String(school._id),
    after: { name: school.name, status: school.status },
  });
  return presentSchool(school.toObject());
}

export async function getSchool(user: AuthUser, id: string) {
  if (!objectIdSchema.safeParse(id).success) throw new AppError(400, "INVALID_ID", "School id is invalid.");
  if (user.role !== ROLES.PLATFORM_ADMIN) requireSchoolId(user, id);
  const school = await School.findById(id).lean();
  if (!school) throw notFound("School");
  return presentSchool(school);
}

export async function updateSchool(user: AuthUser, id: string, input: z.infer<typeof updateSchoolSchema>) {
  const existing = await School.findById(id);
  if (!existing) throw notFound("School");
  if (user.role !== ROLES.PLATFORM_ADMIN && user.schoolId !== String(existing._id)) {
    throw new AppError(403, "TENANT_MISMATCH", "You cannot update another school.");
  }
  if (user.role !== ROLES.PLATFORM_ADMIN) {
    delete input.status;
    delete input.subscription;
    delete input.schoolCode;
  }
  if (input.name) existing.name = input.name;
  if (input.schoolCode) existing.schoolCode = input.schoolCode.toUpperCase();
  if (input.address != null) existing.address = input.address;
  if (input.contactEmail) existing.contactEmail = input.contactEmail.toLowerCase();
  if (input.contactPhone) existing.contactPhone = input.contactPhone;
  if (input.latitude != null && input.longitude != null) {
    existing.location = toPoint(input.latitude, input.longitude);
  }
  if (input.status) existing.status = input.status;
  if (input.settings) existing.settings = { ...existing.settings?.toObject?.() ?? existing.settings, ...input.settings };
  if (input.subscription) {
    existing.subscription = {
      ...(existing.subscription?.toObject?.() ?? existing.subscription),
      ...input.subscription,
      expiresAt: input.subscription.expiresAt ? new Date(input.subscription.expiresAt) : existing.subscription?.expiresAt,
    };
  }
  await existing.save();
  await writeAudit({
    schoolId: String(existing._id),
    actorId: user.id,
    action: "SCHOOL_UPDATED",
    entityType: "School",
    entityId: String(existing._id),
    after: { status: existing.status },
  });
  return presentSchool(existing.toObject());
}

export async function requireSchool(schoolId: string) {
  const school = await School.findById(schoolId).lean();
  if (!school) throw notFound("School");
  if (school.status === "SUSPENDED") {
    throw new AppError(403, "SCHOOL_SUSPENDED", "This school is suspended.");
  }
  return school;
}

export { tenantFilter };

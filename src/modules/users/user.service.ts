import { z } from "zod";
import { requireSchoolId } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/tokens";
import { AppError, notFound } from "@/lib/errors/app-error";
import { paginate } from "@/lib/mongodb/paginate";
import { User } from "@/models/user";
import { writeAudit } from "@/modules/audit/audit.service";
import type { AuthUser, Role } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { objectIdSchema, passwordSchema } from "@/lib/validation/common";
import { serialize } from "@/utils/serialize";
import { escapeRegex } from "@/utils/serialize";

const roleSchema = z.enum(["PLATFORM_ADMIN", "SCHOOL_ADMIN", "DRIVER", "ATTENDANT", "PARENT"]);

export const createUserSchema = z.object({
  schoolId: objectIdSchema.optional(),
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120, "Name must be 120 characters or fewer."),
  email: z.email("Enter a valid email address."),
  phone: z.string().trim().min(8, "Phone must be at least 8 digits.").max(20, "Phone must be 20 characters or fewer."),
  password: passwordSchema,
  role: roleSchema,
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(8).max(20).optional(),
  password: passwordSchema.optional(),
  role: roleSchema.optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  schoolId: objectIdSchema.optional(),
});

function assertRoleAssignment(actor: AuthUser, role: Role, schoolId?: string) {
  if (role === ROLES.PLATFORM_ADMIN) {
    if (actor.role !== ROLES.PLATFORM_ADMIN) {
      throw new AppError(403, "FORBIDDEN", "Only a platform admin can create platform admins.");
    }
    return;
  }
  if (!schoolId) {
    throw new AppError(400, "SCHOOL_REQUIRED", "School staff, drivers, and parents must belong to a school.");
  }
  if (actor.role !== ROLES.PLATFORM_ADMIN && !["SCHOOL_ADMIN", "DRIVER", "ATTENDANT", "PARENT"].includes(role)) {
    throw new AppError(403, "FORBIDDEN", "You cannot assign that role.");
  }
}

export async function listUsers(
  user: AuthUser,
  query: { page: number; limit: number; search?: string; status?: string; schoolId?: string; role?: string },
) {
  const filter: Record<string, unknown> = { ...schoolFilter(user, query.schoolId) };
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = escapeRegex(query.search);
    filter.$or = [{ name: { $regex: pattern, $options: "i" } }, { email: { $regex: pattern, $options: "i" } }];
  }
  const result = await paginate(User, filter, { page: query.page, limit: query.limit, sort: { name: 1 } });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

export async function createUser(actor: AuthUser, input: z.infer<typeof createUserSchema>) {
  const schoolId = input.role === ROLES.PLATFORM_ADMIN ? undefined : requireSchoolId(actor, input.schoolId);
  assertRoleAssignment(actor, input.role, schoolId);
  const user = await User.create({
    schoolId: schoolId ?? null,
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    status: input.status ?? "ACTIVE",
    refreshTokenSessions: [],
  });
  await writeAudit({
    schoolId: schoolId ?? null,
    actorId: actor.id,
    action: "USER_CREATED",
    entityType: "User",
    entityId: String(user._id),
    after: { email: user.email, role: user.role },
  });
  return serialize(user.toObject());
}

export async function getUser(actor: AuthUser, id: string) {
  const user = await User.findById(id).lean();
  if (!user) throw notFound("User");
  assertUserAccess(actor, user);
  return serialize(user);
}

export async function updateUser(actor: AuthUser, id: string, input: z.infer<typeof updateUserSchema>) {
  const user = await User.findById(id);
  if (!user) throw notFound("User");
  assertUserAccess(actor, user);
  if (input.role) assertRoleAssignment(actor, input.role, user.schoolId ? String(user.schoolId) : undefined);
  if (actor.id === String(user._id) && input.role && input.role !== user.role) {
    throw new AppError(403, "FORBIDDEN", "You cannot change your own role.");
  }
  if (input.name) user.name = input.name;
  if (input.phone) user.phone = input.phone;
  if (input.role) user.role = input.role;
  if (input.status) user.status = input.status;
  if (input.password) user.passwordHash = await hashPassword(input.password);
  if (input.status === "DISABLED") user.refreshTokenSessions = [];
  await user.save();
  await writeAudit({
    schoolId: user.schoolId ? String(user.schoolId) : null,
    actorId: actor.id,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: String(user._id),
    after: { role: user.role, status: user.status },
  });
  return serialize(user.toObject());
}

function schoolFilter(user: AuthUser, requested?: string) {
  if (user.role === ROLES.PLATFORM_ADMIN) {
    return requested ? { schoolId: requested } : {};
  }
  return { schoolId: requireSchoolId(user, requested) };
}

function assertUserAccess(actor: AuthUser, user: { schoolId?: unknown; role?: string }) {
  if (actor.role === ROLES.PLATFORM_ADMIN) return;
  if (!user.schoolId || String(user.schoolId) !== actor.schoolId) {
    throw new AppError(403, "TENANT_MISMATCH", "You cannot access this user.");
  }
}

export { objectIdSchema };

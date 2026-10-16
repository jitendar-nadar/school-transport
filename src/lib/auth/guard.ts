import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/auth/tokens";
import { AppError } from "@/lib/errors/app-error";
import { School } from "@/models/school";
import { User } from "@/models/user";
import type { AuthUser, Role } from "@/types/domain";
import { ROLES } from "@/types/domain";

const schoolCache = new Map<string, { status: string; expires: number }>();

export async function userFromAccessToken(token: string): Promise<AuthUser | null> {
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).lean();
    if (!user || user.status !== "ACTIVE") return null;
    await assertSchoolAvailable(user.schoolId ? String(user.schoolId) : null, user.role as Role);
    return toAuthUser(user);
  } catch {
    return null;
  }
}

export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const header = req.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const token = bearer || req.cookies.get(ACCESS_COOKIE)?.value || "";
  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "Sign in to continue.");
  }
  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub).lean();
  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "UNAUTHORIZED", "Account is not active.");
  }
  await assertSchoolAvailable(user.schoolId ? String(user.schoolId) : null, user.role as Role);
  return toAuthUser(user);
}

export function requireRoles(user: AuthUser, roles: Role[]) {
  if (!roles.includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
}

export function requireSchoolId(user: AuthUser, requested?: string | null) {
  if (user.role === ROLES.PLATFORM_ADMIN) {
    if (!requested) {
      throw new AppError(400, "SCHOOL_REQUIRED", "Choose a school before continuing.");
    }
    return requested;
  }
  if (!user.schoolId) {
    throw new AppError(403, "TENANT_REQUIRED", "This account is not assigned to a school.");
  }
  if (requested && requested !== user.schoolId) {
    throw new AppError(403, "TENANT_MISMATCH", "You cannot access another school's data.");
  }
  return user.schoolId;
}

export function tenantFilter(user: AuthUser, requested?: string | null) {
  if (user.role === ROLES.PLATFORM_ADMIN) {
    return requested ? { schoolId: requested } : {};
  }
  return { schoolId: requireSchoolId(user, requested) };
}

async function assertSchoolAvailable(schoolId: string | null, role: Role) {
  if (!schoolId || role === ROLES.PLATFORM_ADMIN) return;
  const now = Date.now();
  const cached = schoolCache.get(schoolId);
  let status = cached && cached.expires > now ? cached.status : "";
  if (!status) {
    const school = await School.findById(schoolId).select("status").lean();
    status = school?.status || "MISSING";
    schoolCache.set(schoolId, { status, expires: now + 30_000 });
  }
  if (status === "SUSPENDED") {
    throw new AppError(403, "SCHOOL_SUSPENDED", "This school is suspended.");
  }
  if (status === "MISSING") {
    throw new AppError(403, "SCHOOL_MISSING", "This school no longer exists.");
  }
}

function toAuthUser(user: {
  _id: unknown;
  schoolId?: unknown;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
}): AuthUser {
  return {
    id: String(user._id),
    schoolId: user.schoolId ? String(user.schoolId) : null,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role as Role,
    status: user.status as AuthUser["status"],
  };
}

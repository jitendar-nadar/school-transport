import { z } from "zod";
import {
  hashPassword,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from "@/lib/auth/tokens";
import { AppError } from "@/lib/errors/app-error";
import { School } from "@/models/school";
import { User } from "@/models/user";
import type { AuthUser, Role } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { passwordSchema } from "@/lib/validation/common";
import { serialize } from "@/utils/serialize";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().trim().min(1).max(80),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

function publicUser(user: {
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

async function assertCanSignIn(user: { role: string; schoolId?: unknown; status: string }) {
  if (user.status !== "ACTIVE") {
    throw new AppError(403, "ACCOUNT_DISABLED", "This account is disabled.");
  }
  if (!user.schoolId || user.role === ROLES.PLATFORM_ADMIN) return;
  const school = await School.findById(user.schoolId).select("status").lean();
  if (!school) throw new AppError(403, "SCHOOL_MISSING", "This school no longer exists.");
  if (school.status === "SUSPENDED") {
    throw new AppError(403, "SCHOOL_SUSPENDED", "This school is suspended.");
  }
}

export async function login(input: z.infer<typeof loginSchema>, userAgent: string) {
  const user = await User.findOne({ email: input.email.toLowerCase() });
  if (!user) {
    throw new AppError(401, "UNAUTHORIZED", "Email or password is incorrect.");
  }
  const matches = await verifyPassword(input.password, user.passwordHash);
  if (!matches) {
    throw new AppError(401, "UNAUTHORIZED", "Email or password is incorrect.");
  }
  await assertCanSignIn(user);
  const authUser = publicUser(user);
  const access = signAccessToken(authUser);
  const refresh = signRefreshToken(authUser);
  const expiresAt = new Date(Date.now() + refresh.expiresIn * 1000);
  const sessions = (user.refreshTokenSessions || [])
    .filter((session: { expiresAt: Date }) => new Date(session.expiresAt).getTime() > Date.now())
    .slice(-4);
  sessions.push({
    tokenHash: hashToken(refresh.token),
    expiresAt,
    createdAt: new Date(),
    userAgent: userAgent.slice(0, 200),
  });
  user.refreshTokenSessions = sessions;
  await user.save();
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: access.expiresIn,
    user: authUser,
  };
}

export async function rotateRefreshToken(refreshToken: string, userAgent: string) {
  const payload = verifyRefreshToken(refreshToken);
  const user = await User.findById(payload.sub);
  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "UNAUTHORIZED", "Refresh token is no longer valid.");
  }
  const tokenHash = hashToken(refreshToken);
  const sessions = user.refreshTokenSessions || [];
  const match = sessions.find((session: { tokenHash: string }) => session.tokenHash === tokenHash);
  if (!match) {
    user.refreshTokenSessions = [];
    await user.save();
    throw new AppError(401, "REFRESH_REUSE", "Refresh token was already used. Sign in again.");
  }
  await assertCanSignIn(user);
  const authUser = publicUser(user);
  const access = signAccessToken(authUser);
  const refresh = signRefreshToken(authUser);
  const remaining = sessions.filter((session: { tokenHash: string }) => session.tokenHash !== tokenHash);
  remaining.push({
    tokenHash: hashToken(refresh.token),
    expiresAt: new Date(Date.now() + refresh.expiresIn * 1000),
    createdAt: new Date(),
    userAgent: userAgent.slice(0, 200),
  });
  user.refreshTokenSessions = remaining.slice(-5);
  await user.save();
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: access.expiresIn,
    user: authUser,
  };
}

export async function logout(userId: string, refreshToken?: string) {
  const user = await User.findById(userId);
  if (!user) return;
  if (!refreshToken) {
    user.refreshTokenSessions = [];
  } else {
    const tokenHash = hashToken(refreshToken);
    user.refreshTokenSessions = (user.refreshTokenSessions || []).filter(
      (session: { tokenHash: string }) => session.tokenHash !== tokenHash,
    );
  }
  await user.save();
}

export async function currentProfile(user: AuthUser) {
  const school = user.schoolId
    ? serialize(await School.findById(user.schoolId).select("name schoolCode status settings subscription").lean())
    : null;
  return { user, school };
}

export { hashPassword, passwordSchema };

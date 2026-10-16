import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { AppError } from "@/lib/errors/app-error";
import type { AuthUser, Role } from "@/types/domain";

const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900);
const REFRESH_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7);

export const ACCESS_COOKIE = "st_access";
export const REFRESH_COOKIE = "st_refresh";

type TokenPayload = {
  sub: string;
  role: Role;
  schoolId: string | null;
  type: "access" | "refresh";
};

function secret(name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET") {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new AppError(500, "CONFIG_ERROR", `${name} must be configured with at least 16 characters.`);
  }
  return value;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newRefreshSecret() {
  return randomBytes(48).toString("base64url");
}

export function signAccessToken(user: AuthUser) {
  const payload: TokenPayload = {
    sub: user.id,
    role: user.role,
    schoolId: user.schoolId,
    type: "access",
  };
  const options: SignOptions = { expiresIn: ACCESS_TTL_SECONDS };
  return {
    token: jwt.sign(payload, secret("JWT_ACCESS_SECRET"), options),
    expiresIn: ACCESS_TTL_SECONDS,
  };
}

export function signRefreshToken(user: AuthUser) {
  const payload: TokenPayload = {
    sub: user.id,
    role: user.role,
    schoolId: user.schoolId,
    type: "refresh",
  };
  const options: SignOptions = { expiresIn: REFRESH_TTL_SECONDS };
  return {
    token: jwt.sign(payload, secret("JWT_REFRESH_SECRET"), options),
    expiresIn: REFRESH_TTL_SECONDS,
  };
}

export function verifyAccessToken(token: string) {
  try {
    const payload = jwt.verify(token, secret("JWT_ACCESS_SECRET")) as TokenPayload;
    if (payload.type !== "access" || !payload.sub) {
      throw new AppError(401, "UNAUTHORIZED", "Access token is invalid.");
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, "UNAUTHORIZED", "Access token is invalid or expired.");
  }
}

export function verifyRefreshToken(token: string) {
  try {
    const payload = jwt.verify(token, secret("JWT_REFRESH_SECRET")) as TokenPayload;
    if (payload.type !== "refresh" || !payload.sub) {
      throw new AppError(401, "UNAUTHORIZED", "Refresh token is invalid.");
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, "UNAUTHORIZED", "Refresh token is invalid or expired.");
  }
}

export function accessCookieMaxAge() {
  return ACCESS_TTL_SECONDS;
}

export function refreshCookieMaxAge() {
  return REFRESH_TTL_SECONDS;
}

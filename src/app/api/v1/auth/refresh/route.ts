import { publicHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { attachAuthCookies } from "@/lib/auth/cookies";
import { REFRESH_COOKIE } from "@/lib/auth/tokens";
import { AppError } from "@/lib/errors/app-error";
import { refreshSchema, rotateRefreshToken } from "@/modules/auth/auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = publicHandler(async ({ req }) => {
  const input = await readJson(req, refreshSchema);
  const refreshToken = input.refreshToken || req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) throw new AppError(401, "UNAUTHORIZED", "Refresh token is missing.");
  const result = await rotateRefreshToken(refreshToken, req.headers.get("user-agent") || "");
  return attachAuthCookies(ok(result), result.accessToken, result.refreshToken);
}, { limit: 20 });

import { publicHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { clearAuthCookies } from "@/lib/auth/cookies";
import { ACCESS_COOKIE, REFRESH_COOKIE, verifyAccessToken, verifyRefreshToken } from "@/lib/auth/tokens";
import { logout } from "@/modules/auth/auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = publicHandler(async ({ req }) => {
  const header = req.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const access = bearer || req.cookies.get(ACCESS_COOKIE)?.value || "";
  let body: { refreshToken?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const refresh = body.refreshToken || req.cookies.get(REFRESH_COOKIE)?.value || "";
  let userId = "";
  if (access) {
    try {
      userId = verifyAccessToken(access).sub;
    } catch {
      userId = "";
    }
  }
  if (!userId && refresh) {
    try {
      userId = verifyRefreshToken(refresh).sub;
    } catch {
      userId = "";
    }
  }
  if (userId) await logout(userId, refresh || undefined);
  return clearAuthCookies(ok({ loggedOut: true }));
}, { limit: 30 });

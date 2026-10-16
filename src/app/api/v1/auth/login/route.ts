import { publicHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { attachAuthCookies } from "@/lib/auth/cookies";
import { login, loginSchema } from "@/modules/auth/auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = publicHandler(async ({ req }) => {
  const input = await readJson(req, loginSchema);
  const result = await login(input, req.headers.get("user-agent") || "");
  return attachAuthCookies(ok(result), result.accessToken, result.refreshToken);
}, { limit: 10 });

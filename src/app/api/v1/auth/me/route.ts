import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { currentProfile } from "@/modules/auth/auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ user }) => ok(await currentProfile(user)));

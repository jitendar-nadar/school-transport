import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { parentActiveTrips } from "@/modules/parents/parent.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ user }) => ok(await parentActiveTrips(user)), { roles: [ROLES.PARENT] });

import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { fleetSummary } from "@/modules/transport/transport.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ user }) => ok(await fleetSummary(user)), { roles: [ROLES.FLEET_ADMIN] });

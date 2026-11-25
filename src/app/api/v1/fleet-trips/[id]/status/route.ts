import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { fleetTripStatusSchema, setFleetTripStatus } from "@/modules/transport/transport.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ req, user, params }) => {
  return ok(await setFleetTripStatus(user, params.id, await readJson(req, fleetTripStatusSchema)));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN] });

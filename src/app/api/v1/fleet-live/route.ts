import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { listLiveTrucks } from "@/modules/transport/tracker-ingest.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await listLiveTrucks(user, query.fleetId));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN] });

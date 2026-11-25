import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { tripReport } from "@/modules/transport/tracker-ingest.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user, params }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await tripReport(user, params.id, query.fleetId));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN] });

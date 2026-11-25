import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { listFleetAlerts } from "@/modules/transport/tracker-ingest.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  const result = await listFleetAlerts(user, query);
  return ok(result.items, result.meta);
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN] });

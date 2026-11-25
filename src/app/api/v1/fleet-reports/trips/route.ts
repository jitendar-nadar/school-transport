import { z } from "zod";
import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema, objectIdSchema, optionalId } from "@/lib/validation/common";
import { listTripHistory } from "@/modules/transport/tracker-ingest.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = listQuerySchema.extend({
  fleetId: optionalId,
  truckId: z.preprocess((value) => (value === "" || value == null ? undefined : value), objectIdSchema.optional()),
  status: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  ),
});

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, querySchema);
  const result = await listTripHistory(user, {
    page: query.page,
    limit: query.limit,
    fleetId: query.fleetId,
    truckId: query.truckId,
    status: query.status,
  });
  return ok(result.items, result.meta);
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN] });

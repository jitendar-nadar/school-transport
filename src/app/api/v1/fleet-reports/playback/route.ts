import { z } from "zod";
import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { objectIdSchema, optionalId } from "@/lib/validation/common";
import { playback } from "@/modules/transport/tracker-ingest.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  fleetId: optionalId,
  truckId: objectIdSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date."),
});

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, querySchema);
  return ok(await playback(user, query.fleetId, query.truckId, query.date));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN] });

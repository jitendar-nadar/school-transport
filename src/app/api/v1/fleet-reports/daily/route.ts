import { z } from "zod";
import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { optionalId } from "@/lib/validation/common";
import { dailyFleetReport } from "@/modules/transport/tracker-ingest.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  fleetId: optionalId,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date."),
});

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, querySchema);
  return ok(await dailyFleetReport(user, query.fleetId, query.date));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN] });

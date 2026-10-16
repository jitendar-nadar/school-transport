import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { listTrips } from "@/modules/trips/trip.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  const result = await listTrips(user, query);
  return ok(result.items, result.meta);
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN] });

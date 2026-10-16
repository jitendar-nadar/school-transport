import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { activeTrips } from "@/modules/dashboard/dashboard.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await activeTrips(user, query.schoolId));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN] });

import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { runWatchCheck } from "@/modules/tours/tour.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [
  ROLES.PLATFORM_ADMIN,
  ROLES.SCHOOL_ADMIN,
  ROLES.TOUR_COORDINATOR,
  ROLES.DRIVER,
  ROLES.ATTENDANT,
];

export const POST = apiHandler(async ({ req, user, params }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await runWatchCheck(user, params.id, query.schoolId));
}, { roles });

import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { headcountSchema, submitHeadcount } from "@/modules/tours/tour.service";
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
  return created(await submitHeadcount(user, params.id, await readJson(req, headcountSchema), query.schoolId));
}, { roles });

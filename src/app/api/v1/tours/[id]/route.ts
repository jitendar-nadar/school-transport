import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { deleteTour, getTour, updateTour, updateTourSchema } from "@/modules/tours/tour.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readRoles = [
  ROLES.PLATFORM_ADMIN,
  ROLES.SCHOOL_ADMIN,
  ROLES.TOUR_COORDINATOR,
  ROLES.DRIVER,
  ROLES.ATTENDANT,
];
const writeRoles = [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN];

export const GET = apiHandler(async ({ req, user, params }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await getTour(user, params.id, query.schoolId));
}, { roles: readRoles });

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await updateTour(user, params.id, await readJson(req, updateTourSchema), query.schoolId));
}, { roles: writeRoles });

export const DELETE = apiHandler(async ({ req, user, params }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await deleteTour(user, params.id, query.schoolId));
}, { roles: writeRoles });

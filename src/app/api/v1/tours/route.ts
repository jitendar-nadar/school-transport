import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { createTour, createTourSchema, listTours } from "@/modules/tours/tour.service";
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

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await listTours(user, query.schoolId));
}, { roles: readRoles });

export const POST = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  const input = await readJson(req, createTourSchema);
  return created(await createTour(user, input, query.schoolId));
}, { roles: writeRoles });

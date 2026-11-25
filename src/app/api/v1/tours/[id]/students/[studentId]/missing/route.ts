import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { markStudentMissing, studentEventSchema } from "@/modules/tours/tour.service";
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
  const input = await readJson(req, studentEventSchema);
  return ok(await markStudentMissing(user, params.id, params.studentId, input, query.schoolId));
}, { roles });

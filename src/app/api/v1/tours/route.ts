import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { createHeadcount, createHeadcountSchema, createTour, createTourSchema, listTours } from "@/modules/school-records/school-records.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN];

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await listTours(user, query.schoolId));
}, { roles });

export const POST = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  const input = await readJson(req, createTourSchema);
  return created(await createTour(user, input, query.schoolId));
}, { roles });

export const PUT = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  const input = await readJson(req, createHeadcountSchema);
  return created(await createHeadcount(user, input, query.schoolId));
}, { roles });

import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { getSchool, updateSchool, updateSchoolSchema } from "@/modules/schools/school.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN];

export const GET = apiHandler(async ({ user, params }) => ok(await getSchool(user, params.id)), { roles });

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, updateSchoolSchema);
  return ok(await updateSchool(user, params.id, input));
}, { roles });

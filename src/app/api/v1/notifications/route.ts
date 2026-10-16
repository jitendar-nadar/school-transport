import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { requireSchoolId } from "@/lib/auth/guard";
import { listQuerySchema } from "@/lib/validation/common";
import { adminNotifications } from "@/modules/parents/parent.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  const schoolId = requireSchoolId(user, query.schoolId);
  const result = await adminNotifications(schoolId, query.page, query.limit);
  return ok(result.items, result.meta);
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN] });

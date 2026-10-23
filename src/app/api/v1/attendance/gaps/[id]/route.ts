import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { reviewGap, reviewSchema } from "@/modules/companies/attendance.service";
import { deleteGap } from "@/modules/companies/company.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, reviewSchema);
  return ok(await reviewGap(user, params.id, input));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN, ROLES.EMPLOYEE] });

export const DELETE = apiHandler(async ({ req, user, params }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await deleteGap(user, params.id, query.companyId));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN] });

import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { policySchema, updatePolicy } from "@/modules/companies/attendance.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, policySchema);
  return ok(await updatePolicy(user, input));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN] });

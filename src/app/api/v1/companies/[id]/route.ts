import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { getCompany, updateCompany, updateCompanySchema } from "@/modules/companies/company.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN];

export const GET = apiHandler(async ({ user, params }) => ok(await getCompany(user, params.id)), { roles });

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, updateCompanySchema);
  return ok(await updateCompany(user, params.id, input));
}, { roles });

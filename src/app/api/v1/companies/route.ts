import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { createCompany, createCompanySchema, listCompanies } from "@/modules/companies/company.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN];

export const GET = apiHandler(async ({ req, user }) => {
  const result = await listCompanies(user, readQuery(req, listQuerySchema));
  return ok(result.items, result.meta);
}, { roles });

export const POST = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, createCompanySchema);
  return created(await createCompany(user, input));
}, { roles: [ROLES.PLATFORM_ADMIN] });

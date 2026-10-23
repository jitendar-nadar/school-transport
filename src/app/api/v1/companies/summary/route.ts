import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { companySummary } from "@/modules/companies/company.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ user }) => ok(await companySummary(user)), { roles: [ROLES.COMPANY_ADMIN] });

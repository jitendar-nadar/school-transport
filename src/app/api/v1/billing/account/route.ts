import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { getAccount } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ user }) => ok(await getAccount(user)), { roles: [ROLES.SCHOOL_ADMIN, ROLES.COMPANY_ADMIN, ROLES.FLEET_ADMIN] });

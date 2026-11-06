import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { getInvoice } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ user, params }) => ok(await getInvoice(user, params.id)), {
  roles: [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.COMPANY_ADMIN, ROLES.FLEET_ADMIN, ROLES.AGENCY_ADMIN],
});

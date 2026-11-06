import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { invoiceQuerySchema, listInvoices } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => {
  const result = await listInvoices(user, readQuery(req, invoiceQuerySchema));
  return ok(result.items, result.meta);
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.COMPANY_ADMIN, ROLES.FLEET_ADMIN, ROLES.AGENCY_ADMIN] });

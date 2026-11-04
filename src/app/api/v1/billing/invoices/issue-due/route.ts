import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { issueDueInvoices } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ user }) => ok(await issueDueInvoices(user)), { roles: [ROLES.PLATFORM_ADMIN], limit: 10 });

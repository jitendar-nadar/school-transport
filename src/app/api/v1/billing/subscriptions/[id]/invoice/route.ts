import { apiHandler } from "@/lib/api/handler";
import { created } from "@/lib/api/http";
import { issueInvoice } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ user, params }) => created(await issueInvoice(user, params.id)), { roles: [ROLES.PLATFORM_ADMIN], limit: 30 });

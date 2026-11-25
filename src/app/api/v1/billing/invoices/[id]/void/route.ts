import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { voidInvoice, voidSchema } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, voidSchema);
  return ok(await voidInvoice(user, params.id, input));
}, { roles: [ROLES.PLATFORM_ADMIN] });

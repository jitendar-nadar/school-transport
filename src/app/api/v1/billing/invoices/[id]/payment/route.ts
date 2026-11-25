import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { paymentSchema, recordPayment } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, paymentSchema);
  return ok(await recordPayment(user, params.id, input));
}, { roles: [ROLES.PLATFORM_ADMIN] });

import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { getSubscription, updateSubscription, updateSubscriptionSchema } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN];

export const GET = apiHandler(async ({ user, params }) => ok(await getSubscription(user, params.id)), { roles });

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, updateSubscriptionSchema);
  return ok(await updateSubscription(user, params.id, input));
}, { roles });

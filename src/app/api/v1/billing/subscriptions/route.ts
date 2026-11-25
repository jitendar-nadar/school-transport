import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/http";
import { createSubscription, createSubscriptionSchema, listSubscriptions, subscriptionQuerySchema } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN];

export const GET = apiHandler(async ({ req, user }) => {
  const result = await listSubscriptions(user, readQuery(req, subscriptionQuerySchema));
  return ok(result.items, result.meta);
}, { roles });

export const POST = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, createSubscriptionSchema);
  return created(await createSubscription(user, input));
}, { roles });

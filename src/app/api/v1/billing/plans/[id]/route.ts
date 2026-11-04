import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { getPlan, planSchema, updatePlan } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN];

export const GET = apiHandler(async ({ user, params }) => ok(await getPlan(user, params.id)), { roles });

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, planSchema);
  return ok(await updatePlan(user, params.id, input));
}, { roles });

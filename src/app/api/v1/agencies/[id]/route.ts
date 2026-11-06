import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { getAgency, updateAgency, updateAgencySchema } from "@/modules/agencies/agency.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN];

export const GET = apiHandler(async ({ user, params }) => ok(await getAgency(user, params.id)), { roles });

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, updateAgencySchema);
  return ok(await updateAgency(user, params.id, input));
}, { roles });

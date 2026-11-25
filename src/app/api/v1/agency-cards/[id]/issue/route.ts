import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { issueAgencyCard, issueCardSchema } from "@/modules/agencies/agency-card.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, issueCardSchema);
  return ok(await issueAgencyCard(user, params.id, input));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.AGENCY_ADMIN] });

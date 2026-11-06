import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { listAgencyCards, registerAgencyCards, registerCardsSchema } from "@/modules/agencies/agency-card.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.AGENCY_ADMIN];

export const GET = apiHandler(async ({ req, user }) => {
  const result = await listAgencyCards(user, readQuery(req, listQuerySchema));
  return ok(result.items, result.meta);
}, { roles });

export const POST = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, registerCardsSchema);
  return created(await registerAgencyCards(user, input));
}, { roles, limit: 30 });

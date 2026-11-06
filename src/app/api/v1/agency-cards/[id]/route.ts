import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { agencyCardStatusSchema, deleteAgencyCard, setAgencyCardStatus } from "@/modules/agencies/agency-card.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.AGENCY_ADMIN];

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, agencyCardStatusSchema);
  return ok(await setAgencyCardStatus(user, params.id, input));
}, { roles });

export const DELETE = apiHandler(async ({ req, user, params }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await deleteAgencyCard(user, params.id, query.agencyId));
}, { roles });

import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { agencySummary } from "@/modules/agencies/agency.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await agencySummary(user, query.agencyId));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.AGENCY_ADMIN] });

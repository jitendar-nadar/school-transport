import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { listClients, setClients, setClientsSchema } from "@/modules/agencies/agency.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await listClients(user, query.agencyId));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.AGENCY_ADMIN] });

export const PUT = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, setClientsSchema);
  return ok(await setClients(user, input));
}, { roles: [ROLES.PLATFORM_ADMIN] });

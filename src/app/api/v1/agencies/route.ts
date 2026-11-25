import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { createAgency, createAgencySchema, listAgencies } from "@/modules/agencies/agency.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => {
  const result = await listAgencies(user, readQuery(req, listQuerySchema));
  return ok(result.items, result.meta);
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.AGENCY_ADMIN] });

export const POST = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, createAgencySchema);
  return created(await createAgency(user, input));
}, { roles: [ROLES.PLATFORM_ADMIN] });

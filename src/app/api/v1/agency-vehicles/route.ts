import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { agencyVehicleSchema, createAgencyVehicle, listAgencyVehicles } from "@/modules/agencies/agency-vehicle.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.AGENCY_ADMIN];

export const GET = apiHandler(async ({ req, user }) => {
  const result = await listAgencyVehicles(user, readQuery(req, listQuerySchema));
  return ok(result.items, result.meta);
}, { roles });

export const POST = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, agencyVehicleSchema);
  return created(await createAgencyVehicle(user, input));
}, { roles });

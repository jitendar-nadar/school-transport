import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { deleteAgencyVehicle, updateAgencyVehicle, updateAgencyVehicleSchema } from "@/modules/agencies/agency-vehicle.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.AGENCY_ADMIN];

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, updateAgencyVehicleSchema);
  return ok(await updateAgencyVehicle(user, params.id, input));
}, { roles });

export const DELETE = apiHandler(async ({ req, user, params }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await deleteAgencyVehicle(user, params.id, query.agencyId));
}, { roles });

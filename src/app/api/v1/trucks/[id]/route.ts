import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { createTruckSchema, deleteTruck, updateTruck } from "@/modules/transport/transport.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN];

export const PATCH = apiHandler(async ({ req, user, params }) => {
  return ok(await updateTruck(user, params.id, await readJson(req, createTruckSchema)));
}, { roles });

export const DELETE = apiHandler(async ({ req, user, params }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await deleteTruck(user, params.id, query.fleetId));
}, { roles });

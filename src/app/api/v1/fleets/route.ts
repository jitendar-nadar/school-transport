import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { createFleet, createFleetSchema, listFleets } from "@/modules/transport/transport.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN];

export const GET = apiHandler(async ({ req, user }) => {
  const result = await listFleets(user, readQuery(req, listQuerySchema));
  return ok(result.items, result.meta);
}, { roles });

export const POST = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, createFleetSchema);
  return created(await createFleet(user, input));
}, { roles: [ROLES.PLATFORM_ADMIN] });

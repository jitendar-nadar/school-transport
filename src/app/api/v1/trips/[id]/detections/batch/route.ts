import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { addDetections, batchSchema } from "@/modules/trips/trip.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(
  async ({ req, user, params }) => ok(await addDetections(user, params.id, await readJson(req, batchSchema))),
  { roles: [ROLES.DRIVER, ROLES.ATTENDANT] },
);

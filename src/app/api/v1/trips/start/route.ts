import { apiHandler, readJson } from "@/lib/api/handler";
import { created } from "@/lib/api/http";
import { startTrip, startTripSchema } from "@/modules/trips/trip.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(
  async ({ req, user }) => created(await startTrip(user, await readJson(req, startTripSchema))),
  { roles: [ROLES.DRIVER, ROLES.ATTENDANT] },
);

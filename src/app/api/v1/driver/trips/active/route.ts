import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { activeDriverTrip } from "@/modules/trips/trip.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ user }) => ok(await activeDriverTrip(user)), {
  roles: [ROLES.DRIVER, ROLES.ATTENDANT],
});

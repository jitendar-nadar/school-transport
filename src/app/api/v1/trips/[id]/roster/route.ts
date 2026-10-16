import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { getRoster } from "@/modules/trips/trip.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ user, params }) => ok(await getRoster(user, params.id)), {
  roles: [ROLES.DRIVER, ROLES.ATTENDANT],
});

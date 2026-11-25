import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { clientPeople, clientPeopleQuerySchema } from "@/modules/agencies/agency-card.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => ok(await clientPeople(user, readQuery(req, clientPeopleQuerySchema))), {
  roles: [ROLES.PLATFORM_ADMIN, ROLES.AGENCY_ADMIN],
});

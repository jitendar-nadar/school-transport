import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { liveAccessSchema, parentLiveAccess } from "@/modules/parents/parent.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(
  async ({ req, user }) => ok(await parentLiveAccess(user, await readJson(req, liveAccessSchema))),
  { roles: [ROLES.PARENT] },
);

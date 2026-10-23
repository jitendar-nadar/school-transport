import { z } from "zod";
import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { updateFleetStatus } from "@/modules/transport/transport.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, z.object({ status: z.string() }));
  return ok(await updateFleetStatus(user, params.id, input.status));
}, { roles: [ROLES.PLATFORM_ADMIN] });

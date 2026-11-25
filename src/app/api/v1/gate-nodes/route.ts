import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/http";
import { listQuerySchema, optionalId } from "@/lib/validation/common";
import { createGateNode, gateNodeSchema, listGateNodes } from "@/modules/gates/gate.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN];

const querySchema = listQuerySchema.extend({
  gateId: optionalId,
});

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, querySchema);
  return ok(await listGateNodes(user, query));
}, { roles });

export const POST = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  const input = await readJson(req, gateNodeSchema);
  return created(await createGateNode(user, input, query.schoolId));
}, { roles });

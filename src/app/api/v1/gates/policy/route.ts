import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { gatePolicySchema, getGatePolicy, updateGatePolicy } from "@/modules/gates/gate.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN];

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await getGatePolicy(user, query.schoolId));
}, { roles });

export const PATCH = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await updateGatePolicy(user, await readJson(req, gatePolicySchema), query.schoolId));
}, { roles });

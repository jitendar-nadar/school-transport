import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { unassignTag } from "@/modules/ble/ble.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ req, user, params }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await unassignTag(user, params.id, query.schoolId));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN] });

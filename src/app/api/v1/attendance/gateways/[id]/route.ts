import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { updateGateway, updateGatewaySchema } from "@/modules/companies/attendance.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, updateGatewaySchema);
  return ok(await updateGateway(user, params.id, input));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN] });

import { apiHandler, readJson } from "@/lib/api/handler";
import { created } from "@/lib/api/http";
import { createGateway, gatewaySchema } from "@/modules/companies/attendance.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, gatewaySchema);
  return created(await createGateway(user, input));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN] });

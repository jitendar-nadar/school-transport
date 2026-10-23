import { apiHandler, readJson } from "@/lib/api/handler";
import { created } from "@/lib/api/http";
import { detectionSchema, recordDetection } from "@/modules/companies/attendance.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, detectionSchema);
  return created(await recordDetection(user, input));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN] });

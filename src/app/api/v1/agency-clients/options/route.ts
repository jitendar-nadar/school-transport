import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { clientOptions } from "@/modules/agencies/agency.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ user }) => ok(await clientOptions(user)), { roles: [ROLES.PLATFORM_ADMIN] });

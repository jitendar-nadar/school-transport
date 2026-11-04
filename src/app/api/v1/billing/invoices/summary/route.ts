import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { platformDues } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ user }) => ok(await platformDues(user)), { roles: [ROLES.PLATFORM_ADMIN] });

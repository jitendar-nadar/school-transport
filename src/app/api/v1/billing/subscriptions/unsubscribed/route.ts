import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listUnsubscribed, unsubscribedQuerySchema } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => ok(await listUnsubscribed(user, readQuery(req, unsubscribedQuerySchema))), { roles: [ROLES.PLATFORM_ADMIN] });

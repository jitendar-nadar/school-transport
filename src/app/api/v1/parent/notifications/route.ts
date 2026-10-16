import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { parentNotifications } from "@/modules/parents/parent.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  const result = await parentNotifications(user, query.page, query.limit);
  return ok(result.items, result.meta);
}, { roles: [ROLES.PARENT] });

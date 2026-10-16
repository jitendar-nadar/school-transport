import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listChildren } from "@/modules/parents/parent.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ user }) => ok(await listChildren(user)), { roles: [ROLES.PARENT] });

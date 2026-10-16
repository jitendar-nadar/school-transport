import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { getUser, updateUser, updateUserSchema } from "@/modules/users/user.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN];

export const GET = apiHandler(async ({ user, params }) => ok(await getUser(user, params.id)), { roles });

export const PATCH = apiHandler(async ({ req, user, params }) => {
  const input = await readJson(req, updateUserSchema);
  return ok(await updateUser(user, params.id, input));
}, { roles });

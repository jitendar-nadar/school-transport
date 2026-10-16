import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { createUser, createUserSchema, listUsers } from "@/modules/users/user.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN];

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  const result = await listUsers(user, query);
  return ok(result.items, result.meta);
}, { roles });

export const POST = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, createUserSchema);
  return created(await createUser(user, input));
}, { roles });

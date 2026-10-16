import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { createTag, createTagSchema, listTags } from "@/modules/ble/ble.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN];

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, listQuerySchema);
  const result = await listTags(user, query);
  return ok(result.items, result.meta);
}, { roles });

export const POST = apiHandler(async ({ req, user }) => created(await createTag(user, await readJson(req, createTagSchema))), { roles });

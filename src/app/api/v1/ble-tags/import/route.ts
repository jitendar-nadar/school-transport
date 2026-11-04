import { apiHandler, readJson } from "@/lib/api/handler";
import { created } from "@/lib/api/http";
import { importTags, importTagsSchema } from "@/modules/ble/ble.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(
  async ({ req, user }) => created(await importTags(user, await readJson(req, importTagsSchema))),
  { roles: [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN], limit: 20 },
);

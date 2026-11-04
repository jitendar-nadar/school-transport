import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { getSettings, saveSettings, settingsSchema } from "@/modules/billing/billing.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN];

export const GET = apiHandler(async ({ user }) => ok(await getSettings(user)), { roles });

export const PUT = apiHandler(async ({ req, user }) => {
  const input = await readJson(req, settingsSchema);
  return ok(await saveSettings(user, input));
}, { roles });

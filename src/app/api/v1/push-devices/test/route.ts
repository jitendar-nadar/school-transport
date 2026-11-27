import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { sendTestPush } from "@/modules/devices/device.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ user }) => ok(await sendTestPush(user)));

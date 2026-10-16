import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { removeDevice } from "@/modules/devices/device.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = apiHandler(async ({ user, params }) => ok(await removeDevice(user, params.id)));

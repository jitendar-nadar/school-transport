import { apiHandler, readJson } from "@/lib/api/handler";
import { created } from "@/lib/api/http";
import { registerDevice, registerDeviceSchema } from "@/modules/devices/device.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ req, user }) => created(await registerDevice(user, await readJson(req, registerDeviceSchema))));

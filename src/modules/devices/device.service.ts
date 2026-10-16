import { z } from "zod";
import { AppError, notFound } from "@/lib/errors/app-error";
import { PushDevice } from "@/models/ops";
import type { AuthUser } from "@/types/domain";
import { serialize } from "@/utils/serialize";

export const registerDeviceSchema = z.object({
  fcmToken: z.string().trim().min(10).max(4096),
  platform: z.enum(["ANDROID", "IOS", "WEB"]),
});

export async function registerDevice(user: AuthUser, input: z.infer<typeof registerDeviceSchema>) {
  const existing = await PushDevice.findOne({ userId: user.id, fcmToken: input.fcmToken });
  if (existing) {
    existing.platform = input.platform;
    existing.lastActiveAt = new Date();
    await existing.save();
    return serialize(existing.toObject());
  }
  const device = await PushDevice.create({
    userId: user.id,
    fcmToken: input.fcmToken,
    platform: input.platform,
    lastActiveAt: new Date(),
  });
  return serialize(device.toObject());
}

export async function removeDevice(user: AuthUser, id: string) {
  const device = await PushDevice.findOne({ _id: id, userId: user.id });
  if (!device) throw notFound("Device");
  await device.deleteOne();
  return { removed: true };
}

export function assertCron(secret: string | null) {
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    throw new AppError(401, "UNAUTHORIZED", "Cron secret is invalid.");
  }
}

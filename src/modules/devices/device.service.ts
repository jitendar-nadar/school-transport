import { z } from "zod";
import { AppError, notFound } from "@/lib/errors/app-error";
import { firebaseReady, messaging } from "@/lib/firebase/admin";
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

/** Sends a test push to the caller's own phones and says what happened. */
export async function sendTestPush(user: AuthUser) {
  const devices = await PushDevice.find({ userId: user.id });
  const result = {
    firebaseConfigured: firebaseReady(),
    devices: devices.length,
    sent: 0,
    failed: 0,
    error: null as string | null,
  };
  if (!result.firebaseConfigured) {
    result.error = "Firebase is not configured on the server.";
    return result;
  }
  if (!devices.length) {
    result.error = "No phone is registered for push. Open the app, allow notifications and sign in again.";
    return result;
  }
  const client = messaging();
  if (!client) {
    result.error = "Firebase messaging is unavailable.";
    return result;
  }
  try {
    const response = await client.sendEachForMulticast({
      tokens: devices.map((device: { fcmToken: string }) => device.fcmToken),
      notification: { title: "Test notification", body: "Push notifications are working." },
      data: { type: "TEST" },
    });
    result.sent = response.successCount;
    result.failed = response.failureCount;
    const failure = response.responses.find((item) => item.error)?.error;
    if (failure) result.error = failure.message;
    await Promise.all(
      response.responses.map(async (item, index) => {
        const code = item.error?.code || "";
        if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
          await PushDevice.deleteOne({ _id: devices[index]._id });
        }
      }),
    );
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Sending failed.";
  }
  return result;
}

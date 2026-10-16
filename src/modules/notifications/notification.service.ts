import { isDuplicateKey } from "@/lib/errors/app-error";
import { firebaseReady, messaging } from "@/lib/firebase/admin";
import { Notification, NotificationJob, PushDevice } from "@/models/ops";
import { School } from "@/models/school";
import { Trip } from "@/models/trip";
import { User } from "@/models/user";
import { deduplicationKey } from "@/modules/trips/state";
import { readActiveTrip } from "@/lib/firebase/admin";
import { formatClock } from "@/utils/time";
import { serialize } from "@/utils/serialize";

const SAFETY_TYPES = new Set([
  "CHILD_STILL_ON_BUS",
  "STUDENT_WRONG_BUS",
  "STUDENT_WRONG_STOP",
  "BUS_TRACKING_OFFLINE",
  "STUDENT_NOT_BOARDED",
]);

export function describeEvent(body: string, historical: boolean, occurredAt: Date, timeZone: string) {
  if (!historical) return body;
  return `${body} Recorded at ${formatClock(occurredAt, timeZone)} after the device reconnected.`;
}

export async function notifyUsers(input: {
  schoolId: string;
  recipientIds: string[];
  studentId?: string | null;
  tripId?: string | null;
  type: string;
  title: string;
  body: string;
  occurredAt: Date;
  historical?: boolean;
  dedupParts: string[];
  asParent?: boolean;
}) {
  const school = await School.findById(input.schoolId).select("settings").lean();
  const enabled = school?.settings?.notificationsEnabled !== false;
  if (!enabled && !SAFETY_TYPES.has(input.type)) return [];

  const created = [];
  for (const recipientId of [...new Set(input.recipientIds.filter(Boolean))]) {
    try {
      const notification = await Notification.create({
        schoolId: input.schoolId,
        parentId: input.asParent === false ? null : recipientId,
        recipientUserId: recipientId,
        studentId: input.studentId || null,
        tripId: input.tripId || null,
        type: input.type,
        title: input.title,
        body: input.body,
        deliveryStatus: "PENDING",
        deduplicationKey: deduplicationKey([...input.dedupParts, recipientId]),
        occurredAt: input.occurredAt,
        historical: input.historical ?? false,
      });
      await NotificationJob.create({
        schoolId: input.schoolId,
        notificationId: notification._id,
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
      });
      created.push(notification);
    } catch (error) {
      if (isDuplicateKey(error)) continue;
      throw error;
    }
  }
  return created;
}

export async function processDueJobs(limit = 20) {
  const jobs = await NotificationJob.find({
    status: "PENDING",
    nextAttemptAt: { $lte: new Date() },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(limit);

  for (const job of jobs) {
    await deliverJob(job);
  }
  return { processed: jobs.length };
}

async function deliverJob(job: {
  notificationId: unknown;
  attempts: number;
  status: string;
  lastError: string;
  nextAttemptAt: Date;
  save: () => Promise<unknown>;
}) {
  const notification = await Notification.findById(job.notificationId);
  if (!notification) {
    job.status = "FAILED";
    job.lastError = "Notification record is missing.";
    await job.save();
    return;
  }

  const recipientId = notification.recipientUserId || notification.parentId;
  const devices = recipientId ? await PushDevice.find({ userId: recipientId }) : [];
  if (!devices.length) {
    notification.deliveryStatus = "SKIPPED";
    await notification.save();
    job.status = "SENT";
    job.lastError = "No registered device.";
    await job.save();
    return;
  }

  const client = messaging();
  if (!firebaseReady() || !client) {
    job.attempts += 1;
    job.lastError = "Firebase is not configured.";
    job.nextAttemptAt = new Date(Date.now() + 15 * 60 * 1000);
    if (job.attempts >= 8) {
      job.status = "FAILED";
      notification.deliveryStatus = "FAILED";
      await notification.save();
    }
    await job.save();
    return;
  }

  const response = await client.sendEachForMulticast({
    tokens: devices.map((device: { fcmToken: string }) => device.fcmToken),
    notification: { title: notification.title, body: notification.body },
    data: {
      type: String(notification.type),
      tripId: notification.tripId ? String(notification.tripId) : "",
      studentId: notification.studentId ? String(notification.studentId) : "",
      occurredAt: new Date(notification.occurredAt).toISOString(),
      historical: String(Boolean(notification.historical)),
    },
  });

  await Promise.all(
    response.responses.map(async (item, index) => {
      const code = item.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
        await PushDevice.deleteOne({ _id: devices[index]._id });
      }
    }),
  );

  if (response.successCount > 0) {
    notification.deliveryStatus = "SENT";
    notification.sentAt = new Date();
    job.status = "SENT";
    job.lastError = "";
  } else {
    job.attempts += 1;
    job.lastError = response.responses.find((item) => item.error)?.error?.message || "FCM delivery failed.";
    job.nextAttemptAt = new Date(Date.now() + job.attempts * 60_000);
    if (job.attempts >= 5) {
      job.status = "FAILED";
      notification.deliveryStatus = "FAILED";
    }
  }
  await notification.save();
  await job.save();
}

export async function scanStaleTrips() {
  const trips = await Trip.find({ status: "ACTIVE" }).lean();
  let flagged = 0;
  for (const trip of trips) {
    const school = await School.findById(trip.schoolId).lean();
    const interval = Number(school?.settings?.trackingIntervalSeconds || 8);
    const staleAfterMs = Math.max(interval * 3, 90) * 1000;
    const live = await readActiveTrip(String(trip._id));
    const updatedAt = live?.updatedAt || (trip.lastKnownLocation?.updatedAt ? new Date(trip.lastKnownLocation.updatedAt).getTime() : 0);
    if (!updatedAt || Date.now() - updatedAt < staleAfterMs) continue;
    if (Date.now() - new Date(trip.startedAt || trip.createdAt).getTime() < staleAfterMs) continue;

    const bucket = String(Math.floor(Date.now() / (10 * 60 * 1000)));
    const staff = await User.find({
      schoolId: trip.schoolId,
      role: "SCHOOL_ADMIN",
      status: "ACTIVE",
    }).select("_id");
    const recipients = [String(trip.driverId), trip.attendantId ? String(trip.attendantId) : "", ...staff.map((item: { _id: unknown }) => String(item._id))];
    await notifyUsers({
      schoolId: String(trip.schoolId),
      recipientIds: recipients,
      tripId: String(trip._id),
      type: "BUS_TRACKING_OFFLINE",
      title: "Bus tracking is offline",
      body: "GPS updates have stopped for an active trip. Check the driver device.",
      occurredAt: new Date(updatedAt),
      historical: false,
      dedupParts: ["BUS_TRACKING_OFFLINE", String(trip._id), bucket],
      asParent: false,
    });
    flagged += 1;
  }
  return { flagged };
}

export async function listNotifications(filter: Record<string, unknown>, page: number, limit: number) {
  const { paginate } = await import("@/lib/mongodb/paginate");
  const result = await paginate(Notification, filter, {
    page,
    limit,
    sort: { createdAt: -1 },
    populate: [{ path: "studentId", select: "name studentCode" }],
  });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

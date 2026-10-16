import { z } from "zod";
import { AppError, notFound } from "@/lib/errors/app-error";
import { createParentCustomToken, grantTripAccess } from "@/lib/firebase/admin";
import { paginate } from "@/lib/mongodb/paginate";
import { Student } from "@/models/student";
import { Trip, TripStudent } from "@/models/trip";
import { listNotifications } from "@/modules/notifications/notification.service";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { objectIdSchema } from "@/lib/validation/common";
import { serialize } from "@/utils/serialize";

export const liveAccessSchema = z.object({
  tripId: objectIdSchema,
  studentId: objectIdSchema,
});

function assertParent(user: AuthUser) {
  if (user.role !== ROLES.PARENT || !user.schoolId) {
    throw new AppError(403, "FORBIDDEN", "Only a parent can use this resource.");
  }
}

async function ownedChild(user: AuthUser, studentId: string) {
  assertParent(user);
  const student = await Student.findOne({
    _id: studentId,
    schoolId: user.schoolId,
    parentIds: user.id,
    status: "ACTIVE",
  }).lean();
  if (!student) throw notFound("Student");
  return student;
}

export async function listChildren(user: AuthUser) {
  assertParent(user);
  const students = await Student.find({ schoolId: user.schoolId, parentIds: user.id, status: "ACTIVE" })
    .select("name studentCode className division photoUrl status")
    .lean();
  return students.map((student) => serialize(student));
}

export async function childStatus(user: AuthUser, studentId: string) {
  const student = await ownedChild(user, studentId);
  const latest = await TripStudent.findOne({ schoolId: user.schoolId, studentId })
    .sort({ createdAt: -1 })
    .populate({ path: "tripId", select: "status direction scheduledDate vehicleId routeId startedAt endedAt" })
    .populate("assignedStopId", "name")
    .lean();
  return { student: serialize(student), transport: latest ? serialize(latest) : null };
}

export async function parentActiveTrips(user: AuthUser) {
  assertParent(user);
  const children = await Student.find({ schoolId: user.schoolId, parentIds: user.id }).select("_id").lean();
  const rows = await TripStudent.find({
    schoolId: user.schoolId,
    studentId: { $in: children.map((child: { _id: unknown }) => child._id) },
  })
    .select("tripId studentId boardingStatus dropStatus")
    .lean();
  const trips = await Trip.find({
    _id: { $in: rows.map((row: { tripId: unknown }) => row.tripId) },
    status: "ACTIVE",
    schoolId: user.schoolId,
  })
    .populate("vehicleId", "vehicleNumber vehicleType")
    .populate("routeId", "name routeCode direction")
    .lean();
  return trips.map((trip) => ({
    ...serialize(trip) as object,
    children: rows
      .filter((row: { tripId: unknown }) => String(row.tripId) === String(trip._id))
      .map((row) => serialize(row)),
  }));
}

export async function parentTrip(user: AuthUser, tripId: string) {
  assertParent(user);
  const trip = await Trip.findOne({ _id: tripId, schoolId: user.schoolId }).lean();
  if (!trip) throw notFound("Trip");
  const children = await Student.find({ schoolId: user.schoolId, parentIds: user.id }).select("_id name").lean();
  const rows = await TripStudent.find({
    tripId,
    studentId: { $in: children.map((child: { _id: unknown }) => child._id) },
  }).lean();
  if (!rows.length) throw new AppError(403, "FORBIDDEN", "This trip does not include your child.");
  return { trip: serialize(trip), students: rows.map((row) => serialize(row)) };
}

export async function parentNotifications(user: AuthUser, page: number, limit: number) {
  assertParent(user);
  return listNotifications({ parentId: user.id, schoolId: user.schoolId }, page, limit);
}

export async function parentLiveAccess(user: AuthUser, input: z.infer<typeof liveAccessSchema>) {
  await ownedChild(user, input.studentId);
  const trip = await Trip.findOne({ _id: input.tripId, schoolId: user.schoolId, status: "ACTIVE" }).lean();
  if (!trip) throw new AppError(409, "TRIP_NOT_ACTIVE", "Live tracking is available only during an active trip.");
  const row = await TripStudent.findOne({ tripId: trip._id, studentId: input.studentId }).lean();
  if (!row) throw new AppError(403, "FORBIDDEN", "Your child is not assigned to this trip.");
  const uid = `parent_${user.id}`;
  const granted = await grantTripAccess(String(trip._id), uid);
  const customToken = await createParentCustomToken(user.id, {
    role: "PARENT",
    schoolId: user.schoolId || "",
    tripId: String(trip._id),
  });
  if (!granted || !customToken) {
    throw new AppError(503, "FIREBASE_NOT_CONFIGURED", "Live tracking is not configured on the server yet.");
  }
  return {
    customToken,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    path: `activeTrips/${String(trip._id)}`,
    uid,
    expiresIn: 3600,
  };
}

export async function adminNotifications(schoolId: string, page: number, limit: number) {
  return listNotifications({ schoolId }, page, limit);
}

export async function listAudit(schoolId: string | Record<string, unknown>, page: number, limit: number) {
  const { AuditLog } = await import("@/models/ops");
  const filter = typeof schoolId === "string" ? { schoolId } : schoolId;
  const result = await paginate(AuditLog, filter, { page, limit, sort: { createdAt: -1 } });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

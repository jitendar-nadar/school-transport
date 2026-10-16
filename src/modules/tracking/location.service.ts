import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { readActiveTrip, revokeTrip, writeActiveTrip } from "@/lib/firebase/admin";
import { School } from "@/models/school";
import { Stop } from "@/models/fleet";
import { Trip, TripLocationHistory, TripStudent } from "@/models/trip";
import { User } from "@/models/user";
import { Vehicle } from "@/models/fleet";
import { describeEvent, notifyUsers, processDueJobs } from "@/modules/notifications/notification.service";
import { approachNotificationType } from "@/modules/trips/state";
import type { AuthUser } from "@/types/domain";
import { distanceMeters, fromPoint, isValidCoordinate, speedKmh, toPoint, type LatLng } from "@/utils/geo";
import { isHistoricalEvent } from "@/utils/time";

const recentPoints = new Map<string, { at: number; latitude: number; longitude: number }>();

export const locationSchema = z.object({
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
  accuracyMeters: z.coerce.number().min(0).max(500),
  heading: z.coerce.number().min(0).max(360).optional(),
  speedKmh: z.coerce.number().min(0).max(180).optional(),
  recordedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp"),
  allowHistorical: z.boolean().optional(),
});

export type LocationInput = z.infer<typeof locationSchema>;

export function clearLiveCache(tripId: string) {
  recentPoints.delete(tripId);
}

export async function openLiveTrip(trip: { _id: unknown; schoolId: unknown; vehicleId: unknown }) {
  const { realtimeDb } = await import("@/lib/firebase/admin");
  const db = realtimeDb();
  if (!db) return false;
  await db.ref(`activeTrips/${String(trip._id)}`).set({
    schoolId: String(trip.schoolId),
    vehicleId: String(trip.vehicleId),
    status: "ACTIVE",
    updatedAt: Date.now(),
  });
  return true;
}

export async function closeLiveTrip(tripId: string) {
  clearLiveCache(tripId);
  return revokeTrip(tripId);
}

export async function applyLocation(user: AuthUser, trip: {
  _id: unknown;
  schoolId: unknown;
  vehicleId: unknown;
  direction: "PICKUP" | "DROP";
  status: string;
  schoolArrivalAt?: Date | null;
  lastKnownLocation?: {
    coordinates?: number[];
    accuracyMeters?: number;
    heading?: number;
    speedKmh?: number;
    updatedAt?: Date;
  };
  save: () => Promise<unknown>;
}, input: LocationInput) {
  if (trip.status !== "ACTIVE") {
    throw new AppError(409, "TRIP_NOT_ACTIVE", "Location updates are only accepted for an active trip.");
  }
  if (!isValidCoordinate(input.latitude, input.longitude)) {
    throw new AppError(422, "GPS_INVALID", "GPS coordinates are invalid.");
  }

  const school = await School.findById(trip.schoolId).lean();
  if (!school) throw new AppError(404, "NOT_FOUND", "School was not found.");
  const settings = school.settings || {};
  const recordedAt = new Date(input.recordedAt);
  const maxAge = Number(settings.gpsMaxAgeSeconds || 120) * 1000;
  if (recordedAt.getTime() > Date.now() + 60_000) {
    throw new AppError(422, "GPS_FUTURE", "GPS timestamp is too far in the future.");
  }
  if (!input.allowHistorical && Date.now() - recordedAt.getTime() > maxAge) {
    throw new AppError(422, "GPS_STALE", "GPS update is stale and was rejected.");
  }
  if (input.accuracyMeters > Number(settings.gpsAccuracyMaxMeters || 80)) {
    throw new AppError(422, "GPS_ACCURACY", "GPS accuracy is too poor to trust for live tracking.");
  }

  const tripId = String(trip._id);
  const point = { latitude: input.latitude, longitude: input.longitude };
  const previous = recentPoints.get(tripId);
  if (previous) {
    const moved = distanceMeters(previous, point);
    const elapsed = (recordedAt.getTime() - previous.at) / 1000;
    if (elapsed > 1 && speedKmh(moved, elapsed) > 180) {
      throw new AppError(422, "GPS_IMPLAUSIBLE", "GPS update implies an implausible speed and was rejected.");
    }
    const interval = Number(settings.trackingIntervalSeconds || 8);
    if (moved < 15 && elapsed < interval) {
      return { throttled: true, firebaseSynced: true, followUp: null as null | (() => Promise<void>) };
    }
  }

  recentPoints.set(tripId, { at: recordedAt.getTime(), ...point });
  const firebaseSynced = await writeActiveTrip(tripId, {
    schoolId: String(trip.schoolId),
    vehicleId: String(trip.vehicleId),
    latitude: point.latitude,
    longitude: point.longitude,
    heading: input.heading ?? null,
    speedKmh: input.speedKmh ?? null,
    accuracyMeters: input.accuracyMeters,
    updatedAt: recordedAt.getTime(),
    status: "ACTIVE",
  }).catch((error) => {
    console.error(error);
    return false;
  });

  const sampleSeconds = Number(settings.locationSampleSeconds || 60) * 1000;
  const lastSample = trip.lastKnownLocation?.updatedAt ? new Date(trip.lastKnownLocation.updatedAt).getTime() : 0;
  if (!lastSample || recordedAt.getTime() - lastSample >= sampleSeconds) {
    trip.lastKnownLocation = {
      ...toPoint(point.latitude, point.longitude),
      accuracyMeters: input.accuracyMeters,
      heading: input.heading,
      speedKmh: input.speedKmh,
      updatedAt: recordedAt,
    };
    await trip.save();
    await TripLocationHistory.create({
      schoolId: trip.schoolId,
      tripId: trip._id,
      location: toPoint(point.latitude, point.longitude),
      heading: input.heading,
      speedKmh: input.speedKmh,
      accuracyMeters: input.accuracyMeters,
      recordedAt,
    });
  }

  return {
    throttled: false,
    firebaseSynced,
    followUp: async () => {
      await evaluateProximity({ tripId, school, point, recordedAt, actorId: user.id });
      await processDueJobs(15);
    },
  };
}

async function evaluateProximity(input: {
  tripId: string;
  school: { _id: unknown; name?: string; location?: { coordinates?: number[] }; settings?: { proximityRadiusMeters?: number; schoolGeofenceMeters?: number; notificationTimezone?: string; notificationsEnabled?: boolean } };
  point: LatLng;
  recordedAt: Date;
  actorId: string;
}) {
  const trip = await Trip.findById(input.tripId);
  if (!trip || trip.status !== "ACTIVE") return;
  const timeZone = input.school.settings?.notificationTimezone || "Asia/Kolkata";
  const historical = isHistoricalEvent(input.recordedAt);
  const students = await TripStudent.find({ tripId: trip._id }).lean();
  const stops = await Stop.find({ _id: { $in: students.map((student: { assignedStopId?: unknown }) => student.assignedStopId).filter(Boolean) } }).lean();
  const stopMap = new Map(
    stops.map((stop: { _id: unknown; name?: string; location?: { coordinates?: number[] }; geofenceRadiusMeters?: number }) => [
      String(stop._id),
      stop,
    ]),
  );
  const vehicle = await Vehicle.findById(trip.vehicleId).select("vehicleNumber").lean();
  const vehicleNumber = vehicle?.vehicleNumber || "the bus";

  for (const row of students) {
    const stop = row.assignedStopId ? stopMap.get(String(row.assignedStopId)) : null;
    const stopPoint = fromPoint(stop?.location);
    if (!stop || !stopPoint) continue;
    const waitingForPickup = trip.direction === "PICKUP" && row.boardingStatus !== "BOARDED";
    const travelingHome = trip.direction === "DROP" && row.boardingStatus === "BOARDED" && row.dropStatus !== "DROPPED";
    if (!waitingForPickup && !travelingHome) continue;
    const radius = Math.max(Number(stop.geofenceRadiusMeters || 80), Number(input.school.settings?.proximityRadiusMeters || 300));
    if (distanceMeters(input.point, stopPoint) > radius) continue;
    if (!row.notificationsEnabled) continue;
    const studentDoc = await (await import("@/models/student")).Student.findById(row.studentId).select("name parentIds").lean();
    if (!studentDoc) continue;
    const type = approachNotificationType(trip.direction);
    const body = describeEvent(
      `${vehicleNumber} is approaching ${stop.name}. Please be ready.`,
      historical,
      input.recordedAt,
      timeZone,
    );
    await notifyUsers({
      schoolId: String(trip.schoolId),
      recipientIds: (studentDoc.parentIds || []).map((id: unknown) => String(id)),
      studentId: String(row.studentId),
      tripId: String(trip._id),
      type,
      title: "Bus is approaching",
      body,
      occurredAt: input.recordedAt,
      historical,
      dedupParts: [type, String(trip._id), String(row.studentId), String(stop._id)],
    });
  }

  if (trip.direction === "PICKUP" && !trip.schoolArrivalAt) {
    const schoolPoint = fromPoint(input.school.location);
    const fence = Number(input.school.settings?.schoolGeofenceMeters || 150);
    if (schoolPoint && distanceMeters(input.point, schoolPoint) <= fence) {
      trip.schoolArrivalAt = input.recordedAt;
      await trip.save();
      const { TripEvent } = await import("@/models/trip");
      await TripEvent.create({
        schoolId: trip.schoolId,
        tripId: trip._id,
        type: "BUS_ARRIVED_AT_SCHOOL",
        message: `${vehicleNumber} arrived at ${input.school.name}.`,
        actorId: input.actorId,
        occurredAt: input.recordedAt,
        payload: input.point,
      });
      const staff = await User.find({ schoolId: trip.schoolId, role: "SCHOOL_ADMIN", status: "ACTIVE" }).select("_id");
      await notifyUsers({
        schoolId: String(trip.schoolId),
        recipientIds: staff.map((item: { _id: unknown }) => String(item._id)),
        tripId: String(trip._id),
        type: "BUS_ARRIVED_AT_SCHOOL",
        title: "Bus arrived at school",
        body: describeEvent(`${vehicleNumber} arrived at ${input.school.name}.`, historical, input.recordedAt, timeZone),
        occurredAt: input.recordedAt,
        historical,
        dedupParts: ["BUS_ARRIVED_AT_SCHOOL", String(trip._id)],
        asParent: false,
      });
    }
  }
}

export { readActiveTrip };

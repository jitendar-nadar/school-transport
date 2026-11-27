import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { readActiveTrip, revokeTrip, writeActiveTrip } from "@/lib/firebase/admin";
import { School } from "@/models/school";
import { Route, Stop, Vehicle } from "@/models/fleet";
import { Trip, TripEvent, TripLocationHistory, TripStudent } from "@/models/trip";
import { User } from "@/models/user";
import { describeEvent, notifyUsers, processDueJobs } from "@/modules/notifications/notification.service";
import {
  etaMinutes,
  isLongStop,
  isOverspeed,
  isRouteDeviation,
  shouldSendApproachAlert,
} from "@/modules/trips/bus-tracking-rules";
import { approachNotificationType } from "@/modules/trips/state";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
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

async function schoolStaffIds(schoolId: unknown, trip?: { driverId?: unknown; attendantId?: unknown }) {
  const staff = await User.find({ schoolId, role: ROLES.SCHOOL_ADMIN, status: "ACTIVE" }).select("_id").lean();
  return [
    ...new Set(
      [
        ...staff.map((row: { _id: unknown }) => String(row._id)),
        trip?.driverId ? String(trip.driverId) : "",
        trip?.attendantId ? String(trip.attendantId) : "",
      ].filter(Boolean),
    ),
  ];
}

export async function applyLocation(user: AuthUser, trip: {
  _id: unknown;
  schoolId: unknown;
  vehicleId: unknown;
  routeId?: unknown;
  driverId?: unknown;
  attendantId?: unknown;
  direction: "PICKUP" | "DROP";
  status: string;
  schoolArrivalAt?: Date | null;
  stoppedSince?: Date | null;
  overspeedAlerted?: boolean;
  longStopAlerted?: boolean;
  routeDeviationAlerted?: boolean;
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

  const students = await TripStudent.find({ tripId: trip._id }).lean();
  const stopIds = students.map((row: { assignedStopId?: unknown }) => row.assignedStopId).filter(Boolean);
  const stops = await Stop.find({ _id: { $in: stopIds } }).lean();
  const stopMap = new Map(stops.map((stop: { _id: unknown }) => [String(stop._id), stop]));
  type StopRow = { _id: unknown; name?: string; location?: { coordinates?: number[] }; geofenceRadiusMeters?: number };
  const etas = students
    .map((row: { studentId: unknown; assignedStopId?: unknown; boardingStatus: string; dropStatus: string }) => {
      const stop = (row.assignedStopId ? stopMap.get(String(row.assignedStopId)) : null) as StopRow | undefined;
      const stopPoint = fromPoint(stop?.location);
      if (!stop || !stopPoint) return null;
      const waitingForPickup = trip.direction === "PICKUP" && row.boardingStatus !== "BOARDED";
      const travelingHome = trip.direction === "DROP" && row.boardingStatus === "BOARDED" && row.dropStatus !== "DROPPED";
      if (!waitingForPickup && !travelingHome) return null;
      const distance = distanceMeters(point, stopPoint);
      return {
        studentId: String(row.studentId),
        stopId: String(stop._id),
        stopName: String(stop.name || "Stop"),
        etaMinutes: etaMinutes(distance, input.speedKmh),
        distanceMeters: Math.round(distance),
      };
    })
    .filter(Boolean) as Array<{ studentId: string; stopId: string; stopName: string; etaMinutes: number; distanceMeters: number }>;

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
    etas,
  }).catch((error) => {
    console.error(error);
    return false;
  });

  const sampleSeconds = Number(settings.locationSampleSeconds || 60) * 1000;
  const lastSample = trip.lastKnownLocation?.updatedAt ? new Date(trip.lastKnownLocation.updatedAt).getTime() : 0;
  const sampleDue = !lastSample || recordedAt.getTime() - lastSample >= sampleSeconds;
  // Without Firebase the saved position is what parents see, so keep it fresh.
  if (sampleDue || !firebaseSynced) {
    trip.lastKnownLocation = {
      ...toPoint(point.latitude, point.longitude),
      accuracyMeters: input.accuracyMeters,
      heading: input.heading,
      speedKmh: input.speedKmh,
      updatedAt: recordedAt,
    };
    await trip.save();
  }
  if (sampleDue) {
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
      await evaluateProximity({
        tripId,
        school,
        point,
        recordedAt,
        actorId: user.id,
        speedKmh: input.speedKmh ?? null,
        user,
      });
      await evaluateBusSafety({
        tripId,
        school,
        point,
        recordedAt,
        speedKmh: input.speedKmh ?? null,
        actorId: user.id,
      });
      await processDueJobs(15);
    },
  };
}

async function evaluateBusSafety(input: {
  tripId: string;
  school: { _id: unknown; name?: string; settings?: Record<string, unknown> };
  point: LatLng;
  recordedAt: Date;
  speedKmh: number | null;
  actorId: string;
}) {
  const trip = await Trip.findById(input.tripId);
  if (!trip || trip.status !== "ACTIVE") return;
  const settings = input.school.settings || {};
  const overspeedLimit = Number(settings.busOverspeedKmh || 60);
  const longStopMinutes = Number(settings.busLongStopMinutes || 10);
  const deviationMeters = Number(settings.busRouteDeviationMeters || 400);
  const vehicle = await Vehicle.findById(trip.vehicleId).select("vehicleNumber").lean();
  const vehicleNumber = vehicle?.vehicleNumber || "the bus";
  const staffIds = await schoolStaffIds(trip.schoolId, trip);
  const historical = isHistoricalEvent(input.recordedAt);

  if (isOverspeed(input.speedKmh, overspeedLimit)) {
    if (!trip.overspeedAlerted) {
      trip.overspeedAlerted = true;
      await TripEvent.create({
        schoolId: trip.schoolId,
        tripId: trip._id,
        type: "BUS_OVERSPEED",
        message: `${vehicleNumber} exceeded ${overspeedLimit} km/h (${input.speedKmh} km/h).`,
        actorId: input.actorId,
        occurredAt: input.recordedAt,
        payload: { speedKmh: input.speedKmh, limit: overspeedLimit },
      });
      await notifyUsers({
        schoolId: String(trip.schoolId),
        recipientIds: staffIds,
        tripId: String(trip._id),
        type: "BUS_OVERSPEED",
        title: "Bus over-speed",
        body: describeEvent(
          `${vehicleNumber} is travelling at ${input.speedKmh} km/h (limit ${overspeedLimit}).`,
          historical,
          input.recordedAt,
          String(settings.notificationTimezone || "Asia/Kolkata"),
        ),
        occurredAt: input.recordedAt,
        historical,
        dedupParts: ["BUS_OVERSPEED", String(trip._id), String(Math.floor(input.recordedAt.getTime() / 300000))],
        asParent: false,
      });
    }
  } else {
    trip.overspeedAlerted = false;
  }

  if (input.speedKmh != null && input.speedKmh < 5) {
    if (!trip.stoppedSince) trip.stoppedSince = input.recordedAt;
  } else {
    trip.stoppedSince = null;
    trip.longStopAlerted = false;
  }

  if (
    isLongStop({
      speedKmh: input.speedKmh,
      stoppedSince: trip.stoppedSince,
      now: input.recordedAt,
      longStopMinutes,
    }) &&
    !trip.longStopAlerted
  ) {
    trip.longStopAlerted = true;
    await TripEvent.create({
      schoolId: trip.schoolId,
      tripId: trip._id,
      type: "BUS_LONG_STOP",
      message: `${vehicleNumber} has been stopped for more than ${longStopMinutes} minutes.`,
      actorId: input.actorId,
      occurredAt: input.recordedAt,
    });
    await notifyUsers({
      schoolId: String(trip.schoolId),
      recipientIds: staffIds,
      tripId: String(trip._id),
      type: "BUS_LONG_STOP",
      title: "Bus long stop",
      body: describeEvent(
        `${vehicleNumber} has been stopped for more than ${longStopMinutes} minutes.`,
        historical,
        input.recordedAt,
        String(settings.notificationTimezone || "Asia/Kolkata"),
      ),
      occurredAt: input.recordedAt,
      historical,
      dedupParts: ["BUS_LONG_STOP", String(trip._id), String(Math.floor(input.recordedAt.getTime() / 600000))],
      asParent: false,
    });
  }

  const route = await Route.findById(trip.routeId).select("stops").lean();
  if (route?.stops?.length) {
    const routeStops = await Stop.find({ _id: { $in: route.stops } }).lean();
    const ordered = route.stops
      .map((id: unknown) => routeStops.find((stop: { _id: unknown; location?: { coordinates?: number[] } }) => String(stop._id) === String(id)))
      .filter(Boolean)
      .map((stop: { location?: { coordinates?: number[] } } | undefined) => fromPoint(stop?.location))
      .filter(Boolean) as LatLng[];
    if (isRouteDeviation(input.point, ordered, deviationMeters)) {
      if (!trip.routeDeviationAlerted) {
        trip.routeDeviationAlerted = true;
        await TripEvent.create({
          schoolId: trip.schoolId,
          tripId: trip._id,
          type: "BUS_ROUTE_DEVIATION",
          message: `${vehicleNumber} is more than ${deviationMeters} m off the planned route.`,
          actorId: input.actorId,
          occurredAt: input.recordedAt,
        });
        await notifyUsers({
          schoolId: String(trip.schoolId),
          recipientIds: staffIds,
          tripId: String(trip._id),
          type: "BUS_ROUTE_DEVIATION",
          title: "Bus route deviation",
          body: describeEvent(
            `${vehicleNumber} is more than ${deviationMeters} m off the planned route.`,
            historical,
            input.recordedAt,
            String(settings.notificationTimezone || "Asia/Kolkata"),
          ),
          occurredAt: input.recordedAt,
          historical,
          dedupParts: ["BUS_ROUTE_DEVIATION", String(trip._id), String(Math.floor(input.recordedAt.getTime() / 300000))],
          asParent: false,
        });
      }
    } else {
      trip.routeDeviationAlerted = false;
    }
  }

  await trip.save();
}

async function evaluateProximity(input: {
  tripId: string;
  school: {
    _id: unknown;
    name?: string;
    location?: { coordinates?: number[] };
    settings?: {
      proximityRadiusMeters?: number;
      schoolGeofenceMeters?: number;
      notificationTimezone?: string;
      notificationsEnabled?: boolean;
      busApproachEtaMinutes?: number;
      busAutoDropAtStop?: boolean;
    };
  };
  point: LatLng;
  recordedAt: Date;
  actorId: string;
  speedKmh: number | null;
  user: AuthUser;
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
  const etaThreshold = Number(input.school.settings?.busApproachEtaMinutes || 5);
  const autoDrop = input.school.settings?.busAutoDropAtStop !== false;

  for (const row of students) {
    const stop = row.assignedStopId ? stopMap.get(String(row.assignedStopId)) : null;
    const stopPoint = fromPoint(stop?.location);
    if (!stop || !stopPoint) continue;
    const distance = distanceMeters(input.point, stopPoint);
    const stopRadius = Number(stop.geofenceRadiusMeters || 80);
    const waitingForPickup = trip.direction === "PICKUP" && row.boardingStatus !== "BOARDED";
    const travelingHome = trip.direction === "DROP" && row.boardingStatus === "BOARDED" && row.dropStatus !== "DROPPED";

    if ((waitingForPickup || travelingHome) && row.notificationsEnabled) {
      const decision = shouldSendApproachAlert({
        distanceMeters: distance,
        speedKmh: input.speedKmh,
        stopRadiusMeters: stopRadius,
        proximityRadiusMeters: Number(input.school.settings?.proximityRadiusMeters || 300),
        etaThresholdMinutes: etaThreshold,
      });
      if (decision.alert) {
        const studentDoc = await (await import("@/models/student")).Student.findById(row.studentId).select("name parentIds").lean();
        if (studentDoc) {
          const type = approachNotificationType(trip.direction);
          const etaText =
            decision.etaMinutes <= etaThreshold
              ? `${vehicleNumber} is about ${decision.etaMinutes} minute${decision.etaMinutes === 1 ? "" : "s"} from ${stop.name}.`
              : `${vehicleNumber} is approaching ${stop.name}. Please be ready.`;
          const body = describeEvent(etaText, historical, input.recordedAt, timeZone);
          await notifyUsers({
            schoolId: String(trip.schoolId),
            recipientIds: (studentDoc.parentIds || []).map((id: unknown) => String(id)),
            studentId: String(row.studentId),
            tripId: String(trip._id),
            type,
            title: decision.etaMinutes <= etaThreshold ? "Bus is about 5 minutes away" : "Bus is approaching",
            body,
            occurredAt: input.recordedAt,
            historical,
            dedupParts: [type, String(trip._id), String(row.studentId), String(stop._id)],
          });
        }
      }
    }

    if (autoDrop && travelingHome && distance <= stopRadius) {
      try {
        const { confirmDrop } = await import("@/modules/trips/trip.service");
        await confirmDrop(input.user, input.tripId, {
          studentId: String(row.studentId),
          verificationMethod: "ASSISTED",
          stopId: String(stop._id),
          latitude: input.point.latitude,
          longitude: input.point.longitude,
          occurredAt: input.recordedAt.toISOString(),
          eventId: `auto-drop-${String(trip._id)}-${String(row.studentId)}`,
        });
      } catch {
        // Attendant can confirm manually if auto-drop is refused.
      }
    }
  }

  if (trip.direction === "PICKUP" && !trip.schoolArrivalAt) {
    const schoolPoint = fromPoint(input.school.location);
    const fence = Number(input.school.settings?.schoolGeofenceMeters || 150);
    if (schoolPoint && distanceMeters(input.point, schoolPoint) <= fence) {
      trip.schoolArrivalAt = input.recordedAt;
      await trip.save();
      await TripEvent.create({
        schoolId: trip.schoolId,
        tripId: trip._id,
        type: "BUS_ARRIVED_AT_SCHOOL",
        message: `${vehicleNumber} arrived at ${input.school.name}.`,
        actorId: input.actorId,
        occurredAt: input.recordedAt,
        payload: input.point,
      });
      const staff = await schoolStaffIds(trip.schoolId, trip);
      await notifyUsers({
        schoolId: String(trip.schoolId),
        recipientIds: staff,
        tripId: String(trip._id),
        type: "BUS_ARRIVED_AT_SCHOOL",
        title: "Bus arrived at school",
        body: describeEvent(`${vehicleNumber} arrived at ${input.school.name}.`, historical, input.recordedAt, timeZone),
        occurredAt: input.recordedAt,
        historical,
        dedupParts: ["BUS_ARRIVED_AT_SCHOOL", String(trip._id)],
        asParent: false,
      });

      const boarded = students.filter((row: { boardingStatus: string; dropStatus: string; notificationsEnabled?: boolean }) => row.boardingStatus === "BOARDED" && row.dropStatus !== "DROPPED");
      for (const row of boarded) {
        const studentDoc = await (await import("@/models/student")).Student.findById(row.studentId).select("name parentIds").lean();
        if (!studentDoc || row.notificationsEnabled === false) continue;
        await notifyUsers({
          schoolId: String(trip.schoolId),
          recipientIds: (studentDoc.parentIds || []).map((id: unknown) => String(id)),
          studentId: String(row.studentId),
          tripId: String(trip._id),
          type: "BUS_ARRIVED_AT_SCHOOL",
          title: "Reached school",
          body: describeEvent(
            `${studentDoc.name} reached school on ${vehicleNumber} at the school gate area.`,
            historical,
            input.recordedAt,
            timeZone,
          ),
          occurredAt: input.recordedAt,
          historical,
          dedupParts: ["BUS_ARRIVED_AT_SCHOOL", "PARENT", String(trip._id), String(row.studentId)],
        });
        if (autoDrop) {
          try {
            const { confirmDrop } = await import("@/modules/trips/trip.service");
            await confirmDrop(input.user, input.tripId, {
              studentId: String(row.studentId),
              verificationMethod: "ASSISTED",
              latitude: input.point.latitude,
              longitude: input.point.longitude,
              occurredAt: input.recordedAt.toISOString(),
              eventId: `auto-school-drop-${String(trip._id)}-${String(row.studentId)}`,
            });
          } catch {
            // Manual drop remains available.
          }
        }
      }
    }
  }
}

export { readActiveTrip };

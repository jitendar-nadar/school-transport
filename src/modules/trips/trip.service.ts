import { z } from "zod";
import { requireSchoolId } from "@/lib/auth/guard";
import { AppError, isDuplicateKey, notFound } from "@/lib/errors/app-error";
import { createOne, withOptionalTransaction } from "@/lib/mongodb/transactions";
import { paginate } from "@/lib/mongodb/paginate";
import { resolveTag } from "@/modules/ble/ble.service";
import { writeAudit } from "@/modules/audit/audit.service";
import { describeEvent, notifyUsers, processDueJobs } from "@/modules/notifications/notification.service";
import { applyLocation, closeLiveTrip, locationSchema, openLiveTrip } from "@/modules/tracking/location.service";
import {
  assistedBoardingAllowed,
  boardTransition,
  boardingNotificationType,
  dropNotificationType,
  dropTransition,
  unresolvedOnboard,
} from "@/modules/trips/state";
import { Assignment, Route, Stop, Vehicle } from "@/models/fleet";
import { School } from "@/models/school";
import { Student } from "@/models/student";
import { BleDetection, Trip, TripEvent, TripStudent } from "@/models/trip";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { objectIdSchema } from "@/lib/validation/common";
import { distanceMeters, fromPoint, toPoint } from "@/utils/geo";
import { serialize } from "@/utils/serialize";
import { calendarDate, dayAnchor, formatClock, isHistoricalEvent } from "@/utils/time";

const timestampSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp");

export const startTripSchema = z.object({
  routeId: objectIdSchema,
  vehicleId: objectIdSchema.optional(),
  driverId: objectIdSchema.optional(),
  attendantId: objectIdSchema.optional(),
  scheduledDate: z.string().optional(),
});

export const detectionSchema = z.object({
  eventId: z.string().trim().min(4).max(80),
  tagIdentifier: z.string().trim().min(3).max(80),
  rssi: z.coerce.number().min(-120).max(20),
  detectedAt: timestampSchema,
  latitude: z.coerce.number().gte(-90).lte(90).optional(),
  longitude: z.coerce.number().gte(-180).lte(180).optional(),
  accuracyMeters: z.coerce.number().min(0).max(1000).optional(),
});

export const batchSchema = z.object({
  detections: z.array(detectionSchema).min(1).max(100),
});

export const verificationSchema = z
  .object({
    studentId: objectIdSchema,
    eventId: z.string().trim().min(4).max(80).optional(),
    verificationMethod: z.enum(["MANUAL", "ASSISTED", "OVERRIDE"]),
    latitude: z.coerce.number().gte(-90).lte(90).optional(),
    longitude: z.coerce.number().gte(-180).lte(180).optional(),
    occurredAt: timestampSchema.optional(),
    stopId: objectIdSchema.optional(),
    reason: z.string().trim().max(400).optional(),
  })
  .refine((value) => value.verificationMethod !== "OVERRIDE" || (value.reason && value.reason.length >= 8), {
    message: "An override requires a reason of at least 8 characters.",
  });

export const syncSchema = z.object({
  events: z
    .array(
      z.object({
        eventId: z.string().trim().min(4).max(80),
        type: z.enum(["DETECTION", "BOARD", "DROP", "LOCATION"]),
        occurredAt: timestampSchema,
        payload: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(100),
});

export const endTripSchema = z.object({
  safetyChecklist: z.object({
    inspectedVehicle: z.literal(true),
    confirmedHeadcount: z.literal(true),
  }),
  unresolvedOverride: z.object({ reason: z.string().trim().min(8).max(400) }).optional(),
});

export { locationSchema };

function assertCrewRole(user: AuthUser) {
  if (user.role !== ROLES.DRIVER && user.role !== ROLES.ATTENDANT) {
    throw new AppError(403, "FORBIDDEN", "Only a driver or attendant can operate a trip.");
  }
}

async function loadCrewTrip(user: AuthUser, tripId: string, allowCompleted = false) {
  assertCrewRole(user);
  const trip = await Trip.findById(tripId);
  if (!trip) throw notFound("Trip");
  if (String(trip.schoolId) !== user.schoolId) {
    throw new AppError(403, "TENANT_MISMATCH", "You cannot access this trip.");
  }
  const allowed = [String(trip.driverId), trip.attendantId ? String(trip.attendantId) : ""];
  if (!allowed.includes(user.id)) {
    throw new AppError(403, "NOT_ASSIGNED", "You are not assigned to this trip.");
  }
  if (!allowCompleted && trip.status !== "ACTIVE") {
    throw new AppError(409, "TRIP_NOT_ACTIVE", "This trip is not active.");
  }
  return trip;
}

async function schoolContext(schoolId: string) {
  const school = await School.findById(schoolId).lean();
  if (!school) throw notFound("School");
  if (school.status === "SUSPENDED") throw new AppError(403, "SCHOOL_SUSPENDED", "This school is suspended.");
  return school;
}

export async function driverToday(user: AuthUser) {
  assertCrewRole(user);
  const schoolId = requireSchoolId(user);
  const school = await schoolContext(schoolId);
  const date = calendarDate(school.settings?.notificationTimezone || "Asia/Kolkata");
  const vehicles = await Vehicle.find({
    schoolId,
    status: "ACTIVE",
    ...(user.role === ROLES.DRIVER ? { driverIds: user.id } : { attendantIds: user.id }),
  }).lean();
  const routes = await Route.find({
    schoolId,
    status: "ACTIVE",
    vehicleId: { $in: vehicles.map((vehicle: { _id: unknown }) => vehicle._id) },
  }).lean();
  const trips = await Trip.find({
    schoolId,
    scheduledDate: date,
    $or: [{ driverId: user.id }, { attendantId: user.id }],
  })
    .sort({ createdAt: -1 })
    .lean();
  return {
    date,
    vehicles: vehicles.map((item) => serialize(item)),
    routes: routes.map((item) => serialize(item)),
    trips: trips.map((item) => serialize(item)),
  };
}

export async function activeDriverTrip(user: AuthUser) {
  assertCrewRole(user);
  const trip = await Trip.findOne({
    schoolId: requireSchoolId(user),
    status: "ACTIVE",
    $or: [{ driverId: user.id }, { attendantId: user.id }],
  }).lean();
  return trip ? serialize(trip) : null;
}

export async function startTrip(user: AuthUser, input: z.infer<typeof startTripSchema>) {
  assertCrewRole(user);
  const schoolId = requireSchoolId(user);
  const school = await schoolContext(schoolId);
  const route = await Route.findOne({ _id: input.routeId, schoolId, status: "ACTIVE" });
  if (!route) throw notFound("Route");
  const vehicleId = input.vehicleId || String(route.vehicleId);
  if (String(route.vehicleId) !== vehicleId) {
    throw new AppError(422, "VEHICLE_MISMATCH", "This route is assigned to a different vehicle.");
  }
  const vehicle = await Vehicle.findOne({ _id: vehicleId, schoolId, status: "ACTIVE" });
  if (!vehicle) throw notFound("Vehicle");

  const drivers = (vehicle.driverIds || []).map(String);
  const attendants = (vehicle.attendantIds || []).map(String);
  if (user.role === ROLES.DRIVER && !drivers.includes(user.id)) {
    throw new AppError(403, "NOT_ASSIGNED", "You are not assigned to this vehicle.");
  }
  if (user.role === ROLES.ATTENDANT && !attendants.includes(user.id)) {
    throw new AppError(403, "NOT_ASSIGNED", "You are not assigned to this vehicle.");
  }
  const driverId = user.role === ROLES.DRIVER ? user.id : input.driverId || drivers[0];
  const attendantId = user.role === ROLES.ATTENDANT ? user.id : input.attendantId || attendants[0] || null;
  if (!driverId || !drivers.includes(driverId)) {
    throw new AppError(422, "DRIVER_REQUIRED", "Choose a driver assigned to this vehicle.");
  }
  if (attendantId && !attendants.includes(attendantId)) {
    throw new AppError(422, "ATTENDANT_MISMATCH", "That attendant is not assigned to this vehicle.");
  }

  const scheduledDate = calendarDate(school.settings?.notificationTimezone || "Asia/Kolkata", input.scheduledDate);
  const existing = await Trip.findOne({ vehicleId, status: "ACTIVE" }).lean();
  if (existing) {
    throw new AppError(409, "TRIP_ALREADY_ACTIVE", "This vehicle already has an active trip.", { tripId: String(existing._id) });
  }

  const anchor = dayAnchor(scheduledDate);
  const routeField = route.direction === "PICKUP" ? "morningRouteId" : "afternoonRouteId";
  const stopField = route.direction === "PICKUP" ? "morningStopId" : "afternoonStopId";
  const assignments = await Assignment.find({
    schoolId,
    status: "ACTIVE",
    [routeField]: route._id,
    $and: [
      { $or: [{ effectiveFrom: null }, { effectiveFrom: { $lte: anchor } }] },
      { $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: anchor } }] },
    ],
  }).lean();
  const students = await Student.find({
    _id: { $in: assignments.map((assignment: { studentId: unknown }) => assignment.studentId) },
    schoolId,
    status: "ACTIVE",
  }).lean();
  const studentMap = new Map(
    students.map((student: { _id: unknown; parentConsent?: { granted?: boolean } }) => [String(student._id), student]),
  );

  const trip = await withOptionalTransaction(async (session) => {
    const created = await createOne(
      Trip,
      {
        schoolId,
        vehicleId,
        routeId: route._id,
        driverId,
        attendantId,
        direction: route.direction,
        scheduledDate,
        startedAt: new Date(),
        status: "ACTIVE",
        totalAssignedStudents: students.length,
        totalBoarded: 0,
        totalDropped: 0,
      },
      session,
    );
    const rows = assignments
      .map((assignment: { studentId: unknown; morningStopId?: unknown; afternoonStopId?: unknown }) => {
        const student = studentMap.get(String(assignment.studentId));
        if (!student) return null;
        return {
          schoolId,
          tripId: created._id,
          studentId: student._id,
          assignedStopId: assignment[stopField] || null,
          boardingStatus: "NOT_BOARDED",
          dropStatus: "NOT_DROPPED",
          notificationsEnabled: Boolean(student.parentConsent?.granted),
        };
      })
      .filter(Boolean);
    if (rows.length) await TripStudent.insertMany(rows, { session: session ?? undefined });
    await createOne(
      TripEvent,
      {
        schoolId,
        tripId: created._id,
        type: "TRIP_STARTED",
        message: `${route.name} started on ${vehicle.vehicleNumber}.`,
        actorId: user.id,
        occurredAt: new Date(),
        payload: { routeId: String(route._id), vehicleId },
      },
      session,
    );
    return created;
  });

  const liveTracking = await openLiveTrip(trip).catch(() => false);
  const roster = await rosterFor(String(trip._id));
  return { trip: serialize(trip.toObject()), roster, liveTracking };
}

export async function rosterFor(tripId: string) {
  const rows = await TripStudent.find({ tripId })
    .populate("studentId", "name studentCode className division photoUrl parentConsent")
    .populate("assignedStopId", "name address")
    .lean();
  return rows.map((row) => serialize(row));
}

export async function getRoster(user: AuthUser, tripId: string) {
  await loadCrewTrip(user, tripId, true);
  return rosterFor(tripId);
}

export async function addDetections(user: AuthUser, tripId: string, input: z.infer<typeof batchSchema>) {
  const trip = await loadCrewTrip(user, tripId);
  const school = await schoolContext(String(trip.schoolId));
  const retentionDays = Number(school.settings?.bleDetectionRetentionDays || 30);
  const results = [];

  for (const detection of input.detections) {
    const detectedAt = new Date(detection.detectedAt);
    const duplicate = await BleDetection.findOne({ tripId: trip._id, eventId: detection.eventId }).select("_id").lean();
    if (duplicate) {
      results.push({ eventId: detection.eventId, status: "duplicate" });
      continue;
    }
    const tag = await resolveTag(String(trip.schoolId), detection.tagIdentifier);
    let processingStatus = "UNRESOLVED";
    let student = null;
    if (tag?.studentId) {
      student = await Student.findOne({ _id: tag.studentId, schoolId: trip.schoolId }).lean();
    }
    const row = student ? await TripStudent.findOne({ tripId: trip._id, studentId: student._id }) : null;
    if (row) {
      processingStatus = "MATCHED";
      if (row.boardingStatus !== "BOARDED") row.boardingStatus = "DETECTED";
      row.lastDetectedAt = detectedAt;
      row.lastRssi = detection.rssi;
      await row.save();
    } else if (student) {
      processingStatus = "WRONG_BUS";
      const timeZone = school.settings?.notificationTimezone || "Asia/Kolkata";
      const historical = isHistoricalEvent(detectedAt);
      const vehicle = await Vehicle.findById(trip.vehicleId).select("vehicleNumber").lean();
      await notifyUsers({
        schoolId: String(trip.schoolId),
        recipientIds: (student.parentIds || []).map((id: unknown) => String(id)),
        studentId: String(student._id),
        tripId: String(trip._id),
        type: "STUDENT_WRONG_BUS",
        title: "Card detected on another bus",
        body: describeEvent(
          `${student.name}'s card was detected on ${vehicle?.vehicleNumber || "another vehicle"}, which is not their assigned vehicle.`,
          historical,
          detectedAt,
          timeZone,
        ),
        occurredAt: detectedAt,
        historical,
        dedupParts: ["STUDENT_WRONG_BUS", String(trip._id), String(student._id)],
      });
    }

    try {
      await BleDetection.create({
        schoolId: trip.schoolId,
        tripId: trip._id,
        eventId: detection.eventId,
        tagIdentifier: detection.tagIdentifier,
        resolvedStudentId: student?._id || null,
        receiverId: user.id,
        rssi: detection.rssi,
        detectedAt,
        receivedAt: new Date(),
        location:
          detection.latitude != null && detection.longitude != null
            ? toPoint(detection.latitude, detection.longitude)
            : undefined,
        processingStatus,
        expiresAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        results.push({ eventId: detection.eventId, status: "duplicate" });
        continue;
      }
      throw error;
    }

    results.push({
      eventId: detection.eventId,
      status: processingStatus === "MATCHED" ? "matched" : processingStatus === "WRONG_BUS" ? "wrong_bus" : "unresolved",
      student: student
        ? {
            id: String(student._id),
            name: student.name,
            photoUrl: student.photoUrl || "",
            boardingStatus: row?.boardingStatus || "NOT_ON_ROSTER",
          }
        : null,
    });
  }

  return { results };
}

async function recordEvent(input: Record<string, unknown>) {
  try {
    await TripEvent.create(input);
    return "created" as const;
  } catch (error) {
    if (isDuplicateKey(error)) return "duplicate" as const;
    throw error;
  }
}

export async function confirmBoarding(user: AuthUser, tripId: string, input: z.infer<typeof verificationSchema>) {
  const trip = await loadCrewTrip(user, tripId);
  const row = await TripStudent.findOne({ tripId: trip._id, studentId: input.studentId });
  if (!row) throw new AppError(422, "NOT_ON_ROSTER", "This student is not assigned to the trip.");
  const transition = boardTransition(row.boardingStatus);
  if (transition === "duplicate") return { duplicate: true, student: serialize(row.toObject()) };
  if (transition !== "ok") throw new AppError(409, "INVALID_STATE", "This student cannot be boarded from the current state.");

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (input.eventId) {
    const existing = await TripEvent.findOne({ tripId: trip._id, eventId: input.eventId }).lean();
    if (existing) return { duplicate: true, student: serialize(row.toObject()) };
  }
  if (input.verificationMethod === "ASSISTED") {
    let distanceToStop: number | null = null;
    let stopRadius: number | null = null;
    if (row.assignedStopId && input.latitude != null && input.longitude != null) {
      const stop = await Stop.findById(row.assignedStopId).lean();
      const point = fromPoint(stop?.location);
      if (point) {
        distanceToStop = distanceMeters({ latitude: input.latitude, longitude: input.longitude }, point);
        stopRadius = Number(stop?.geofenceRadiusMeters || 80);
      }
    }
    const allowed = assistedBoardingAllowed({
      lastDetectedAt: row.lastDetectedAt,
      occurredAt,
      rssi: row.lastRssi,
      distanceToStopMeters: distanceToStop,
      stopRadiusMeters: stopRadius,
    });
    if (!allowed) {
      throw new AppError(
        422,
        "ASSISTED_CHECK_FAILED",
        "Assisted boarding needs a recent stable card detection near the assigned stop. Confirm manually if the student is aboard.",
      );
    }
  }

  const school = await schoolContext(String(trip.schoolId));
  const student = await Student.findById(row.studentId).lean();
  const stop = input.stopId
    ? await Stop.findOne({ _id: input.stopId, schoolId: trip.schoolId }).lean()
    : row.assignedStopId
      ? await Stop.findById(row.assignedStopId).lean()
      : null;
  const vehicle = await Vehicle.findById(trip.vehicleId).select("vehicleNumber").lean();
  const timeZone = school.settings?.notificationTimezone || "Asia/Kolkata";
  const historical = isHistoricalEvent(occurredAt);
  row.boardingStatus = "BOARDED";
  row.boardedAt = occurredAt;
  row.boardingVerificationMethod = input.verificationMethod;
  row.verifiedBy = user.id;
  if (input.latitude != null && input.longitude != null) row.boardedLocation = toPoint(input.latitude, input.longitude);
  await row.save();
  await refreshTotals(String(trip._id));

  const place = stop?.name || "the stop";
  const type = boardingNotificationType(trip.direction);
  const body = describeEvent(
    `${student?.name || "Student"} boarded ${vehicle?.vehicleNumber || "the vehicle"} at ${place} at ${formatClock(occurredAt, timeZone)}.`,
    historical,
    occurredAt,
    timeZone,
  );
  const eventState = await recordEvent({
    schoolId: trip.schoolId,
    tripId: trip._id,
    studentId: row.studentId,
    eventId: input.eventId,
    type: "STUDENT_BOARDED",
    message: body,
    actorId: user.id,
    occurredAt,
    payload: { verificationMethod: input.verificationMethod, stopId: stop ? String(stop._id) : null },
  });
  if (input.verificationMethod === "OVERRIDE") {
    await writeAudit({
      schoolId: String(trip.schoolId),
      actorId: user.id,
      action: "BOARDING_OVERRIDE",
      entityType: "TripStudent",
      entityId: String(row._id),
      reason: input.reason,
      after: { boardingStatus: "BOARDED" },
    });
  }
  if (row.notificationsEnabled && student) {
    await notifyUsers({
      schoolId: String(trip.schoolId),
      recipientIds: (student.parentIds || []).map((id: unknown) => String(id)),
      studentId: String(student._id),
      tripId: String(trip._id),
      type,
      title: trip.direction === "PICKUP" ? "Student boarded" : "Student boarded for home",
      body,
      occurredAt,
      historical,
      dedupParts: [type, String(trip._id), String(student._id)],
    });
    await processDueJobs(10);
  }
  return { duplicate: eventState === "duplicate", student: serialize(row.toObject()) };
}

export async function confirmDrop(user: AuthUser, tripId: string, input: z.infer<typeof verificationSchema>) {
  const trip = await loadCrewTrip(user, tripId);
  const row = await TripStudent.findOne({ tripId: trip._id, studentId: input.studentId });
  if (!row) throw new AppError(422, "NOT_ON_ROSTER", "This student is not assigned to the trip.");
  const transition = dropTransition(row.boardingStatus, row.dropStatus);
  if (transition === "duplicate") return { duplicate: true, student: serialize(row.toObject()) };
  if (transition === "not_boarded") {
    throw new AppError(409, "NOT_BOARDED", "Confirm boarding before recording a drop-off.");
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (input.eventId) {
    const existing = await TripEvent.findOne({ tripId: trip._id, eventId: input.eventId }).lean();
    if (existing) return { duplicate: true, student: serialize(row.toObject()) };
  }
  const stop = input.stopId ? await Stop.findOne({ _id: input.stopId, schoolId: trip.schoolId }).lean() : null;
  const assignedDiffers = Boolean(stop && row.assignedStopId && String(stop._id) !== String(row.assignedStopId));
  if (assignedDiffers && input.verificationMethod !== "OVERRIDE" && !(input.reason && input.reason.length >= 8)) {
    throw new AppError(422, "WRONG_STOP", "This drop-off does not match the assigned stop. Submit an override reason to record it.");
  }

  const school = await schoolContext(String(trip.schoolId));
  const student = await Student.findById(row.studentId).lean();
  const timeZone = school.settings?.notificationTimezone || "Asia/Kolkata";
  const historical = isHistoricalEvent(occurredAt);
  const place = trip.direction === "PICKUP" ? school.name : stop?.name || "the assigned stop";
  row.dropStatus = "DROPPED";
  row.droppedAt = occurredAt;
  row.dropVerificationMethod = input.verificationMethod;
  row.verifiedBy = user.id;
  if (input.latitude != null && input.longitude != null) row.droppedLocation = toPoint(input.latitude, input.longitude);
  await row.save();
  await refreshTotals(String(trip._id));

  const type = dropNotificationType(trip.direction);
  const body = describeEvent(
    `${student?.name || "Student"} was dropped off at ${place} at ${formatClock(occurredAt, timeZone)}.`,
    historical,
    occurredAt,
    timeZone,
  );
  await recordEvent({
    schoolId: trip.schoolId,
    tripId: trip._id,
    studentId: row.studentId,
    eventId: input.eventId,
    type: "STUDENT_DROPPED",
    message: body,
    actorId: user.id,
    occurredAt,
    payload: { verificationMethod: input.verificationMethod, stopId: stop ? String(stop._id) : null },
  });
  if (assignedDiffers && student) {
    await notifyUsers({
      schoolId: String(trip.schoolId),
      recipientIds: (student.parentIds || []).map((id: unknown) => String(id)),
      studentId: String(student._id),
      tripId: String(trip._id),
      type: "STUDENT_WRONG_STOP",
      title: "Drop-off stop differs",
      body: describeEvent(
        `${student.name} was dropped at ${stop?.name || "a different stop"}, which is not the assigned stop.`,
        historical,
        occurredAt,
        timeZone,
      ),
      occurredAt,
      historical,
      dedupParts: ["STUDENT_WRONG_STOP", String(trip._id), String(student._id)],
    });
    await writeAudit({
      schoolId: String(trip.schoolId),
      actorId: user.id,
      action: "WRONG_STOP_OVERRIDE",
      entityType: "TripStudent",
      entityId: String(row._id),
      reason: input.reason,
      after: { stopId: String(stop?._id || "") },
    });
  }
  if (row.notificationsEnabled && student) {
    await notifyUsers({
      schoolId: String(trip.schoolId),
      recipientIds: (student.parentIds || []).map((id: unknown) => String(id)),
      studentId: String(student._id),
      tripId: String(trip._id),
      type,
      title: "Student dropped off",
      body,
      occurredAt,
      historical,
      dedupParts: [type, String(trip._id), String(student._id)],
    });
  }
  await processDueJobs(10);
  return { duplicate: false, student: serialize(row.toObject()) };
}

export async function syncTrip(user: AuthUser, tripId: string, input: z.infer<typeof syncSchema>) {
  await loadCrewTrip(user, tripId);
  const ordered = [...input.events].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const results = [];
  for (const event of ordered) {
    try {
      if (event.type === "DETECTION") {
        const payload = detectionSchema.parse({ ...event.payload, eventId: event.eventId, detectedAt: event.occurredAt });
        const data = await addDetections(user, tripId, { detections: [payload] });
        results.push({ eventId: event.eventId, status: "applied", data });
      } else if (event.type === "BOARD" || event.type === "DROP") {
        const payload = verificationSchema.parse({
          ...event.payload,
          eventId: event.eventId,
          occurredAt: event.occurredAt,
        });
        const data = event.type === "BOARD" ? await confirmBoarding(user, tripId, payload) : await confirmDrop(user, tripId, payload);
        results.push({ eventId: event.eventId, status: data.duplicate ? "duplicate" : "applied", data });
      } else {
        const payload = locationSchema.parse({ ...event.payload, recordedAt: event.occurredAt, allowHistorical: true });
        const trip = await loadCrewTrip(user, tripId);
        const data = await applyLocation(user, trip, payload);
        if (data.followUp) await data.followUp();
        results.push({ eventId: event.eventId, status: "applied", data: { throttled: data.throttled, firebaseSynced: data.firebaseSynced } });
      }
    } catch (error) {
      if (error instanceof AppError) {
        results.push({ eventId: event.eventId, status: "rejected", code: error.code, message: error.message });
        continue;
      }
      throw error;
    }
  }
  return { results };
}

export async function endTrip(user: AuthUser, tripId: string, input: z.infer<typeof endTripSchema>) {
  const trip = await loadCrewTrip(user, tripId);
  const rows = await TripStudent.find({ tripId: trip._id }).lean();
  const unresolved = unresolvedOnboard(rows);
  if (unresolved.length && !input.unresolvedOverride) {
    const students = await Student.find({ _id: { $in: unresolved.map((row: { studentId: unknown }) => row.studentId) } })
      .select("name studentCode")
      .lean();
    throw new AppError(409, "CHILD_STILL_ON_BUS", "Students are still marked onboard. Resolve each drop-off or submit a documented override.", {
      students: students.map((student) => serialize(student)),
    });
  }

  const school = await schoolContext(String(trip.schoolId));
  const timeZone = school.settings?.notificationTimezone || "Asia/Kolkata";
  const endedAt = new Date();
  if (unresolved.length && input.unresolvedOverride) {
    const students = await Student.find({ _id: { $in: unresolved.map((row: { studentId: unknown }) => row.studentId) } }).lean();
    for (const student of students) {
      const body = `${student.name} is still marked onboard after the trip ended. Staff recorded: ${input.unresolvedOverride.reason}`;
      await notifyUsers({
        schoolId: String(trip.schoolId),
        recipientIds: (student.parentIds || []).map((id: unknown) => String(id)),
        studentId: String(student._id),
        tripId: String(trip._id),
        type: "CHILD_STILL_ON_BUS",
        title: "Child still marked onboard",
        body,
        occurredAt: endedAt,
        dedupParts: ["CHILD_STILL_ON_BUS", String(trip._id), String(student._id)],
      });
    }
    trip.safetyOverrideReason = input.unresolvedOverride.reason;
    await writeAudit({
      schoolId: String(trip.schoolId),
      actorId: user.id,
      action: "CHILD_STILL_ON_BUS_OVERRIDE",
      entityType: "Trip",
      entityId: String(trip._id),
      reason: input.unresolvedOverride.reason,
      after: { unresolvedStudentIds: unresolved.map((row: { studentId: unknown }) => String(row.studentId)) },
    });
  }

  const missing = rows.filter((row: { boardingStatus: string }) => row.boardingStatus !== "BOARDED");
  if (missing.length) {
    const students = await Student.find({ _id: { $in: missing.map((row: { studentId: unknown }) => row.studentId) } }).lean();
    const vehicle = await Vehicle.findById(trip.vehicleId).select("vehicleNumber").lean();
    for (const student of students) {
      const row = missing.find((item: { studentId: unknown }) => String(item.studentId) === String(student._id));
      if (row && row.notificationsEnabled === false) continue;
      await notifyUsers({
        schoolId: String(trip.schoolId),
        recipientIds: (student.parentIds || []).map((id: unknown) => String(id)),
        studentId: String(student._id),
        tripId: String(trip._id),
        type: "STUDENT_NOT_BOARDED",
        title: "Student was not boarded",
        body: `${student.name} was not confirmed on ${vehicle?.vehicleNumber || "the vehicle"} for this trip.`,
        occurredAt: endedAt,
        dedupParts: ["STUDENT_NOT_BOARDED", String(trip._id), String(student._id)],
      });
    }
  }

  await refreshTotals(String(trip._id));
  trip.status = "COMPLETED";
  trip.endedAt = endedAt;
  await trip.save();
  await TripEvent.create({
    schoolId: trip.schoolId,
    tripId: trip._id,
    type: "TRIP_COMPLETED",
    message: "Trip completed after the safety checklist.",
    actorId: user.id,
    occurredAt: endedAt,
    payload: {
      unresolved: unresolved.length,
      override: input.unresolvedOverride?.reason || "",
      timeZone,
    },
  });
  await closeLiveTrip(String(trip._id)).catch((error) => console.error(error));
  await processDueJobs(20);
  return serialize(trip.toObject());
}

export async function listTrips(user: AuthUser, query: { page: number; limit: number; status?: string; schoolId?: string }) {
  const filter: Record<string, unknown> = {};
  if (user.role === ROLES.PLATFORM_ADMIN || user.role === ROLES.SCHOOL_ADMIN) {
    filter.schoolId = requireSchoolId(user, query.schoolId);
  } else {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to list trips.");
  }
  if (query.status) filter.status = query.status;
  const result = await paginate(Trip, filter, {
    page: query.page,
    limit: query.limit,
    sort: { createdAt: -1 },
    populate: [
      { path: "vehicleId", select: "vehicleNumber vehicleType" },
      { path: "routeId", select: "name routeCode direction" },
      { path: "driverId", select: "name" },
    ],
  });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

async function refreshTotals(tripId: string) {
  const [totalAssignedStudents, totalBoarded, totalDropped] = await Promise.all([
    TripStudent.countDocuments({ tripId }),
    TripStudent.countDocuments({ tripId, boardingStatus: "BOARDED" }),
    TripStudent.countDocuments({ tripId, dropStatus: "DROPPED" }),
  ]);
  await Trip.updateOne({ _id: tripId }, { totalAssignedStudents, totalBoarded, totalDropped });
}

export async function submitLocation(user: AuthUser, tripId: string, input: z.infer<typeof locationSchema>) {
  const trip = await loadCrewTrip(user, tripId);
  return applyLocation(user, trip, input);
}

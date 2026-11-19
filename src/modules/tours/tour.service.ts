import { z } from "zod";
import { requireSchoolId } from "@/lib/auth/guard";
import { AppError, notFound } from "@/lib/errors/app-error";
import { objectIdSchema } from "@/lib/validation/common";
import { BleTag } from "@/models/ble-tag";
import { Vehicle } from "@/models/fleet";
import { Tour, TourBus, TourHeadcount, TourIncident, TourStudent } from "@/models/school-records";
import { Student } from "@/models/student";
import { User } from "@/models/user";
import { resolveTag } from "@/modules/ble/ble.service";
import { notifyUsers } from "@/modules/notifications/notification.service";
import {
  classifyTourScan,
  nextTourStatuses,
  parentUpdateBody,
  parentUpdateType,
  TOUR_STATUSES,
  type TourStatus,
  watchTimedOut,
} from "@/modules/tours/tour-rules";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { serialize } from "@/utils/serialize";

const busInputSchema = z.object({
  vehicleId: objectIdSchema,
  label: z.string().trim().max(80).optional().default(""),
  coordinatorIds: z.array(objectIdSchema).max(12).optional().default([]),
  studentIds: z.array(objectIdSchema).min(1, "Add at least one student to each bus.").max(80),
});

export const createTourSchema = z.object({
  name: z.string().trim().min(2, "Tour name must be at least 2 characters."),
  tripDate: z.string().trim().min(8, "Enter the tour date."),
  watchMinutes: z.coerce.number().int().min(1).max(180).optional().default(15),
  leadCoordinatorId: objectIdSchema.optional().nullable(),
  buses: z.array(busInputSchema).max(20).optional().default([]),
});

export const updateTourSchema = createTourSchema.partial().extend({
  name: z.string().trim().min(2).optional(),
  tripDate: z.string().trim().min(8).optional(),
});

export const tourStatusSchema = z.object({
  status: z.enum(TOUR_STATUSES),
});

export const headcountSchema = z.object({
  tourBusId: objectIdSchema,
  phase: z.enum(["BOARDING", "STOP", "DESTINATION", "RETURN", "OTHER"]).optional().default("OTHER"),
  stopLabel: z.string().trim().max(120).optional().default(""),
  note: z.string().trim().max(300).optional().default(""),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  source: z.enum(["SCAN", "MANUAL_ADMIN", "MANUAL_COORDINATOR"]).optional().default("SCAN"),
  presentStudentIds: z.array(objectIdSchema).optional(),
  foundManualStudentIds: z.array(objectIdSchema).optional().default([]),
  detections: z
    .array(
      z.object({
        tagIdentifier: z.string().trim().min(2),
        rssi: z.number().optional().nullable(),
        detectedAt: z.string().datetime().optional().nullable(),
      }),
    )
    .optional()
    .default([]),
});

export const studentEventSchema = z.object({
  note: z.string().trim().max(300).optional().default(""),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  photoUrl: z.string().trim().max(500).optional().default(""),
  tourBusId: objectIdSchema.optional(),
});

const ADMIN_ROLES = new Set<string>([ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN]);
const STAFF_ROLES = new Set<string>([
  ROLES.PLATFORM_ADMIN,
  ROLES.SCHOOL_ADMIN,
  ROLES.TOUR_COORDINATOR,
  ROLES.DRIVER,
  ROLES.ATTENDANT,
]);

function normalizeStatus(status: string): TourStatus {
  if (status === "ACTIVE") return "DEPARTED";
  if ((TOUR_STATUSES as readonly string[]).includes(status)) return status as TourStatus;
  return "PLANNED";
}

function isAdmin(user: AuthUser) {
  return ADMIN_ROLES.has(user.role);
}

async function loadTour(tenant: string, tourId: string) {
  const tour = await Tour.findOne({ _id: tourId, schoolId: tenant });
  if (!tour) throw notFound("Tour");
  if (tour.status === "ACTIVE") {
    tour.status = "DEPARTED";
    await tour.save();
  }
  return tour;
}

async function assertTourAccess(user: AuthUser, tenant: string, tourId: string, busId?: string) {
  if (isAdmin(user)) return;
  if (!STAFF_ROLES.has(user.role)) {
    throw new AppError(403, "FORBIDDEN", "You cannot access this tour.");
  }
  const tour = await Tour.findOne({ _id: tourId, schoolId: tenant }).lean();
  if (!tour) throw notFound("Tour");
  if (tour.leadCoordinatorId && String(tour.leadCoordinatorId) === user.id) return;
  const busFilter: Record<string, unknown> = { tourId, schoolId: tenant, coordinatorIds: user.id };
  if (busId) busFilter._id = busId;
  const bus = await TourBus.findOne(busFilter).lean();
  if (!bus) throw new AppError(403, "FORBIDDEN", "You are not assigned to this tour.");
}

async function replaceBuses(
  tenant: string,
  tourId: string,
  buses: z.infer<typeof busInputSchema>[],
) {
  const vehicleIds = buses.map((bus) => bus.vehicleId);
  if (new Set(vehicleIds).size !== vehicleIds.length) {
    throw new AppError(400, "DUPLICATE_BUS", "Each vehicle can appear only once on a tour.");
  }
  const vehicles = await Vehicle.find({ _id: { $in: vehicleIds }, schoolId: tenant, status: "ACTIVE" }).lean();
  if (vehicles.length !== vehicleIds.length) throw notFound("Vehicle");

  const allStudentIds = [...new Set(buses.flatMap((bus) => bus.studentIds))];
  if (allStudentIds.length !== buses.reduce((sum, bus) => sum + bus.studentIds.length, 0)) {
    throw new AppError(400, "DUPLICATE_STUDENT", "A student can be assigned to only one tour bus.");
  }
  const students = await Student.find({ _id: { $in: allStudentIds }, schoolId: tenant, status: "ACTIVE" }).lean();
  if (students.length !== allStudentIds.length) throw notFound("Student");

  const coordinatorIds = [...new Set(buses.flatMap((bus) => bus.coordinatorIds))];
  if (coordinatorIds.length) {
    const coordinators = await User.find({
      _id: { $in: coordinatorIds },
      schoolId: tenant,
      status: "ACTIVE",
      role: { $in: [ROLES.TOUR_COORDINATOR, ROLES.DRIVER, ROLES.ATTENDANT, ROLES.SCHOOL_ADMIN] },
    }).lean();
    if (coordinators.length !== coordinatorIds.length) {
      throw new AppError(400, "INVALID_COORDINATOR", "Choose active school staff as coordinators.");
    }
  }

  await TourStudent.deleteMany({ schoolId: tenant, tourId });
  await TourBus.deleteMany({ schoolId: tenant, tourId });

  const createdBuses = [];
  for (const bus of buses) {
    const vehicle = vehicles.find((row) => String(row._id) === bus.vehicleId);
    const created = await TourBus.create({
      schoolId: tenant,
      tourId,
      vehicleId: bus.vehicleId,
      label: bus.label || vehicle?.vehicleNumber || "",
      coordinatorIds: bus.coordinatorIds,
    });
    createdBuses.push(created);
    if (bus.studentIds.length) {
      await TourStudent.insertMany(
        bus.studentIds.map((studentId) => ({
          schoolId: tenant,
          tourId,
          tourBusId: created._id,
          studentId,
          status: "EXPECTED",
        })),
      );
    }
  }
  return createdBuses;
}

function asRecord(value: unknown) {
  return serialize(value) as Record<string, unknown>;
}

async function parentIdsForStudents(studentIds: string[]) {
  if (!studentIds.length) return [] as string[];
  const students = await Student.find({ _id: { $in: studentIds } }).select("parentIds").lean();
  return [
    ...new Set(
      students.flatMap((row) => ((row.parentIds || []) as unknown[]).map((id: unknown) => String(id))),
    ),
  ];
}

async function staffRecipients(tenant: string, tourId: string) {
  const tour = await Tour.findById(tourId).select("leadCoordinatorId").lean();
  const buses = await TourBus.find({ schoolId: tenant, tourId }).select("coordinatorIds").lean();
  const admins = await User.find({ schoolId: tenant, role: ROLES.SCHOOL_ADMIN, status: "ACTIVE" }).select("_id").lean();
  const ids = new Set<string>();
  if (tour?.leadCoordinatorId) ids.add(String(tour.leadCoordinatorId));
  for (const bus of buses) {
    for (const id of bus.coordinatorIds || []) ids.add(String(id));
  }
  for (const admin of admins) ids.add(String(admin._id));
  return [...ids];
}

function serializeTour(tour: Record<string, unknown>) {
  const row = serialize(tour) as Record<string, unknown>;
  row.status = normalizeStatus(String(row.status || "PLANNED"));
  return row;
}

type TourListItem = Record<string, unknown> & {
  id: string;
  watchMinutes?: number;
  busCount: number;
  studentCount: number;
  presentCount: number;
  missingCount: number;
  headcountCount: number;
};
type TourBusItem = Record<string, unknown> & {
  id: string;
  tourId: string;
  vehicleNumber: string;
  coordinators: Array<{ id: string; name: string; role: string }>;
};
type TourRosterItem = Record<string, unknown> & {
  id: string;
  tourId: string;
  tourBusId: string;
  studentId: string;
  status: string;
  studentName: string;
  studentCode: string;
  photoUrl: string;
};

export async function listTours(user: AuthUser, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const filter: Record<string, unknown> = { schoolId: tenant };
  if (!isAdmin(user)) {
    const buses = await TourBus.find({ schoolId: tenant, coordinatorIds: user.id }).select("tourId").lean();
    const tourIds = new Set(buses.map((bus) => String(bus.tourId)));
    const led = await Tour.find({ schoolId: tenant, leadCoordinatorId: user.id }).select("_id").lean();
    for (const row of led) tourIds.add(String(row._id));
    filter._id = { $in: [...tourIds] };
  }
  const tours = await Tour.find(filter).sort({ tripDate: -1, createdAt: -1 }).lean();
  const tourIds = tours.map((tour) => tour._id);
  const [buses, roster, headcounts, incidents] = await Promise.all([
    TourBus.find({ schoolId: tenant, tourId: { $in: tourIds } }).lean(),
    TourStudent.find({ schoolId: tenant, tourId: { $in: tourIds } }).lean(),
    TourHeadcount.find({ schoolId: tenant, tourId: { $in: tourIds } }).sort({ takenAt: -1 }).lean(),
    TourIncident.find({ schoolId: tenant, tourId: { $in: tourIds } }).sort({ occurredAt: -1 }).limit(200).lean(),
  ]);
  const vehicleIds = [...new Set(buses.map((bus) => String(bus.vehicleId)))];
  const studentIds = [...new Set(roster.map((row) => String(row.studentId)))];
  const coordinatorIds = [
    ...new Set([
      ...buses.flatMap((bus) => ((bus.coordinatorIds || []) as unknown[]).map((id: unknown) => String(id))),
      ...tours.map((tour) => (tour.leadCoordinatorId ? String(tour.leadCoordinatorId) : "")).filter(Boolean),
    ]),
  ];
  const [vehicles, students, people] = await Promise.all([
    Vehicle.find({ _id: { $in: vehicleIds } }).select("vehicleNumber").lean(),
    Student.find({ _id: { $in: studentIds } }).select("name studentCode photoUrl").lean(),
    User.find({ _id: { $in: coordinatorIds } }).select("name role").lean(),
  ]);
  const vehicleMap = new Map(vehicles.map((row) => [String(row._id), row]));
  const studentMap = new Map(students.map((row) => [String(row._id), row]));
  const peopleMap = new Map(people.map((row) => [String(row._id), row]));

  return {
    tours: tours.map((tour) => {
      const id = String(tour._id);
      const tourBuses = buses.filter((bus) => String(bus.tourId) === id);
      const tourRoster = roster.filter((row) => String(row.tourId) === id);
      const present = tourRoster.filter((row) => row.status === "PRESENT" || row.status === "FOUND").length;
      const missing = tourRoster.filter((row) => row.status === "MISSING").length;
      return {
        ...serializeTour(tour as unknown as Record<string, unknown>),
        busCount: tourBuses.length,
        studentCount: tourRoster.length,
        presentCount: present,
        missingCount: missing,
        headcountCount: headcounts.filter((row) => String(row.tourId) === id).length,
      } as TourListItem;
    }),
    buses: buses.map((bus) => ({
      ...asRecord(bus),
      vehicleNumber: vehicleMap.get(String(bus.vehicleId))?.vehicleNumber || "",
      coordinators: ((bus.coordinatorIds || []) as unknown[]).map((id: unknown) => {
        const person = peopleMap.get(String(id));
        return { id: String(id), name: person?.name || "", role: person?.role || "" };
      }),
    })) as TourBusItem[],
    roster: roster.map((row) => {
      const student = studentMap.get(String(row.studentId));
      return {
        ...asRecord(row),
        studentName: student?.name || "",
        studentCode: student?.studentCode || "",
        photoUrl: student?.photoUrl || "",
      };
    }) as TourRosterItem[],
    headcounts: headcounts.map((row) => asRecord(row)),
    incidents: incidents.map((row) => asRecord(row)),
    people: people.map((row) => asRecord(row)),
  };
}

export async function getTour(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  await assertTourAccess(user, tenant, id);
  const listed = await listTours(user, schoolId);
  const tour = listed.tours.find((row) => String(row.id) === id);
  if (!tour) throw notFound("Tour");
  return {
    tour,
    buses: listed.buses.filter((bus) => String(bus.tourId) === id),
    roster: listed.roster.filter((row) => String(row.tourId) === id),
    headcounts: listed.headcounts.filter((row) => String(row.tourId) === id),
    incidents: listed.incidents.filter((row) => String(row.tourId) === id),
  };
}

export async function createTour(user: AuthUser, input: z.infer<typeof createTourSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  if (input.leadCoordinatorId) {
    const lead = await User.findOne({
      _id: input.leadCoordinatorId,
      schoolId: tenant,
      status: "ACTIVE",
      role: { $in: [ROLES.TOUR_COORDINATOR, ROLES.DRIVER, ROLES.ATTENDANT, ROLES.SCHOOL_ADMIN] },
    }).lean();
    if (!lead) throw new AppError(400, "INVALID_COORDINATOR", "Choose an active school staff member as trip lead.");
  }
  const tour = await Tour.create({
    schoolId: tenant,
    name: input.name,
    tripDate: input.tripDate,
    watchMinutes: input.watchMinutes,
    leadCoordinatorId: input.leadCoordinatorId || null,
    status: "PLANNED",
  });
  if (input.buses.length) await replaceBuses(tenant, String(tour._id), input.buses);
  return getTour(user, String(tour._id), schoolId);
}

export async function updateTour(user: AuthUser, id: string, input: z.infer<typeof updateTourSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const tour = await loadTour(tenant, id);
  if (input.name !== undefined) tour.name = input.name;
  if (input.tripDate !== undefined) tour.tripDate = input.tripDate;
  if (input.watchMinutes !== undefined) tour.watchMinutes = input.watchMinutes;
  if (input.leadCoordinatorId !== undefined) tour.leadCoordinatorId = input.leadCoordinatorId || null;
  await tour.save();
  if (input.buses) {
    if (normalizeStatus(tour.status) !== "PLANNED") {
      throw new AppError(400, "TOUR_LOCKED", "Buses can only be changed while the tour is planned.");
    }
    await replaceBuses(tenant, id, input.buses);
  }
  return getTour(user, id, schoolId);
}

export async function deleteTour(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const tour = await loadTour(tenant, id);
  await Promise.all([
    TourHeadcount.deleteMany({ schoolId: tenant, tourId: tour._id }),
    TourIncident.deleteMany({ schoolId: tenant, tourId: tour._id }),
    TourStudent.deleteMany({ schoolId: tenant, tourId: tour._id }),
    TourBus.deleteMany({ schoolId: tenant, tourId: tour._id }),
  ]);
  await tour.deleteOne();
  return { deleted: true };
}

export async function setTourStatus(user: AuthUser, id: string, input: z.infer<typeof tourStatusSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  await assertTourAccess(user, tenant, id);
  const tour = await loadTour(tenant, id);
  const current = normalizeStatus(tour.status);
  const allowed = nextTourStatuses(current);
  if (!allowed.includes(input.status)) {
    throw new AppError(400, "INVALID_STATUS", `Cannot move from ${current} to ${input.status}.`);
  }
  const now = new Date();
  tour.status = input.status;
  if (input.status === "DEPARTED") tour.departedAt = now;
  if (input.status === "AT_DESTINATION") tour.reachedDestinationAt = now;
  if (input.status === "RETURNING") tour.returningAt = now;
  if (input.status === "COMPLETED") {
    tour.reachedSchoolAt = now;
    tour.completedAt = now;
  }
  await tour.save();

  const notifyType = parentUpdateType(input.status);
  if (notifyType) {
    const roster = await TourStudent.find({ schoolId: tenant, tourId: id }).select("studentId").lean();
    const parents = await parentIdsForStudents(roster.map((row) => String(row.studentId)));
    await notifyUsers({
      schoolId: tenant,
      recipientIds: parents,
      type: notifyType,
      title: tour.name,
      body: parentUpdateBody(input.status, tour.name),
      occurredAt: now,
      dedupParts: [notifyType, id, input.status],
    });
  }
  return getTour(user, id, schoolId);
}

export async function downloadTourPackage(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  await assertTourAccess(user, tenant, id);
  const detail = await getTour(user, id, schoolId);
  const studentIds = detail.roster.map((row) => String(row.studentId));
  const tags = await BleTag.find({
    schoolId: tenant,
    status: "ACTIVE",
    studentId: { $in: studentIds },
  })
    .select("tagIdentifier aliasIdentifiers studentId")
    .lean();
  const students = await Student.find({ _id: { $in: studentIds } })
    .select("name studentCode photoUrl className division parentIds")
    .lean();
  return {
    ...detail,
    downloadedAt: new Date().toISOString(),
    watchMinutes: Number(detail.tour.watchMinutes ?? 15),
    students: students.map((row) => serialize(row)),
    tags: tags.map((row) => serialize(row)),
  };
}

export async function submitHeadcount(user: AuthUser, id: string, input: z.infer<typeof headcountSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  await assertTourAccess(user, tenant, id, input.tourBusId);
  await loadTour(tenant, id);
  const bus = await TourBus.findOne({ _id: input.tourBusId, tourId: id, schoolId: tenant }).lean();
  if (!bus) throw notFound("Tour bus");

  const roster = await TourStudent.find({ schoolId: tenant, tourId: id }).lean();
  const studentIds = roster.map((row) => String(row.studentId));
  const tags = await BleTag.find({
    schoolId: tenant,
    status: "ACTIVE",
    studentId: { $in: studentIds },
  }).lean();
  const tagByIdentifier = new Map<string, (typeof tags)[number]>();
  for (const tag of tags) {
    tagByIdentifier.set(tag.tagIdentifier, tag);
    for (const alias of tag.aliasIdentifiers || []) tagByIdentifier.set(alias, tag);
  }

  let presentStudentIds = input.presentStudentIds || [];
  let missingStudentIds: string[] = [];
  let wrongBusStudentIds: string[] = [];
  const heardAt = new Map<string, { detectedAt: Date; rssi: number | null; tagIdentifier: string }>();

  if (input.source === "SCAN" || input.detections.length) {
    const detections = [];
    for (const detection of input.detections) {
      let tag = tagByIdentifier.get(detection.tagIdentifier);
      if (!tag) {
        const resolved = await resolveTag(tenant, detection.tagIdentifier);
        if (resolved) tag = resolved;
      }
      detections.push({
        tagIdentifier: detection.tagIdentifier,
        studentId: tag?.studentId ? String(tag.studentId) : null,
        rssi: detection.rssi ?? null,
        detectedAt: detection.detectedAt || new Date().toISOString(),
      });
    }
    const classified = classifyTourScan({
      roster: roster.map((row) => ({ studentId: String(row.studentId), tourBusId: String(row.tourBusId) })),
      detections,
      busId: input.tourBusId,
    });
    presentStudentIds = classified.presentStudentIds;
    missingStudentIds = classified.missingStudentIds;
    wrongBusStudentIds = classified.wrongBusStudentIds;
    for (const [studentId, heard] of classified.heardAt) heardAt.set(studentId, heard);
  } else {
    const busRoster = roster.filter((row) => String(row.tourBusId) === input.tourBusId);
    const presentSet = new Set(presentStudentIds);
    missingStudentIds = busRoster.map((row) => String(row.studentId)).filter((sid) => !presentSet.has(sid));
  }

  const now = new Date();
  const foundManual = new Set(input.foundManualStudentIds || []);

  for (const row of roster) {
    const studentId = String(row.studentId);
    const onThisBus = String(row.tourBusId) === input.tourBusId;
    const heard = heardAt.get(studentId);
    if (presentStudentIds.includes(studentId) || foundManual.has(studentId)) {
      await TourStudent.updateOne(
        { _id: row._id },
        {
          $set: {
            status: foundManual.has(studentId) && !presentStudentIds.includes(studentId) ? "FOUND" : "PRESENT",
            lastSeenAt: heard?.detectedAt || now,
            lastSeenByUserId: user.id,
            lastSeenLatitude: input.latitude ?? row.lastSeenLatitude,
            lastSeenLongitude: input.longitude ?? row.lastSeenLongitude,
            missingAlertedAt: null,
          },
        },
      );
    } else if (onThisBus && missingStudentIds.includes(studentId)) {
      await TourStudent.updateOne({ _id: row._id }, { $set: { status: "MISSING" } });
    } else if (wrongBusStudentIds.includes(studentId)) {
      await TourStudent.updateOne(
        { _id: row._id },
        {
          $set: {
            status: "WRONG_BUS",
            lastSeenAt: heard?.detectedAt || now,
            lastSeenByUserId: user.id,
            lastSeenLatitude: input.latitude ?? null,
            lastSeenLongitude: input.longitude ?? null,
          },
        },
      );
    }
  }

  const headcount = await TourHeadcount.create({
    schoolId: tenant,
    tourId: id,
    tourBusId: input.tourBusId,
    takenByUserId: user.id,
    phase: input.phase,
    stopLabel: input.stopLabel,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    presentCount: presentStudentIds.length + [...foundManual].filter((sid) => !presentStudentIds.includes(sid)).length,
    presentStudentIds,
    missingStudentIds,
    wrongBusStudentIds,
    foundManualStudentIds: [...foundManual],
    note: input.note,
    source: input.source,
    takenAt: now,
  });

  await raiseMissingAlerts(user, tenant, id, missingStudentIds, input, now);
  await raiseWrongBusAlerts(tenant, id, input.tourBusId, wrongBusStudentIds, input, now, user.id);

  return {
    headcount: serialize(headcount.toObject()),
    presentStudentIds,
    missingStudentIds,
    wrongBusStudentIds,
    tour: await getTour(user, id, schoolId),
  };
}

async function raiseMissingAlerts(
  user: AuthUser,
  tenant: string,
  tourId: string,
  missingStudentIds: string[],
  input: z.infer<typeof headcountSchema>,
  now: Date,
) {
  if (!missingStudentIds.length) return;
  const tour = await Tour.findById(tourId).lean();
  const students = await Student.find({ _id: { $in: missingStudentIds } }).lean();
  const staff = await staffRecipients(tenant, tourId);
  for (const student of students) {
    const rosterRow = await TourStudent.findOne({ tourId, studentId: student._id });
    const lastSeen = rosterRow?.lastSeenAt || null;
    const message = `${student.name} is missing on ${tour?.name || "the tour"}.${
      lastSeen ? ` Last seen ${new Date(lastSeen).toISOString()}.` : ""
    }`;
    await TourIncident.create({
      schoolId: tenant,
      tourId,
      tourBusId: input.tourBusId,
      studentId: student._id,
      type: "MISSING",
      message,
      latitude: rosterRow?.lastSeenLatitude ?? input.latitude ?? null,
      longitude: rosterRow?.lastSeenLongitude ?? input.longitude ?? null,
      lastSeenAt: lastSeen,
      actorId: user.id,
      occurredAt: now,
    });
    await notifyUsers({
      schoolId: tenant,
      recipientIds: staff,
      studentId: String(student._id),
      type: "TOUR_STUDENT_MISSING",
      title: "Student missing on tour",
      body: message,
      occurredAt: now,
      dedupParts: ["TOUR_STUDENT_MISSING", tourId, String(student._id), now.toISOString().slice(0, 16)],
      asParent: false,
    });
    if (rosterRow) {
      rosterRow.missingAlertedAt = now;
      await rosterRow.save();
    }
  }
}

async function raiseWrongBusAlerts(
  tenant: string,
  tourId: string,
  tourBusId: string,
  wrongBusStudentIds: string[],
  input: z.infer<typeof headcountSchema>,
  now: Date,
  actorId: string,
) {
  if (!wrongBusStudentIds.length) return;
  const tour = await Tour.findById(tourId).lean();
  const bus = await TourBus.findById(tourBusId).lean();
  const vehicle = bus ? await Vehicle.findById(bus.vehicleId).select("vehicleNumber").lean() : null;
  const students = await Student.find({ _id: { $in: wrongBusStudentIds } }).lean();
  const staff = await staffRecipients(tenant, tourId);
  for (const student of students) {
    const message = `${student.name}'s card was heard on ${vehicle?.vehicleNumber || "another tour bus"} during ${tour?.name || "the tour"}.`;
    await TourIncident.create({
      schoolId: tenant,
      tourId,
      tourBusId,
      studentId: student._id,
      type: "WRONG_BUS",
      message,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      lastSeenAt: now,
      actorId,
      occurredAt: now,
    });
    await notifyUsers({
      schoolId: tenant,
      recipientIds: [...staff, ...((student.parentIds || []) as unknown[]).map((id: unknown) => String(id))],
      studentId: String(student._id),
      type: "TOUR_STUDENT_WRONG_BUS",
      title: "Wrong tour bus",
      body: message,
      occurredAt: now,
      dedupParts: ["TOUR_STUDENT_WRONG_BUS", tourId, tourBusId, String(student._id), now.toISOString().slice(0, 13)],
    });
  }
}

export async function markStudentMissing(
  user: AuthUser,
  tourId: string,
  studentId: string,
  input: z.infer<typeof studentEventSchema>,
  schoolId?: string,
) {
  const tenant = requireSchoolId(user, schoolId);
  await assertTourAccess(user, tenant, tourId);
  const row = await TourStudent.findOne({ schoolId: tenant, tourId, studentId });
  if (!row) throw notFound("Tour student");
  row.status = "MISSING";
  await row.save();
  await raiseMissingAlerts(user, tenant, tourId, [studentId], {
    tourBusId: String(row.tourBusId),
    phase: "OTHER",
    stopLabel: "",
    note: input.note,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    source: "MANUAL_COORDINATOR",
    presentStudentIds: [],
    foundManualStudentIds: [],
    detections: [],
  }, new Date());
  return getTour(user, tourId, schoolId);
}

export async function markStudentFound(
  user: AuthUser,
  tourId: string,
  studentId: string,
  input: z.infer<typeof studentEventSchema>,
  schoolId?: string,
) {
  const tenant = requireSchoolId(user, schoolId);
  await assertTourAccess(user, tenant, tourId);
  const row = await TourStudent.findOne({ schoolId: tenant, tourId, studentId });
  if (!row) throw notFound("Tour student");
  const now = new Date();
  if (input.tourBusId && String(row.tourBusId) !== input.tourBusId) {
    row.tourBusId = input.tourBusId as unknown as typeof row.tourBusId;
  }
  row.status = "FOUND";
  row.lastSeenAt = now;
  row.lastSeenByUserId = user.id as unknown as typeof row.lastSeenByUserId;
  row.lastSeenLatitude = input.latitude ?? null;
  row.lastSeenLongitude = input.longitude ?? null;
  row.lastSeenPhotoUrl = input.photoUrl || "";
  row.missingAlertedAt = null;
  await row.save();

  const student = await Student.findById(studentId).lean();
  const tour = await Tour.findById(tourId).lean();
  const message = `${student?.name || "Student"} was found on ${tour?.name || "the tour"}.${input.note ? ` ${input.note}` : ""}`;
  await TourIncident.create({
    schoolId: tenant,
    tourId,
    tourBusId: row.tourBusId,
    studentId,
    type: "FOUND",
    message,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    lastSeenAt: now,
    actorId: user.id,
    occurredAt: now,
  });
  const staff = await staffRecipients(tenant, tourId);
  const parents = ((student?.parentIds || []) as unknown[]).map((id: unknown) => String(id));
  await notifyUsers({
    schoolId: tenant,
    recipientIds: [...staff, ...parents],
    studentId,
    type: "TOUR_STUDENT_FOUND",
    title: "Student found",
    body: message,
    occurredAt: now,
    dedupParts: ["TOUR_STUDENT_FOUND", tourId, studentId, now.toISOString()],
  });
  return getTour(user, tourId, schoolId);
}

export async function runWatchCheck(user: AuthUser, tourId: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  await assertTourAccess(user, tenant, tourId);
  const tour = await loadTour(tenant, tourId);
  const status = normalizeStatus(tour.status);
  const inWatchWindow = status === "AT_DESTINATION" || status === "RETURNING";
  const now = new Date();
  const roster = await TourStudent.find({ schoolId: tenant, tourId }).lean();
  const timedOut = [];
  for (const row of roster) {
    if (row.status === "MISSING" || row.status === "WRONG_BUS") continue;
    if (
      !watchTimedOut({
        lastSeenAt: row.lastSeenAt,
        now,
        watchMinutes: tour.watchMinutes || 15,
        inWatchWindow,
      })
    ) {
      continue;
    }
    if (row.watchAlertedAt && now.getTime() - new Date(row.watchAlertedAt).getTime() < (tour.watchMinutes || 15) * 60_000) {
      continue;
    }
    timedOut.push(String(row.studentId));
    await TourStudent.updateOne({ _id: row._id }, { $set: { status: "MISSING", watchAlertedAt: now } });
    await raiseMissingAlerts(
      user,
      tenant,
      tourId,
      [String(row.studentId)],
      {
        tourBusId: String(row.tourBusId),
        phase: "OTHER",
        stopLabel: "watch",
        note: "Watch-mode timeout",
        latitude: row.lastSeenLatitude,
        longitude: row.lastSeenLongitude,
        source: "SCAN",
        presentStudentIds: [],
        foundManualStudentIds: [],
        detections: [],
      },
      now,
    );
    await TourIncident.create({
      schoolId: tenant,
      tourId,
      tourBusId: row.tourBusId,
      studentId: row.studentId,
      type: "WATCH_TIMEOUT",
      message: `Watch window exceeded for a student on ${tour.name}.`,
      latitude: row.lastSeenLatitude,
      longitude: row.lastSeenLongitude,
      lastSeenAt: row.lastSeenAt,
      actorId: user.id,
      occurredAt: now,
    });
  }
  return { timedOutStudentIds: timedOut, tour: await getTour(user, tourId, schoolId) };
}

export async function tourReport(user: AuthUser, tourId: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  await assertTourAccess(user, tenant, tourId);
  const detail = await getTour(user, tourId, schoolId);
  const byStatus = detail.roster.reduce<Record<string, number>>((acc, row) => {
    const key = String(row.status || "EXPECTED");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    tour: detail.tour,
    buses: detail.buses,
    totals: {
      students: detail.roster.length,
      present: (byStatus.PRESENT || 0) + (byStatus.FOUND || 0),
      missing: byStatus.MISSING || 0,
      wrongBus: byStatus.WRONG_BUS || 0,
      expected: byStatus.EXPECTED || 0,
    },
    headcounts: detail.headcounts,
    incidents: detail.incidents,
    roster: detail.roster,
  };
}

/** @deprecated legacy typed count — prefer submitHeadcount */
export const createHeadcountSchema = z.object({
  tourId: objectIdSchema,
  presentCount: z.coerce.number().int().min(0),
  note: z.string().trim().max(300).optional().default(""),
});

export async function createHeadcount(user: AuthUser, input: z.infer<typeof createHeadcountSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  await loadTour(tenant, input.tourId);
  const headcount = await TourHeadcount.create({
    schoolId: tenant,
    tourId: input.tourId,
    presentCount: input.presentCount,
    note: input.note,
    source: "MANUAL_ADMIN",
    takenByUserId: user.id,
  });
  return serialize(headcount.toObject());
}

export async function updateHeadcount(user: AuthUser, id: string, input: z.infer<typeof createHeadcountSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const headcount = await TourHeadcount.findOne({ _id: id, schoolId: tenant });
  if (!headcount) throw notFound("Headcount");
  await loadTour(tenant, input.tourId);
  headcount.tourId = input.tourId as unknown as typeof headcount.tourId;
  headcount.presentCount = input.presentCount;
  headcount.note = input.note || "";
  await headcount.save();
  return serialize(headcount.toObject());
}

export async function deleteHeadcount(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const headcount = await TourHeadcount.findOne({ _id: id, schoolId: tenant });
  if (!headcount) throw notFound("Headcount");
  await headcount.deleteOne();
  return { deleted: true };
}

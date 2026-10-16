import { z } from "zod";
import { requireSchoolId } from "@/lib/auth/guard";
import { AppError, notFound } from "@/lib/errors/app-error";
import { paginate } from "@/lib/mongodb/paginate";
import { Assignment, Route, Stop, Vehicle } from "@/models/fleet";
import { Student } from "@/models/student";
import { User } from "@/models/user";
import { writeAudit } from "@/modules/audit/audit.service";
import type { AuthUser } from "@/types/domain";
import { objectIdSchema } from "@/lib/validation/common";
import { escapeRegex, serialize } from "@/utils/serialize";
import { fromPoint, toPoint } from "@/utils/geo";

const optionalIds = z.array(objectIdSchema).optional().default([]);

export const vehicleSchema = z.object({
  schoolId: objectIdSchema.optional(),
  vehicleNumber: z.string().trim().min(1).max(30),
  vehicleType: z.enum(["BUS", "VAN"]),
  capacity: z.coerce.number().int().min(1).max(80),
  driverIds: optionalIds,
  attendantIds: optionalIds,
  status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).optional(),
});
export const updateVehicleSchema = vehicleSchema.partial();

export const stopSchema = z.object({
  schoolId: objectIdSchema.optional(),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(300).optional().default(""),
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
  geofenceRadiusMeters: z.coerce.number().int().min(20).max(1000).optional(),
  stopType: z.enum(["PICKUP", "DROP", "SCHOOL"]),
});
export const updateStopSchema = stopSchema.partial();

export const routeSchema = z.object({
  schoolId: objectIdSchema.optional(),
  name: z.string().trim().min(2).max(120),
  routeCode: z.string().trim().min(2).max(20),
  direction: z.enum(["PICKUP", "DROP"]),
  vehicleId: objectIdSchema,
  stops: z.array(objectIdSchema).min(1).max(40),
  scheduledStartTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  scheduledEndTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
export const updateRouteSchema = routeSchema.partial();

export const assignmentSchema = z.object({
  schoolId: objectIdSchema.optional(),
  studentId: objectIdSchema,
  morningRouteId: objectIdSchema.nullable().optional(),
  morningStopId: objectIdSchema.nullable().optional(),
  afternoonRouteId: objectIdSchema.nullable().optional(),
  afternoonStopId: objectIdSchema.nullable().optional(),
  status: z.enum(["ACTIVE", "ENDED"]).optional(),
  effectiveFrom: z.string().optional(),
  effectiveUntil: z.string().optional(),
});
export const updateAssignmentSchema = assignmentSchema.partial();

async function assertCrew(schoolId: string, ids: string[], role: "DRIVER" | "ATTENDANT") {
  if (!ids.length) return;
  const count = await User.countDocuments({ _id: { $in: ids }, schoolId, role, status: "ACTIVE" });
  if (count !== ids.length) {
    throw new AppError(422, "INVALID_CREW", `Every ${role.toLowerCase()} must belong to this school.`);
  }
}

async function assertStops(schoolId: string, ids: string[]) {
  const count = await Stop.countDocuments({ _id: { $in: ids }, schoolId });
  if (count !== ids.length) throw new AppError(422, "INVALID_STOP", "Every stop must belong to this school.");
}

function presentStop(stop: unknown) {
  const data = serialize(stop) as { location?: { coordinates?: number[] } };
  const point = fromPoint(data.location);
  return { ...data, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null };
}

export async function listVehicles(user: AuthUser, query: { page: number; limit: number; search?: string; status?: string; schoolId?: string; vehicleType?: string }) {
  const schoolId = requireSchoolId(user, query.schoolId);
  const filter: Record<string, unknown> = { schoolId };
  if (query.status) filter.status = query.status;
  if (query.vehicleType) filter.vehicleType = query.vehicleType;
  if (query.search) filter.vehicleNumber = { $regex: escapeRegex(query.search), $options: "i" };
  const result = await paginate(Vehicle, filter, {
    page: query.page,
    limit: query.limit,
    sort: { vehicleNumber: 1 },
    populate: [
      { path: "driverIds", select: "name phone" },
      { path: "attendantIds", select: "name phone" },
    ],
  });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

export async function createVehicle(user: AuthUser, input: z.infer<typeof vehicleSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  await assertCrew(schoolId, input.driverIds, "DRIVER");
  await assertCrew(schoolId, input.attendantIds, "ATTENDANT");
  const vehicle = await Vehicle.create({ ...input, schoolId, status: input.status ?? "ACTIVE" });
  return serialize(vehicle.toObject());
}

export async function updateVehicle(user: AuthUser, id: string, input: z.infer<typeof updateVehicleSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  const vehicle = await Vehicle.findOne({ _id: id, schoolId });
  if (!vehicle) throw notFound("Vehicle");
  if (input.driverIds) await assertCrew(schoolId, input.driverIds, "DRIVER");
  if (input.attendantIds) await assertCrew(schoolId, input.attendantIds, "ATTENDANT");
  Object.assign(vehicle, {
    vehicleNumber: input.vehicleNumber ?? vehicle.vehicleNumber,
    vehicleType: input.vehicleType ?? vehicle.vehicleType,
    capacity: input.capacity ?? vehicle.capacity,
    driverIds: input.driverIds ?? vehicle.driverIds,
    attendantIds: input.attendantIds ?? vehicle.attendantIds,
    status: input.status ?? vehicle.status,
  });
  await vehicle.save();
  return serialize(vehicle.toObject());
}

export async function listStops(user: AuthUser, query: { page: number; limit: number; search?: string; schoolId?: string }) {
  const schoolId = requireSchoolId(user, query.schoolId);
  const filter: Record<string, unknown> = { schoolId };
  if (query.search) filter.name = { $regex: escapeRegex(query.search), $options: "i" };
  const result = await paginate(Stop, filter, { page: query.page, limit: query.limit, sort: { name: 1 } });
  return { items: result.items.map(presentStop), meta: result.meta };
}

export async function createStop(user: AuthUser, input: z.infer<typeof stopSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  const stop = await Stop.create({
    schoolId,
    name: input.name,
    address: input.address,
    location: toPoint(input.latitude, input.longitude),
    geofenceRadiusMeters: input.geofenceRadiusMeters ?? 80,
    stopType: input.stopType,
  });
  return presentStop(stop.toObject());
}

export async function updateStop(user: AuthUser, id: string, input: z.infer<typeof updateStopSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  const stop = await Stop.findOne({ _id: id, schoolId });
  if (!stop) throw notFound("Stop");
  if (input.name) stop.name = input.name;
  if (input.address != null) stop.address = input.address;
  if (input.stopType) stop.stopType = input.stopType;
  if (input.geofenceRadiusMeters) stop.geofenceRadiusMeters = input.geofenceRadiusMeters;
  if (input.latitude != null && input.longitude != null) stop.location = toPoint(input.latitude, input.longitude);
  await stop.save();
  return presentStop(stop.toObject());
}

export async function listRoutes(user: AuthUser, query: { page: number; limit: number; search?: string; status?: string; schoolId?: string; direction?: string }) {
  const schoolId = requireSchoolId(user, query.schoolId);
  const filter: Record<string, unknown> = { schoolId };
  if (query.status) filter.status = query.status;
  if (query.direction) filter.direction = query.direction;
  if (query.search) {
    const pattern = escapeRegex(query.search);
    filter.$or = [{ name: { $regex: pattern, $options: "i" } }, { routeCode: { $regex: pattern, $options: "i" } }];
  }
  const result = await paginate(Route, filter, {
    page: query.page,
    limit: query.limit,
    sort: { routeCode: 1 },
    populate: [
      { path: "vehicleId", select: "vehicleNumber vehicleType" },
      { path: "stops", select: "name stopType" },
    ],
  });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

export async function createRoute(user: AuthUser, input: z.infer<typeof routeSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  const vehicle = await Vehicle.findOne({ _id: input.vehicleId, schoolId });
  if (!vehicle) throw notFound("Vehicle");
  await assertStops(schoolId, input.stops);
  const route = await Route.create({
    ...input,
    schoolId,
    routeCode: input.routeCode.toUpperCase(),
    status: input.status ?? "ACTIVE",
  });
  return serialize(route.toObject());
}

export async function updateRoute(user: AuthUser, id: string, input: z.infer<typeof updateRouteSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  const route = await Route.findOne({ _id: id, schoolId });
  if (!route) throw notFound("Route");
  if (input.vehicleId) {
    const vehicle = await Vehicle.findOne({ _id: input.vehicleId, schoolId });
    if (!vehicle) throw notFound("Vehicle");
    route.vehicleId = input.vehicleId;
  }
  if (input.stops) {
    await assertStops(schoolId, input.stops);
    route.stops = input.stops;
  }
  if (input.name) route.name = input.name;
  if (input.routeCode) route.routeCode = input.routeCode.toUpperCase();
  if (input.direction) route.direction = input.direction;
  if (input.scheduledStartTime) route.scheduledStartTime = input.scheduledStartTime;
  if (input.scheduledEndTime) route.scheduledEndTime = input.scheduledEndTime;
  if (input.status) route.status = input.status;
  await route.save();
  return serialize(route.toObject());
}

async function assertAssignmentLinks(schoolId: string, input: {
  studentId?: string;
  morningRouteId?: string | null;
  morningStopId?: string | null;
  afternoonRouteId?: string | null;
  afternoonStopId?: string | null;
}) {
  if (input.studentId) {
    const student = await Student.findOne({ _id: input.studentId, schoolId });
    if (!student) throw notFound("Student");
  }
  const checks: Array<[string | null | undefined, "PICKUP" | "DROP" | null]> = [
    [input.morningRouteId, "PICKUP"],
    [input.afternoonRouteId, "DROP"],
  ];
  for (const [routeId, direction] of checks) {
    if (!routeId) continue;
    const route = await Route.findOne({ _id: routeId, schoolId, direction });
    if (!route) throw new AppError(422, "INVALID_ROUTE", "The route does not match the expected direction.");
  }
  for (const stopId of [input.morningStopId, input.afternoonStopId]) {
    if (!stopId) continue;
    const stop = await Stop.findOne({ _id: stopId, schoolId });
    if (!stop) throw notFound("Stop");
  }
}

export async function listAssignments(user: AuthUser, query: { page: number; limit: number; status?: string; schoolId?: string; search?: string }) {
  const schoolId = requireSchoolId(user, query.schoolId);
  const filter: Record<string, unknown> = { schoolId };
  if (query.status) filter.status = query.status;
  const result = await paginate(Assignment, filter, {
    page: query.page,
    limit: query.limit,
    sort: { createdAt: -1 },
    populate: [
      { path: "studentId", select: "name studentCode className division" },
      { path: "morningRouteId", select: "name routeCode" },
      { path: "afternoonRouteId", select: "name routeCode" },
      { path: "morningStopId", select: "name" },
      { path: "afternoonStopId", select: "name" },
    ],
  });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

export async function createAssignment(user: AuthUser, input: z.infer<typeof assignmentSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  if (!input.morningRouteId && !input.afternoonRouteId) {
    throw new AppError(422, "ROUTE_REQUIRED", "Choose a morning route, an afternoon route, or both.");
  }
  await assertAssignmentLinks(schoolId, input);
  const existing = await Assignment.findOne({ studentId: input.studentId, status: "ACTIVE" });
  if (existing) {
    throw new AppError(409, "ASSIGNMENT_EXISTS", "This student already has an active transport assignment.");
  }
  const assignment = await Assignment.create({
    schoolId,
    studentId: input.studentId,
    morningRouteId: input.morningRouteId || null,
    morningStopId: input.morningStopId || null,
    afternoonRouteId: input.afternoonRouteId || null,
    afternoonStopId: input.afternoonStopId || null,
    status: input.status ?? "ACTIVE",
    effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
    effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
  });
  await writeAudit({
    schoolId,
    actorId: user.id,
    action: "ASSIGNMENT_CREATED",
    entityType: "Assignment",
    entityId: String(assignment._id),
    after: { studentId: input.studentId },
  });
  return serialize(assignment.toObject());
}

export async function updateAssignment(user: AuthUser, id: string, input: z.infer<typeof updateAssignmentSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  const assignment = await Assignment.findOne({ _id: id, schoolId });
  if (!assignment) throw notFound("Assignment");
  await assertAssignmentLinks(schoolId, {
    studentId: input.studentId,
    morningRouteId: input.morningRouteId,
    morningStopId: input.morningStopId,
    afternoonRouteId: input.afternoonRouteId,
    afternoonStopId: input.afternoonStopId,
  });
  const before = { status: assignment.status };
  if (input.morningRouteId !== undefined) assignment.morningRouteId = input.morningRouteId;
  if (input.morningStopId !== undefined) assignment.morningStopId = input.morningStopId;
  if (input.afternoonRouteId !== undefined) assignment.afternoonRouteId = input.afternoonRouteId;
  if (input.afternoonStopId !== undefined) assignment.afternoonStopId = input.afternoonStopId;
  if (input.status) assignment.status = input.status;
  if (input.effectiveFrom !== undefined) assignment.effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
  if (input.effectiveUntil !== undefined) assignment.effectiveUntil = input.effectiveUntil ? new Date(input.effectiveUntil) : null;
  await assignment.save();
  await writeAudit({
    schoolId,
    actorId: user.id,
    action: "ASSIGNMENT_UPDATED",
    entityType: "Assignment",
    entityId: String(assignment._id),
    before,
    after: { status: assignment.status },
  });
  return serialize(assignment.toObject());
}

import { z } from "zod";
import { hashPassword } from "@/lib/auth/tokens";
import { requireCompanyId } from "@/lib/auth/guard";
import { AppError, notFound } from "@/lib/errors/app-error";
import { passwordSchema } from "@/lib/validation/common";
import { AttendanceDay } from "@/models/attendance";
import { AttendanceGap, Company, Department, Employee } from "@/models/company";
import { DetectionEvent, Gateway } from "@/models/platform-events";
import { User } from "@/models/user";
import { assertEmployeeCardUsable, linkEmployeeCard } from "@/modules/agencies/agency-card.service";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { serialize } from "@/utils/serialize";
import {
  belowSignal,
  dayCounts,
  describeGap,
  exceedsGrace,
  gatewayHealth,
  matchSite,
  splitGapAt,
  gapOutcome,
  instantOnDate,
  isDeducted,
  isEarlyExit,
  isLate,
  livePresence,
  parseOfficeTime,
  policyFrom,
  shouldCloseDay,
  workDate,
  workingMinutes,
  type AttendancePolicy,
} from "@/modules/companies/attendance-rules";

const companyIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Choose a company.");
const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30.");

export const policySchema = z.object({
  companyId: companyIdSchema,
  gracePeriodMinutes: z.coerce.number().int().min(1, "Grace period must be at least 1 minute.").max(180),
  shiftStart: clockSchema,
  shiftEnd: clockSchema,
  lunchStart: clockSchema,
  lunchEnd: clockSchema,
  silenceCountsAsPersonal: z.boolean(),
  lunchCountsAsPersonal: z.boolean(),
  manualCountsAsPersonal: z.boolean(),
  pilotOneFloor: z.boolean(),
  reviewWindowHours: z.coerce.number().int().min(1, "Review window must be at least 1 hour.").max(336),
  fieldCheckInAllowed: z.boolean(),
  fieldApprovalRequired: z.boolean().optional().default(false),
  fieldSites: z.array(z.object({
    name: z.string().trim().min(2, "Site name must be at least 2 characters.").max(80),
    latitude: z.coerce.number().gte(-90).lte(90),
    longitude: z.coerce.number().gte(-180).lte(180),
    radiusMeters: z.coerce.number().int().min(25, "Radius must be at least 25 m.").max(5000, "Radius can be at most 5000 m."),
  })).max(50).optional().default([]),
  gatewaySilentMinutes: z.coerce.number().int().min(5, "Use at least 5 minutes.").max(1440).optional().default(30),
  monitoringPolicy: z.string().trim().min(20, "Write the monitoring policy in at least 20 characters.").max(2000),
});

const departmentIdsSchema = z.array(z.string().regex(/^[a-f\d]{24}$/i, "Choose a department.")).max(50).optional().default([]);

export const hrSchema = z.object({
  companyId: companyIdSchema,
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.email("Enter a valid email address."),
  phone: z.string().trim().min(8, "Phone must be at least 8 digits.").max(20),
  password: passwordSchema,
  departmentIds: departmentIdsSchema,
});

export const reviewerScopeSchema = z.object({
  companyId: companyIdSchema.optional(),
  departmentIds: departmentIdsSchema,
});

const rssiSchema = z.preprocess((value) => (value == null || value === "" ? undefined : value), z.coerce.number().min(-120).max(0).optional());

const readingSchema = z.object({
  tagIdentifier: z.string().trim().min(2, "Enter the card id.").max(64),
  occurredAt: z.string().optional().default(""),
  rssi: rssiSchema,
});

export const gatewayIngestSchema = z.object({
  gatewayId: companyIdSchema,
  tagIdentifier: z.string().trim().min(2, "Enter the card id.").max(64).optional(),
  occurredAt: z.string().optional().default(""),
  rssi: rssiSchema,
  readings: z.array(readingSchema).max(500, "Send at most 500 readings at a time.").optional(),
});

const minRssiSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.coerce.number().int().min(-110, "Use a value between -110 and -30.").max(-30, "Use a value between -110 and -30.").nullable(),
);

export const gatewaySchema = z.object({
  companyId: companyIdSchema,
  name: z.string().trim().min(2, "Gateway name must be at least 2 characters."),
  zone: z.enum(["FLOOR", "MEETING_ROOM", "CAFETERIA", "CORRIDOR", "OTHER"]),
  minRssi: minRssiSchema.optional().default(null),
});

export const updateGatewaySchema = gatewaySchema.extend({ companyId: companyIdSchema.optional() });

export const detectionSchema = z.object({
  companyId: companyIdSchema,
  tagIdentifier: z.string().trim().min(2, "Enter the card id.").max(64),
  gatewayId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a gateway."),
  occurredAt: z.string().optional().default(""),
  rssi: rssiSchema,
});

export const employeeAccessSchema = z.object({
  companyId: companyIdSchema,
  tagIdentifier: z.string().trim().max(64).optional().default(""),
  workMode: z.enum(["OFFICE", "FIELD"]),
  consentGranted: z.boolean(),
  loginEmail: z.union([z.literal(""), z.email("Enter a valid email address.")]).optional().default(""),
  loginPassword: z.string().optional().default(""),
});

export const fieldSchema = z.object({
  companyId: companyIdSchema.optional(),
  employeeId: companyIdSchema.optional(),
  action: z.enum(["IN", "OUT"]),
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
});

export const reviewSchema = z.object({
  action: z.enum(["DISPUTE", "APPROVE", "REJECT"]),
  reason: z.string().trim().max(300).optional().default(""),
});

export const fieldReviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(300).optional().default(""),
});

async function loadCompany(companyId: string) {
  const company = await Company.findById(companyId);
  if (!company) throw notFound("Company");
  return company;
}

function assertPolicyReady(policy: AttendancePolicy) {
  if (policy.monitoringPolicy.trim().length < 20) {
    throw new AppError(400, "POLICY_REQUIRED", "Save a written monitoring policy before recording attendance.");
  }
}

function gapMinutes(gap: { personalMinutes?: number; countsAsPersonal?: boolean; startedAt: Date; endedAt: Date }) {
  if (gap.countsAsPersonal === false) return 0;
  if (typeof gap.personalMinutes === "number" && gap.personalMinutes > 0) return gap.personalMinutes;
  return Math.max(0, Math.round((new Date(gap.endedAt).getTime() - new Date(gap.startedAt).getTime()) / 60000));
}

function closeDay(day: {
  source?: string;
  workDate: string;
  checkedInAt?: Date | null;
  lastSeenAt?: Date | null;
  checkedOutAt?: Date | null;
  closedBy?: string | null;
  presence?: string;
}, policy: AttendancePolicy) {
  if (day.source === "PHONE") {
    const shiftEnd = instantOnDate(day.workDate, policy.shiftEnd);
    if (shiftEnd && day.checkedInAt && shiftEnd > day.checkedInAt) {
      day.checkedOutAt = shiftEnd;
      day.closedBy = "SHIFT_END";
    } else {
      day.checkedOutAt = day.lastSeenAt || null;
      day.closedBy = "PHONE";
    }
  } else {
    day.checkedOutAt = day.lastSeenAt || null;
    day.closedBy = "LAST_SEEN";
  }
  day.presence = "CHECKED_OUT";
}

async function closeDueDays(companyId: string, policy: AttendancePolicy, now: Date, employeeId?: unknown) {
  const filter: Record<string, unknown> = { companyId, checkedOutAt: null, checkedInAt: { $ne: null } };
  if (employeeId) filter.employeeId = employeeId;
  const openDays = await AttendanceDay.find(filter);
  for (const day of openDays) {
    if (!shouldCloseDay(day.workDate, now, policy.shiftEnd, policy.gracePeriodMinutes)) continue;
    closeDay(day, policy);
    await day.save();
  }
}

export async function updatePolicy(user: AuthUser, input: z.infer<typeof policySchema>) {
  if (user.role === ROLES.EMPLOYEE) throw new AppError(403, "FORBIDDEN", "Only a company admin can change attendance rules.");
  const companyId = requireCompanyId(user, input.companyId);
  const company = await loadCompany(companyId);
  if (input.shiftStart >= input.shiftEnd) throw new AppError(400, "VALIDATION_ERROR", "The shift must end after it starts.");
  if (input.lunchStart >= input.lunchEnd) throw new AppError(400, "VALIDATION_ERROR", "Lunch must end after it starts.");
  company.gracePeriodMinutes = input.gracePeriodMinutes;
  company.shiftStart = input.shiftStart;
  company.shiftEnd = input.shiftEnd;
  company.lunchStart = input.lunchStart;
  company.lunchEnd = input.lunchEnd;
  company.silenceCountsAsPersonal = input.silenceCountsAsPersonal;
  company.lunchCountsAsPersonal = input.lunchCountsAsPersonal;
  company.manualCountsAsPersonal = input.manualCountsAsPersonal;
  company.pilotOneFloor = input.pilotOneFloor;
  company.reviewWindowHours = input.reviewWindowHours;
  company.fieldCheckInAllowed = input.fieldCheckInAllowed;
  company.fieldApprovalRequired = input.fieldApprovalRequired;
  company.set("fieldSites", input.fieldSites);
  company.gatewaySilentMinutes = input.gatewaySilentMinutes;
  company.monitoringPolicy = input.monitoringPolicy;
  await company.save();
  return policyFrom(company);
}

function assertZoneAllowed(policy: AttendancePolicy, zone: string) {
  if (policy.pilotOneFloor && zone !== "FLOOR") {
    throw new AppError(400, "PILOT_FLOOR", "The pilot accepts only a floor gateway. Turn the pilot off to cover meeting rooms, the cafeteria, and corridors.", {
      fieldErrors: { zone: ["The pilot accepts only a floor gateway."] },
    });
  }
}

export async function updateGateway(user: AuthUser, id: string, input: z.infer<typeof updateGatewaySchema>) {
  if (user.role === ROLES.EMPLOYEE || user.role === ROLES.COMPANY_HR) throw new AppError(403, "FORBIDDEN", "Only a company admin can change a gateway.");
  const companyId = requireCompanyId(user, input.companyId);
  const company = await loadCompany(companyId);
  const gateway = await Gateway.findOne({ _id: id, ownerType: "COMPANY", ownerId: companyId, kind: "OFFICE" });
  if (!gateway) throw notFound("Gateway");
  if (input.zone !== gateway.zone) assertZoneAllowed(policyFrom(company), input.zone);
  gateway.name = input.name;
  gateway.zone = input.zone;
  gateway.minRssi = input.minRssi;
  await gateway.save();
  return serialize(gateway.toObject());
}

export async function createGateway(user: AuthUser, input: z.infer<typeof gatewaySchema>) {
  if (user.role === ROLES.EMPLOYEE) throw new AppError(403, "FORBIDDEN", "Only a company admin can add a gateway.");
  const companyId = requireCompanyId(user, input.companyId);
  const company = await loadCompany(companyId);
  assertZoneAllowed(policyFrom(company), input.zone);
  const gateway = await Gateway.create({
    ownerType: "COMPANY",
    ownerId: companyId,
    name: input.name,
    kind: "OFFICE",
    zone: input.zone,
    minRssi: input.minRssi,
    status: "ACTIVE",
  });
  return serialize(gateway.toObject());
}

export async function updateEmployeeAccess(user: AuthUser, employeeId: string, input: z.infer<typeof employeeAccessSchema>) {
  if (user.role === ROLES.EMPLOYEE) throw new AppError(403, "FORBIDDEN", "Only a company admin can update an employee card.");
  const companyId = requireCompanyId(user, input.companyId);
  const company = await loadCompany(companyId);
  const employee = await Employee.findOne({ _id: employeeId, companyId });
  if (!employee) throw notFound("Employee");
  const tag = input.tagIdentifier.trim();
  const previousTag = employee.tagIdentifier || "";
  if (tag) {
    const other = await Employee.findOne({ tagIdentifier: tag, _id: { $ne: employee._id } }).lean();
    if (other) throw new AppError(409, "CONFLICT", "This card is already assigned to someone else.");
    if (tag !== previousTag) await assertEmployeeCardUsable(companyId, employee._id, tag);
  }
  employee.tagIdentifier = tag;
  employee.workMode = input.workMode;
  if (input.consentGranted && !employee.consentGranted) employee.consentAt = new Date();
  if (!input.consentGranted) employee.consentAt = null;
  employee.consentGranted = input.consentGranted;
  if (input.loginPassword) {
    const password = passwordSchema.safeParse(input.loginPassword);
    if (!password.success) throw new AppError(400, "VALIDATION_ERROR", "Password must be at least 8 characters and include a letter and a number.");
    if (!input.loginEmail) throw new AppError(400, "VALIDATION_ERROR", "Enter an email for the employee login.");
    const phone = employee.phone.length >= 8 ? employee.phone : company.contactPhone;
    const email = input.loginEmail.toLowerCase();
    if (employee.userId) {
      const account = await User.findById(employee.userId);
      if (!account) throw notFound("User");
      account.email = email;
      account.passwordHash = await hashPassword(password.data);
      account.employeeId = employee._id;
      account.companyId = company._id;
      account.role = ROLES.EMPLOYEE;
      await account.save();
    } else {
      const account = await User.create({
        companyId: company._id,
        employeeId: employee._id,
        name: employee.name,
        email,
        phone,
        passwordHash: await hashPassword(password.data),
        role: ROLES.EMPLOYEE,
      });
      employee.userId = account._id;
    }
    if (!employee.email) employee.email = email;
  }
  await employee.save();
  await linkEmployeeCard(companyId, employee._id, previousTag, tag);
  return serialize(employee.toObject());
}

type Reading = { tagIdentifier: string; occurredAt?: string; rssi?: number };
type ReadingGateway = { _id: unknown; zone?: string | null; minRssi?: number | null };
type ReadingStatus = "APPLIED" | "LATE" | "DUPLICATE" | "IGNORED_WEAK_SIGNAL";
type AttendanceDayDoc = InstanceType<typeof AttendanceDay>;

function readingTime(value?: string) {
  const occurredAt = value ? parseOfficeTime(value) : new Date();
  if (!occurredAt) throw new AppError(400, "VALIDATION_ERROR", "Enter a valid detection time.");
  if (occurredAt.getTime() > Date.now() + 60_000) throw new AppError(400, "VALIDATION_ERROR", "A detection cannot be in the future.");
  if (Date.now() - occurredAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
    throw new AppError(400, "VALIDATION_ERROR", "A detection older than 7 days cannot be applied.");
  }
  return occurredAt;
}

function laterDate(first: Date | null | undefined, second: Date) {
  return first && new Date(first).getTime() > second.getTime() ? new Date(first) : second;
}

async function placeLateReading(day: AttendanceDayDoc, policy: AttendancePolicy, occurredAt: Date) {
  const checkedInAt = day.checkedInAt ? new Date(day.checkedInAt) : null;
  if (checkedInAt && occurredAt.getTime() < checkedInAt.getTime()) {
    day.checkedInAt = occurredAt;
    if (!exceedsGrace(occurredAt, checkedInAt, policy.gracePeriodMinutes)) return null;
    return AttendanceGap.create({
      companyId: day.companyId,
      employeeId: day.employeeId,
      startedAt: occurredAt,
      endedAt: checkedInAt,
      reason: "",
      status: "OPEN",
      source: "GATEWAY",
      ...describeGap(policy, occurredAt, checkedInAt),
    });
  }
  const gap = await AttendanceGap.findOne({
    companyId: day.companyId,
    employeeId: day.employeeId,
    source: "GATEWAY",
    status: { $in: ["OPEN", "DISPUTED"] },
    startedAt: { $lt: occurredAt },
    endedAt: { $gt: occurredAt },
  });
  if (!gap) return null;
  const pieces = splitGapAt({ startedAt: new Date(gap.startedAt), endedAt: new Date(gap.endedAt) }, occurredAt, policy.gracePeriodMinutes);
  if (!pieces.length) {
    await gap.deleteOne();
    return null;
  }
  const originalDeadline = gap.reviewDeadline ? new Date(gap.reviewDeadline) : null;
  const [first, second] = pieces;
  const firstShape = describeGap(policy, first.startedAt, first.endedAt);
  gap.set({ ...first, ...firstShape, reviewDeadline: laterDate(originalDeadline, firstShape.reviewDeadline) });
  await gap.save();
  if (second) {
    const secondShape = describeGap(policy, second.startedAt, second.endedAt);
    await AttendanceGap.create({
      companyId: gap.companyId,
      employeeId: gap.employeeId,
      ...second,
      ...secondShape,
      reviewDeadline: laterDate(originalDeadline, secondShape.reviewDeadline),
      reason: gap.reason,
      status: gap.status,
      source: "GATEWAY",
    });
  }
  return gap;
}

async function applyReading(companyId: string, policy: AttendancePolicy, gateway: ReadingGateway, reading: Reading) {
  const employee = await Employee.findOne({ companyId, tagIdentifier: reading.tagIdentifier.trim(), status: "ACTIVE" });
  if (!employee) throw new AppError(404, "TAG_UNKNOWN", "No active employee uses this card.");
  if (!employee.consentGranted) throw new AppError(403, "CONSENT_REQUIRED", "This employee has not given written monitoring consent.");
  if (policy.pilotOneFloor && gateway.zone !== "FLOOR") {
    throw new AppError(400, "PILOT_FLOOR", "This pilot only hears floor gateways. Turn the pilot off after that floor is tuned.");
  }
  const occurredAt = readingTime(reading.occurredAt);
  const event = {
    ownerType: "COMPANY",
    ownerId: companyId,
    tagIdentifier: employee.tagIdentifier,
    gatewayId: gateway._id,
    occurredAt,
    rssi: reading.rssi ?? null,
  };
  if (belowSignal(reading.rssi, gateway.minRssi)) {
    await DetectionEvent.create({ ...event, ignoredReason: "WEAK_SIGNAL" });
    return { status: "IGNORED_WEAK_SIGNAL" as ReadingStatus, occurredAt, day: null, gap: null };
  }

  await closeDueDays(companyId, policy, occurredAt, employee._id);
  const dayKey = workDate(occurredAt);
  let day = await AttendanceDay.findOne({ companyId, employeeId: employee._id, workDate: dayKey });
  if (!day) day = new AttendanceDay({ companyId, employeeId: employee._id, workDate: dayKey, source: "GATEWAY" });
  if (day.source === "PHONE" && day.checkedInAt) throw new AppError(409, "FIELD_DAY", "This day already uses a phone check-in.");
  const lastSeen = day.lastSeenAt ? new Date(day.lastSeenAt).getTime() : null;
  if (lastSeen != null && occurredAt.getTime() <= lastSeen) {
    const seen = occurredAt.getTime() === lastSeen
      || await DetectionEvent.exists({ ownerType: "COMPANY", ownerId: companyId, tagIdentifier: employee.tagIdentifier, occurredAt, ignoredReason: { $ne: "WEAK_SIGNAL" } });
    if (seen) return { status: "DUPLICATE" as ReadingStatus, occurredAt, day: serialize(day.toObject()), gap: null };
    const gap = await placeLateReading(day, policy, occurredAt);
    await day.save();
    await DetectionEvent.create(event);
    return { status: "LATE" as ReadingStatus, occurredAt, day: serialize(day.toObject()), gap: gap ? serialize(gap.toObject()) : null };
  }

  let gap = null;
  if (day.checkedOutAt) {
    day.checkedOutAt = null;
    day.closedBy = null;
  }
  if (!day.checkedInAt) day.checkedInAt = occurredAt;
  else if (day.lastSeenAt && exceedsGrace(new Date(day.lastSeenAt), occurredAt, policy.gracePeriodMinutes)) {
    const described = describeGap(policy, new Date(day.lastSeenAt), occurredAt);
    gap = await AttendanceGap.create({
      companyId,
      employeeId: employee._id,
      startedAt: day.lastSeenAt,
      endedAt: occurredAt,
      reason: "",
      status: "OPEN",
      source: "GATEWAY",
      ...described,
    });
  }
  day.lastSeenAt = occurredAt;
  day.source = "GATEWAY";
  day.presence = "IN_OFFICE";
  if (shouldCloseDay(dayKey, occurredAt, policy.shiftEnd, policy.gracePeriodMinutes)) {
    day.checkedOutAt = occurredAt;
    day.closedBy = "LAST_SEEN";
    day.presence = "CHECKED_OUT";
  }
  await day.save();
  await DetectionEvent.create(event);
  return { status: "APPLIED" as ReadingStatus, occurredAt, day: serialize(day.toObject()), gap: gap ? serialize(gap.toObject()) : null };
}

async function markHeard(gatewayId: unknown, occurredAt: Date) {
  await Gateway.updateOne({ _id: gatewayId }, { $max: { lastHeartbeatAt: occurredAt } });
}

export async function recordDetection(user: AuthUser, input: z.infer<typeof detectionSchema>) {
  if (user.role === ROLES.EMPLOYEE || user.role === ROLES.COMPANY_HR) throw new AppError(403, "FORBIDDEN", "Only a company admin can record a gateway detection.");
  const companyId = requireCompanyId(user, input.companyId);
  const policy = policyFrom(await loadCompany(companyId));
  assertPolicyReady(policy);
  const gateway = await Gateway.findOne({ _id: input.gatewayId, ownerType: "COMPANY", ownerId: companyId, kind: "OFFICE", status: "ACTIVE" }).lean();
  if (!gateway) throw new AppError(400, "GATEWAY_REQUIRED", "Choose an active office gateway for this company.");
  const result = await applyReading(companyId, policy, gateway, input);
  if (result.status !== "IGNORED_WEAK_SIGNAL") await markHeard(gateway._id, result.occurredAt);
  return result;
}

export function assertGatewayKey(secret: string | null) {
  const expected = process.env.GATEWAY_INGEST_SECRET;
  if (!expected || secret !== expected) {
    throw new AppError(401, "UNAUTHORIZED", "Gateway key is invalid.");
  }
}

export async function ingestGatewayDetection(input: z.infer<typeof gatewayIngestSchema>) {
  const lastContactAt = new Date();
  const gateway = await Gateway.findOneAndUpdate(
    { _id: input.gatewayId, ownerType: "COMPANY", kind: "OFFICE" },
    { $set: { lastContactAt } },
    { returnDocument: "after" },
  ).lean();
  if (!gateway) throw notFound("Gateway");
  const single = input.tagIdentifier ? [{ tagIdentifier: input.tagIdentifier, occurredAt: input.occurredAt, rssi: input.rssi }] : [];
  const readings = [...single, ...(input.readings ?? [])];
  if (!readings.length) return { gatewayId: String(gateway._id), lastContactAt, received: 0 };
  if (gateway.status !== "ACTIVE") throw new AppError(409, "GATEWAY_INACTIVE", "This gateway is turned off.");
  const companyId = String(gateway.ownerId);
  const policy = policyFrom(await loadCompany(companyId));
  assertPolicyReady(policy);

  if (!input.readings) {
    const result = await applyReading(companyId, policy, gateway, readings[0]);
    if (result.status !== "IGNORED_WEAK_SIGNAL") await markHeard(gateway._id, result.occurredAt);
    return result;
  }

  const ordered = readings
    .map((reading, index) => ({ reading, index, at: parseOfficeTime(reading.occurredAt || "")?.getTime() ?? Date.now() }))
    .sort((first, second) => first.at - second.at);
  const results: { index: number; tagIdentifier: string; status: ReadingStatus | "REJECTED"; code?: string; message?: string }[] = [];
  let newest: Date | null = null;
  for (const { reading, index } of ordered) {
    try {
      const result = await applyReading(companyId, policy, gateway, reading);
      if (result.status !== "IGNORED_WEAK_SIGNAL") newest = laterDate(newest, result.occurredAt);
      results.push({ index, tagIdentifier: reading.tagIdentifier, status: result.status });
    } catch (caught) {
      if (!(caught instanceof AppError)) throw caught;
      results.push({ index, tagIdentifier: reading.tagIdentifier, status: "REJECTED", code: caught.code, message: caught.message });
    }
  }
  if (newest) await markHeard(gateway._id, newest);
  results.sort((first, second) => first.index - second.index);
  const count = (status: string) => results.filter((result) => result.status === status).length;
  return {
    gatewayId: String(gateway._id),
    lastContactAt,
    received: readings.length,
    applied: count("APPLIED"),
    late: count("LATE"),
    duplicate: count("DUPLICATE"),
    ignored: count("IGNORED_WEAK_SIGNAL"),
    rejected: count("REJECTED"),
    results,
  };
}

export async function createHrReviewer(user: AuthUser, input: z.infer<typeof hrSchema>) {
  if (user.role === ROLES.EMPLOYEE || user.role === ROLES.COMPANY_HR) {
    throw new AppError(403, "FORBIDDEN", "Only a company admin can add an HR reviewer.");
  }
  const companyId = requireCompanyId(user, input.companyId);
  const company = await loadCompany(companyId);
  const departmentIds = await companyDepartments(companyId, input.departmentIds);
  const account = await User.create({
    companyId: company._id,
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    passwordHash: await hashPassword(input.password),
    role: ROLES.COMPANY_HR,
    reviewDepartmentIds: departmentIds,
  });
  return serialize(account.toObject());
}

async function companyDepartments(companyId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const found = await Department.countDocuments({ companyId, _id: { $in: unique } });
  if (found !== unique.length) {
    throw new AppError(400, "VALIDATION_ERROR", "Choose departments of this company.", { fieldErrors: { departmentIds: ["Choose departments of this company."] } });
  }
  return unique;
}

export async function updateReviewer(user: AuthUser, id: string, input: z.infer<typeof reviewerScopeSchema>) {
  if (user.role === ROLES.EMPLOYEE || user.role === ROLES.COMPANY_HR) {
    throw new AppError(403, "FORBIDDEN", "Only a company admin can change an HR reviewer.");
  }
  const companyId = requireCompanyId(user, input.companyId);
  const account = await User.findOne({ _id: id, companyId, role: ROLES.COMPANY_HR });
  if (!account) throw notFound("HR reviewer");
  account.set("reviewDepartmentIds", await companyDepartments(companyId, input.departmentIds));
  await account.save();
  return serialize(account.toObject());
}

async function reviewScope(user: AuthUser, companyId: string) {
  if (user.role !== ROLES.COMPANY_HR) return null;
  const account = await User.findOne({ _id: user.id, companyId }, "reviewDepartmentIds").lean();
  const ids = (account?.reviewDepartmentIds ?? []).map(String);
  return ids.length ? ids : null;
}

async function assertInScope(user: AuthUser, companyId: string, employeeId: unknown) {
  const scope = await reviewScope(user, companyId);
  if (!scope) return;
  const employee = await Employee.findOne({ _id: employeeId, companyId }, "departmentId").lean();
  if (!employee || !scope.includes(String(employee.departmentId))) {
    throw new AppError(403, "OUTSIDE_DEPARTMENTS", "This employee is outside the departments you review.");
  }
}

export async function fieldCheck(user: AuthUser, input: z.infer<typeof fieldSchema>) {
  const companyId = requireCompanyId(user, input.companyId);
  const company = await loadCompany(companyId);
  const policy = policyFrom(company);
  assertPolicyReady(policy);
  if (!policy.fieldCheckInAllowed) throw new AppError(403, "FIELD_NOT_ALLOWED", "This company has not allowed phone check-in.");
  const employee = user.role === ROLES.EMPLOYEE
    ? await Employee.findOne({ userId: user.id, companyId })
    : await Employee.findOne({ _id: input.employeeId, companyId });
  if (!employee) throw notFound("Employee");
  if (employee.workMode !== "FIELD") throw new AppError(403, "FIELD_NOT_ALLOWED", "Only field staff can check in from a phone.");
  if (!employee.consentGranted) throw new AppError(403, "CONSENT_REQUIRED", "This employee has not given written monitoring consent.");
  const now = new Date();
  const dayKey = workDate(now);
  let day = await AttendanceDay.findOne({ companyId, employeeId: employee._id, workDate: dayKey });
  if (input.action === "IN") {
    if (day?.source === "GATEWAY" && day.checkedInAt) throw new AppError(409, "OFFICE_DAY", "This day already uses an office card.");
    if (day?.checkedInAt && !day.checkedOutAt) throw new AppError(409, "ALREADY_IN", "This employee is already checked in.");
    const site = policy.fieldSites.length ? matchSite(policy.fieldSites, { latitude: input.latitude, longitude: input.longitude }) : null;
    if (policy.fieldSites.length && !site) {
      throw new AppError(403, "OUTSIDE_SITE", "Check in from one of the company's approved field sites.");
    }
    if (!day) day = new AttendanceDay({ companyId, employeeId: employee._id, workDate: dayKey, source: "PHONE" });
    if (!day.checkedInAt) {
      day.checkedInAt = now;
      day.fieldInLatitude = input.latitude;
      day.fieldInLongitude = input.longitude;
      day.fieldSite = site?.site.name ?? "";
      day.fieldReview = policy.fieldApprovalRequired ? "PENDING" : "NOT_REQUIRED";
    }
    day.lastSeenAt = now;
    day.checkedOutAt = null;
    day.closedBy = null;
    day.source = "PHONE";
    day.presence = "IN_OFFICE";
    day.fieldLatitude = input.latitude;
    day.fieldLongitude = input.longitude;
  } else {
    if (!day?.checkedInAt || day.checkedOutAt) throw new AppError(400, "NOT_CHECKED_IN", "Check in before checking out.");
    day.checkedOutAt = now;
    day.lastSeenAt = now;
    day.closedBy = "PHONE";
    day.presence = "CHECKED_OUT";
    day.fieldLatitude = input.latitude;
    day.fieldLongitude = input.longitude;
  }
  await day.save();
  return serialize(day.toObject());
}

export async function reviewGap(user: AuthUser, gapId: string, input: z.infer<typeof reviewSchema>) {
  const gap = await AttendanceGap.findById(gapId);
  if (!gap) throw notFound("Gap");
  const companyId = requireCompanyId(user, String(gap.companyId));
  if (String(gap.companyId) !== companyId) throw new AppError(403, "TENANT_MISMATCH", "You cannot access another company's data.");
  if (user.role === ROLES.EMPLOYEE) {
    if (input.action !== "DISPUTE") throw new AppError(403, "FORBIDDEN", "You can dispute your own gap.");
    const employee = await Employee.findOne({ userId: user.id, companyId }).lean();
    if (!employee || String(gap.employeeId) !== String(employee._id)) throw new AppError(403, "FORBIDDEN", "You can dispute your own gap.");
    if (gap.status !== "OPEN") throw new AppError(400, "GAP_CLOSED", "Only an open gap can be disputed.");
    if (input.reason.trim().length < 8) throw new AppError(400, "VALIDATION_ERROR", "Give a reason of at least 8 characters.");
    gap.status = "DISPUTED";
    gap.reason = input.reason.trim();
    await gap.save();
  } else {
    if (input.action === "DISPUTE") throw new AppError(403, "FORBIDDEN", "The employee disputes a gap. HR approves or rejects it.");
    if (gap.status !== "OPEN" && gap.status !== "DISPUTED") throw new AppError(400, "GAP_CLOSED", "This gap has already been reviewed.");
    await assertInScope(user, companyId, gap.employeeId);
    gap.status = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
    gap.resolutionNote = input.reason.trim();
    gap.reviewedAt = new Date();
    gap.reviewedBy = user.id;
    if (gap.status === "APPROVED") gap.countsAsPersonal = false;
    await gap.save();
  }
  return { ...(serialize(gap.toObject()) as object), outcome: gapOutcome(gap, new Date()) };
}

export async function reviewFieldDay(user: AuthUser, dayId: string, input: z.infer<typeof fieldReviewSchema>) {
  if (user.role === ROLES.EMPLOYEE) throw new AppError(403, "FORBIDDEN", "HR approves or rejects field check-ins.");
  const day = await AttendanceDay.findById(dayId);
  if (!day) throw notFound("Attendance day");
  const companyId = requireCompanyId(user, String(day.companyId));
  if (String(day.companyId) !== companyId) throw new AppError(403, "TENANT_MISMATCH", "You cannot access another company's data.");
  if (day.source !== "PHONE" || day.fieldReview !== "PENDING") throw new AppError(400, "NOT_PENDING", "This field check-in is not waiting for review.");
  await assertInScope(user, companyId, day.employeeId);
  if (input.action === "REJECT" && input.note.trim().length < 4) {
    throw new AppError(400, "VALIDATION_ERROR", "Say why the field day is rejected.", { fieldErrors: { note: ["Say why the field day is rejected."] } });
  }
  day.fieldReview = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
  day.fieldReviewNote = input.note.trim();
  day.fieldReviewedBy = user.id;
  day.fieldReviewedAt = new Date();
  await day.save();
  return serialize(day.toObject());
}

export async function attendanceBoard(user: AuthUser, companyId?: string) {
  if (user.role === ROLES.EMPLOYEE) throw new AppError(403, "FORBIDDEN", "Open My day to see your own attendance.");
  const tenant = requireCompanyId(user, companyId);
  const company = await loadCompany(tenant);
  const policy = policyFrom(company);
  const now = new Date();
  await closeDueDays(tenant, policy, now);
  const today = workDate(now);
  const scope = await reviewScope(user, tenant);
  const employeeFilter: Record<string, unknown> = { companyId: tenant, status: "ACTIVE" };
  if (scope) employeeFilter.departmentId = { $in: scope };
  const employees = await Employee.find(employeeFilter).sort({ name: 1 }).lean();
  const scoped = scope ? { employeeId: { $in: employees.map((employee) => employee._id) } } : {};
  const [days, gateways, gaps, departments, reviewers, fieldDays] = await Promise.all([
    AttendanceDay.find({ companyId: tenant, workDate: today, ...scoped }).lean(),
    Gateway.find({ ownerType: "COMPANY", ownerId: tenant, kind: "OFFICE" }).sort({ name: 1 }).lean(),
    AttendanceGap.find({ companyId: tenant, ...scoped }).populate("employeeId", "name employeeCode").sort({ startedAt: -1 }).limit(50).lean(),
    Department.find({ companyId: tenant }, "name").sort({ name: 1 }).lean(),
    User.find({ companyId: tenant, role: ROLES.COMPANY_HR }, "name email status reviewDepartmentIds").sort({ name: 1 }).lean(),
    AttendanceDay.find({ companyId: tenant, source: "PHONE", fieldReview: "PENDING", ...scoped })
      .populate("employeeId", "name employeeCode").sort({ workDate: -1 }).limit(100).lean(),
  ]);
  const byEmployee = new Map(days.map((day) => [String(day.employeeId), day]));
  return {
    policy,
    reviewScope: scope,
    departments: departments.map((department) => serialize(department)),
    reviewers: user.role === ROLES.COMPANY_HR ? [] : reviewers.map((reviewer) => serialize(reviewer)),
    fieldDays: fieldDays.map((day) => serialize(day)),
    gateways: gateways.map((gateway) => ({
      ...(serialize(gateway) as object),
      health: gatewayHealth(gateway.lastContactAt ? new Date(gateway.lastContactAt) : null, now, policy.gatewaySilentMinutes),
    })),
    people: employees.map((employee) => {
      const day = byEmployee.get(String(employee._id));
      return {
        ...(serialize(employee) as object),
        presence: livePresence({
          checkedInAt: day?.checkedInAt ? new Date(day.checkedInAt) : null,
          lastSeenAt: day?.lastSeenAt ? new Date(day.lastSeenAt) : null,
          checkedOutAt: day?.checkedOutAt ? new Date(day.checkedOutAt) : null,
          now,
          graceMinutes: policy.gracePeriodMinutes,
        }),
        checkedInAt: day?.checkedInAt || null,
        lastSeenAt: day?.lastSeenAt || null,
        checkedOutAt: day?.checkedOutAt || null,
      };
    }),
    gaps: gaps.map((gap) => ({ ...(serialize(gap) as object), outcome: gapOutcome(gap, now) })),
  };
}

export async function myAttendance(user: AuthUser, date?: string) {
  const companyId = requireCompanyId(user);
  const employee = await Employee.findOne({ userId: user.id, companyId }).lean();
  if (!employee) throw new AppError(403, "EMPLOYEE_MISSING", "This login is not linked to an employee.");
  const company = await loadCompany(companyId);
  const policy = policyFrom(company);
  const now = new Date();
  const dayKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : workDate(now);
  await closeDueDays(companyId, policy, now, employee._id);
  const start = instantOnDate(dayKey, "00:00");
  const end = start ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : null;
  const [day, gaps, detections] = await Promise.all([
    AttendanceDay.findOne({ companyId, employeeId: employee._id, workDate: dayKey }).lean(),
    start && end ? AttendanceGap.find({ companyId, employeeId: employee._id, startedAt: { $lt: end }, endedAt: { $gt: start } }).sort({ startedAt: 1 }).lean() : [],
    start && end && employee.tagIdentifier
      ? DetectionEvent.find({ ownerType: "COMPANY", ownerId: companyId, tagIdentifier: employee.tagIdentifier, occurredAt: { $gte: start, $lt: end } }).populate("gatewayId", "name zone").sort({ occurredAt: 1 }).lean()
      : [],
  ]);
  return {
    employee: serialize(employee),
    policy,
    workDate: dayKey,
    presence: livePresence({
      checkedInAt: day?.checkedInAt ? new Date(day.checkedInAt) : null,
      lastSeenAt: day?.lastSeenAt ? new Date(day.lastSeenAt) : null,
      checkedOutAt: day?.checkedOutAt ? new Date(day.checkedOutAt) : null,
      now,
      graceMinutes: policy.gracePeriodMinutes,
    }),
    day: day ? serialize(day) : null,
    gaps: gaps.map((gap) => ({ ...(serialize(gap) as object), outcome: gapOutcome(gap, now) })),
    detections: detections.map((detection) => serialize(detection)),
  };
}

export type ReportRow = {
  employee: string;
  employeeCode: string;
  workingMinutes: number;
  personalMinutes: number;
  pendingMinutes: number;
  lateDays: number;
  earlyDays: number;
  daysPresent: number;
};

export async function monthlyReport(user: AuthUser, companyId: string | undefined, month: string) {
  if (user.role === ROLES.EMPLOYEE) throw new AppError(403, "FORBIDDEN", "Only a company admin can export attendance.");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError(400, "VALIDATION_ERROR", "Use a month like 2026-10.");
  const tenant = requireCompanyId(user, companyId);
  const company = await loadCompany(tenant);
  const policy = policyFrom(company);
  const now = new Date();
  await closeDueDays(tenant, policy, now);
  const [year, mon] = month.split("-").map(Number);
  const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
  const monthStart = instantOnDate(`${month}-01`, "00:00");
  const monthEnd = instantOnDate(nextMonth, "00:00");
  if (!monthStart || !monthEnd) throw new AppError(400, "VALIDATION_ERROR", "Use a month like 2026-10.");
  const scope = await reviewScope(user, tenant);
  const employeeFilter: Record<string, unknown> = { companyId: tenant, status: "ACTIVE" };
  if (scope) employeeFilter.departmentId = { $in: scope };
  const [employees, days, gaps] = await Promise.all([
    Employee.find(employeeFilter).sort({ name: 1 }).lean(),
    AttendanceDay.find({ companyId: tenant, workDate: new RegExp(`^${month}`) }).lean(),
    AttendanceGap.find({ companyId: tenant, startedAt: { $gte: monthStart, $lt: monthEnd } }).lean(),
  ]);
  const rows: ReportRow[] = employees.map((employee) => {
    const mine = days.filter((day) => String(day.employeeId) === String(employee._id));
    const myGaps = gaps.filter((gap) => String(gap.employeeId) === String(employee._id));
    let working = 0;
    let lateDays = 0;
    let earlyDays = 0;
    let daysPresent = 0;
    let pendingFieldMinutes = 0;
    for (const day of mine) {
      if (!day.checkedInAt) continue;
      const counts = dayCounts(day);
      if (counts === "EXCLUDED") continue;
      if (counts === "PENDING") {
        if (day.checkedOutAt) pendingFieldMinutes += workingMinutes(new Date(day.checkedInAt), new Date(day.checkedOutAt), 0);
        continue;
      }
      daysPresent += 1;
      if (isLate(new Date(day.checkedInAt), policy.shiftStart)) lateDays += 1;
      if (day.checkedOutAt && day.closedBy !== "SHIFT_END" && isEarlyExit(new Date(day.checkedOutAt), policy.shiftEnd)) earlyDays += 1;
      const deducted = myGaps
        .filter((gap) => workDate(new Date(gap.startedAt)) === day.workDate && isDeducted(gap, now))
        .reduce((sum, gap) => sum + gapMinutes(gap), 0);
      if (day.checkedOutAt) working += workingMinutes(new Date(day.checkedInAt), new Date(day.checkedOutAt), deducted);
    }
    const personalMinutesTotal = myGaps.filter((gap) => isDeducted(gap, now)).reduce((sum, gap) => sum + gapMinutes(gap), 0);
    const pendingMinutes = myGaps.filter((gap) => gap.status === "OPEN" || gap.status === "DISPUTED").filter((gap) => !isDeducted(gap, now)).reduce((sum, gap) => sum + gapMinutes(gap), 0);
    return {
      employee: employee.name,
      employeeCode: employee.employeeCode,
      workingMinutes: working,
      personalMinutes: personalMinutesTotal,
      pendingMinutes: pendingMinutes + pendingFieldMinutes,
      lateDays,
      earlyDays,
      daysPresent,
    };
  });
  return { month, rows };
}

export function reportCsv(month: string, rows: ReportRow[]) {
  const header = ["Employee", "Code", "Working hours", "Out of office hours", "Pending review hours", "Late arrivals", "Early exits", "Days present"];
  const lines = rows.map((row) => [
    row.employee,
    row.employeeCode,
    (row.workingMinutes / 60).toFixed(2),
    (row.personalMinutes / 60).toFixed(2),
    (row.pendingMinutes / 60).toFixed(2),
    String(row.lateDays),
    String(row.earlyDays),
    String(row.daysPresent),
  ]);
  return [header, ...lines].map((line) => line.map((cell) => `"${cell.replaceAll("\"", "\"\"")}"`).join(",")).join("\n") + `\n`;
}

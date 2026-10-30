import { z } from "zod";
import { hashPassword } from "@/lib/auth/tokens";
import { requireCompanyId } from "@/lib/auth/guard";
import { AppError, notFound } from "@/lib/errors/app-error";
import { passwordSchema } from "@/lib/validation/common";
import { AttendanceDay } from "@/models/attendance";
import { AttendanceGap, Company, Employee } from "@/models/company";
import { DetectionEvent, Gateway } from "@/models/platform-events";
import { User } from "@/models/user";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { serialize } from "@/utils/serialize";
import {
  describeGap,
  exceedsGrace,
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
  monitoringPolicy: z.string().trim().min(20, "Write the monitoring policy in at least 20 characters.").max(2000),
});

export const hrSchema = z.object({
  companyId: companyIdSchema,
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.email("Enter a valid email address."),
  phone: z.string().trim().min(8, "Phone must be at least 8 digits.").max(20),
  password: passwordSchema,
});

export const gatewayIngestSchema = z.object({
  gatewayId: companyIdSchema,
  tagIdentifier: z.string().trim().min(2, "Enter the card id.").max(64),
  occurredAt: z.string().optional().default(""),
  rssi: z.preprocess((value) => (value == null || value === "" ? undefined : value), z.coerce.number().min(-120).max(0).optional()),
});

export const gatewaySchema = z.object({
  companyId: companyIdSchema,
  name: z.string().trim().min(2, "Gateway name must be at least 2 characters."),
  zone: z.enum(["FLOOR", "MEETING_ROOM", "CAFETERIA", "CORRIDOR", "OTHER"]),
});

export const detectionSchema = z.object({
  companyId: companyIdSchema,
  tagIdentifier: z.string().trim().min(2, "Enter the card id.").max(64),
  gatewayId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a gateway."),
  occurredAt: z.string().optional().default(""),
  rssi: z.preprocess((value) => (value == null || value === "" ? undefined : value), z.coerce.number().min(-120).max(0).optional()),
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
  company.monitoringPolicy = input.monitoringPolicy;
  await company.save();
  return policyFrom(company);
}

export async function createGateway(user: AuthUser, input: z.infer<typeof gatewaySchema>) {
  if (user.role === ROLES.EMPLOYEE) throw new AppError(403, "FORBIDDEN", "Only a company admin can add a gateway.");
  const companyId = requireCompanyId(user, input.companyId);
  const company = await loadCompany(companyId);
  const policy = policyFrom(company);
  if (policy.pilotOneFloor && input.zone !== "FLOOR") {
    throw new AppError(400, "PILOT_FLOOR", "The pilot accepts only a floor gateway. Turn the pilot off to cover meeting rooms, the cafeteria, and corridors.");
  }
  const gateway = await Gateway.create({
    ownerType: "COMPANY",
    ownerId: companyId,
    name: input.name,
    kind: "OFFICE",
    zone: input.zone,
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
  if (tag) {
    const other = await Employee.findOne({ tagIdentifier: tag, _id: { $ne: employee._id } }).lean();
    if (other) throw new AppError(409, "CONFLICT", "This card is already assigned to someone else.");
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
  return serialize(employee.toObject());
}

export async function recordDetection(user: AuthUser, input: z.infer<typeof detectionSchema>) {
  if (user.role === ROLES.EMPLOYEE) throw new AppError(403, "FORBIDDEN", "Only a company admin can record a gateway detection.");
  const companyId = requireCompanyId(user, input.companyId);
  const company = await loadCompany(companyId);
  const policy = policyFrom(company);
  assertPolicyReady(policy);
  const employee = await Employee.findOne({ companyId, tagIdentifier: input.tagIdentifier.trim(), status: "ACTIVE" });
  if (!employee) throw new AppError(404, "TAG_UNKNOWN", "No active employee uses this card.");
  if (!employee.consentGranted) throw new AppError(403, "CONSENT_REQUIRED", "This employee has not given written monitoring consent.");
  const gateway = await Gateway.findOne({ _id: input.gatewayId, ownerType: "COMPANY", ownerId: companyId, kind: "OFFICE", status: "ACTIVE" });
  if (!gateway) throw new AppError(400, "GATEWAY_REQUIRED", "Choose an active office gateway for this company.");
  if (policy.pilotOneFloor && gateway.zone !== "FLOOR") {
    throw new AppError(400, "PILOT_FLOOR", "This pilot only hears floor gateways. Turn the pilot off after that floor is tuned.");
  }
  const occurredAt = input.occurredAt ? parseOfficeTime(input.occurredAt) : new Date();
  if (!occurredAt) throw new AppError(400, "VALIDATION_ERROR", "Enter a valid detection time.");
  if (occurredAt.getTime() > Date.now() + 60_000) throw new AppError(400, "VALIDATION_ERROR", "A detection cannot be in the future.");
  if (Date.now() - occurredAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
    throw new AppError(400, "VALIDATION_ERROR", "A detection older than 7 days cannot be applied.");
  }

  await closeDueDays(companyId, policy, occurredAt, employee._id);
  const dayKey = workDate(occurredAt);
  let day = await AttendanceDay.findOne({ companyId, employeeId: employee._id, workDate: dayKey });
  if (!day) day = new AttendanceDay({ companyId, employeeId: employee._id, workDate: dayKey, source: "GATEWAY" });
  if (day.source === "PHONE" && day.checkedInAt) throw new AppError(409, "FIELD_DAY", "This day already uses a phone check-in.");
  if (day.lastSeenAt && occurredAt.getTime() < new Date(day.lastSeenAt).getTime()) {
    throw new AppError(400, "OUT_OF_ORDER", "This reading is older than the last one for this card.");
  }
  if (day.lastSeenAt && occurredAt.getTime() === new Date(day.lastSeenAt).getTime()) {
    return { day: serialize(day.toObject()), gap: null };
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
  gateway.lastHeartbeatAt = occurredAt;
  await gateway.save();
  await DetectionEvent.create({
    ownerType: "COMPANY",
    ownerId: companyId,
    tagIdentifier: employee.tagIdentifier,
    gatewayId: gateway._id,
    occurredAt,
    rssi: input.rssi ?? null,
  });
  return { day: serialize(day.toObject()), gap: gap ? serialize(gap.toObject()) : null };
}

export function assertGatewayKey(secret: string | null) {
  const expected = process.env.GATEWAY_INGEST_SECRET;
  if (!expected || secret !== expected) {
    throw new AppError(401, "UNAUTHORIZED", "Gateway key is invalid.");
  }
}

export async function ingestGatewayDetection(input: z.infer<typeof gatewayIngestSchema>) {
  const gateway = await Gateway.findOne({ _id: input.gatewayId, ownerType: "COMPANY", kind: "OFFICE" }).lean();
  if (!gateway) throw notFound("Gateway");
  return recordDetection(
    { id: "", schoolId: null, companyId: String(gateway.ownerId), fleetId: null, employeeId: null, name: "Gateway", email: "", phone: "", role: ROLES.COMPANY_ADMIN, status: "ACTIVE" },
    { companyId: String(gateway.ownerId), tagIdentifier: input.tagIdentifier, gatewayId: input.gatewayId, occurredAt: input.occurredAt, rssi: input.rssi },
  );
}

export async function createHrReviewer(user: AuthUser, input: z.infer<typeof hrSchema>) {
  if (user.role === ROLES.EMPLOYEE || user.role === ROLES.COMPANY_HR) {
    throw new AppError(403, "FORBIDDEN", "Only a company admin can add an HR reviewer.");
  }
  const companyId = requireCompanyId(user, input.companyId);
  const company = await loadCompany(companyId);
  const account = await User.create({
    companyId: company._id,
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    passwordHash: await hashPassword(input.password),
    role: ROLES.COMPANY_HR,
  });
  return serialize(account.toObject());
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
    if (!day) day = new AttendanceDay({ companyId, employeeId: employee._id, workDate: dayKey, source: "PHONE" });
    if (!day.checkedInAt) day.checkedInAt = now;
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
    gap.status = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
    gap.resolutionNote = input.reason.trim();
    gap.reviewedAt = new Date();
    gap.reviewedBy = user.id;
    if (gap.status === "APPROVED") gap.countsAsPersonal = false;
    await gap.save();
  }
  return { ...(serialize(gap.toObject()) as object), outcome: gapOutcome(gap, new Date()) };
}

export async function attendanceBoard(user: AuthUser, companyId?: string) {
  if (user.role === ROLES.EMPLOYEE) throw new AppError(403, "FORBIDDEN", "Open My day to see your own attendance.");
  const tenant = requireCompanyId(user, companyId);
  const company = await loadCompany(tenant);
  const policy = policyFrom(company);
  const now = new Date();
  await closeDueDays(tenant, policy, now);
  const today = workDate(now);
  const [employees, days, gateways, gaps] = await Promise.all([
    Employee.find({ companyId: tenant, status: "ACTIVE" }).sort({ name: 1 }).lean(),
    AttendanceDay.find({ companyId: tenant, workDate: today }).lean(),
    Gateway.find({ ownerType: "COMPANY", ownerId: tenant, kind: "OFFICE" }).sort({ name: 1 }).lean(),
    AttendanceGap.find({ companyId: tenant }).populate("employeeId", "name employeeCode").sort({ startedAt: -1 }).limit(50).lean(),
  ]);
  const byEmployee = new Map(days.map((day) => [String(day.employeeId), day]));
  return {
    policy,
    gateways: gateways.map((gateway) => serialize(gateway)),
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
  const [employees, days, gaps] = await Promise.all([
    Employee.find({ companyId: tenant, status: "ACTIVE" }).sort({ name: 1 }).lean(),
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
    for (const day of mine) {
      if (!day.checkedInAt) continue;
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
      pendingMinutes,
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

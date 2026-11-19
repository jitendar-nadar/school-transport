import { z } from "zod";
import { requireSchoolId } from "@/lib/auth/guard";
import { AppError, notFound } from "@/lib/errors/app-error";
import { BleTag } from "@/models/ble-tag";
import { School } from "@/models/school";
import { CampusDay, CampusEvent, Gate, GateNode, GateSighting } from "@/models/school-records";
import { Student } from "@/models/student";
import {
  directionFromPair,
  isDebounced,
  isEarlyExit,
  pastCutOff,
  policyFrom,
  readingTime,
  schoolDay,
  withinPairWindow,
  type GateDirection,
  type GatePolicy,
  type GateSide,
} from "@/modules/gates/gate-rules";
import { notifyUsers } from "@/modules/notifications/notification.service";
import type { AuthUser } from "@/types/domain";
import { objectIdSchema } from "@/lib/validation/common";
import { formatClock } from "@/utils/time";
import { serialize } from "@/utils/serialize";

export const gateNodeSchema = z.object({
  gateId: objectIdSchema,
  name: z.string().trim().min(2, "Enter a node name.").max(80),
  side: z.enum(["OUTSIDE", "INSIDE"]),
  hardwareId: z
    .string()
    .trim()
    .min(4, "Hardware id must be at least 4 characters.")
    .max(64)
    .transform((value) => value.toUpperCase()),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
});

export const updateGateNodeSchema = gateNodeSchema.partial().omit({ gateId: true }).extend({
  name: z.string().trim().min(2).max(80).optional(),
  side: z.enum(["OUTSIDE", "INSIDE"]).optional(),
  hardwareId: z
    .string()
    .trim()
    .min(4)
    .max(64)
    .transform((value) => value.toUpperCase())
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const gatePolicySchema = z.object({
  cutOffTime: z.string().regex(/^\d{1,2}:\d{2}$/, "Use HH:mm for the cut-off time."),
  schoolEndTime: z.string().regex(/^\d{1,2}:\d{2}$/, "Use HH:mm for the school end time."),
  debounceMinutes: z.coerce.number().int().min(1).max(60),
  pairWindowSeconds: z.coerce.number().int().min(5).max(300),
  absenceAlertsEnabled: z.boolean(),
});

export const gateOverrideSchema = z.object({
  studentId: objectIdSchema,
  gateId: objectIdSchema.optional(),
  direction: z.enum(["ENTRY", "EXIT"]),
  reason: z.string().trim().min(4, "Enter a reason of at least 4 characters.").max(300),
  occurredAt: z.string().trim().optional(),
});

export const gateIngestSchema = z.object({
  hardwareId: z
    .string()
    .trim()
    .min(4)
    .max(64)
    .transform((value) => value.toUpperCase()),
  tagIdentifier: z.string().trim().min(4).max(64).optional(),
  occurredAt: z.union([z.string(), z.date()]).optional(),
  rssi: z.coerce.number().int().min(-120).max(0).optional(),
  readings: z
    .array(
      z.object({
        tagIdentifier: z.string().trim().min(4).max(64),
        occurredAt: z.union([z.string(), z.date()]).optional(),
        rssi: z.coerce.number().int().min(-120).max(0).optional(),
      }),
    )
    .max(200)
    .optional(),
});

export function assertSchoolGateKey(secret: string | null) {
  const expected = process.env.SCHOOL_GATE_INGEST_SECRET || process.env.GATEWAY_INGEST_SECRET;
  if (!expected || secret !== expected) {
    throw new AppError(401, "UNAUTHORIZED", "Gate node key is invalid.");
  }
}

async function loadPolicy(schoolId: string): Promise<GatePolicy> {
  const school = await School.findById(schoolId).select("settings").lean();
  const settings = school?.settings || {};
  return policyFrom({
    cutOffTime: settings.gateCutOffTime,
    schoolEndTime: settings.gateSchoolEndTime,
    debounceMinutes: settings.gateDebounceMinutes,
    pairWindowSeconds: settings.gatePairWindowSeconds,
    absenceAlertsEnabled: settings.gateAbsenceAlertsEnabled,
  });
}

export async function getGatePolicy(user: AuthUser, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  return { schoolId: tenant, policy: await loadPolicy(tenant) };
}

export async function updateGatePolicy(user: AuthUser, input: z.infer<typeof gatePolicySchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const school = await School.findById(tenant);
  if (!school) throw notFound("School");
  school.settings = school.settings || {};
  school.settings.gateCutOffTime = input.cutOffTime;
  school.settings.gateSchoolEndTime = input.schoolEndTime;
  school.settings.gateDebounceMinutes = input.debounceMinutes;
  school.settings.gatePairWindowSeconds = input.pairWindowSeconds;
  school.settings.gateAbsenceAlertsEnabled = input.absenceAlertsEnabled;
  await school.save();
  return { schoolId: tenant, policy: await loadPolicy(tenant) };
}

export async function listGateNodes(user: AuthUser, query: { schoolId?: string; gateId?: string }) {
  const tenant = requireSchoolId(user, query.schoolId);
  const filter: Record<string, unknown> = { schoolId: tenant };
  if (query.gateId) filter.gateId = query.gateId;
  const nodes = await GateNode.find(filter).sort({ gateId: 1, side: 1, name: 1 }).lean();
  const gates = await Gate.find({ schoolId: tenant }).select("name").lean();
  const gateNames = new Map(gates.map((gate) => [String(gate._id), gate.name]));
  return nodes.map((node) => {
    const row = serialize(node) as Record<string, unknown>;
    return { ...row, gateName: gateNames.get(String(node.gateId)) || "" };
  });
}

export async function createGateNode(user: AuthUser, input: z.infer<typeof gateNodeSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const gate = await Gate.findOne({ _id: input.gateId, schoolId: tenant }).lean();
  if (!gate) throw notFound("Gate");
  if (input.status === "ACTIVE") {
    const existing = await GateNode.findOne({ gateId: gate._id, side: input.side, status: "ACTIVE" }).lean();
    if (existing) {
      throw new AppError(409, "SIDE_TAKEN", `This gate already has an active ${input.side.toLowerCase()} node.`);
    }
  }
  try {
    const node = await GateNode.create({
      schoolId: tenant,
      gateId: gate._id,
      name: input.name,
      side: input.side,
      hardwareId: input.hardwareId,
      status: input.status,
    });
    return serialize(node.toObject());
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new AppError(409, "HARDWARE_TAKEN", "That hardware id is already registered.", {
        fieldErrors: { hardwareId: ["That hardware id is already registered."] },
      });
    }
    throw error;
  }
}

export async function updateGateNode(
  user: AuthUser,
  id: string,
  input: z.infer<typeof updateGateNodeSchema>,
  schoolId?: string,
) {
  const tenant = requireSchoolId(user, schoolId);
  const node = await GateNode.findOne({ _id: id, schoolId: tenant });
  if (!node) throw notFound("Gate node");
  const nextSide = input.side || node.side;
  const nextStatus = input.status || node.status;
  if (nextStatus === "ACTIVE") {
    const existing = await GateNode.findOne({
      gateId: node.gateId,
      side: nextSide,
      status: "ACTIVE",
      _id: { $ne: node._id },
    }).lean();
    if (existing) {
      throw new AppError(409, "SIDE_TAKEN", `This gate already has an active ${nextSide.toLowerCase()} node.`);
    }
  }
  if (input.name != null) node.name = input.name;
  if (input.side != null) node.side = input.side;
  if (input.hardwareId != null) node.hardwareId = input.hardwareId;
  if (input.status != null) node.status = input.status;
  try {
    await node.save();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new AppError(409, "HARDWARE_TAKEN", "That hardware id is already registered.", {
        fieldErrors: { hardwareId: ["That hardware id is already registered."] },
      });
    }
    throw error;
  }
  return serialize(node.toObject());
}

export async function deleteGateNode(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const node = await GateNode.findOne({ _id: id, schoolId: tenant });
  if (!node) throw notFound("Gate node");
  await GateSighting.deleteMany({ nodeId: node._id });
  await node.deleteOne();
  return { deleted: true };
}

export async function removeGateCascade(schoolId: string, gateId: string) {
  const nodes = await GateNode.find({ schoolId, gateId }).select("_id").lean();
  const nodeIds = nodes.map((node) => node._id);
  await GateSighting.deleteMany({ gateId });
  if (nodeIds.length) await GateSighting.deleteMany({ nodeId: { $in: nodeIds } });
  await GateNode.deleteMany({ gateId });
}

async function findStudentByTag(schoolId: string, tagIdentifier: string) {
  const tag = await BleTag.findOne({
    tagIdentifier: tagIdentifier.trim(),
    schoolId,
    status: "ACTIVE",
    studentId: { $ne: null },
  }).lean();
  if (!tag?.studentId) return null;
  const student = await Student.findOne({ _id: tag.studentId, schoolId, status: "ACTIVE" }).lean();
  if (!student) return null;
  return { student, tagIdentifier: tag.tagIdentifier };
}

async function ensureCampusDay(schoolId: string, studentId: string, day: string) {
  let record = await CampusDay.findOne({ schoolId, studentId, day });
  if (!record) {
    record = await CampusDay.create({
      schoolId,
      studentId,
      day,
      presence: "NOT_ARRIVED",
    });
  }
  return record;
}

async function applyCrossing(input: {
  schoolId: string;
  student: { _id: unknown; name: string; parentIds?: unknown[] };
  gateId: string | null;
  direction: GateDirection;
  source: "NODES" | "MANUAL";
  reason?: string;
  actorId?: string | null;
  occurredAt: Date;
  policy: GatePolicy;
}) {
  const day = schoolDay(input.occurredAt);
  const campus = await ensureCampusDay(input.schoolId, String(input.student._id), day);
  if (isDebounced(campus.lastEventAt, input.occurredAt, input.policy.debounceMinutes) && input.source === "NODES") {
    return { status: "DEBOUNCED" as const, campus: serialize(campus.toObject()) };
  }

  const earlyExit = isEarlyExit({
    direction: input.direction,
    occurredAt: input.occurredAt,
    enteredAt: campus.enteredAt,
    cutOffTime: input.policy.cutOffTime,
    schoolEndTime: input.policy.schoolEndTime,
  });

  await CampusEvent.create({
    schoolId: input.schoolId,
    studentId: input.student._id,
    gateId: input.gateId,
    day,
    direction: input.direction,
    source: input.source,
    reason: input.reason || "",
    actorId: input.actorId || null,
    earlyExit,
    occurredAt: input.occurredAt,
  });

  if (input.direction === "ENTRY") {
    if (!campus.enteredAt || input.occurredAt < campus.enteredAt) campus.enteredAt = input.occurredAt;
    campus.presence = "IN_CAMPUS";
    campus.exitedAt = null;
  } else {
    campus.exitedAt = input.occurredAt;
    campus.presence = "OUT";
    if (earlyExit) campus.leftEarly = true;
  }
  campus.lastEventAt = input.occurredAt;
  campus.lastDirection = input.direction;
  await campus.save();

  const school = await School.findById(input.schoolId).select("settings.notificationTimezone").lean();
  const timeZone = school?.settings?.notificationTimezone || "Asia/Kolkata";
  const clock = formatClock(input.occurredAt, timeZone);
  const parents = (input.student.parentIds || []).map((id) => String(id));

  if (input.direction === "ENTRY") {
    await notifyUsers({
      schoolId: input.schoolId,
      recipientIds: parents,
      studentId: String(input.student._id),
      type: "STUDENT_ENTERED_SCHOOL",
      title: "Entered school",
      body: `${input.student.name} entered school at ${clock}.`,
      occurredAt: input.occurredAt,
      dedupParts: ["STUDENT_ENTERED_SCHOOL", day, String(input.student._id), String(input.occurredAt.getTime())],
    });
  } else {
    await notifyUsers({
      schoolId: input.schoolId,
      recipientIds: parents,
      studentId: String(input.student._id),
      type: "STUDENT_EXITED_SCHOOL",
      title: earlyExit ? "Left school early" : "Left school",
      body: earlyExit
        ? `${input.student.name} left school early at ${clock}.`
        : `${input.student.name} left school at ${clock}.`,
      occurredAt: input.occurredAt,
      dedupParts: ["STUDENT_EXITED_SCHOOL", day, String(input.student._id), String(input.occurredAt.getTime())],
    });
    if (earlyExit) {
      await notifyUsers({
        schoolId: input.schoolId,
        recipientIds: parents,
        studentId: String(input.student._id),
        type: "STUDENT_LEFT_EARLY",
        title: "Left school early",
        body: `${input.student.name} left school early at ${clock}.`,
        occurredAt: input.occurredAt,
        dedupParts: ["STUDENT_LEFT_EARLY", day, String(input.student._id)],
      });
    }
  }

  return { status: "APPLIED" as const, direction: input.direction, earlyExit, campus: serialize(campus.toObject()) };
}

async function applySighting(input: {
  node: { _id: unknown; schoolId: unknown; gateId: unknown; side: GateSide; status: string };
  tagIdentifier: string;
  occurredAt: Date;
  rssi: number | null;
}) {
  if (input.node.status !== "ACTIVE") {
    return { status: "NODE_INACTIVE" as const };
  }
  const schoolId = String(input.node.schoolId);
  const matched = await findStudentByTag(schoolId, input.tagIdentifier);
  if (!matched) return { status: "TAG_UNKNOWN" as const };

  const policy = await loadPolicy(schoolId);
  await GateSighting.create({
    schoolId,
    gateId: input.node.gateId,
    nodeId: input.node._id,
    studentId: matched.student._id,
    tagIdentifier: matched.tagIdentifier,
    side: input.node.side,
    rssi: input.rssi,
    heardAt: input.occurredAt,
  });

  const windowMs = policy.pairWindowSeconds * 1000;
  const opposite = await GateSighting.findOne({
    schoolId,
    gateId: input.node.gateId,
    studentId: matched.student._id,
    side: input.node.side === "OUTSIDE" ? "INSIDE" : "OUTSIDE",
    heardAt: {
      $gte: new Date(input.occurredAt.getTime() - windowMs),
      $lte: new Date(input.occurredAt.getTime() + windowMs),
    },
  })
    .sort({ heardAt: 1 })
    .lean();

  if (!opposite) {
    await GateSighting.deleteMany({
      schoolId,
      studentId: matched.student._id,
      heardAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    return { status: "PENDING_PAIR" as const, studentId: String(matched.student._id), side: input.node.side };
  }

  if (!withinPairWindow(new Date(opposite.heardAt), input.occurredAt, policy.pairWindowSeconds)) {
    return { status: "PENDING_PAIR" as const, studentId: String(matched.student._id), side: input.node.side };
  }

  const direction = directionFromPair(
    { side: opposite.side as GateSide, heardAt: new Date(opposite.heardAt), rssi: opposite.rssi ?? null },
    { side: input.node.side, heardAt: input.occurredAt, rssi: input.rssi },
  );
  await GateSighting.deleteMany({
    _id: { $in: [opposite._id] },
    schoolId,
  });
  await GateSighting.deleteMany({
    schoolId,
    gateId: input.node.gateId,
    studentId: matched.student._id,
    side: input.node.side,
    heardAt: input.occurredAt,
  });

  if (!direction) return { status: "AMBIGUOUS" as const };

  const result = await applyCrossing({
    schoolId,
    student: matched.student as { _id: unknown; name: string; parentIds?: unknown[] },
    gateId: String(input.node.gateId),
    direction,
    source: "NODES",
    occurredAt: input.occurredAt.getTime() >= new Date(opposite.heardAt).getTime() ? input.occurredAt : new Date(opposite.heardAt),
    policy,
  });
  return { ...result, studentId: String(matched.student._id) };
}

export async function ingestGateNodeReading(input: z.infer<typeof gateIngestSchema>) {
  const node = await GateNode.findOne({ hardwareId: input.hardwareId });
  if (!node) throw new AppError(404, "NODE_UNKNOWN", "No gate node uses that hardware id.");

  node.lastContactAt = new Date();
  await node.save();

  const readings =
    input.readings && input.readings.length
      ? input.readings
      : input.tagIdentifier
        ? [{ tagIdentifier: input.tagIdentifier, occurredAt: input.occurredAt, rssi: input.rssi }]
        : [];

  if (!readings.length) {
    return { hardwareId: node.hardwareId, lastContactAt: node.lastContactAt, received: 0 };
  }

  const results = [];
  let applied = 0;
  let pending = 0;
  let debounced = 0;
  let rejected = 0;
  for (const reading of readings) {
    const occurredAt = readingTime(reading.occurredAt ? new Date(reading.occurredAt) : undefined);
    if (!occurredAt) {
      rejected += 1;
      results.push({ tagIdentifier: reading.tagIdentifier, status: "INVALID_TIME" });
      continue;
    }
    const outcome = await applySighting({
      node: node.toObject() as { _id: unknown; schoolId: unknown; gateId: unknown; side: GateSide; status: string },
      tagIdentifier: reading.tagIdentifier,
      occurredAt,
      rssi: reading.rssi ?? null,
    });
    if (outcome.status === "APPLIED") applied += 1;
    else if (outcome.status === "PENDING_PAIR") pending += 1;
    else if (outcome.status === "DEBOUNCED") debounced += 1;
    else rejected += 1;
    results.push({ tagIdentifier: reading.tagIdentifier, ...outcome });
  }

  return {
    hardwareId: node.hardwareId,
    gateId: String(node.gateId),
    received: readings.length,
    applied,
    pending,
    debounced,
    rejected,
    results,
  };
}

export async function manualGateOverride(user: AuthUser, input: z.infer<typeof gateOverrideSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const student = await Student.findOne({ _id: input.studentId, schoolId: tenant, status: "ACTIVE" }).lean();
  if (!student) throw notFound("Student");
  if (input.gateId) {
    const gate = await Gate.findOne({ _id: input.gateId, schoolId: tenant }).lean();
    if (!gate) throw notFound("Gate");
  }
  const occurredAt = readingTime(input.occurredAt || undefined);
  if (!occurredAt) throw new AppError(400, "INVALID_TIME", "Enter a valid date and time.");
  const policy = await loadPolicy(tenant);
  return applyCrossing({
    schoolId: tenant,
    student: student as { _id: unknown; name: string; parentIds?: unknown[] },
    gateId: input.gateId || null,
    direction: input.direction,
    source: "MANUAL",
    reason: input.reason,
    actorId: user.id,
    occurredAt,
    policy,
  });
}

export async function gateBoard(user: AuthUser, query: { schoolId?: string; day?: string }) {
  const tenant = requireSchoolId(user, query.schoolId);
  const policy = await loadPolicy(tenant);
  const now = new Date();
  const day = query.day || schoolDay(now);
  const students = await Student.find({ schoolId: tenant, status: "ACTIVE" })
    .select("name className division studentCode parentIds")
    .sort({ name: 1 })
    .lean();
  const days = await CampusDay.find({ schoolId: tenant, day }).lean();
  const byStudent = new Map(days.map((row) => [String(row.studentId), row]));
  const cutOffPassed = pastCutOff(now, policy.cutOffTime) || day < schoolDay(now);

  const rows = students.map((student) => {
    const campus = byStudent.get(String(student._id));
    const presence = campus?.presence || "NOT_ARRIVED";
    return {
      studentId: String(student._id),
      name: student.name,
      className: student.className || "",
      division: student.division || "",
      studentCode: student.studentCode || "",
      presence,
      enteredAt: campus?.enteredAt ? new Date(campus.enteredAt).toISOString() : null,
      exitedAt: campus?.exitedAt ? new Date(campus.exitedAt).toISOString() : null,
      leftEarly: Boolean(campus?.leftEarly),
      absenceAlertedAt: campus?.absenceAlertedAt ? new Date(campus.absenceAlertedAt).toISOString() : null,
    };
  });

  const inCampus = rows.filter((row) => row.presence === "IN_CAMPUS");
  const leftEarly = rows.filter((row) => row.leftEarly && row.presence === "OUT");
  const notArrived = rows.filter((row) => row.presence === "NOT_ARRIVED" && cutOffPassed);
  const waiting = rows.filter((row) => row.presence === "NOT_ARRIVED" && !cutOffPassed);

  const events = await CampusEvent.find({ schoolId: tenant, day })
    .sort({ occurredAt: -1 })
    .limit(40)
    .lean();
  const eventStudentIds = [...new Set(events.map((event) => String(event.studentId)))];
  const eventStudents = await Student.find({ _id: { $in: eventStudentIds } }).select("name").lean();
  const names = new Map(eventStudents.map((student) => [String(student._id), student.name]));
  const gates = await Gate.find({ schoolId: tenant }).select("name").lean();
  const gateNames = new Map(gates.map((gate) => [String(gate._id), gate.name]));

  const nodes = await GateNode.find({ schoolId: tenant }).lean();

  return {
    day,
    policy,
    cutOffPassed,
    counts: {
      inCampus: inCampus.length,
      notArrived: notArrived.length,
      leftEarly: leftEarly.length,
      waiting: waiting.length,
      activeStudents: students.length,
    },
    inCampus,
    notArrived,
    leftEarly,
    waiting,
    recentEvents: events.map((event) => {
      const row = serialize(event) as Record<string, unknown>;
      return {
        ...row,
        studentName: names.get(String(event.studentId)) || "",
        gateName: event.gateId ? gateNames.get(String(event.gateId)) || "" : "",
      };
    }),
    nodes: nodes.map((node) => {
      const row = serialize(node) as Record<string, unknown>;
      return { ...row, gateName: gateNames.get(String(node.gateId)) || "" };
    }),
  };
}

export async function sendAbsenceAlerts(user: AuthUser, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const policy = await loadPolicy(tenant);
  if (!policy.absenceAlertsEnabled) {
    throw new AppError(409, "ALERTS_DISABLED", "Absence alerts are turned off in the gate rules.");
  }
  const now = new Date();
  if (!pastCutOff(now, policy.cutOffTime)) {
    throw new AppError(409, "BEFORE_CUTOFF", `Absence alerts open after the cut-off (${policy.cutOffTime}).`);
  }
  const day = schoolDay(now);
  const board = await gateBoard(user, { schoolId: tenant, day });
  const school = await School.findById(tenant).select("settings.notificationTimezone").lean();
  const timeZone = school?.settings?.notificationTimezone || "Asia/Kolkata";
  let sent = 0;
  for (const row of board.notArrived) {
    if (row.absenceAlertedAt) continue;
    const student = await Student.findById(row.studentId).select("name parentIds").lean();
    if (!student) continue;
    await notifyUsers({
      schoolId: tenant,
      recipientIds: (student.parentIds || []).map((id: unknown) => String(id)),
      studentId: row.studentId,
      type: "STUDENT_ABSENT_FROM_SCHOOL",
      title: "Not arrived at school",
      body: `${student.name} had not entered school by ${policy.cutOffTime} (${formatClock(now, timeZone)}).`,
      occurredAt: now,
      dedupParts: ["STUDENT_ABSENT_FROM_SCHOOL", day, row.studentId],
    });
    await CampusDay.findOneAndUpdate(
      { schoolId: tenant, studentId: row.studentId, day },
      {
        $set: { absenceAlertedAt: now, presence: "NOT_ARRIVED" },
        $setOnInsert: { schoolId: tenant, studentId: row.studentId, day },
      },
      { upsert: true },
    );
    sent += 1;
  }
  return { day, sent, notArrived: board.notArrived.length };
}

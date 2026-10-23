import { z } from "zod";
import { requireSchoolId } from "@/lib/auth/guard";
import { AppError, isDuplicateKey, notFound } from "@/lib/errors/app-error";
import { paginate } from "@/lib/mongodb/paginate";
import { BleTag } from "@/models/ble-tag";
import { Student } from "@/models/student";
import { writeAudit } from "@/modules/audit/audit.service";
import type { AuthUser } from "@/types/domain";
import { objectIdSchema } from "@/lib/validation/common";
import { escapeRegex, serialize } from "@/utils/serialize";

export const createTagSchema = z.object({
  schoolId: objectIdSchema.optional(),
  tagIdentifier: z.string().trim().min(3).max(80),
  aliasIdentifiers: z.array(z.string().trim().min(3).max(80)).max(10).optional().default([]),
  tagType: z.string().trim().max(40).optional().default("CARD"),
  batteryStatus: z.enum(["UNKNOWN", "GOOD", "LOW", "REPLACE"]).optional(),
});

export const updateTagSchema = z.object({
  aliasIdentifiers: z.array(z.string().trim().min(3).max(80)).max(10).optional(),
  batteryStatus: z.enum(["UNKNOWN", "GOOD", "LOW", "REPLACE"]).optional(),
  status: z.enum(["ACTIVE", "UNASSIGNED", "INACTIVE", "LOST", "RETIRED"]).optional(),
  schoolId: objectIdSchema.optional(),
});

export const assignTagSchema = z.object({
  studentId: objectIdSchema,
  schoolId: objectIdSchema.optional(),
});

export async function listTags(
  user: AuthUser,
  query: { page: number; limit: number; search?: string; status?: string; schoolId?: string },
) {
  const schoolId = requireSchoolId(user, query.schoolId);
  const filter: Record<string, unknown> = { schoolId };
  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = escapeRegex(query.search);
    const students = await Student.find({
      schoolId,
      $or: [
        { name: { $regex: pattern, $options: "i" } },
        { studentCode: { $regex: pattern, $options: "i" } },
        { className: { $regex: pattern, $options: "i" } },
        { division: { $regex: pattern, $options: "i" } },
      ],
    }).select("_id");
    filter.$or = [
      { tagIdentifier: { $regex: pattern, $options: "i" } },
      { status: { $regex: pattern, $options: "i" } },
      { batteryStatus: { $regex: pattern, $options: "i" } },
      { studentId: { $in: students.map((student) => student._id) } },
    ];
  }
  const result = await paginate(BleTag, filter, {
    page: query.page,
    limit: query.limit,
    sort: { tagIdentifier: 1 },
    populate: [{ path: "studentId", select: "name studentCode className division" }],
  });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

export async function createTag(user: AuthUser, input: z.infer<typeof createTagSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  try {
    const tag = await BleTag.create({
      schoolId,
      tagIdentifier: input.tagIdentifier,
      aliasIdentifiers: input.aliasIdentifiers,
      tagType: input.tagType,
      batteryStatus: input.batteryStatus ?? "UNKNOWN",
      status: "UNASSIGNED",
    });
    return serialize(tag.toObject());
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError(409, "TAG_EXISTS", "This BLE tag identifier is already registered.");
    }
    throw error;
  }
}

export async function updateTag(user: AuthUser, id: string, input: z.infer<typeof updateTagSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  const tag = await BleTag.findOne({ _id: id, schoolId });
  if (!tag) throw notFound("BLE tag");
  if (input.status === "UNASSIGNED" && tag.studentId) {
    throw new AppError(422, "TAG_ASSIGNED", "Remove the student before marking this card unassigned.");
  }
  if (input.status === "ACTIVE") {
    tag.status = "ACTIVE";
  } else if (input.status === "INACTIVE" || input.status === "LOST" || input.status === "RETIRED") {
    if (tag.studentId) {
      await Student.updateOne({ _id: tag.studentId, schoolId }, { $set: { bleTagId: null } });
      tag.studentId = null;
      tag.assignedAt = null;
    }
    tag.status = input.status;
  } else if (input.status === "UNASSIGNED") {
    tag.status = "UNASSIGNED";
  }
  if (input.aliasIdentifiers) tag.aliasIdentifiers = input.aliasIdentifiers;
  if (input.batteryStatus) tag.batteryStatus = input.batteryStatus;
  await tag.save();
  await writeAudit({
    schoolId,
    actorId: user.id,
    action: "BLE_TAG_UPDATED",
    entityType: "BleTag",
    entityId: String(tag._id),
    after: { status: tag.status, batteryStatus: tag.batteryStatus },
  });
  return serialize(tag.toObject());
}

export async function assignTag(user: AuthUser, id: string, input: z.infer<typeof assignTagSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  const tag = await BleTag.findOne({ _id: id, schoolId });
  if (!tag) throw notFound("BLE tag");
  const student = await Student.findOne({ _id: input.studentId, schoolId, status: "ACTIVE" });
  if (!student) throw notFound("Student");
  const other = await BleTag.findOne({
    _id: { $ne: tag._id },
    studentId: student._id,
    status: "ACTIVE",
  });
  if (other) {
    throw new AppError(409, "STUDENT_HAS_TAG", "This student already has an active card. Mark that card inactive before assigning a new one.");
  }
  if (tag.studentId && String(tag.studentId) !== String(student._id)) {
    await Student.updateOne({ _id: tag.studentId }, { $set: { bleTagId: null } });
  }
  tag.studentId = student._id;
  tag.status = "ACTIVE";
  tag.assignedAt = new Date();
  await tag.save();
  student.bleTagId = tag._id;
  await student.save();
  await writeAudit({
    schoolId,
    actorId: user.id,
    action: "BLE_TAG_ASSIGNED",
    entityType: "BleTag",
    entityId: String(tag._id),
    after: { studentId: String(student._id) },
  });
  return serialize(tag.toObject());
}

export async function unassignTag(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const tag = await BleTag.findOne({ _id: id, schoolId: tenant });
  if (!tag) throw notFound("BLE tag");
  if (tag.studentId) {
    await Student.updateOne({ _id: tag.studentId, schoolId: tenant }, { $set: { bleTagId: null } });
  }
  tag.studentId = null;
  tag.assignedAt = null;
  tag.status = tag.status === "INACTIVE" || tag.status === "LOST" || tag.status === "RETIRED" ? tag.status : "UNASSIGNED";
  await tag.save();
  await writeAudit({
    schoolId: tenant,
    actorId: user.id,
    action: "BLE_TAG_UNASSIGNED",
    entityType: "BleTag",
    entityId: String(tag._id),
  });
  return serialize(tag.toObject());
}

export async function deleteTag(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const tag = await BleTag.findOne({ _id: id, schoolId: tenant });
  if (!tag) throw notFound("BLE tag");
  if (tag.studentId) {
    await Student.updateOne({ _id: tag.studentId, schoolId: tenant, bleTagId: tag._id }, { $set: { bleTagId: null } });
  }
  await tag.deleteOne();
  await writeAudit({
    schoolId: tenant,
    actorId: user.id,
    action: "BLE_TAG_DELETED",
    entityType: "BleTag",
    entityId: id,
    after: { tagIdentifier: tag.tagIdentifier },
  });
  return { deleted: true };
}

export async function resolveTag(schoolId: string, tagIdentifier: string) {
  return BleTag.findOne({
    schoolId,
    status: "ACTIVE",
    $or: [{ tagIdentifier }, { aliasIdentifiers: tagIdentifier }],
  }).lean();
}

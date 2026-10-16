import { z } from "zod";
import { requireSchoolId } from "@/lib/auth/guard";
import { AppError, notFound } from "@/lib/errors/app-error";
import { paginate } from "@/lib/mongodb/paginate";
import { Student } from "@/models/student";
import { User } from "@/models/user";
import { writeAudit } from "@/modules/audit/audit.service";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { objectIdSchema } from "@/lib/validation/common";
import { escapeRegex, serialize } from "@/utils/serialize";

export const studentSchema = z.object({
  schoolId: objectIdSchema.optional(),
  studentCode: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  className: z.string().trim().min(1).max(40),
  division: z.string().trim().max(20).optional().default(""),
  photoUrl: z.string().trim().max(500).optional().default(""),
  parentIds: z.array(objectIdSchema).max(6).optional().default([]),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  parentConsent: z
    .object({
      granted: z.boolean(),
      notes: z.string().max(300).optional(),
    })
    .optional(),
});

export const updateStudentSchema = studentSchema.partial();

const schoolPopulate = { path: "schoolId", select: "name schoolCode" };

function presentStudent(student: unknown) {
  const data = serialize(student) as {
    schoolId?: string | { id?: string; name?: string; schoolCode?: string };
  };
  if (data.schoolId && typeof data.schoolId === "object") {
    const school = data.schoolId;
    return {
      ...data,
      schoolId: String(school.id || ""),
      schoolName: school.name || "",
      schoolCode: school.schoolCode || "",
    };
  }
  return { ...data, schoolName: "", schoolCode: "" };
}

async function assertParents(schoolId: string, parentIds: string[]) {
  if (!parentIds.length) return;
  const parents = await User.find({
    _id: { $in: parentIds },
    schoolId,
    role: ROLES.PARENT,
    status: "ACTIVE",
  }).select("_id");
  if (parents.length !== parentIds.length) {
    throw new AppError(422, "INVALID_PARENT", "Every guardian must be an active parent in this school.");
  }
}

export async function listStudents(
  user: AuthUser,
  query: { page: number; limit: number; search?: string; status?: string; schoolId?: string },
) {
  const schoolId = requireSchoolId(user, query.schoolId);
  const filter: Record<string, unknown> = { schoolId };
  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = escapeRegex(query.search);
    filter.$or = [{ name: { $regex: pattern, $options: "i" } }, { studentCode: { $regex: pattern, $options: "i" } }];
  }
  const result = await paginate(Student, filter, {
    page: query.page,
    limit: query.limit,
    sort: { name: 1 },
    populate: [{ path: "parentIds", select: "name email phone" }, schoolPopulate],
  });
  return { items: result.items.map((item) => presentStudent(item)), meta: result.meta };
}

export async function createStudent(user: AuthUser, input: z.infer<typeof studentSchema>) {
  const schoolId = requireSchoolId(user, input.schoolId);
  await assertParents(schoolId, input.parentIds);
  const student = await Student.create({
    schoolId,
    studentCode: input.studentCode,
    name: input.name,
    className: input.className,
    division: input.division,
    photoUrl: input.photoUrl || "",
    parentIds: input.parentIds,
    status: input.status ?? "ACTIVE",
    parentConsent: {
      granted: input.parentConsent?.granted ?? false,
      grantedAt: input.parentConsent?.granted ? new Date() : undefined,
      notes: input.parentConsent?.notes || "",
    },
  });
  await writeAudit({
    schoolId,
    actorId: user.id,
    action: "STUDENT_CREATED",
    entityType: "Student",
    entityId: String(student._id),
    after: { studentCode: student.studentCode, consent: student.parentConsent?.granted ?? false },
  });
  const saved = await Student.findById(student._id).populate(schoolPopulate).lean();
  return presentStudent(saved);
}

export async function getStudent(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const student = await Student.findOne({ _id: id, schoolId: tenant })
    .populate("parentIds", "name email phone")
    .populate(schoolPopulate)
    .lean();
  if (!student) throw notFound("Student");
  return presentStudent(student);
}

export async function updateStudent(user: AuthUser, id: string, input: z.infer<typeof updateStudentSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, input.schoolId || schoolId);
  const student = await Student.findOne({ _id: id, schoolId: tenant });
  if (!student) throw notFound("Student");
  if (input.parentIds) await assertParents(tenant, input.parentIds);
  if (input.studentCode) student.studentCode = input.studentCode;
  if (input.name) student.name = input.name;
  if (input.className) student.className = input.className;
  if (input.division != null) student.division = input.division;
  if (input.photoUrl != null) student.photoUrl = input.photoUrl;
  if (input.parentIds) student.parentIds = input.parentIds;
  if (input.status) student.status = input.status;
  if (input.parentConsent) {
    student.parentConsent = {
      granted: input.parentConsent.granted,
      grantedAt: input.parentConsent.granted ? student.parentConsent?.grantedAt || new Date() : undefined,
      notes: input.parentConsent.notes || "",
    };
  }
  await student.save();
  await writeAudit({
    schoolId: tenant,
    actorId: user.id,
    action: "STUDENT_UPDATED",
    entityType: "Student",
    entityId: String(student._id),
    after: { status: student.status, consent: student.parentConsent?.granted ?? false },
  });
  const saved = await Student.findById(student._id).populate(schoolPopulate).lean();
  return presentStudent(saved);
}

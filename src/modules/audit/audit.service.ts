import { AuditLog } from "@/models/ops";
import { serialize } from "@/utils/serialize";

export async function writeAudit(input: {
  schoolId?: string | null;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
}) {
  const entry = await AuditLog.create({
    schoolId: input.schoolId || null,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    reason: input.reason || "",
    before: input.before ?? null,
    after: input.after ?? null,
  });
  return serialize(entry.toObject());
}

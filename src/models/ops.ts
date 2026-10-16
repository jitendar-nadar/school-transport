import { Schema } from "mongoose";
import { registerModel } from "@/models/common";

const notificationSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    recipientUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", default: null },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", default: null },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    deliveryStatus: { type: String, enum: ["PENDING", "SENT", "FAILED", "SKIPPED"], default: "PENDING" },
    deduplicationKey: { type: String, required: true, unique: true },
    occurredAt: { type: Date, required: true },
    historical: { type: Boolean, default: false },
    sentAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
notificationSchema.index({ schoolId: 1, createdAt: -1 });
notificationSchema.index({ tripId: 1, type: 1 });
export const Notification = registerModel("Notification", notificationSchema);

const jobSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true },
    notificationId: { type: Schema.Types.ObjectId, ref: "Notification", required: true },
    status: { type: String, enum: ["PENDING", "SENT", "FAILED"], default: "PENDING" },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
);
jobSchema.index({ status: 1, nextAttemptAt: 1 });
export const NotificationJob = registerModel("NotificationJob", jobSchema);

const deviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fcmToken: { type: String, required: true },
    platform: { type: String, enum: ["ANDROID", "IOS", "WEB"], required: true },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
deviceSchema.index({ userId: 1, fcmToken: 1 }, { unique: true });
export const PushDevice = registerModel("PushDevice", deviceSchema);

const auditSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", default: null, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    reason: { type: String, default: "" },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ schoolId: 1, createdAt: -1 });
auditSchema.index({ entityType: 1, entityId: 1 });
export const AuditLog = registerModel("AuditLog", auditSchema);

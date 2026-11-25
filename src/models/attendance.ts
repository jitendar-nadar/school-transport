import { Schema } from "mongoose";
import { registerModel } from "@/models/common";

const schema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    workDate: { type: String, required: true },
    checkedInAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    checkedOutAt: { type: Date, default: null },
    presence: { type: String, enum: ["NOT_ARRIVED", "IN_OFFICE", "AWAY", "CHECKED_OUT"], default: "NOT_ARRIVED" },
    source: { type: String, enum: ["GATEWAY", "PHONE"], default: "GATEWAY" },
    closedBy: { type: String, enum: ["LAST_SEEN", "PHONE", "SHIFT_END"], default: null },
    fieldLatitude: { type: Number, default: null },
    fieldLongitude: { type: Number, default: null },
    fieldInLatitude: { type: Number, default: null },
    fieldInLongitude: { type: Number, default: null },
    fieldSite: { type: String, default: "" },
    fieldReview: { type: String, enum: ["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"], default: "NOT_REQUIRED" },
    fieldReviewNote: { type: String, default: "" },
    fieldReviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    fieldReviewedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "attendancedays" },
);

schema.index({ companyId: 1, employeeId: 1, workDate: 1 }, { unique: true });
schema.index({ companyId: 1, fieldReview: 1 });

export const AttendanceDay = registerModel("AttendanceDay", schema);

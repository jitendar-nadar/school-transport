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
  },
  { timestamps: true, collection: "attendancedays" },
);

schema.index({ companyId: 1, employeeId: 1, workDate: 1 }, { unique: true });

export const AttendanceDay = registerModel("AttendanceDay", schema);

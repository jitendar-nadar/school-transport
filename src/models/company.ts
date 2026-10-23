import { Schema } from "mongoose";
import { registerModel } from "@/models/common";

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    companyCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    address: { type: String, default: "" },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    gracePeriodMinutes: { type: Number, default: 15, min: 1 },
    shiftStart: { type: String, default: "09:30" },
    shiftEnd: { type: String, default: "18:30" },
    lunchStart: { type: String, default: "13:00" },
    lunchEnd: { type: String, default: "14:00" },
    lunchCountsAsPersonal: { type: Boolean, default: false },
    reviewWindowHours: { type: Number, default: 48, min: 1 },
    fieldCheckInAllowed: { type: Boolean, default: false },
    monitoringPolicy: { type: String, default: "" },
    status: { type: String, enum: ["TRIAL", "ACTIVE", "SUSPENDED"], default: "TRIAL" },
  },
  { timestamps: true, collection: "companies" },
);
export const Company = registerModel("Company", companySchema);

const departmentSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: "departments" },
);
departmentSchema.index({ companyId: 1, name: 1 }, { unique: true });
export const Department = registerModel("Department", departmentSchema);

const employeeSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    employeeCode: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, default: "", lowercase: true, trim: true },
    phone: { type: String, default: "" },
    tagIdentifier: { type: String, default: "", trim: true },
    workMode: { type: String, enum: ["OFFICE", "FIELD"], default: "OFFICE" },
    consentGranted: { type: Boolean, default: false },
    consentAt: { type: Date, default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true, collection: "employees" },
);
employeeSchema.index({ companyId: 1, employeeCode: 1 }, { unique: true });
employeeSchema.index({ tagIdentifier: 1 }, { unique: true, partialFilterExpression: { tagIdentifier: { $gt: "" } } });
export const Employee = registerModel("Employee", employeeSchema);

const gapSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    reason: { type: String, default: "" },
    countsAsPersonal: { type: Boolean, default: true },
    personalMinutes: { type: Number, default: 0, min: 0 },
    reviewDeadline: { type: Date, default: null },
    source: { type: String, enum: ["GATEWAY", "MANUAL"], default: "MANUAL" },
    resolutionNote: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["OPEN", "DISPUTED", "APPROVED", "REJECTED"], default: "OPEN" },
  },
  { timestamps: true, collection: "attendancegaps" },
);
export const AttendanceGap = registerModel("AttendanceGap", gapSchema);

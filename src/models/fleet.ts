import { Schema } from "mongoose";
import { pointSchema, registerModel } from "@/models/common";

const vehicleSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    vehicleNumber: { type: String, required: true, trim: true },
    vehicleType: { type: String, enum: ["BUS", "VAN"], required: true },
    capacity: { type: Number, required: true, min: 1 },
    driverIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    attendantIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    status: { type: String, enum: ["ACTIVE", "MAINTENANCE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true },
);
vehicleSchema.index({ schoolId: 1, vehicleNumber: 1 }, { unique: true });
export const Vehicle = registerModel("Vehicle", vehicleSchema);

const stopSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, default: "" },
    location: { type: pointSchema, required: true },
    geofenceRadiusMeters: { type: Number, default: 80, min: 20 },
    stopType: { type: String, enum: ["PICKUP", "DROP", "SCHOOL"], required: true },
  },
  { timestamps: true },
);
stopSchema.index({ location: "2dsphere" });
stopSchema.index({ schoolId: 1, name: 1 });
export const Stop = registerModel("Stop", stopSchema);

const routeSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
    routeCode: { type: String, required: true, trim: true, uppercase: true },
    direction: { type: String, enum: ["PICKUP", "DROP"], required: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    stops: [{ type: Schema.Types.ObjectId, ref: "Stop" }],
    scheduledStartTime: { type: String, required: true },
    scheduledEndTime: { type: String, required: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true },
);
routeSchema.index({ schoolId: 1, routeCode: 1 }, { unique: true });
routeSchema.index({ schoolId: 1, vehicleId: 1, status: 1 });
export const Route = registerModel("Route", routeSchema);

const assignmentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    morningRouteId: { type: Schema.Types.ObjectId, ref: "Route", default: null },
    morningStopId: { type: Schema.Types.ObjectId, ref: "Stop", default: null },
    afternoonRouteId: { type: Schema.Types.ObjectId, ref: "Route", default: null },
    afternoonStopId: { type: Schema.Types.ObjectId, ref: "Stop", default: null },
    status: { type: String, enum: ["ACTIVE", "ENDED"], default: "ACTIVE" },
    effectiveFrom: { type: Date, default: null },
    effectiveUntil: { type: Date, default: null },
  },
  { timestamps: true },
);
assignmentSchema.index(
  { studentId: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" } },
);
assignmentSchema.index({ schoolId: 1, morningRouteId: 1, status: 1 });
assignmentSchema.index({ schoolId: 1, afternoonRouteId: 1, status: 1 });
export const Assignment = registerModel("Assignment", assignmentSchema);

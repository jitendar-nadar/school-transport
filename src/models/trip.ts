import { Schema } from "mongoose";
import { pointSchema, registerModel } from "@/models/common";

const locationSnapshot = new Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: undefined },
    accuracyMeters: { type: Number },
    heading: { type: Number },
    speedKmh: { type: Number },
    updatedAt: { type: Date },
  },
  { _id: false },
);

const tripSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    routeId: { type: Schema.Types.ObjectId, ref: "Route", required: true },
    driverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    attendantId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    direction: { type: String, enum: ["PICKUP", "DROP"], required: true },
    scheduledDate: { type: String, required: true },
    startedAt: { type: Date },
    endedAt: { type: Date },
    status: { type: String, enum: ["SCHEDULED", "ACTIVE", "COMPLETED", "CANCELLED"], default: "ACTIVE" },
    totalAssignedStudents: { type: Number, default: 0 },
    totalBoarded: { type: Number, default: 0 },
    totalDropped: { type: Number, default: 0 },
    lastKnownLocation: { type: locationSnapshot, default: undefined },
    schoolArrivalAt: { type: Date, default: null },
    safetyOverrideReason: { type: String, default: "" },
  },
  { timestamps: true },
);
tripSchema.index(
  { vehicleId: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" } },
);
tripSchema.index({ schoolId: 1, status: 1, scheduledDate: -1 });
tripSchema.index({ driverId: 1, status: 1 });
tripSchema.index({ attendantId: 1, status: 1 });
export const Trip = registerModel("Trip", tripSchema);

const tripStudentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    assignedStopId: { type: Schema.Types.ObjectId, ref: "Stop", default: null },
    boardingStatus: { type: String, enum: ["NOT_BOARDED", "DETECTED", "BOARDED"], default: "NOT_BOARDED" },
    dropStatus: { type: String, enum: ["NOT_DROPPED", "DROPPED"], default: "NOT_DROPPED" },
    boardedAt: { type: Date },
    boardedLocation: { type: pointSchema, default: undefined },
    droppedAt: { type: Date },
    droppedLocation: { type: pointSchema, default: undefined },
    boardingVerificationMethod: { type: String, default: "" },
    dropVerificationMethod: { type: String, default: "" },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastDetectedAt: { type: Date },
    lastRssi: { type: Number },
    notificationsEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);
tripStudentSchema.index({ tripId: 1, studentId: 1 }, { unique: true });
tripStudentSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });
export const TripStudent = registerModel("TripStudent", tripStudentSchema);

const tripEventSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", default: null },
    eventId: { type: String, default: undefined },
    type: { type: String, required: true },
    message: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    occurredAt: { type: Date, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
tripEventSchema.index(
  { tripId: 1, eventId: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: "string" } } },
);
tripEventSchema.index({ tripId: 1, occurredAt: 1 });
export const TripEvent = registerModel("TripEvent", tripEventSchema);

const detectionSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    eventId: { type: String, required: true },
    tagIdentifier: { type: String, required: true },
    resolvedStudentId: { type: Schema.Types.ObjectId, ref: "Student", default: null },
    receiverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rssi: { type: Number, required: true },
    detectedAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true },
    location: { type: pointSchema, default: undefined },
    processingStatus: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
detectionSchema.index({ tripId: 1, eventId: 1 }, { unique: true });
detectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const BleDetection = registerModel("BleDetection", detectionSchema);

const historySchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    location: { type: pointSchema, required: true },
    heading: { type: Number },
    speedKmh: { type: Number },
    accuracyMeters: { type: Number },
    recordedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
export const TripLocationHistory = registerModel("TripLocationHistory", historySchema);

import { Schema } from "mongoose";
import { registerModel } from "@/models/common";

const gateSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: "gates" },
);
gateSchema.index({ schoolId: 1, name: 1 }, { unique: true });
export const Gate = registerModel("Gate", gateSchema);

const gateNodeSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    gateId: { type: Schema.Types.ObjectId, ref: "Gate", required: true, index: true },
    name: { type: String, required: true, trim: true },
    side: { type: String, enum: ["OUTSIDE", "INSIDE"], required: true },
    hardwareId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    lastContactAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "gatenodes" },
);
gateNodeSchema.index({ gateId: 1, side: 1, status: 1 });
export const GateNode = registerModel("GateNode", gateNodeSchema);

const gateSightingSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    gateId: { type: Schema.Types.ObjectId, ref: "Gate", required: true, index: true },
    nodeId: { type: Schema.Types.ObjectId, ref: "GateNode", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    tagIdentifier: { type: String, required: true, trim: true },
    side: { type: String, enum: ["OUTSIDE", "INSIDE"], required: true },
    rssi: { type: Number, default: null },
    heardAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, collection: "gatesightings" },
);
gateSightingSchema.index({ studentId: 1, gateId: 1, side: 1, heardAt: -1 });
export const GateSighting = registerModel("GateSighting", gateSightingSchema);

const campusEventSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    gateId: { type: Schema.Types.ObjectId, ref: "Gate", default: null },
    day: { type: String, required: true, index: true },
    direction: { type: String, enum: ["ENTRY", "EXIT"], required: true },
    source: { type: String, enum: ["NODES", "MANUAL"], default: "NODES" },
    reason: { type: String, default: "" },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    earlyExit: { type: Boolean, default: false },
    occurredAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "campusevents" },
);
campusEventSchema.index({ schoolId: 1, day: 1, studentId: 1, occurredAt: -1 });
export const CampusEvent = registerModel("CampusEvent", campusEventSchema);

const campusDaySchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    day: { type: String, required: true },
    presence: { type: String, enum: ["NOT_ARRIVED", "IN_CAMPUS", "OUT"], default: "NOT_ARRIVED" },
    enteredAt: { type: Date, default: null },
    exitedAt: { type: Date, default: null },
    lastEventAt: { type: Date, default: null },
    lastDirection: { type: String, enum: ["ENTRY", "EXIT"], default: null },
    leftEarly: { type: Boolean, default: false },
    absenceAlertedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "campusdays" },
);
campusDaySchema.index({ schoolId: 1, day: 1, studentId: 1 }, { unique: true });
export const CampusDay = registerModel("CampusDay", campusDaySchema);

const classSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
    division: { type: String, default: "", trim: true },
  },
  { timestamps: true, collection: "schoolclasses" },
);
classSchema.index({ schoolId: 1, name: 1, division: 1 }, { unique: true });
export const SchoolClass = registerModel("SchoolClass", classSchema);

const tourSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
    tripDate: { type: String, required: true },
    status: {
      type: String,
      enum: ["PLANNED", "DEPARTED", "AT_DESTINATION", "RETURNING", "COMPLETED", "CANCELLED", "ACTIVE"],
      default: "PLANNED",
    },
    leadCoordinatorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    watchMinutes: { type: Number, default: 15, min: 1, max: 180 },
    departedAt: { type: Date, default: null },
    reachedDestinationAt: { type: Date, default: null },
    returningAt: { type: Date, default: null },
    reachedSchoolAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "tours" },
);
tourSchema.index({ schoolId: 1, tripDate: -1 });
export const Tour = registerModel("Tour", tourSchema);

const tourBusSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true, index: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    label: { type: String, default: "", trim: true },
    coordinatorIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true, collection: "tourbuses" },
);
tourBusSchema.index({ tourId: 1, vehicleId: 1 }, { unique: true });
export const TourBus = registerModel("TourBus", tourBusSchema);

const tourStudentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true, index: true },
    tourBusId: { type: Schema.Types.ObjectId, ref: "TourBus", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    status: {
      type: String,
      enum: ["EXPECTED", "PRESENT", "MISSING", "FOUND", "WRONG_BUS"],
      default: "EXPECTED",
    },
    lastSeenAt: { type: Date, default: null },
    lastSeenByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastSeenLatitude: { type: Number, default: null },
    lastSeenLongitude: { type: Number, default: null },
    lastSeenPhotoUrl: { type: String, default: "" },
    missingAlertedAt: { type: Date, default: null },
    watchAlertedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "tourstudents" },
);
tourStudentSchema.index({ tourId: 1, studentId: 1 }, { unique: true });
tourStudentSchema.index({ tourBusId: 1, status: 1 });
export const TourStudent = registerModel("TourStudent", tourStudentSchema);

const headcountSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true, index: true },
    tourBusId: { type: Schema.Types.ObjectId, ref: "TourBus", default: null, index: true },
    takenByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    phase: {
      type: String,
      enum: ["BOARDING", "STOP", "DESTINATION", "RETURN", "OTHER"],
      default: "OTHER",
    },
    stopLabel: { type: String, default: "", trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    presentCount: { type: Number, default: 0, min: 0 },
    presentStudentIds: [{ type: Schema.Types.ObjectId, ref: "Student" }],
    missingStudentIds: [{ type: Schema.Types.ObjectId, ref: "Student" }],
    wrongBusStudentIds: [{ type: Schema.Types.ObjectId, ref: "Student" }],
    foundManualStudentIds: [{ type: Schema.Types.ObjectId, ref: "Student" }],
    note: { type: String, default: "" },
    source: { type: String, enum: ["SCAN", "MANUAL_ADMIN", "MANUAL_COORDINATOR"], default: "MANUAL_ADMIN" },
    takenAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "tourheadcounts" },
);
export const TourHeadcount = registerModel("TourHeadcount", headcountSchema);

const tourIncidentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true, index: true },
    tourBusId: { type: Schema.Types.ObjectId, ref: "TourBus", default: null },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", default: null },
    type: {
      type: String,
      enum: ["MISSING", "FOUND", "WRONG_BUS", "WATCH_TIMEOUT"],
      required: true,
    },
    message: { type: String, required: true, trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    lastSeenAt: { type: Date, default: null },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    occurredAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "tourincidents" },
);
tourIncidentSchema.index({ tourId: 1, occurredAt: -1 });
export const TourIncident = registerModel("TourIncident", tourIncidentSchema);

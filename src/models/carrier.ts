import { Schema } from "mongoose";
import { registerModel } from "@/models/common";

const fleetSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    fleetCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    address: { type: String, default: "" },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    status: { type: String, enum: ["TRIAL", "ACTIVE", "SUSPENDED"], default: "TRIAL" },
  },
  { timestamps: true, collection: "fleets" },
);
export const FleetAccount = registerModel("FleetAccount", fleetSchema);

const truckSchema = new Schema(
  {
    fleetId: { type: Schema.Types.ObjectId, ref: "FleetAccount", required: true, index: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    status: { type: String, enum: ["ACTIVE", "MAINTENANCE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true, collection: "trucks" },
);
truckSchema.index({ fleetId: 1, registrationNumber: 1 }, { unique: true });
export const Truck = registerModel("Truck", truckSchema);

const trackerSchema = new Schema(
  {
    fleetId: { type: Schema.Types.ObjectId, ref: "FleetAccount", required: true, index: true },
    truckId: { type: Schema.Types.ObjectId, ref: "Truck", required: true },
    imei: { type: String, required: true, unique: true, trim: true },
    certification: { type: String, enum: ["STANDARD", "AIS140"], default: "STANDARD" },
    status: { type: String, enum: ["ACTIVE", "OFFLINE", "RETIRED"], default: "ACTIVE" },
    lastLatitude: { type: Number, default: null },
    lastLongitude: { type: Number, default: null },
    lastSpeedKmh: { type: Number, default: null },
    lastIgnition: { type: Boolean, default: null },
    lastUnplugged: { type: Boolean, default: false },
    lastHeading: { type: Number, default: null },
    lastRecordedAt: { type: Date, default: null },
    lastReceivedAt: { type: Date, default: null },
    alertState: {
      insideGeofenceIds: { type: [String], default: [] },
      stopSince: { type: Date, default: null },
      longStopAlerted: { type: Boolean, default: false },
      overspeedAlerted: { type: Boolean, default: false },
      deviationAlerted: { type: Boolean, default: false },
      unpluggedAlerted: { type: Boolean, default: false },
      offlineAlerted: { type: Boolean, default: false },
    },
  },
  { timestamps: true, collection: "trackers" },
);
export const Tracker = registerModel("Tracker", trackerSchema);

const pointSchema = new Schema(
  {
    fleetId: { type: Schema.Types.ObjectId, ref: "FleetAccount", required: true, index: true },
    truckId: { type: Schema.Types.ObjectId, ref: "Truck", required: true, index: true },
    trackerId: { type: Schema.Types.ObjectId, ref: "Tracker", required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    speedKmh: { type: Number, default: 0 },
    ignition: { type: Boolean, default: null },
    heading: { type: Number, default: null },
    unplugged: { type: Boolean, default: false },
    recordedAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true },
  },
  { timestamps: false, collection: "trackerpoints" },
);
pointSchema.index({ trackerId: 1, recordedAt: 1 }, { unique: true });
pointSchema.index({ fleetId: 1, truckId: 1, recordedAt: 1 });
export const TrackerPoint = registerModel("TrackerPoint", pointSchema);

const geofenceSchema = new Schema(
  {
    fleetId: { type: Schema.Types.ObjectId, ref: "FleetAccount", required: true, index: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["DEPOT", "CUSTOMER"], required: true },
    address: { type: String, default: "" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    radiusMeters: { type: Number, default: 150, min: 30 },
  },
  { timestamps: true, collection: "fleetgeofences" },
);
export const FleetGeofence = registerModel("FleetGeofence", geofenceSchema);

const routePointSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    label: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { _id: false },
);

const tripSchema = new Schema(
  {
    fleetId: { type: Schema.Types.ObjectId, ref: "FleetAccount", required: true, index: true },
    truckId: { type: Schema.Types.ObjectId, ref: "Truck", required: true },
    origin: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    route: { type: [routePointSchema], default: [] },
    status: { type: String, enum: ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"], default: "PLANNED" },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "fleettrips" },
);
export const FleetTrip = registerModel("FleetTrip", tripSchema);

const alertSchema = new Schema(
  {
    fleetId: { type: Schema.Types.ObjectId, ref: "FleetAccount", required: true, index: true },
    truckId: { type: Schema.Types.ObjectId, ref: "Truck", required: true },
    tripId: { type: Schema.Types.ObjectId, ref: "FleetTrip", default: null },
    geofenceId: { type: Schema.Types.ObjectId, ref: "FleetGeofence", default: null },
    type: {
      type: String,
      enum: ["GEOFENCE_ENTER", "GEOFENCE_EXIT", "LONG_STOP", "OVERSPEED", "ROUTE_DEVIATION", "UNPLUGGED", "OFFLINE"],
      required: true,
    },
    message: { type: String, required: true },
    recordedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "fleetalerts" },
);
alertSchema.index({ fleetId: 1, recordedAt: -1 });
export const FleetAlert = registerModel("FleetAlert", alertSchema);

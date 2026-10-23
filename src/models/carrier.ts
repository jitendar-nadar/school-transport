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
    status: { type: String, enum: ["ACTIVE", "OFFLINE", "RETIRED"], default: "ACTIVE" },
  },
  { timestamps: true, collection: "trackers" },
);
export const Tracker = registerModel("Tracker", trackerSchema);

const geofenceSchema = new Schema(
  {
    fleetId: { type: Schema.Types.ObjectId, ref: "FleetAccount", required: true, index: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["DEPOT", "CUSTOMER"], required: true },
    address: { type: String, default: "" },
  },
  { timestamps: true, collection: "fleetgeofences" },
);
export const FleetGeofence = registerModel("FleetGeofence", geofenceSchema);

const tripSchema = new Schema(
  {
    fleetId: { type: Schema.Types.ObjectId, ref: "FleetAccount", required: true, index: true },
    truckId: { type: Schema.Types.ObjectId, ref: "Truck", required: true },
    origin: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    status: { type: String, enum: ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"], default: "PLANNED" },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "fleettrips" },
);
export const FleetTrip = registerModel("FleetTrip", tripSchema);

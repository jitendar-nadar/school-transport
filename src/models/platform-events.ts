import { Schema } from "mongoose";
import { pointSchema, registerModel } from "@/models/common";

const owner = {
  ownerType: { type: String, enum: ["SCHOOL", "COMPANY", "FLEET"], required: true },
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
};

const gatewaySchema = new Schema(
  {
    ...owner,
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["GATE_OUTSIDE", "GATE_INSIDE", "OFFICE", "BUS"], required: true },
    zone: { type: String, enum: ["FLOOR", "MEETING_ROOM", "CAFETERIA", "CORRIDOR", "OTHER"], default: "FLOOR" },
    lastHeartbeatAt: { type: Date, default: null },
    status: { type: String, enum: ["ACTIVE", "OFFLINE"], default: "ACTIVE" },
  },
  { timestamps: true, collection: "gateways" },
);
export const Gateway = registerModel("Gateway", gatewaySchema);

const detectionSchema = new Schema(
  {
    ...owner,
    tagIdentifier: { type: String, required: true, trim: true },
    gatewayId: { type: Schema.Types.ObjectId, ref: "Gateway", default: null },
    occurredAt: { type: Date, required: true },
    rssi: { type: Number, default: null },
    location: { type: pointSchema, default: undefined },
  },
  { timestamps: true, collection: "detectionevents" },
);
detectionSchema.index({ ownerType: 1, ownerId: 1, occurredAt: -1 });
detectionSchema.index({ tagIdentifier: 1, occurredAt: -1 });
export const DetectionEvent = registerModel("DetectionEvent", detectionSchema);

const gpsSchema = new Schema(
  {
    ...owner,
    vehicleRef: { type: Schema.Types.ObjectId, required: true },
    tripRef: { type: Schema.Types.ObjectId, default: null },
    location: { type: pointSchema, required: true },
    speedKmh: { type: Number, default: null },
    recordedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "gpspoints" },
);
gpsSchema.index({ ownerType: 1, ownerId: 1, recordedAt: -1 });
export const GpsPoint = registerModel("GpsPoint", gpsSchema);

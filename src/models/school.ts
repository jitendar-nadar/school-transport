import { Schema } from "mongoose";
import { pointSchema, registerModel } from "@/models/common";

const settingsSchema = new Schema(
  {
    trackingIntervalSeconds: { type: Number, default: 8 },
    proximityRadiusMeters: { type: Number, default: 300 },
    schoolGeofenceMeters: { type: Number, default: 150 },
    gpsAccuracyMaxMeters: { type: Number, default: 80 },
    gpsMaxAgeSeconds: { type: Number, default: 120 },
    locationSampleSeconds: { type: Number, default: 60 },
    notificationTimezone: { type: String, default: "Asia/Kolkata" },
    bleDetectionRetentionDays: { type: Number, default: 30 },
    notificationsEnabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const subscriptionSchema = new Schema(
  {
    plan: { type: String, default: "PILOT" },
    status: { type: String, enum: ["ACTIVE", "PAST_DUE", "CANCELLED"], default: "ACTIVE" },
    expiresAt: { type: Date },
  },
  { _id: false },
);

const schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    schoolCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    address: { type: String, default: "" },
    location: { type: pointSchema, required: true },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    settings: { type: settingsSchema, default: () => ({}) },
    subscription: { type: subscriptionSchema, default: () => ({}) },
    status: { type: String, enum: ["TRIAL", "ACTIVE", "SUSPENDED"], default: "TRIAL" },
  },
  { timestamps: true },
);

schema.index({ location: "2dsphere" });
schema.index({ status: 1 });

export const School = registerModel("School", schema);

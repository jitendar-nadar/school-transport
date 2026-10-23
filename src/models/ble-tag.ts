import { Schema } from "mongoose";
import { registerModel } from "@/models/common";

const schema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    tagIdentifier: { type: String, required: true, unique: true, trim: true },
    aliasIdentifiers: [{ type: String, trim: true }],
    studentId: { type: Schema.Types.ObjectId, ref: "Student", default: null },
    tagType: { type: String, default: "CARD" },
    batteryStatus: { type: String, enum: ["UNKNOWN", "GOOD", "LOW", "REPLACE"], default: "UNKNOWN" },
    status: { type: String, enum: ["UNASSIGNED", "ACTIVE", "INACTIVE", "LOST", "RETIRED"], default: "UNASSIGNED" },
    assignedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, status: 1 });
schema.index({ studentId: 1 });
schema.index({ aliasIdentifiers: 1 });

export const BleTag = registerModel("BleTag", schema);

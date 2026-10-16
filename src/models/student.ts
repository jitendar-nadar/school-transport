import { Schema } from "mongoose";
import { registerModel } from "@/models/common";

const consentSchema = new Schema(
  {
    granted: { type: Boolean, default: false },
    grantedAt: { type: Date },
    notes: { type: String, default: "" },
  },
  { _id: false },
);

const schema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    studentCode: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    className: { type: String, required: true, trim: true },
    division: { type: String, default: "", trim: true },
    photoUrl: { type: String, default: "" },
    parentIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    bleTagId: { type: Schema.Types.ObjectId, ref: "BleTag", default: null },
    parentConsent: { type: consentSchema, default: () => ({ granted: false }) },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, studentCode: 1 }, { unique: true });
schema.index({ schoolId: 1, name: 1 });
schema.index({ parentIds: 1 });
schema.index({ bleTagId: 1 });

export const Student = registerModel("Student", schema);

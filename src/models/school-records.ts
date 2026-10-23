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
    status: { type: String, enum: ["PLANNED", "ACTIVE", "COMPLETED"], default: "PLANNED" },
  },
  { timestamps: true, collection: "tours" },
);
export const Tour = registerModel("Tour", tourSchema);

const headcountSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true, index: true },
    presentCount: { type: Number, required: true, min: 0 },
    note: { type: String, default: "" },
    takenAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "tourheadcounts" },
);
export const TourHeadcount = registerModel("TourHeadcount", headcountSchema);

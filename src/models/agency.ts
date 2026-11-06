import { Schema } from "mongoose";
import { registerModel } from "@/models/common";

const agencySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    agencyCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    address: { type: String, default: "" },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    status: { type: String, enum: ["TRIAL", "ACTIVE", "SUSPENDED"], default: "TRIAL" },
    schoolIds: [{ type: Schema.Types.ObjectId, ref: "School" }],
    companyIds: [{ type: Schema.Types.ObjectId, ref: "Company" }],
  },
  { timestamps: true, collection: "agencies" },
);
agencySchema.index({ schoolIds: 1 });
agencySchema.index({ companyIds: 1 });
export const TransportAgency = registerModel("TransportAgency", agencySchema);

const agencyVehicleSchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: "TransportAgency", required: true, index: true },
    vehicleNumber: { type: String, required: true, trim: true, uppercase: true },
    vehicleType: { type: String, enum: ["BUS", "VAN"], required: true },
    capacity: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["ACTIVE", "MAINTENANCE", "INACTIVE"], default: "ACTIVE" },
    schoolIds: [{ type: Schema.Types.ObjectId, ref: "School" }],
    companyIds: [{ type: Schema.Types.ObjectId, ref: "Company" }],
  },
  { timestamps: true, collection: "agencyvehicles" },
);
agencyVehicleSchema.index({ agencyId: 1, vehicleNumber: 1 }, { unique: true });
agencyVehicleSchema.index({ companyIds: 1 });
export const AgencyVehicle = registerModel("AgencyVehicle", agencyVehicleSchema);

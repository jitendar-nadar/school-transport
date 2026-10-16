import { Schema } from "mongoose";
import { registerModel } from "@/models/common";

const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    userAgent: { type: String, default: "" },
  },
  { _id: false },
);

const schema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", default: null, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ["PLATFORM_ADMIN", "SCHOOL_ADMIN", "DRIVER", "ATTENDANT", "PARENT"],
    },
    status: { type: String, enum: ["ACTIVE", "DISABLED"], default: "ACTIVE" },
    refreshTokenSessions: { type: [sessionSchema], default: [] },
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, role: 1, status: 1 });
schema.index({ phone: 1 });

export const User = registerModel("User", schema);

import mongoose, { type Model, type Schema } from "mongoose";

/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose 9 model unions are not safely callable without a loose model type. */
export function registerModel(name: string, schema: Schema): Model<any> {
  const models = mongoose.models as unknown as Record<string, Model<any>>;
  if (models[name]) return models[name];
  return mongoose.model(name, schema) as unknown as Model<any>;
}

export const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point", required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

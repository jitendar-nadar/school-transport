import { Schema } from "mongoose";
import { registerModel } from "@/models/common";
import { allMetrics, billingEntityTypes, cycles } from "@/modules/billing/billing-rules";

const rateSchema = new Schema(
  {
    metric: { type: String, enum: allMetrics, required: true },
    ratePaise: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "PLATFORM" },
    legalName: { type: String, required: true, trim: true },
    address: { type: String, default: "" },
    stateCode: { type: String, required: true },
    gstin: { type: String, default: "", uppercase: true, trim: true },
    pan: { type: String, default: "", uppercase: true, trim: true },
    email: { type: String, default: "", lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true },
    invoicePrefix: { type: String, default: "PT", uppercase: true, trim: true },
    paymentTermsDays: { type: Number, default: 15, min: 0 },
    bankDetails: { type: String, default: "" },
    sacCode: { type: String, default: "", trim: true },
  },
  { timestamps: true, collection: "billing_settings" },
);
export const BillingSettings = registerModel("BillingSettings", settingsSchema);

const planSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    entityType: { type: String, enum: billingEntityTypes, required: true, index: true },
    description: { type: String, default: "" },
    baseFeePaise: { type: Number, default: 0, min: 0 },
    rates: { type: [rateSchema], default: [] },
    status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE" },
  },
  { timestamps: true, collection: "billing_plans" },
);
export const BillingPlan = registerModel("BillingPlan", planSchema);

const billToSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, default: "" },
    gstin: { type: String, default: "", uppercase: true, trim: true },
    stateCode: { type: String, required: true },
    email: { type: String, default: "", lowercase: true, trim: true },
  },
  { _id: false },
);

const subscriptionSchema = new Schema(
  {
    entityType: { type: String, enum: billingEntityTypes, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    entityName: { type: String, required: true, trim: true },
    planId: { type: Schema.Types.ObjectId, ref: "BillingPlan", default: null },
    planName: { type: String, default: "" },
    cycle: { type: String, enum: cycles, default: "MONTHLY" },
    baseFeePaise: { type: Number, default: 0, min: 0 },
    rates: { type: [rateSchema], default: [] },
    startMonth: { type: String, required: true },
    status: { type: String, enum: ["ACTIVE", "PAUSED", "CANCELLED"], default: "ACTIVE" },
    billTo: { type: billToSchema, required: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true, collection: "subscriptions" },
);
subscriptionSchema.index({ entityType: 1, entityId: 1 }, { unique: true });
subscriptionSchema.index({ entityName: 1 });
export const Subscription = registerModel("Subscription", subscriptionSchema);

const lineSchema = new Schema(
  {
    code: { type: String, required: true },
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPricePaise: { type: Number, required: true },
    months: { type: Number, required: true },
    amountPaise: { type: Number, required: true },
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    number: { type: String, required: true, unique: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", required: true, index: true },
    entityType: { type: String, enum: billingEntityTypes, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    entityName: { type: String, required: true },
    activeKey: { type: String },
    periodStart: { type: String, required: true },
    periodEnd: { type: String, required: true },
    cycle: { type: String, enum: cycles, required: true },
    issueDate: { type: String, required: true },
    dueDate: { type: String, required: true },
    seller: { type: Schema.Types.Mixed, required: true },
    billTo: { type: billToSchema, required: true },
    planName: { type: String, default: "" },
    lines: { type: [lineSchema], default: [] },
    counts: { type: Schema.Types.Mixed, default: {} },
    countedAt: { type: Date, required: true },
    subtotalPaise: { type: Number, required: true },
    taxType: { type: String, enum: ["INTRA", "INTER"], required: true },
    taxRate: { type: Number, required: true },
    cgstPaise: { type: Number, default: 0 },
    sgstPaise: { type: Number, default: 0 },
    igstPaise: { type: Number, default: 0 },
    totalPaise: { type: Number, required: true },
    status: { type: String, enum: ["ISSUED", "PAID", "VOID"], default: "ISSUED" },
    payment: {
      type: new Schema(
        {
          paidOn: { type: String, required: true },
          method: { type: String, enum: ["BANK_TRANSFER", "UPI", "CHEQUE", "CASH", "OTHER"], required: true },
          reference: { type: String, default: "" },
          amountPaise: { type: Number, required: true },
          recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
        },
        { _id: false },
      ),
      default: null,
    },
    voidReason: { type: String, default: "" },
  },
  { timestamps: true, collection: "invoices" },
);
invoiceSchema.index({ activeKey: 1 }, { unique: true, partialFilterExpression: { activeKey: { $exists: true } } });
invoiceSchema.index({ entityType: 1, entityId: 1, periodStart: -1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
export const Invoice = registerModel("Invoice", invoiceSchema);

const counterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    sequence: { type: Number, default: 0 },
  },
  { collection: "invoice_counters" },
);
export const InvoiceCounter = registerModel("InvoiceCounter", counterSchema);

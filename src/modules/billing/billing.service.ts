import { z } from "zod";
import { AppError, isDuplicateKey, notFound } from "@/lib/errors/app-error";
import { paginate } from "@/lib/mongodb/paginate";
import { objectIdSchema } from "@/lib/validation/common";
import { BillingPlan, BillingSettings, Invoice, InvoiceCounter, Subscription } from "@/models/billing";
import { BleTag } from "@/models/ble-tag";
import { AgencyVehicle, TransportAgency } from "@/models/agency";
import { FleetAccount, Truck } from "@/models/carrier";
import { Company, Employee } from "@/models/company";
import { Vehicle } from "@/models/fleet";
import { Gateway } from "@/models/platform-events";
import { School } from "@/models/school";
import { Student } from "@/models/student";
import { writeAudit } from "@/modules/audit/audit.service";
import {
  addDays,
  allMetrics,
  billingEntityTypes,
  buildLines,
  calendarDate,
  cycles,
  entityTypeLabels,
  financialYear,
  formatPeriod,
  gstinMatchesState,
  gstinPattern,
  invoiceNumber,
  invoiceTotals,
  isMonth,
  metricsFor,
  nextPeriod,
  periodEnded,
  rupeesToPaise,
  type BillingEntityType,
  type Counts,
  type Cycle,
  type MetricRate,
  type Period,
} from "@/modules/billing/billing-rules";
import { gstStateCodes } from "@/modules/billing/gst-states";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { searchClause, serialize } from "@/utils/serialize";

const SETTINGS_KEY = "PLATFORM";
const MAX_BACKLOG_PERIODS = 24;

const money = z
  .number({ error: "Enter an amount." })
  .min(0, "must be 0 or more.")
  .max(10_000_000, "is too large.")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "Use at most 2 decimal places.");

const stateCode = z.enum(gstStateCodes as [string, ...string[]], { error: "Choose a state." });
const optionalEmail = z.union([z.literal(""), z.email("Enter a valid email address.")]).optional().default("");
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => value === "" || gstinPattern.test(value), "GSTIN must be 15 characters, like 27AAPFU0939F1ZV.")
  .optional()
  .default("");
const rates = z.array(z.object({ metric: z.enum(allMetrics), rate: money })).max(allMetrics.length).default([]);

export const settingsSchema = z.object({
  legalName: z.string().trim().min(2, "Legal name must be at least 2 characters.").max(200),
  address: z.string().trim().max(500).optional().default(""),
  stateCode,
  gstin,
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value), "PAN must be 10 characters, like AAPFU0939F.")
    .optional()
    .default(""),
  email: optionalEmail,
  phone: z.string().trim().max(20).optional().default(""),
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/, "Use up to 10 letters, numbers, or dashes."),
  paymentTermsDays: z.number({ error: "Enter the number of days." }).int().min(0).max(120, "Use 120 days or fewer."),
  bankDetails: z.string().trim().max(1000).optional().default(""),
  sacCode: z.string().trim().regex(/^(\d{6})?$/, "SAC code must be 6 digits.").optional().default(""),
});

export const planSchema = z.object({
  name: z.string().trim().min(2, "must be at least 2 characters.").max(80),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "Use 2 to 20 letters, numbers, or dashes."),
  entityType: z.enum(billingEntityTypes, { error: "Choose who the plan is for." }),
  description: z.string().trim().max(300).optional().default(""),
  baseFee: money,
  rates,
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional().default("ACTIVE"),
});

const subscriptionFields = z.object({
  planId: z.union([z.literal(""), objectIdSchema]).optional().default(""),
  cycle: z.enum(cycles, { error: "Choose a billing cycle." }),
  baseFee: money,
  rates,
  startMonth: z.string().refine(isMonth, "Choose the first month to bill."),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional().default("ACTIVE"),
  billingName: z.string().trim().min(2, "Billing name must be at least 2 characters.").max(200),
  billingAddress: z.string().trim().max(500).optional().default(""),
  gstin,
  stateCode,
  billingEmail: optionalEmail,
  notes: z.string().trim().max(500).optional().default(""),
});

export const createSubscriptionSchema = subscriptionFields.extend({
  entityType: z.enum(billingEntityTypes, { error: "Choose the entity type." }),
  entityId: z.string().regex(/^[a-f\d]{24}$/i, "Choose the entity."),
});

export const updateSubscriptionSchema = subscriptionFields;

export const paymentSchema = z.object({
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the payment date."),
  method: z.enum(["BANK_TRANSFER", "UPI", "CHEQUE", "CASH", "OTHER"], { error: "Choose how it was paid." }),
  reference: z.string().trim().max(120).optional().default(""),
});

export const voidSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(300),
});

export const invoiceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  state: z.enum(["UNPAID", "OVERDUE", "PAID", "VOID"]).optional(),
  subscriptionId: objectIdSchema.optional(),
});

export const subscriptionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  entityType: z.enum(billingEntityTypes).optional(),
});

export const unsubscribedQuerySchema = z.object({
  entityType: z.enum(billingEntityTypes).optional(),
});

export const planQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  entityType: z.enum(billingEntityTypes).optional(),
});

type RateInput = z.infer<typeof rates>;
type SubscriptionDoc = {
  _id: unknown;
  entityType: BillingEntityType;
  entityId: unknown;
  entityName: string;
  planName: string;
  cycle: Cycle;
  baseFeePaise: number;
  rates: MetricRate[];
  startMonth: string;
  status: string;
  billTo: { name: string; address: string; gstin: string; stateCode: string; email: string };
};
type SettingsDoc = z.infer<typeof settingsSchema>;

function fieldError(status: number, code: string, field: string, message: string) {
  return new AppError(status, code, message, { fieldErrors: { [field]: [message] } });
}

function requirePlatform(user: AuthUser) {
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "Only a platform admin can manage billing.");
}

function checkId(id: string, label: string) {
  if (!objectIdSchema.safeParse(id).success) throw new AppError(400, "INVALID_ID", `${label} id is invalid.`);
}

function today() {
  return calendarDate(new Date());
}

function ratesFor(entityType: BillingEntityType, input: RateInput): MetricRate[] {
  const allowed = metricsFor[entityType];
  const stray = input.find((rate) => !allowed.includes(rate.metric));
  if (stray) throw fieldError(422, "INVALID_RATE", "rates", `Use only rates that apply to ${entityTypeLabels[entityType].toLowerCase()} plans.`);
  return allowed.map((metric) => ({ metric, ratePaise: rupeesToPaise(input.find((rate) => rate.metric === metric)?.rate ?? 0) }));
}

function checkGstin(value: string, state: string) {
  if (value && !gstinMatchesState(value, state)) {
    throw fieldError(422, "GSTIN_STATE", "gstin", "GSTIN does not belong to the chosen state. Its first two digits are the state code.");
  }
}

const entityModels = { SCHOOL: School, COMPANY: Company, FLEET: FleetAccount, AGENCY: TransportAgency };

async function findEntity(entityType: BillingEntityType, entityId: string) {
  const entity = await entityModels[entityType].findById(entityId).select("name").lean<{ name: string } | null>();
  if (!entity) throw fieldError(422, "ENTITY_NOT_FOUND", "entityId", `Choose an existing ${entityTypeLabels[entityType].toLowerCase()}.`);
  return entity;
}

export async function countUnits(entityType: BillingEntityType, entityId: unknown): Promise<Counts> {
  if (entityType === "SCHOOL") {
    const [students, vehicles, cards] = await Promise.all([
      Student.countDocuments({ schoolId: entityId, status: "ACTIVE" }),
      Vehicle.countDocuments({ schoolId: entityId, status: { $ne: "INACTIVE" }, agencyId: null }),
      BleTag.countDocuments({ schoolId: entityId, status: "ACTIVE", agencyId: null }),
    ]);
    return { STUDENTS: students, SCHOOL_VEHICLES: vehicles, BLE_CARDS: cards };
  }
  if (entityType === "AGENCY") {
    const [vehicles, cards] = await Promise.all([
      AgencyVehicle.countDocuments({ agencyId: entityId, status: { $ne: "INACTIVE" } }),
      BleTag.countDocuments({ agencyId: entityId, status: "ACTIVE", $or: [{ studentId: { $ne: null } }, { employeeId: { $ne: null } }] }),
    ]);
    return { AGENCY_VEHICLES: vehicles, AGENCY_CARDS: cards };
  }
  if (entityType === "COMPANY") {
    const [employees, gateways] = await Promise.all([
      Employee.countDocuments({ companyId: entityId, status: "ACTIVE" }),
      Gateway.countDocuments({ ownerType: "COMPANY", ownerId: entityId }),
    ]);
    return { EMPLOYEES: employees, GATEWAYS: gateways };
  }
  return { FLEET_VEHICLES: await Truck.countDocuments({ fleetId: entityId, status: { $ne: "INACTIVE" } }) };
}

async function readSettings(): Promise<SettingsDoc | null> {
  return BillingSettings.findOne({ key: SETTINGS_KEY }).lean<SettingsDoc | null>();
}

async function lastBilledEnds(subscriptionIds: unknown[]) {
  const rows = await Invoice.aggregate<{ _id: unknown; lastEnd: string }>([
    { $match: { subscriptionId: { $in: subscriptionIds }, status: { $ne: "VOID" } } },
    { $group: { _id: "$subscriptionId", lastEnd: { $max: "$periodEnd" } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.lastEnd]));
}

async function upcomingPeriod(subscription: SubscriptionDoc): Promise<Period> {
  const ends = await lastBilledEnds([subscription._id]);
  return nextPeriod(subscription.startMonth, subscription.cycle, ends.get(String(subscription._id)) ?? null);
}

function estimateFor(subscription: SubscriptionDoc, counts: Counts, settings: SettingsDoc | null) {
  const lines = buildLines({ baseFeePaise: subscription.baseFeePaise, rates: subscription.rates, cycle: subscription.cycle, counts });
  return { lines, ...invoiceTotals(lines, settings?.stateCode ?? subscription.billTo.stateCode, subscription.billTo.stateCode) };
}

// Settings

export async function getSettings(user: AuthUser) {
  requirePlatform(user);
  const settings = await readSettings();
  return settings ? serialize(settings) : null;
}

export async function saveSettings(user: AuthUser, input: z.infer<typeof settingsSchema>) {
  requirePlatform(user);
  checkGstin(input.gstin, input.stateCode);
  const settings = await BillingSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { ...input, key: SETTINGS_KEY } },
    { upsert: true, returnDocument: "after", runValidators: true },
  ).lean();
  await writeAudit({ actorId: user.id, action: "BILLING_SETTINGS_UPDATED", entityType: "BillingSettings", entityId: SETTINGS_KEY, after: { legalName: input.legalName, stateCode: input.stateCode, invoicePrefix: input.invoicePrefix } });
  return serialize(settings);
}

// Plans

export async function listPlans(user: AuthUser, query: z.infer<typeof planQuerySchema>) {
  requirePlatform(user);
  const filter = { ...searchClause(["name", "code"], query.search), ...(query.entityType ? { entityType: query.entityType } : {}) };
  const result = await paginate(BillingPlan, filter, { page: query.page, limit: query.limit, sort: { entityType: 1, name: 1 } });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

export async function getPlan(user: AuthUser, id: string) {
  requirePlatform(user);
  checkId(id, "Plan");
  const plan = await BillingPlan.findById(id).lean();
  if (!plan) throw notFound("Plan");
  return serialize(plan);
}

function planValues(input: z.infer<typeof planSchema>) {
  return {
    name: input.name,
    code: input.code,
    entityType: input.entityType,
    description: input.description,
    baseFeePaise: rupeesToPaise(input.baseFee),
    rates: ratesFor(input.entityType, input.rates),
    status: input.status,
  };
}

function duplicatePlan(error: unknown) {
  if (isDuplicateKey(error)) return fieldError(409, "CODE_EXISTS", "code", "is already used by another plan.");
  return error;
}

export async function createPlan(user: AuthUser, input: z.infer<typeof planSchema>) {
  requirePlatform(user);
  try {
    const plan = await BillingPlan.create(planValues(input));
    await writeAudit({ actorId: user.id, action: "BILLING_PLAN_CREATED", entityType: "BillingPlan", entityId: String(plan._id), after: { name: plan.name, code: plan.code } });
    return serialize(plan.toObject());
  } catch (error) {
    throw duplicatePlan(error);
  }
}

export async function updatePlan(user: AuthUser, id: string, input: z.infer<typeof planSchema>) {
  requirePlatform(user);
  checkId(id, "Plan");
  const plan = await BillingPlan.findById(id);
  if (!plan) throw notFound("Plan");
  plan.set(planValues(input));
  try {
    await plan.save();
  } catch (error) {
    throw duplicatePlan(error);
  }
  await writeAudit({ actorId: user.id, action: "BILLING_PLAN_UPDATED", entityType: "BillingPlan", entityId: String(plan._id), after: { name: plan.name, code: plan.code, status: plan.status } });
  return serialize(plan.toObject());
}

// Subscriptions

export async function listSubscriptions(user: AuthUser, query: z.infer<typeof subscriptionQuerySchema>) {
  requirePlatform(user);
  const filter = { ...searchClause(["entityName", "planName", "billTo.name"], query.search), ...(query.entityType ? { entityType: query.entityType } : {}) };
  const result = await paginate(Subscription, filter, { page: query.page, limit: query.limit, sort: { entityName: 1 } });
  const items = result.items as SubscriptionDoc[];
  const ends = await lastBilledEnds(items.map((item) => item._id));
  const now = today();
  return {
    items: items.map((item) => {
      const period = nextPeriod(item.startMonth, item.cycle, ends.get(String(item._id)) ?? null);
      return { ...(serialize(item) as object), nextPeriod: period, nextPeriodReady: periodEnded(period, now) };
    }),
    meta: result.meta,
  };
}

const entityCodeFields: Record<BillingEntityType, string> = { SCHOOL: "schoolCode", COMPANY: "companyCode", FLEET: "fleetCode", AGENCY: "agencyCode" };

export async function listUnsubscribed(user: AuthUser, query: z.infer<typeof unsubscribedQuerySchema>) {
  requirePlatform(user);
  const types = query.entityType ? [query.entityType] : billingEntityTypes;
  const groups = await Promise.all(types.map(async (entityType) => {
    const subscribed = await Subscription.distinct("entityId", { entityType });
    const codeField = entityCodeFields[entityType];
    const entities = await entityModels[entityType]
      .find({ _id: { $nin: subscribed } })
      .select(`name status ${codeField}`)
      .sort({ name: 1 })
      .limit(500)
      .lean<Array<Record<string, unknown> & { _id: unknown; name: string; status?: string }>>();
    return entities.map((entity) => ({
      entityType,
      entityId: String(entity._id),
      name: entity.name,
      code: String(entity[codeField] ?? ""),
      status: entity.status ?? "",
    }));
  }));
  return groups.flat();
}

async function subscriptionDoc(id: string) {
  checkId(id, "Subscription");
  const subscription = await Subscription.findById(id);
  if (!subscription) throw notFound("Subscription");
  return subscription;
}

async function subscriptionView(subscription: SubscriptionDoc) {
  const [counts, period, settings] = await Promise.all([
    countUnits(subscription.entityType, subscription.entityId),
    upcomingPeriod(subscription),
    readSettings(),
  ]);
  return {
    subscription: serialize(subscription),
    counts,
    nextPeriod: period,
    nextPeriodReady: periodEnded(period, today()),
    estimate: estimateFor(subscription, counts, settings),
  };
}

export async function getSubscription(user: AuthUser, id: string) {
  requirePlatform(user);
  const subscription = await subscriptionDoc(id);
  return subscriptionView(subscription.toObject() as SubscriptionDoc);
}

async function planLabel(planId: string) {
  if (!planId) return { planId: null, planName: "" };
  const plan = await BillingPlan.findById(planId).select("name").lean<{ name: string } | null>();
  if (!plan) throw fieldError(422, "PLAN_NOT_FOUND", "planId", "Choose an existing plan.");
  return { planId, planName: plan.name };
}

function subscriptionValues(entityType: BillingEntityType, input: z.infer<typeof subscriptionFields>) {
  checkGstin(input.gstin, input.stateCode);
  return {
    cycle: input.cycle,
    baseFeePaise: rupeesToPaise(input.baseFee),
    rates: ratesFor(entityType, input.rates),
    startMonth: input.startMonth,
    status: input.status,
    billTo: { name: input.billingName, address: input.billingAddress, gstin: input.gstin, stateCode: input.stateCode, email: input.billingEmail },
    notes: input.notes,
  };
}

export async function createSubscription(user: AuthUser, input: z.infer<typeof createSubscriptionSchema>) {
  requirePlatform(user);
  const entity = await findEntity(input.entityType, input.entityId);
  const values = subscriptionValues(input.entityType, input);
  const plan = await planLabel(input.planId);
  try {
    const subscription = await Subscription.create({ ...values, ...plan, entityType: input.entityType, entityId: input.entityId, entityName: entity.name });
    await writeAudit({ actorId: user.id, action: "SUBSCRIPTION_CREATED", entityType: "Subscription", entityId: String(subscription._id), after: { entityName: entity.name, cycle: values.cycle } });
    return serialize(subscription.toObject());
  } catch (error) {
    if (isDuplicateKey(error)) throw fieldError(409, "SUBSCRIPTION_EXISTS", "entityId", `Choose another entity. ${entity.name} already has a subscription, so edit that instead.`);
    throw error;
  }
}

export async function updateSubscription(user: AuthUser, id: string, input: z.infer<typeof updateSubscriptionSchema>) {
  requirePlatform(user);
  const subscription = await subscriptionDoc(id);
  const values = subscriptionValues(subscription.entityType as BillingEntityType, input);
  if (values.startMonth !== subscription.startMonth && (await Invoice.exists({ subscriptionId: subscription._id, status: { $ne: "VOID" } }))) {
    throw fieldError(409, "START_LOCKED", "startMonth", "First billing month cannot change once invoices exist.");
  }
  const entity = await entityModels[subscription.entityType as BillingEntityType].findById(subscription.entityId).select("name").lean<{ name: string } | null>();
  subscription.set({ ...values, ...(await planLabel(input.planId)), entityName: entity?.name ?? subscription.entityName });
  await subscription.save();
  await writeAudit({ actorId: user.id, action: "SUBSCRIPTION_UPDATED", entityType: "Subscription", entityId: String(subscription._id), after: { entityName: subscription.entityName, cycle: subscription.cycle, status: subscription.status } });
  return serialize(subscription.toObject());
}

// Invoices

async function nextInvoiceNumber(prefix: string, issueDate: string) {
  const fy = financialYear(issueDate);
  const counter = await InvoiceCounter.findOneAndUpdate(
    { key: `${prefix}:${fy}` },
    { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: "after" },
  ).lean<{ sequence: number }>();
  return invoiceNumber(prefix, fy, counter?.sequence ?? 1);
}

async function requireSettings() {
  const settings = await readSettings();
  if (!settings) throw new AppError(409, "SETTINGS_MISSING", "Fill in Billing settings (your legal name and state) before issuing invoices.");
  return settings;
}

async function issueNext(subscription: SubscriptionDoc, settings: SettingsDoc, actorId: string, now: string) {
  const period = await upcomingPeriod(subscription);
  if (!periodEnded(period, now)) return { period, invoice: null };
  const activeKey = `${String(subscription._id)}:${period.start}`;
  if (await Invoice.exists({ activeKey })) throw new AppError(409, "ALREADY_INVOICED", `${formatPeriod(period)} is already invoiced.`);
  const counts = await countUnits(subscription.entityType, subscription.entityId);
  const lines = buildLines({ baseFeePaise: subscription.baseFeePaise, rates: subscription.rates, cycle: subscription.cycle, counts });
  const totals = invoiceTotals(lines, settings.stateCode, subscription.billTo.stateCode);
  const invoice = await Invoice.create({
    number: await nextInvoiceNumber(settings.invoicePrefix, now),
    subscriptionId: subscription._id,
    entityType: subscription.entityType,
    entityId: subscription.entityId,
    entityName: subscription.entityName,
    activeKey,
    periodStart: period.start,
    periodEnd: period.end,
    cycle: subscription.cycle,
    issueDate: now,
    dueDate: addDays(now, settings.paymentTermsDays),
    seller: {
      legalName: settings.legalName,
      address: settings.address,
      stateCode: settings.stateCode,
      gstin: settings.gstin,
      pan: settings.pan,
      email: settings.email,
      phone: settings.phone,
      bankDetails: settings.bankDetails,
      sacCode: settings.sacCode,
    },
    billTo: subscription.billTo,
    planName: subscription.planName,
    lines,
    counts,
    countedAt: new Date(),
    ...totals,
  });
  await writeAudit({ actorId, action: "INVOICE_ISSUED", entityType: "Invoice", entityId: String(invoice._id), after: { number: invoice.number, entityName: invoice.entityName, totalPaise: invoice.totalPaise } });
  return { period, invoice };
}

export async function issueInvoice(user: AuthUser, subscriptionId: string) {
  requirePlatform(user);
  const settings = await requireSettings();
  const subscription = (await subscriptionDoc(subscriptionId)).toObject() as SubscriptionDoc;
  if (subscription.status !== "ACTIVE") throw new AppError(409, "NOT_ACTIVE", "Only an active subscription can be invoiced.");
  const result = await issueNext(subscription, settings, user.id, today());
  if (!result.invoice) {
    throw new AppError(409, "PERIOD_OPEN", `${formatPeriod(result.period)} has not ended yet. Invoice it after the period ends, when the counts are final.`);
  }
  return serialize(result.invoice.toObject());
}

export async function issueDueInvoices(user: AuthUser) {
  requirePlatform(user);
  const settings = await requireSettings();
  const now = today();
  const subscriptions = await Subscription.find({ status: "ACTIVE" }).lean<SubscriptionDoc[]>();
  const issued: Array<{ id: string; number: string; entityName: string }> = [];
  for (const subscription of subscriptions) {
    for (let round = 0; round < MAX_BACKLOG_PERIODS; round += 1) {
      const result = await issueNext(subscription, settings, user.id, now);
      if (!result.invoice) break;
      issued.push({ id: String(result.invoice._id), number: result.invoice.number, entityName: result.invoice.entityName });
    }
  }
  return { issued };
}

function stateFilter(state: z.infer<typeof invoiceQuerySchema>["state"], now: string) {
  if (state === "PAID") return { status: "PAID" };
  if (state === "VOID") return { status: "VOID" };
  if (state === "OVERDUE") return { status: "ISSUED", dueDate: { $lt: now } };
  if (state === "UNPAID") return { status: "ISSUED" };
  return {};
}

type Tenant = { entityType: BillingEntityType; entityId: string };

function tenantOf(user: AuthUser): Tenant | null {
  if (user.role === ROLES.SCHOOL_ADMIN && user.schoolId) return { entityType: "SCHOOL", entityId: user.schoolId };
  if (user.role === ROLES.COMPANY_ADMIN && user.companyId) return { entityType: "COMPANY", entityId: user.companyId };
  if (user.role === ROLES.FLEET_ADMIN && user.fleetId) return { entityType: "FLEET", entityId: user.fleetId };
  if (user.role === ROLES.AGENCY_ADMIN && user.agencyId) return { entityType: "AGENCY", entityId: user.agencyId };
  return null;
}

function requireTenant(user: AuthUser) {
  const tenant = tenantOf(user);
  if (!tenant) throw new AppError(403, "FORBIDDEN", "This account has no billing account.");
  return tenant;
}

export async function listInvoices(user: AuthUser, query: z.infer<typeof invoiceQuerySchema>) {
  const now = today();
  const scope = user.role === ROLES.PLATFORM_ADMIN ? {} : requireTenant(user);
  const filter = {
    ...scope,
    ...stateFilter(query.state, now),
    ...(query.subscriptionId ? { subscriptionId: query.subscriptionId } : {}),
    ...searchClause(["number", "entityName"], query.search),
  };
  const result = await paginate(Invoice, filter, { page: query.page, limit: query.limit, sort: { issueDate: -1, number: -1 } });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

async function invoiceFor(user: AuthUser, id: string) {
  checkId(id, "Invoice");
  const invoice = await Invoice.findById(id);
  if (!invoice) throw notFound("Invoice");
  if (user.role !== ROLES.PLATFORM_ADMIN) {
    const tenant = requireTenant(user);
    if (invoice.entityType !== tenant.entityType || String(invoice.entityId) !== tenant.entityId) throw notFound("Invoice");
  }
  return invoice;
}

export async function getInvoice(user: AuthUser, id: string) {
  const invoice = await invoiceFor(user, id);
  return serialize(invoice.toObject());
}

export async function recordPayment(user: AuthUser, id: string, input: z.infer<typeof paymentSchema>) {
  requirePlatform(user);
  const invoice = await invoiceFor(user, id);
  if (invoice.status !== "ISSUED") throw new AppError(409, "NOT_PAYABLE", `This invoice is ${invoice.status.toLowerCase()}.`);
  if (input.paidOn < invoice.issueDate) throw fieldError(422, "PAID_BEFORE_ISSUE", "paidOn", "Payment date cannot be before the invoice date.");
  if (input.paidOn > today()) throw fieldError(422, "PAID_IN_FUTURE", "paidOn", "Payment date cannot be in the future.");
  invoice.status = "PAID";
  invoice.payment = { ...input, amountPaise: invoice.totalPaise, recordedBy: user.id };
  await invoice.save();
  await writeAudit({ actorId: user.id, action: "INVOICE_PAID", entityType: "Invoice", entityId: String(invoice._id), after: { number: invoice.number, paidOn: input.paidOn, method: input.method } });
  return serialize(invoice.toObject());
}

export async function voidInvoice(user: AuthUser, id: string, input: z.infer<typeof voidSchema>) {
  requirePlatform(user);
  const invoice = await invoiceFor(user, id);
  if (invoice.status !== "ISSUED") throw new AppError(409, "NOT_VOIDABLE", "Only an unpaid invoice can be voided.");
  const later = await Invoice.exists({ subscriptionId: invoice.subscriptionId, status: { $ne: "VOID" }, periodStart: { $gt: invoice.periodStart } });
  if (later) throw new AppError(409, "NOT_LATEST", "Void the later invoices for this subscription first, so the periods stay in order.");
  invoice.status = "VOID";
  invoice.voidReason = input.reason;
  invoice.activeKey = undefined;
  await invoice.save();
  await writeAudit({ actorId: user.id, action: "INVOICE_VOIDED", entityType: "Invoice", entityId: String(invoice._id), reason: input.reason, after: { number: invoice.number } });
  return serialize(invoice.toObject());
}

// Entity admin view

async function dueSummary(filter: Record<string, unknown>) {
  const now = today();
  const [unpaid, overdue] = await Promise.all([
    Invoice.aggregate<{ count: number; totalPaise: number }>([{ $match: { ...filter, status: "ISSUED" } }, { $group: { _id: null, count: { $sum: 1 }, totalPaise: { $sum: "$totalPaise" } } }]),
    Invoice.aggregate<{ count: number; totalPaise: number }>([{ $match: { ...filter, status: "ISSUED", dueDate: { $lt: now } } }, { $group: { _id: null, count: { $sum: 1 }, totalPaise: { $sum: "$totalPaise" } } }]),
  ]);
  return {
    unpaid: { count: unpaid[0]?.count ?? 0, totalPaise: unpaid[0]?.totalPaise ?? 0 },
    overdue: { count: overdue[0]?.count ?? 0, totalPaise: overdue[0]?.totalPaise ?? 0 },
  };
}

const noDues = () => ({ unpaid: { count: 0, totalPaise: 0 }, overdue: { count: 0, totalPaise: 0 } });

export async function getAccount(user: AuthUser) {
  const tenant = requireTenant(user);
  const subscription = await Subscription.findOne({ entityType: tenant.entityType, entityId: tenant.entityId }).lean<SubscriptionDoc | null>();
  if (!subscription) return { subscription: null, ...noDues() };
  const [view, dues] = await Promise.all([
    subscriptionView(subscription),
    dueSummary({ entityType: tenant.entityType, entityId: subscription.entityId }),
  ]);
  const safe = view.subscription as Record<string, unknown>;
  delete safe.notes;
  return { ...view, ...dues };
}

export async function getDues(user: AuthUser) {
  const tenant = tenantOf(user);
  if (!tenant) return noDues();
  const subscription = await Subscription.findOne({ entityType: tenant.entityType, entityId: tenant.entityId }).select("entityId").lean<{ entityId: unknown } | null>();
  if (!subscription) return noDues();
  return dueSummary({ entityType: tenant.entityType, entityId: subscription.entityId });
}

export async function platformDues(user: AuthUser) {
  requirePlatform(user);
  return dueSummary({});
}

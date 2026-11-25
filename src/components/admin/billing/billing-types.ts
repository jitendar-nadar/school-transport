import type { BillingEntityType, Counts, Cycle, InvoiceLine, Metric, Period } from "@/modules/billing/billing-rules";

export type RateRecord = { metric: Metric; ratePaise: number };

export type PlanRecord = {
  id: string;
  name: string;
  code: string;
  entityType: BillingEntityType;
  description: string;
  baseFeePaise: number;
  rates: RateRecord[];
  status: "ACTIVE" | "ARCHIVED";
};

export type BillTo = { name: string; address: string; gstin: string; stateCode: string; email: string };

export type SubscriptionRecord = {
  id: string;
  entityType: BillingEntityType;
  entityId: string;
  entityName: string;
  planId: string | null;
  planName: string;
  cycle: Cycle;
  baseFeePaise: number;
  rates: RateRecord[];
  startMonth: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  billTo: BillTo;
  notes?: string;
  nextPeriod?: Period;
  nextPeriodReady?: boolean;
};

export type Estimate = {
  lines: InvoiceLine[];
  subtotalPaise: number;
  taxType: "INTRA" | "INTER";
  taxRate: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

export type SubscriptionView = {
  subscription: SubscriptionRecord;
  counts: Counts;
  nextPeriod: Period;
  nextPeriodReady: boolean;
  estimate: Estimate;
};

export type Dues = { unpaid: { count: number; totalPaise: number }; overdue: { count: number; totalPaise: number } };

export type AccountView = Dues & (Partial<SubscriptionView> & { subscription: SubscriptionRecord | null });

export type Seller = {
  legalName: string;
  address: string;
  stateCode: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  bankDetails: string;
  sacCode?: string;
};

export type InvoiceRecord = Estimate & {
  id: string;
  number: string;
  subscriptionId: string;
  entityType: BillingEntityType;
  entityName: string;
  periodStart: string;
  periodEnd: string;
  cycle: Cycle;
  issueDate: string;
  dueDate: string;
  seller: Seller;
  billTo: BillTo;
  planName: string;
  counts: Counts;
  countedAt: string;
  status: "ISSUED" | "PAID" | "VOID";
  payment: { paidOn: string; method: string; reference: string; amountPaise: number } | null;
  voidReason: string;
};

export type SettingsRecord = Seller & { invoicePrefix: string; paymentTermsDays: number };

export const paymentMethods: Array<{ value: string; label: string }> = [
  { value: "BANK_TRANSFER", label: "Bank transfer (NEFT / RTGS / IMPS)" },
  { value: "UPI", label: "UPI" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH", label: "Cash" },
  { value: "OTHER", label: "Other" },
];

export function paymentMethodLabel(value: string) {
  return paymentMethods.find((method) => method.value === value)?.label ?? value;
}

export function rupees(paise: number) {
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

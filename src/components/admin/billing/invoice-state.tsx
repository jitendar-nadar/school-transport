"use client";

import { calendarDate, invoiceState, type InvoiceState } from "@/modules/billing/billing-rules";

const styles: Record<InvoiceState, string> = {
  DUE: "bg-brand-50 text-brand-800 ring-brand-200",
  OVERDUE: "bg-red-50 text-red-700 ring-red-200",
  PAID: "bg-aqua-50 text-aqua-800 ring-aqua-200",
  VOID: "bg-slate-100 text-slate-600 ring-slate-200",
};

const labels: Record<InvoiceState, string> = { DUE: "Due", OVERDUE: "Overdue", PAID: "Paid", VOID: "Void" };

export function stateOf(invoice: { status: string; dueDate: string }) {
  return invoiceState(invoice, calendarDate(new Date()));
}

export function InvoiceStatePill({ invoice }: { invoice: { status: string; dueDate: string } }) {
  const state = stateOf(invoice);
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${styles[state]}`}>{labels[state]}</span>;
}

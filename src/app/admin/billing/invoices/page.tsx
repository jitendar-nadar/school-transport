"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PlatformGate, textLinkClass } from "@/components/admin/billing/platform-gate";
import { InvoiceStatePill } from "@/components/admin/billing/invoice-state";
import { useResource } from "@/components/admin/billing/use-resource";
import type { Dues, InvoiceRecord } from "@/components/admin/billing/billing-types";
import { DataTable, Notice, PageHeader, Panel } from "@/components/admin/ui";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { entityTypeLabels, formatDate, formatINR, formatPeriod } from "@/modules/billing/billing-rules";

const filters = [
  { value: "", label: "All" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "PAID", label: "Paid" },
  { value: "VOID", label: "Void" },
];

function SummaryCard({ label, count, totalPaise, tone }: { label: string; count: number; totalPaise: number; tone: "brand" | "red" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${tone === "red" && count ? "text-red-700" : "text-slate-900"}`}>{formatINR(totalPaise)}</p>
      <p className="text-xs text-slate-500">{count} invoice{count === 1 ? "" : "s"}</p>
    </div>
  );
}

function InvoiceList() {
  const router = useRouter();
  const params = useSearchParams();
  const state = filters.find((filter) => filter.value === params.get("state"))?.value ?? "";
  const invoices = usePagedRecords<InvoiceRecord>(`/api/v1/billing/invoices${state ? `?state=${state}` : ""}`, false);
  const dues = useResource<Dues>("/api/v1/billing/invoices/summary");

  return (
    <div className="space-y-5">
      <PageHeader title="Invoices" subtitle="Every invoice issued on the platform. Open one to print it, record a payment, or void it." />
      {invoices.error ? <Notice>{invoices.error}</Notice> : null}
      {dues.data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SummaryCard label="Unpaid" count={dues.data.unpaid.count} totalPaise={dues.data.unpaid.totalPaise} tone="brand" />
          <SummaryCard label="Overdue" count={dues.data.overdue.count} totalPaise={dues.data.overdue.totalPaise} tone="red" />
        </div>
      ) : null}
      <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1" role="group" aria-label="Invoice state">
        {filters.map((filter) => {
          const selected = filter.value === state;
          return (
            <button
              key={filter.value || "ALL"}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${selected ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              type="button"
              aria-pressed={selected}
              onClick={() => router.replace(filter.value ? `/admin/billing/invoices?state=${filter.value}` : "/admin/billing/invoices")}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
      <Panel>
        <DataTable
          {...listControls(invoices)}
          columns={["Number", "Bill to", "Period", "Issued", "Due", "Total", "State", ""]}
          empty="No invoices here."
          rows={invoices.rows.map((invoice) => [
            <span key="number" className="font-medium text-slate-900">{invoice.number}</span>,
            <span key="entity">{invoice.entityName}<span className="block text-xs text-slate-500">{entityTypeLabels[invoice.entityType]}</span></span>,
            formatPeriod({ start: invoice.periodStart, end: invoice.periodEnd }),
            formatDate(invoice.issueDate),
            formatDate(invoice.dueDate),
            <span key="total" className="tabular-nums">{formatINR(invoice.totalPaise)}</span>,
            <InvoiceStatePill key="state" invoice={invoice} />,
            <Link key="view" className={textLinkClass} href={`/admin/billing/invoices/${invoice.id}`} aria-label={`View invoice ${invoice.number}`}>View</Link>,
          ])}
        />
      </Panel>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <PlatformGate title="Invoices">
      <Suspense fallback={null}>
        <InvoiceList />
      </Suspense>
    </PlatformGate>
  );
}

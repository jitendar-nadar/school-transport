"use client";

import Link from "next/link";
import { textLinkClass } from "@/components/admin/billing/platform-gate";
import { CountTiles, EstimatePanel } from "@/components/admin/billing/estimate-panel";
import { InvoiceStatePill } from "@/components/admin/billing/invoice-state";
import { useResource } from "@/components/admin/billing/use-resource";
import type { AccountView, InvoiceRecord } from "@/components/admin/billing/billing-types";
import { DataTable, Notice, PageHeader, Panel } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { cycleLabels, formatINR, formatDate, formatMonth, formatPeriod, metricLabels, metricsFor } from "@/modules/billing/billing-rules";

const tenantRoles = new Set(["SCHOOL_ADMIN", "COMPANY_ADMIN", "FLEET_ADMIN", "AGENCY_ADMIN"]);

function Account() {
  const account = useResource<AccountView>("/api/v1/billing/account");
  const invoices = useResource<InvoiceRecord[]>("/api/v1/billing/invoices?limit=24");
  const data = account.data;
  const subscription = data?.subscription;

  return (
    <div className="space-y-5">
      <PageHeader title="Billing" subtitle="Your plan, current counts, and invoices from ProxiTrace." />
      {account.error ? <Notice>{account.error}</Notice> : null}
      {data && data.overdue.count ? (
        <Notice>
          {data.overdue.count} invoice{data.overdue.count === 1 ? " is" : "s are"} overdue, totalling {formatINR(data.overdue.totalPaise)}. Please arrange payment and share the reference with ProxiTrace.
        </Notice>
      ) : null}
      {data && !subscription ? (
        <Panel><p className="py-6 text-center text-sm text-slate-500">No subscription is set up for your organisation yet. ProxiTrace will add it.</p></Panel>
      ) : null}
      {subscription && data?.counts && data.nextPeriod && data.estimate ? (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <p className="text-sm font-semibold text-slate-900">{subscription.planName || "Custom plan"}</p>
              <p className="mb-3 text-xs text-slate-500">Billed {cycleLabels[subscription.cycle].toLowerCase()} since {formatMonth(subscription.startMonth)}. Prices are per month, before GST.</p>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 text-slate-700">Platform fee</td>
                    <td className="py-2 text-right tabular-nums">{formatINR(subscription.baseFeePaise)}</td>
                  </tr>
                  {metricsFor[subscription.entityType].map((metric) => {
                    const rate = subscription.rates.find((item) => item.metric === metric)?.ratePaise ?? 0;
                    return rate ? (
                      <tr key={metric} className="border-b border-slate-100">
                        <td className="py-2 text-slate-700">{metricLabels[metric].label}</td>
                        <td className="py-2 text-right tabular-nums">{formatINR(rate)} per {metricLabels[metric].unit}</td>
                      </tr>
                    ) : null;
                  })}
                </tbody>
              </table>
              <p className="mb-2 mt-5 text-sm font-semibold text-slate-900">Counts today</p>
              <CountTiles entityType={subscription.entityType} counts={data.counts} />
            </Panel>
            <Panel>
              {subscription.status === "ACTIVE" ? (
                <EstimatePanel period={data.nextPeriod} cycle={subscription.cycle} estimate={data.estimate} ready={data.nextPeriodReady ?? false} />
              ) : (
                <p className="text-sm text-slate-500">Your subscription is {subscription.status.toLowerCase()}. No new invoices are being issued.</p>
              )}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 px-4 py-3">
                  <p className="text-xs text-slate-500">Unpaid</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{formatINR(data.unpaid.totalPaise)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 px-4 py-3">
                  <p className="text-xs text-slate-500">Overdue</p>
                  <p className={`mt-1 text-lg font-semibold tabular-nums ${data.overdue.count ? "text-red-700" : "text-slate-900"}`}>{formatINR(data.overdue.totalPaise)}</p>
                </div>
              </div>
            </Panel>
          </div>
          <Panel>
            <p className="mb-3 text-sm font-semibold text-slate-900">Invoices</p>
            {invoices.error ? <Notice>{invoices.error}</Notice> : null}
            <DataTable
              columns={["Number", "Period", "Issued", "Due", "Total", "State", ""]}
              empty="No invoices yet."
              rows={(invoices.data ?? []).map((invoice) => [
                invoice.number,
                formatPeriod({ start: invoice.periodStart, end: invoice.periodEnd }),
                formatDate(invoice.issueDate),
                formatDate(invoice.dueDate),
                formatINR(invoice.totalPaise),
                <InvoiceStatePill key="state" invoice={invoice} />,
                <Link key="view" className={textLinkClass} href={`/admin/my-billing/invoices/${invoice.id}`} aria-label={`View invoice ${invoice.number}`}>View</Link>,
              ])}
            />
          </Panel>
        </>
      ) : null}
      {!data && !account.error ? <Panel><p className="py-6 text-center text-sm text-slate-500">Loading…</p></Panel> : null}
    </div>
  );
}

export default function MyBillingPage() {
  const { user } = useScope();
  if (!user) return null;
  if (!tenantRoles.has(user.role)) {
    return (
      <div className="space-y-5">
        <PageHeader title="Billing" subtitle="Billing for your organisation." />
        <Notice>Only school, company, fleet, and transport agency admins can see their organisation&apos;s billing.</Notice>
      </div>
    );
  }
  return <Account />;
}

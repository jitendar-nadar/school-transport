"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { FileText } from "lucide-react";
import { BackLink, PlatformGate, secondaryButtonClass, textLinkClass } from "@/components/admin/billing/platform-gate";
import { CountTiles, EstimatePanel } from "@/components/admin/billing/estimate-panel";
import { InvoiceStatePill } from "@/components/admin/billing/invoice-state";
import { SubscriptionForm } from "@/components/admin/billing/subscription-form";
import { useResource } from "@/components/admin/billing/use-resource";
import type { InvoiceRecord, SubscriptionView } from "@/components/admin/billing/billing-types";
import { failureOf } from "@/components/admin/validated-form";
import { DataTable, Notice, PageHeader, Panel } from "@/components/admin/ui";
import { entityTypeLabels, formatDate, formatINR, formatPeriod } from "@/modules/billing/billing-rules";
import { api } from "@/lib/admin/api";

export default function SubscriptionPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const view = useResource<SubscriptionView>(`/api/v1/billing/subscriptions/${id}`);
  const invoices = useResource<InvoiceRecord[]>(`/api/v1/billing/invoices?subscriptionId=${id}&limit=12`);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const data = view.data;
  const subscription = data?.subscription;

  async function issue() {
    setIssuing(true);
    setNotice(null);
    try {
      const result = await api<{ id: string; number: string }>(`/api/v1/billing/subscriptions/${id}/invoice`, { method: "POST", school: false });
      setNotice({ tone: "ok", text: `Invoice ${result.data.number} was issued.` });
      view.reload();
      invoices.reload();
    } catch (caught) {
      setNotice({ tone: "error", text: failureOf(caught, "Could not issue the invoice.").message });
    } finally {
      setIssuing(false);
    }
  }

  return (
    <PlatformGate title="Subscription">
      <div className="space-y-5">
        <BackLink href="/admin/billing">All subscriptions</BackLink>
        <PageHeader
          title={subscription ? subscription.entityName : "Subscription"}
          subtitle={subscription ? `${entityTypeLabels[subscription.entityType]} subscription${subscription.planName ? ` on ${subscription.planName}` : " with custom prices"}.` : "Loading the subscription."}
        />
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
        {view.error ? <Notice>{view.error}</Notice> : null}
        {data && subscription ? (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel>
                <p className="mb-3 text-sm font-semibold text-slate-900">Counts today</p>
                <CountTiles entityType={subscription.entityType} counts={data.counts} />
              </Panel>
              <Panel>
                {subscription.status === "ACTIVE" ? (
                  <EstimatePanel
                    period={data.nextPeriod}
                    cycle={subscription.cycle}
                    estimate={data.estimate}
                    ready={data.nextPeriodReady}
                    action={data.nextPeriodReady ? (
                      <button className={secondaryButtonClass} type="button" disabled={issuing} onClick={() => void issue()}>
                        <FileText className="h-4 w-4 text-brand-700" aria-hidden="true" />
                        {issuing ? "Issuing…" : "Issue invoice"}
                      </button>
                    ) : null}
                  />
                ) : (
                  <p className="text-sm text-slate-500">This subscription is {subscription.status.toLowerCase()}, so no invoices are issued.</p>
                )}
              </Panel>
            </div>
            <Panel>
              <p className="mb-3 text-sm font-semibold text-slate-900">Invoices</p>
              <DataTable
                columns={["Number", "Period", "Issued", "Total", "State", ""]}
                empty="No invoices yet."
                rows={(invoices.data ?? []).map((invoice) => [
                  invoice.number,
                  formatPeriod({ start: invoice.periodStart, end: invoice.periodEnd }),
                  formatDate(invoice.issueDate),
                  formatINR(invoice.totalPaise),
                  <InvoiceStatePill key="state" invoice={invoice} />,
                  <Link key="view" className={textLinkClass} href={`/admin/billing/invoices/${invoice.id}`}>View</Link>,
                ])}
              />
            </Panel>
            <Panel>
              <p className="mb-3 text-sm font-semibold text-slate-900">Prices and billing details</p>
              <SubscriptionForm
                key={subscription.id}
                subscription={subscription}
                onSaved={(name) => router.push(`/admin/billing?saved=updated&name=${encodeURIComponent(name)}`)}
              />
            </Panel>
          </>
        ) : (
          <Panel><p className="py-6 text-center text-sm text-slate-500">{view.error ? "Go back and choose the subscription again." : "Loading…"}</p></Panel>
        )}
      </div>
    </PlatformGate>
  );
}

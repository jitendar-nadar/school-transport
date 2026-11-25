"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FileText, Pencil, Plus, Zap } from "lucide-react";
import { PlatformGate, primaryLinkClass, secondaryButtonClass, textLinkClass } from "@/components/admin/billing/platform-gate";
import type { SubscriptionRecord } from "@/components/admin/billing/billing-types";
import { failureOf } from "@/components/admin/validated-form";
import { Badge, DataTable, Notice, PageHeader, Panel } from "@/components/admin/ui";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { addDays, billingEntityTypes, cycleLabels, entityTypeLabels, entityTypePlurals, formatDate, formatPeriod, periodDates, type BillingEntityType } from "@/modules/billing/billing-rules";
import { api } from "@/lib/admin/api";
import { useResource } from "@/components/admin/billing/use-resource";

type UnsubscribedEntity = { entityType: BillingEntityType; entityId: string; name: string; code: string; status: string };

const statusLabels: Record<SubscriptionRecord["status"], string> = { ACTIVE: "Active", PAUSED: "Paused", CANCELLED: "Cancelled" };

function NextInvoice({ subscription }: { subscription: SubscriptionRecord }) {
  if (!subscription.nextPeriod) return null;
  const opens = addDays(periodDates(subscription.nextPeriod).to, 1);
  return (
    <span>
      {formatPeriod(subscription.nextPeriod)}
      <span className={`block text-xs ${subscription.nextPeriodReady ? "font-medium text-brand-700" : "text-slate-500"}`}>
        {subscription.nextPeriodReady ? "Ready to invoice" : `From ${formatDate(opens)}`}
      </span>
    </span>
  );
}

function SubscriptionList() {
  const router = useRouter();
  const params = useSearchParams();
  const typeParam = params.get("type");
  const entityType = billingEntityTypes.find((type) => type === typeParam) ?? null;
  const saved = params.get("saved");
  const name = params.get("name");
  const subscriptions = usePagedRecords<SubscriptionRecord>(`/api/v1/billing/subscriptions${entityType ? `?entityType=${entityType}` : ""}`, false);
  const unsubscribed = useResource<UnsubscribedEntity[]>(`/api/v1/billing/subscriptions/unsubscribed${entityType ? `?entityType=${entityType}` : ""}`);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  function chooseType(type: BillingEntityType | null) {
    setNotice(null);
    router.replace(type ? `/admin/billing?type=${type}` : "/admin/billing");
  }

  async function issue(subscription: SubscriptionRecord) {
    setBusy(subscription.id);
    setNotice(null);
    try {
      const result = await api<{ id: string; number: string }>(`/api/v1/billing/subscriptions/${subscription.id}/invoice`, { method: "POST", school: false });
      setNotice({ tone: "ok", text: `Invoice ${result.data.number} was issued to ${subscription.entityName}.` });
      await subscriptions.reload();
    } catch (caught) {
      setNotice({ tone: "error", text: failureOf(caught, "Could not issue the invoice.").message });
    } finally {
      setBusy("");
    }
  }

  async function issueAll() {
    setBusy("ALL");
    setNotice(null);
    try {
      const result = await api<{ issued: Array<{ number: string }> }>("/api/v1/billing/invoices/issue-due", { method: "POST", school: false });
      const count = result.data.issued.length;
      setNotice({ tone: "ok", text: count ? `${count} invoice${count === 1 ? " was" : "s were"} issued: ${result.data.issued.map((item) => item.number).join(", ")}.` : "Nothing is due. Every active subscription is invoiced up to its last ended period." });
      await subscriptions.reload();
    } catch (caught) {
      setNotice({ tone: "error", text: failureOf(caught, "Could not issue the due invoices.").message });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Subscriptions" subtitle="What each school, company, fleet, and transport agency pays. Invoices are issued after each period ends, from the counts at that time." />
      {saved && name ? <Notice tone="ok">The subscription for {name} was {saved === "updated" ? "updated" : "created"}.</Notice> : null}
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {subscriptions.error ? <Notice>{subscriptions.error}</Notice> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1" role="group" aria-label="Entity type">
          {[null, ...billingEntityTypes].map((type) => {
            const selected = type === entityType;
            return (
              <button
                key={type ?? "ALL"}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${selected ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseType(type)}
              >
                {type ? entityTypePlurals[type] : "All"}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={secondaryButtonClass} type="button" disabled={busy !== ""} onClick={() => void issueAll()}>
            <Zap className="h-4 w-4 text-brand-700" aria-hidden="true" />
            {busy === "ALL" ? "Issuing…" : "Issue all due invoices"}
          </button>
          <Link className={primaryLinkClass} href="/admin/billing/subscriptions/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add subscription
          </Link>
        </div>
      </div>
      <Panel>
        <DataTable
          {...listControls(subscriptions)}
          columns={["Entity", "Plan", "Cycle", "Next invoice", "Status", ""]}
          empty="No subscriptions yet. Add one for each organisation you bill."
          rows={subscriptions.rows.map((subscription) => [
            <span key="entity"><span className="font-medium text-slate-900">{subscription.entityName}</span><span className="block text-xs text-slate-500">{entityTypeLabels[subscription.entityType]}</span></span>,
            subscription.planName || "Custom prices",
            cycleLabels[subscription.cycle],
            subscription.status === "ACTIVE" ? <NextInvoice key="next" subscription={subscription} /> : "—",
            <Badge key="status">{statusLabels[subscription.status]}</Badge>,
            <span key="actions" className="inline-flex gap-1">
              {subscription.status === "ACTIVE" && subscription.nextPeriodReady ? (
                <button className={textLinkClass} type="button" disabled={busy !== ""} onClick={() => void issue(subscription)}>
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {busy === subscription.id ? "Issuing…" : "Issue invoice"}
                </button>
              ) : null}
              <Link className={textLinkClass} href={`/admin/billing/subscriptions/${subscription.id}`} aria-label={`Open the subscription for ${subscription.entityName}`}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Open
              </Link>
            </span>,
          ])}
        />
      </Panel>
      <Panel>
        <h2 className="text-base font-semibold text-slate-900">Not subscribed yet</h2>
        <p className="mt-1 mb-4 text-sm text-slate-500">
          {entityType ? entityTypePlurals[entityType] : "Organisations"} with no subscription are not billed. Add one to start invoicing them.
        </p>
        {unsubscribed.error ? <Notice>{unsubscribed.error}</Notice> : null}
        <DataTable
          columns={["Entity", "Code", "Account status", "Billing", ""]}
          empty={unsubscribed.loading ? "Loading…" : `Every ${entityType ? entityTypeLabels[entityType].toLowerCase() : "organisation"} has a subscription.`}
          rows={(unsubscribed.data ?? []).map((entity) => [
            <span key="entity"><span className="font-medium text-slate-900">{entity.name}</span><span className="block text-xs text-slate-500">{entityTypeLabels[entity.entityType]}</span></span>,
            entity.code || "—",
            entity.status ? entity.status.charAt(0) + entity.status.slice(1).toLowerCase() : "—",
            <Badge key="billing">No subscription</Badge>,
            <Link
              key="add"
              className={textLinkClass}
              href={`/admin/billing/subscriptions/new?entityType=${entity.entityType}&entityId=${entity.entityId}`}
              aria-label={`Add a subscription for ${entity.name}`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add subscription
            </Link>,
          ])}
        />
      </Panel>
    </div>
  );
}

export default function BillingPage() {
  return (
    <PlatformGate title="Subscriptions">
      <Suspense fallback={null}>
        <SubscriptionList />
      </Suspense>
    </PlatformGate>
  );
}

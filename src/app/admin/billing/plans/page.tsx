"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Pencil, Plus } from "lucide-react";
import { PlatformGate, primaryLinkClass, textLinkClass } from "@/components/admin/billing/platform-gate";
import type { PlanRecord } from "@/components/admin/billing/billing-types";
import { Badge, DataTable, Notice, PageHeader, Panel } from "@/components/admin/ui";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { entityTypeLabels, formatINR, metricLabels } from "@/modules/billing/billing-rules";

function PlanList() {
  const params = useSearchParams();
  const saved = params.get("saved");
  const name = params.get("name");
  const plans = usePagedRecords<PlanRecord>("/api/v1/billing/plans", false);

  return (
    <div className="space-y-5">
      <PageHeader title="Plans" subtitle="Price templates for each kind of organisation. Picking a plan on a subscription copies its prices, which you can then adjust for that customer." />
      {saved && name ? <Notice tone="ok">{name} was {saved === "updated" ? "updated" : "created"}.</Notice> : null}
      {plans.error ? <Notice>{plans.error}</Notice> : null}
      <div className="flex justify-end">
        <Link className={primaryLinkClass} href="/admin/billing/plans/new">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add plan
        </Link>
      </div>
      <Panel>
        <DataTable
          {...listControls(plans)}
          columns={["Plan", "For", "Base fee / month", "Rates / month", "Status", ""]}
          empty="No plans yet. Add one to reuse prices across subscriptions."
          rows={plans.rows.map((plan) => [
            <span key="name"><span className="font-medium text-slate-900">{plan.name}</span><span className="block text-xs text-slate-500">{plan.code}</span></span>,
            entityTypeLabels[plan.entityType],
            formatINR(plan.baseFeePaise),
            <span key="rates" className="text-xs leading-5">
              {plan.rates.filter((rate) => rate.ratePaise > 0).map((rate) => `${formatINR(rate.ratePaise)} per ${metricLabels[rate.metric].unit}`).join(", ") || "None"}
            </span>,
            <Badge key="status">{plan.status === "ACTIVE" ? "Active" : "Archived"}</Badge>,
            <Link key="edit" className={textLinkClass} href={`/admin/billing/plans/${plan.id}`} aria-label={`Edit ${plan.name}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Link>,
          ])}
        />
      </Panel>
    </div>
  );
}

export default function PlansPage() {
  return (
    <PlatformGate title="Plans">
      <Suspense fallback={null}>
        <PlanList />
      </Suspense>
    </PlatformGate>
  );
}

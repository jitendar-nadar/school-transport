"use client";

import { useParams, useRouter } from "next/navigation";
import { BackLink, PlatformGate } from "@/components/admin/billing/platform-gate";
import { PlanForm } from "@/components/admin/billing/plan-form";
import { useResource } from "@/components/admin/billing/use-resource";
import type { PlanRecord } from "@/components/admin/billing/billing-types";
import { Notice, PageHeader, Panel } from "@/components/admin/ui";

export default function EditPlanPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const plan = useResource<PlanRecord>(`/api/v1/billing/plans/${id}`);

  return (
    <PlatformGate title="Edit plan">
      <div className="space-y-5">
        <BackLink href="/admin/billing/plans">All plans</BackLink>
        <PageHeader title={plan.data ? `Edit ${plan.data.name}` : "Edit plan"} subtitle="Existing subscriptions keep their own prices; this only changes the template." />
        {plan.error ? <Notice>{plan.error}</Notice> : null}
        <Panel>
          {plan.data ? (
            <PlanForm key={plan.data.id} plan={plan.data} onSaved={(name) => router.push(`/admin/billing/plans?saved=updated&name=${encodeURIComponent(name)}`)} />
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">{plan.error ? "Go back and choose the plan again." : "Loading…"}</p>
          )}
        </Panel>
      </div>
    </PlatformGate>
  );
}

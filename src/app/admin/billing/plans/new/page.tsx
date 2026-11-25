"use client";

import { useRouter } from "next/navigation";
import { BackLink, PlatformGate } from "@/components/admin/billing/platform-gate";
import { PlanForm } from "@/components/admin/billing/plan-form";
import { PageHeader, Panel } from "@/components/admin/ui";

export default function NewPlanPage() {
  const router = useRouter();
  return (
    <PlatformGate title="Add plan">
      <div className="space-y-5">
        <BackLink href="/admin/billing/plans">All plans</BackLink>
        <PageHeader title="Add plan" subtitle="A plan is a reusable price list for schools, companies, fleets, or transport agencies." />
        <Panel>
          <PlanForm onSaved={(name) => router.push(`/admin/billing/plans?saved=created&name=${encodeURIComponent(name)}`)} />
        </Panel>
      </div>
    </PlatformGate>
  );
}

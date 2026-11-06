"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BackLink, PlatformGate } from "@/components/admin/billing/platform-gate";
import { SubscriptionForm } from "@/components/admin/billing/subscription-form";
import { PageHeader, Panel } from "@/components/admin/ui";
import { billingEntityTypes } from "@/modules/billing/billing-rules";

function NewSubscription() {
  const router = useRouter();
  const params = useSearchParams();
  const typeParam = params.get("entityType");
  const entityType = billingEntityTypes.find((type) => type === typeParam);
  const entityId = entityType ? params.get("entityId") ?? undefined : undefined;
  return (
    <SubscriptionForm
      initialEntityType={entityType}
      initialEntityId={entityId}
      onSaved={(name) => router.push(`/admin/billing?saved=created&name=${encodeURIComponent(name)}`)}
    />
  );
}

export default function NewSubscriptionPage() {
  return (
    <PlatformGate title="Add subscription">
      <div className="space-y-5">
        <BackLink href="/admin/billing">All subscriptions</BackLink>
        <PageHeader title="Add subscription" subtitle="Choose the organisation, its prices, and who the invoice is addressed to." />
        <Panel>
          <Suspense fallback={null}>
            <NewSubscription />
          </Suspense>
        </Panel>
      </div>
    </PlatformGate>
  );
}

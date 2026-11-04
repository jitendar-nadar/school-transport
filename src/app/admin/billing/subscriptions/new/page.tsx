"use client";

import { useRouter } from "next/navigation";
import { BackLink, PlatformGate } from "@/components/admin/billing/platform-gate";
import { SubscriptionForm } from "@/components/admin/billing/subscription-form";
import { PageHeader, Panel } from "@/components/admin/ui";

export default function NewSubscriptionPage() {
  const router = useRouter();
  return (
    <PlatformGate title="Add subscription">
      <div className="space-y-5">
        <BackLink href="/admin/billing">All subscriptions</BackLink>
        <PageHeader title="Add subscription" subtitle="Choose the organisation, its prices, and who the invoice is addressed to." />
        <Panel>
          <SubscriptionForm onSaved={(name) => router.push(`/admin/billing?saved=created&name=${encodeURIComponent(name)}`)} />
        </Panel>
      </div>
    </PlatformGate>
  );
}

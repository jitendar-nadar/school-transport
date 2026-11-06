"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BackToEntities, EntityForm } from "@/components/admin/entity-form";
import { entityTypes, typeFromSlug } from "@/components/admin/entity-types";
import { Notice, PageHeader, Panel } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";

function NewEntity() {
  const { user } = useScope();
  const router = useRouter();
  const params = useSearchParams();
  const type = typeFromSlug(params.get("type")) ?? "SCHOOL";
  const config = entityTypes[type];

  if (user.role !== "PLATFORM_ADMIN") {
    return (
      <div className="space-y-5">
        <PageHeader title="Add entity" subtitle="Create a school, company, fleet, or transport agency." />
        <Notice>Only platform administrators manage entities.</Notice>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BackToEntities slug={config.slug} />
      <PageHeader title="Add entity" subtitle="Choose the entity type, fill in its details, and create it. It then appears in the entity list and the header picker." />
      <Panel>
        <EntityForm
          key={type}
          type={type}
          onTypeChange={(next) => router.replace(`/admin/entities/new?type=${entityTypes[next].slug}`)}
          onSaved={(saved) => router.push(`/admin/entities?type=${entityTypes[saved.type].slug}&saved=created&name=${encodeURIComponent(saved.name)}`)}
        />
      </Panel>
    </div>
  );
}

export default function NewEntityPage() {
  return (
    <Suspense fallback={null}>
      <NewEntity />
    </Suspense>
  );
}

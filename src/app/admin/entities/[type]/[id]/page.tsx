"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BackToEntities, EntityForm } from "@/components/admin/entity-form";
import { capitalised, entityTypes, typeFromSlug, type EntityRecord, type EntityType } from "@/components/admin/entity-types";
import { Notice, PageHeader, Panel } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { api } from "@/lib/admin/api";

type Loaded = { key: string; entity: EntityRecord | null; error: string };

function EditEntity() {
  const { user, selectEntity } = useScope();
  const router = useRouter();
  const params = useParams<{ type: string; id: string }>();
  const slugType = typeFromSlug(params.type);
  const id = params.id;
  const requestKey = `${params.type}/${id}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const platform = user.role === "PLATFORM_ADMIN";

  useEffect(() => {
    if (!slugType || !platform) return;
    let ignore = false;
    api<EntityRecord>(`${entityTypes[slugType].endpoint}/${id}`, { school: false })
      .then((result) => {
        if (!ignore) setLoaded({ key: requestKey, entity: result.data, error: "" });
      })
      .catch((caught) => {
        if (!ignore) setLoaded({ key: requestKey, entity: null, error: caught instanceof Error ? caught.message : "Could not load this entity." });
      });
    return () => {
      ignore = true;
    };
  }, [slugType, id, platform, requestKey]);

  if (!platform) {
    return (
      <div className="space-y-5">
        <PageHeader title="Edit entity" subtitle="Change an organisation's details." />
        <Notice>Only platform administrators manage entities.</Notice>
      </div>
    );
  }
  if (!slugType) {
    return (
      <div className="space-y-5">
        <BackToEntities slug="school" />
        <Notice>This entity type is not recognised.</Notice>
      </div>
    );
  }

  const current = loaded?.key === requestKey ? loaded : null;
  const entity = current?.entity ?? null;
  const type: EntityType = slugType;
  const config = entityTypes[type];

  return (
    <div className="space-y-5">
      <BackToEntities slug={config.slug} />
      <PageHeader
        title={entity ? `Edit ${entity.name}` : `Edit ${config.noun}`}
        subtitle={`${capitalised(config.label)} details. Saving updates the entity list and the header picker.`}
        icon={config.icon}
      />
      {current?.error ? <Notice>{current.error}</Notice> : null}
      <Panel>
        {entity ? (
          <EntityForm
            key={entity.id}
            type={type}
            entity={entity}
            onSaved={(saved) => router.push(`/admin/entities?type=${entityTypes[saved.type].slug}&saved=updated&name=${encodeURIComponent(saved.name)}`)}
          />
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">{current?.error ? "Go back to the list and choose the entity again." : "Loading…"}</p>
        )}
      </Panel>
      {entity && type === "AGENCY" ? (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Link the schools and companies this agency serves. Its vehicles and cards can then be given to them.</p>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-brand-800 shadow-sm transition hover:bg-slate-50"
              onClick={() => {
                selectEntity("AGENCY", { id: entity.id, name: entity.name });
                router.push("/admin/agency-clients");
              }}
            >
              Manage clients
            </button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

export default function EditEntityPage() {
  return (
    <Suspense fallback={null}>
      <EditEntity />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { failureOf } from "@/components/admin/validated-form";
import { DataTable, Notice, PageHeader, Panel, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { capitalised, entityStatuses, entityTypes, typeFromSlug, typeOrder, type EntityConfig, type EntityRecord } from "@/components/admin/entity-types";
import { api } from "@/lib/admin/api";

function EntityList({ config, onError }: { config: EntityConfig; onError: (message: string) => void }) {
  const entities = usePagedRecords<EntityRecord>(config.list, false);
  const { rows, error, reload } = entities;

  async function setStatus(id: string, status: string) {
    try {
      await api(`${config.endpoint}/${id}`, { method: "PATCH", school: false, body: { status } });
      await reload();
    } catch (caught) {
      onError(failureOf(caught, "Could not change the status.").message);
    }
  }

  return (
    <>
      {error ? <Notice>{error}</Notice> : null}
      <Panel>
        <DataTable
          {...listControls(entities)}
          columns={[capitalised(config.noun), "Code", "Contact", "Status", ""]}
          empty={`No ${config.plural} yet.`}
          rows={rows.map((entity) => [
            entity.name,
            entity[config.codeField] || "",
            `${entity.contactEmail} · ${entity.contactPhone}`,
            <select key={`${entity.id}-status`} className={controlClass} value={entity.status} onChange={(event) => void setStatus(entity.id, event.target.value)} aria-label={`Status of ${entity.name}`}>
              {entityStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>,
            <Link
              key={`${entity.id}-edit`}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50"
              href={`/admin/entities/${config.slug}/${entity.id}`}
              aria-label={`Edit ${entity.name}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Link>,
          ])}
        />
      </Panel>
    </>
  );
}

function EntitiesList() {
  const { user } = useScope();
  const router = useRouter();
  const params = useSearchParams();
  const type = typeFromSlug(params.get("type")) ?? "SCHOOL";
  const config = entityTypes[type];
  const saved = params.get("saved");
  const savedName = params.get("name");
  const [error, setError] = useState("");

  if (user.role !== "PLATFORM_ADMIN") {
    return (
      <div className="space-y-5">
        <PageHeader title="Entities" subtitle="Schools, companies, fleets, and transport agencies." />
        <Notice>Only platform administrators manage entities.</Notice>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Entities" subtitle="Every organisation on the platform: schools, companies, truck fleets, and the bus and van agencies that serve schools and companies." />
      {saved && savedName ? <Notice tone="ok">{savedName} was {saved === "updated" ? "updated" : "created"}.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1" role="group" aria-label="Entity type">
          {typeOrder.map((value) => {
            const Icon = entityTypes[value].icon;
            const selected = value === type;
            return (
              <button
                key={value}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${selected ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setError("");
                  router.replace(`/admin/entities?type=${entityTypes[value].slug}`);
                }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {capitalised(entityTypes[value].plural)}
              </button>
            );
          })}
        </div>
        <Link
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand-700/20 transition-colors hover:bg-brand-800"
          href={`/admin/entities/new?type=${config.slug}`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add {config.noun}
        </Link>
      </div>
      <EntityList key={type} config={config} onError={setError} />
    </div>
  );
}

export default function EntitiesPage() {
  return (
    <Suspense fallback={null}>
      <EntitiesList />
    </Suspense>
  );
}

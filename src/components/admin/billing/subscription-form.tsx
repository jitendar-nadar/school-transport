"use client";

import { FormEvent, useMemo, useState } from "react";
import { PriceFields, readPrices } from "@/components/admin/billing/price-fields";
import { useResource } from "@/components/admin/billing/use-resource";
import type { PlanRecord, SubscriptionRecord } from "@/components/admin/billing/billing-types";
import { SearchSelect } from "@/components/admin/search-select";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { Field, Notice, PrimaryButton, controlClass } from "@/components/admin/ui";
import { billingEntityTypes, calendarDate, cycleLabels, cycles, entityTypeLabels, type BillingEntityType } from "@/modules/billing/billing-rules";
import { gstStates } from "@/modules/billing/gst-states";
import { api } from "@/lib/admin/api";

type EntityOption = { id: string; name: string; contactEmail?: string; address?: string; category?: string };

const entityLists: Record<BillingEntityType, string> = {
  SCHOOL: "/api/v1/schools?limit=100",
  COMPANY: "/api/v1/companies?limit=100",
  FLEET: "/api/v1/fleets?limit=100",
};

function EntityPicker({ entityType, onPick }: { entityType: BillingEntityType; onPick: (entity: EntityOption | null) => void }) {
  const entities = useResource<EntityOption[]>(entityLists[entityType]);
  const taken = useResource<SubscriptionRecord[]>(`/api/v1/billing/subscriptions?entityType=${entityType}&limit=100`);
  const options = useMemo(() => {
    const subscribed = new Set((taken.data ?? []).map((item) => item.entityId));
    return (entities.data ?? [])
      .filter((entity) => !subscribed.has(entity.id))
      .map((entity) => ({ ...entity, detail: entity.category === "TOUR_TRAVEL" ? "Tour and travel" : entity.contactEmail }));
  }, [entities.data, taken.data]);

  return (
    <SearchSelect
      label={entityTypeLabels[entityType]}
      name="entityId"
      options={options}
      placeholder={`Search ${entityTypeLabels[entityType].toLowerCase()} by name`}
      anotherPlaceholder="Choose another to replace it"
      emptyMatch="No match. Entities that already have a subscription are not listed."
      emptyOptions={entities.loading ? "Loading…" : `Every ${entityTypeLabels[entityType].toLowerCase()} already has a subscription.`}
      single
      onChange={(ids) => onPick(options.find((option) => option.id === ids[0]) ?? null)}
    />
  );
}

export function SubscriptionForm({ subscription, onSaved }: { subscription?: SubscriptionRecord; onSaved: (name: string) => void }) {
  const editing = Boolean(subscription);
  const [entityType, setEntityType] = useState<BillingEntityType>(subscription?.entityType ?? "SCHOOL");
  const [entityName, setEntityName] = useState(subscription?.entityName ?? "");
  const [planId, setPlanId] = useState(subscription?.planId ?? "");
  const [billing, setBilling] = useState({
    name: subscription?.billTo.name ?? "",
    address: subscription?.billTo.address ?? "",
    email: subscription?.billTo.email ?? "",
  });
  const [thisMonth] = useState(() => calendarDate(new Date()).slice(0, 7));
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const plans = useResource<PlanRecord[]>(`/api/v1/billing/plans?entityType=${entityType}&limit=100`);
  const planOptions = (plans.data ?? []).filter((plan) => plan.status === "ACTIVE" || plan.id === subscription?.planId);
  const chosenPlan = planOptions.find((plan) => plan.id === planId);
  const priceSource = chosenPlan && chosenPlan.id !== subscription?.planId ? chosenPlan : subscription ?? chosenPlan;

  function pickEntity(entity: EntityOption | null) {
    setEntityName(entity?.name ?? "");
    if (!entity) return;
    setBilling((current) => ({
      name: current.name || entity.name,
      address: current.address || entity.address || "",
      email: current.email || entity.contactEmail || "",
    }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setFieldErrors({});
    setPending(true);
    const body = {
      planId,
      cycle: form.get("cycle"),
      startMonth: form.get("startMonth"),
      status: form.get("status") ?? "ACTIVE",
      billingName: billing.name,
      billingAddress: billing.address,
      gstin: form.get("gstin"),
      stateCode: form.get("stateCode"),
      billingEmail: billing.email,
      notes: form.get("notes"),
      ...readPrices(form, entityType),
    };
    try {
      if (subscription) {
        await api(`/api/v1/billing/subscriptions/${subscription.id}`, { method: "PATCH", school: false, body });
      } else {
        await api("/api/v1/billing/subscriptions", { method: "POST", school: false, body: { ...body, entityType, entityId: form.get("entityId") ?? "" } });
      }
      onSaved(subscription?.entityName ?? entityName);
    } catch (caught) {
      const result = failureOf(caught, "Could not save the subscription.");
      setFieldErrors(result.fields);
      setMessage(result.message);
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <Notice>{message}</Notice> : null}
      <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={onSubmit}>
        {editing ? null : (
          <>
            <Field label="Entity type">
              <select
                className={controlClass}
                value={entityType}
                onChange={(event) => {
                  setEntityType(event.target.value as BillingEntityType);
                  setEntityName("");
                  setPlanId("");
                }}
              >
                {billingEntityTypes.map((type) => <option key={type} value={type}>{entityTypeLabels[type]}</option>)}
              </select>
            </Field>
            <div className="md:col-span-2">
              <EntityPicker key={entityType} entityType={entityType} onPick={pickEntity} />
            </div>
          </>
        )}
        <Field label="Plan">
          <select className={controlClass} name="planId" value={planId} onChange={(event) => setPlanId(event.target.value)}>
            <option value="">Custom prices (no plan)</option>
            {planOptions.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}{plan.status === "ARCHIVED" ? " (archived)" : ""}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-slate-500">Choosing a plan fills in its prices below.</span>
        </Field>
        <Field label="Billing cycle">
          <select className={controlClass} name="cycle" defaultValue={subscription?.cycle ?? "MONTHLY"}>
            {cycles.map((cycle) => <option key={cycle} value={cycle}>{cycleLabels[cycle]}</option>)}
          </select>
        </Field>
        <Field label="First month to bill">
          <input className={controlClass} name="startMonth" type="month" defaultValue={subscription?.startMonth ?? thisMonth} required />
          <span className="mt-1 block text-xs font-normal text-slate-500">Each period is invoiced after it ends, using the counts at that time.</span>
        </Field>
        <PriceFields key={`${entityType}-${priceSource?.id ?? "none"}`} entityType={entityType} baseFeePaise={priceSource?.baseFeePaise} rates={priceSource?.rates} />
        <h3 className="pt-2 text-sm font-semibold text-slate-900 md:col-span-3">Bill to</h3>
        <Field label="Billing name"><input className={controlClass} name="billingName" minLength={2} maxLength={200} value={billing.name} onChange={(event) => setBilling({ ...billing, name: event.target.value })} required /></Field>
        <Field label="State (place of supply)">
          <select className={controlClass} name="stateCode" defaultValue={subscription?.billTo.stateCode ?? ""} required>
            <option value="">Choose a state</option>
            {gstStates.map((state) => <option key={state.code} value={state.code}>{state.name} ({state.code})</option>)}
          </select>
        </Field>
        <Field label="Customer GSTIN">
          <input className={controlClass} name="gstin" maxLength={15} pattern="[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]" title="GSTIN must be 15 characters, like 27AAPFU0939F1ZV." defaultValue={subscription?.billTo.gstin} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Optional. Leave blank if they are not GST registered.</span>
        </Field>
        <div className="md:col-span-2">
          <Field label="Billing address"><input className={controlClass} name="billingAddress" maxLength={500} value={billing.address} onChange={(event) => setBilling({ ...billing, address: event.target.value })} /></Field>
        </div>
        <Field label="Billing email"><input className={controlClass} name="billingEmail" type="email" value={billing.email} onChange={(event) => setBilling({ ...billing, email: event.target.value })} /></Field>
        {editing ? (
          <Field label="Status">
            <select className={controlClass} name="status" defaultValue={subscription?.status}>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused (no invoices)</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </Field>
        ) : null}
        <div className={editing ? "md:col-span-2" : "md:col-span-3"}>
          <Field label="Internal notes"><input className={controlClass} name="notes" maxLength={500} defaultValue={subscription?.notes} placeholder="Only platform admins see this" /></Field>
        </div>
        <div className="md:col-span-3">
          <PrimaryButton disabled={pending}>{pending ? "Saving…" : editing ? "Save subscription" : "Create subscription"}</PrimaryButton>
        </div>
      </ValidatedForm>
    </div>
  );
}

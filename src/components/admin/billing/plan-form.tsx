"use client";

import { FormEvent, useState } from "react";
import { PriceFields, readPrices } from "@/components/admin/billing/price-fields";
import type { PlanRecord } from "@/components/admin/billing/billing-types";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { Field, Notice, PrimaryButton, controlClass } from "@/components/admin/ui";
import { billingEntityTypes, entityTypePlurals, type BillingEntityType } from "@/modules/billing/billing-rules";
import { api } from "@/lib/admin/api";

export function PlanForm({ plan, onSaved }: { plan?: PlanRecord; onSaved: (name: string) => void }) {
  const [entityType, setEntityType] = useState<BillingEntityType>(plan?.entityType ?? "SCHOOL");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setFieldErrors({});
    setPending(true);
    const body = {
      name: form.get("name"),
      code: form.get("code"),
      entityType,
      description: form.get("description"),
      status: form.get("status") ?? "ACTIVE",
      ...readPrices(form, entityType),
    };
    try {
      if (plan) await api(`/api/v1/billing/plans/${plan.id}`, { method: "PATCH", school: false, body });
      else await api("/api/v1/billing/plans", { method: "POST", school: false, body });
      onSaved(String(body.name));
    } catch (caught) {
      const result = failureOf(caught, "Could not save the plan.");
      setFieldErrors(result.fields);
      setMessage(result.message);
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <Notice>{message}</Notice> : null}
      <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={onSubmit}>
        <Field label="Plan name"><input className={controlClass} name="name" minLength={2} maxLength={80} defaultValue={plan?.name} required /></Field>
        <Field label="Plan code">
          <input className={controlClass} name="code" minLength={2} maxLength={20} pattern="[A-Za-z0-9-]{2,20}" title="Use 2 to 20 letters, numbers, or dashes." defaultValue={plan?.code} required />
        </Field>
        <Field label="For">
          <select className={controlClass} name="entityType" value={entityType} onChange={(event) => setEntityType(event.target.value as BillingEntityType)}>
            {billingEntityTypes.map((type) => <option key={type} value={type}>{entityTypePlurals[type]}</option>)}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Description"><input className={controlClass} name="description" maxLength={300} defaultValue={plan?.description} /></Field>
        </div>
        {plan ? (
          <Field label="Status">
            <select className={controlClass} name="status" defaultValue={plan.status}>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived (hidden when adding subscriptions)</option>
            </select>
          </Field>
        ) : null}
        <PriceFields key={entityType} entityType={entityType} baseFeePaise={plan?.baseFeePaise} rates={plan?.entityType === entityType ? plan.rates : undefined} />
        <p className="text-xs leading-5 text-slate-500 md:col-span-3">Changing a plan does not change existing subscriptions. Each subscription keeps its own copy of the prices, so you can adjust one customer without affecting others.</p>
        <div className="md:col-span-3">
          <PrimaryButton disabled={pending}>{pending ? "Saving…" : plan ? "Save plan" : "Create plan"}</PrimaryButton>
        </div>
      </ValidatedForm>
    </div>
  );
}

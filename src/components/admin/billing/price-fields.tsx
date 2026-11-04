"use client";

import { useFieldError } from "@/components/admin/form-error-context";
import { Field, controlClass } from "@/components/admin/ui";
import { metricLabels, metricsFor, type BillingEntityType, type Metric } from "@/modules/billing/billing-rules";
import { rupees, type RateRecord } from "@/components/admin/billing/billing-types";

export function rateName(metric: Metric) {
  return `rate-${metric}`;
}

export function readPrices(form: FormData, entityType: BillingEntityType) {
  return {
    baseFee: Number(form.get("baseFee") || 0),
    rates: metricsFor[entityType].map((metric) => ({ metric, rate: Number(form.get(rateName(metric)) || 0) })),
  };
}

function MoneyInput({ name, defaultValue, label }: { name: string; defaultValue?: string; label: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
      <input className={`${controlClass} pl-7`} name={name} type="number" min={0} max={10000000} step="0.01" inputMode="decimal" defaultValue={defaultValue ?? "0"} aria-label={label} required />
    </div>
  );
}

export function PriceFields({ entityType, baseFeePaise, rates }: { entityType: BillingEntityType; baseFeePaise?: number; rates?: RateRecord[] }) {
  const ratesError = useFieldError("rates");
  return (
    <fieldset className="md:col-span-3">
      <legend className="mb-1 text-sm font-medium text-slate-700">Monthly prices (before GST)</legend>
      <p className="mb-3 text-xs leading-5 text-slate-500">
        Each invoice charges the base fee plus each rate times the count at the end of the period. Quarterly and yearly cycles multiply these by 3 or 12. Leave a rate at 0 to not charge for it.
      </p>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Base fee per month" name="baseFee">
          <MoneyInput name="baseFee" label="Base fee per month" defaultValue={baseFeePaise != null ? rupees(baseFeePaise) : undefined} />
        </Field>
        {metricsFor[entityType].map((metric) => {
          const current = rates?.find((rate) => rate.metric === metric);
          const label = `Per ${metricLabels[metric].unit} per month`;
          return (
            <Field key={metric} label={label} name={rateName(metric)}>
              <MoneyInput name={rateName(metric)} label={label} defaultValue={current ? rupees(current.ratePaise) : undefined} />
              <span className="mt-1 block text-xs font-normal text-slate-500">{metricLabels[metric].label}</span>
            </Field>
          );
        })}
      </div>
      {ratesError ? <p className="mt-2 text-sm text-red-700">{ratesError}</p> : null}
    </fieldset>
  );
}

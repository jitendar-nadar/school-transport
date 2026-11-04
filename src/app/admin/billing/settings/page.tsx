"use client";

import { FormEvent, useState } from "react";
import { PlatformGate } from "@/components/admin/billing/platform-gate";
import { useResource } from "@/components/admin/billing/use-resource";
import type { SettingsRecord } from "@/components/admin/billing/billing-types";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { gstStates } from "@/modules/billing/gst-states";
import { api } from "@/lib/admin/api";

function SettingsForm({ settings, onSaved }: { settings: SettingsRecord | null; onSaved: () => void }) {
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setFieldErrors({});
    setPending(true);
    try {
      await api("/api/v1/billing/settings", {
        method: "PUT",
        school: false,
        body: {
          legalName: form.get("legalName"),
          address: form.get("address"),
          stateCode: form.get("stateCode"),
          gstin: form.get("gstin"),
          pan: form.get("pan"),
          email: form.get("email"),
          phone: form.get("phone"),
          invoicePrefix: form.get("invoicePrefix"),
          paymentTermsDays: Number(form.get("paymentTermsDays")),
          sacCode: form.get("sacCode"),
          bankDetails: form.get("bankDetails"),
        },
      });
      onSaved();
    } catch (caught) {
      const result = failureOf(caught, "Could not save the billing settings.");
      setFieldErrors(result.fields);
      setMessage(result.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <Notice>{message}</Notice> : null}
      <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={onSubmit}>
        <Field label="Legal name"><input className={controlClass} name="legalName" minLength={2} maxLength={200} defaultValue={settings?.legalName} required /></Field>
        <Field label="State (for GST)">
          <select className={controlClass} name="stateCode" defaultValue={settings?.stateCode ?? ""} required>
            <option value="">Choose a state</option>
            {gstStates.map((state) => <option key={state.code} value={state.code}>{state.name} ({state.code})</option>)}
          </select>
        </Field>
        <Field label="GSTIN"><input className={controlClass} name="gstin" maxLength={15} pattern="[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]" title="GSTIN must be 15 characters, like 27AAPFU0939F1ZV." defaultValue={settings?.gstin} /></Field>
        <Field label="Address"><textarea className={controlClass} name="address" rows={3} maxLength={500} defaultValue={settings?.address} /></Field>
        <Field label="PAN"><input className={controlClass} name="pan" maxLength={10} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" title="PAN must be 10 characters, like AAPFU0939F." defaultValue={settings?.pan} /></Field>
        <Field label="SAC code"><input className={controlClass} name="sacCode" inputMode="numeric" pattern="[0-9]{6}" title="SAC must be 6 digits." defaultValue={settings?.sacCode} /></Field>
        <Field label="Billing email"><input className={controlClass} name="email" type="email" defaultValue={settings?.email} /></Field>
        <Field label="Billing phone"><input className={controlClass} name="phone" maxLength={20} defaultValue={settings?.phone} /></Field>
        <Field label="Invoice number prefix">
          <input className={controlClass} name="invoicePrefix" maxLength={10} pattern="[A-Za-z0-9-]{1,10}" title="Use up to 10 letters, numbers, or dashes." defaultValue={settings?.invoicePrefix ?? "PT"} required />
          <span className="mt-1 block text-xs font-normal text-slate-500">Numbers look like PT/2026-27/0001 and restart each financial year.</span>
        </Field>
        <Field label="Payment due after (days)"><input className={controlClass} name="paymentTermsDays" type="number" min={0} max={120} step={1} defaultValue={settings?.paymentTermsDays ?? 15} required /></Field>
        <div className="md:col-span-2">
          <Field label="Bank or UPI details printed on invoices">
            <textarea className={controlClass} name="bankDetails" rows={3} maxLength={1000} placeholder={"Bank: ...\nAccount: ...\nIFSC: ...\nUPI: ..."} defaultValue={settings?.bankDetails} />
          </Field>
        </div>
        <div className="md:col-span-3">
          <PrimaryButton disabled={pending}>{pending ? "Saving…" : "Save settings"}</PrimaryButton>
        </div>
      </ValidatedForm>
    </div>
  );
}

export default function BillingSettingsPage() {
  const settings = useResource<SettingsRecord | null>("/api/v1/billing/settings");
  const [saved, setSaved] = useState(false);

  return (
    <PlatformGate title="Billing settings">
      <div className="space-y-5">
        <PageHeader title="Billing settings" subtitle="Your business details as the seller. They are copied onto each invoice when it is issued, so later changes do not alter old invoices." />
        {saved ? <Notice tone="ok">Billing settings saved.</Notice> : null}
        {settings.error ? <Notice>{settings.error}</Notice> : null}
        {settings.ready && !settings.data ? <Notice>Fill these in before issuing the first invoice. The state decides whether GST is split into CGST and SGST or charged as IGST.</Notice> : null}
        <Panel>
          {settings.ready ? (
            <SettingsForm
              key={settings.data ? "loaded" : "empty"}
              settings={settings.data}
              onSaved={() => {
                setSaved(true);
                settings.reload();
              }}
            />
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
          )}
        </Panel>
      </div>
    </PlatformGate>
  );
}

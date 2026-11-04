"use client";

import { FormEvent, useState } from "react";
import { Ban, IndianRupee, Printer } from "lucide-react";
import { secondaryButtonClass } from "@/components/admin/billing/platform-gate";
import { paymentMethods, type InvoiceRecord } from "@/components/admin/billing/billing-types";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { Field, Notice, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { calendarDate, formatINR } from "@/modules/billing/billing-rules";
import { api } from "@/lib/admin/api";

export function PrintButton() {
  return (
    <button className={secondaryButtonClass} type="button" onClick={() => window.print()}>
      <Printer className="h-4 w-4 text-brand-700" aria-hidden="true" />
      Print or save as PDF
    </button>
  );
}

type Mode = "pay" | "void" | null;

export function InvoiceActions({ invoice, onChanged }: { invoice: InvoiceRecord; onChanged: (message: string) => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [today] = useState(() => calendarDate(new Date()));
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const open = invoice.status === "ISSUED";

  function choose(next: Mode) {
    setMode((current) => (current === next ? null : next));
    setMessage("");
    setFieldErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setFieldErrors({});
    setPending(true);
    try {
      if (mode === "pay") {
        await api(`/api/v1/billing/invoices/${invoice.id}/payment`, {
          method: "POST",
          school: false,
          body: { paidOn: form.get("paidOn"), method: form.get("method"), reference: form.get("reference") },
        });
        onChanged(`Payment recorded. ${invoice.number} is paid.`);
      } else {
        await api(`/api/v1/billing/invoices/${invoice.id}/void`, { method: "POST", school: false, body: { reason: form.get("reason") } });
        onChanged(`${invoice.number} was voided. The period can be invoiced again.`);
      }
      setMode(null);
    } catch (caught) {
      const result = failureOf(caught, "Could not update the invoice.");
      setFieldErrors(result.fields);
      setMessage(result.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 print:hidden">
      <div className="flex flex-wrap gap-2">
        <PrintButton />
        {open ? (
          <>
            <button className={secondaryButtonClass} type="button" aria-expanded={mode === "pay"} onClick={() => choose("pay")}>
              <IndianRupee className="h-4 w-4 text-brand-700" aria-hidden="true" />
              Record payment
            </button>
            <button className={secondaryButtonClass} type="button" aria-expanded={mode === "void"} onClick={() => choose("void")}>
              <Ban className="h-4 w-4 text-red-600" aria-hidden="true" />
              Void invoice
            </button>
          </>
        ) : null}
      </div>
      {mode ? (
        <Panel>
          {message ? <div className="mb-3"><Notice>{message}</Notice></div> : null}
          <ValidatedForm key={mode} className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={submit}>
            {mode === "pay" ? (
              <>
                <p className="text-sm text-slate-600 md:col-span-3">Record the full amount of {formatINR(invoice.totalPaise)} as received.</p>
                <Field label="Paid on"><input className={controlClass} name="paidOn" type="date" min={invoice.issueDate} max={today} defaultValue={today} required /></Field>
                <Field label="Method">
                  <select className={controlClass} name="method" defaultValue="BANK_TRANSFER" required>
                    {paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                  </select>
                </Field>
                <Field label="Reference (UTR, cheque no.)"><input className={controlClass} name="reference" maxLength={120} /></Field>
                <div className="md:col-span-3"><PrimaryButton disabled={pending}>{pending ? "Saving…" : "Mark as paid"}</PrimaryButton></div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600 md:col-span-3">Voiding keeps the invoice number on record but cancels the amount. Only the latest invoice of a subscription can be voided.</p>
                <div className="md:col-span-2"><Field label="Reason"><input className={controlClass} name="reason" minLength={3} maxLength={300} required /></Field></div>
                <div className="md:col-span-3"><PrimaryButton disabled={pending}>{pending ? "Voiding…" : "Void invoice"}</PrimaryButton></div>
              </>
            )}
          </ValidatedForm>
        </Panel>
      ) : null}
    </div>
  );
}

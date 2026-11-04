"use client";

import { useParams } from "next/navigation";
import { PrintButton } from "@/components/admin/billing/invoice-actions";
import { InvoiceDocument } from "@/components/admin/billing/invoice-document";
import { InvoiceStatePill } from "@/components/admin/billing/invoice-state";
import { BackLink } from "@/components/admin/billing/platform-gate";
import { useResource } from "@/components/admin/billing/use-resource";
import type { InvoiceRecord } from "@/components/admin/billing/billing-types";
import { Notice, Panel } from "@/components/admin/ui";

export default function MyInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useResource<InvoiceRecord>(`/api/v1/billing/invoices/${id}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href="/admin/my-billing">Billing</BackLink>
        {invoice.data ? (
          <span className="inline-flex items-center gap-3">
            <InvoiceStatePill invoice={invoice.data} />
            <PrintButton />
          </span>
        ) : null}
      </div>
      {invoice.error ? <Notice>{invoice.error}</Notice> : null}
      {invoice.data ? <InvoiceDocument invoice={invoice.data} /> : (
        <Panel><p className="py-6 text-center text-sm text-slate-500">{invoice.error ? "Go back and choose the invoice again." : "Loading…"}</p></Panel>
      )}
    </div>
  );
}

"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { InvoiceActions } from "@/components/admin/billing/invoice-actions";
import { InvoiceDocument } from "@/components/admin/billing/invoice-document";
import { InvoiceStatePill } from "@/components/admin/billing/invoice-state";
import { BackLink, PlatformGate } from "@/components/admin/billing/platform-gate";
import { useResource } from "@/components/admin/billing/use-resource";
import type { InvoiceRecord } from "@/components/admin/billing/billing-types";
import { Notice, Panel } from "@/components/admin/ui";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useResource<InvoiceRecord>(`/api/v1/billing/invoices/${id}`);
  const [notice, setNotice] = useState("");

  return (
    <PlatformGate title="Invoice">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <BackLink href="/admin/billing/invoices">All invoices</BackLink>
          {invoice.data ? <span className="inline-flex items-center gap-2 text-sm text-slate-500">{invoice.data.entityName} <InvoiceStatePill invoice={invoice.data} /></span> : null}
        </div>
        {notice ? <div className="print:hidden"><Notice tone="ok">{notice}</Notice></div> : null}
        {invoice.error ? <Notice>{invoice.error}</Notice> : null}
        {invoice.data ? (
          <>
            <InvoiceActions
              invoice={invoice.data}
              onChanged={(message) => {
                setNotice(message);
                invoice.reload();
              }}
            />
            <InvoiceDocument invoice={invoice.data} />
          </>
        ) : (
          <Panel><p className="py-6 text-center text-sm text-slate-500">{invoice.error ? "Go back and choose the invoice again." : "Loading…"}</p></Panel>
        )}
      </div>
    </PlatformGate>
  );
}

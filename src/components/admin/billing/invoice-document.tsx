import Image from "next/image";
import { amountInWords, calendarDate, cycleLabels, formatDate, formatINR, formatPeriod, periodDates } from "@/modules/billing/billing-rules";
import { stateName } from "@/modules/billing/gst-states";
import { paymentMethodLabel, type InvoiceRecord } from "@/components/admin/billing/billing-types";

function Party({ title, name, address, stateCode, gstin, extra }: { title: string; name: string; address: string; stateCode: string; gstin: string; extra?: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <p className="mt-1 font-semibold text-slate-900">{name}</p>
      {address ? <p className="whitespace-pre-line text-slate-600">{address}</p> : null}
      <p className="text-slate-600">State: {stateName(stateCode)} ({stateCode})</p>
      {gstin ? <p className="text-slate-600">GSTIN: {gstin}</p> : null}
      {extra?.filter(Boolean).map((line) => <p key={line} className="text-slate-600">{line}</p>)}
    </div>
  );
}

export function InvoiceDocument({ invoice }: { invoice: InvoiceRecord }) {
  const period = { start: invoice.periodStart, end: invoice.periodEnd };
  const dates = periodDates(period);
  const intra = invoice.taxType === "INTRA";
  const half = invoice.taxRate / 2;
  return (
    <article className="invoice-document rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <Image src="/brand/proxitrace-logo.png" alt="ProxiTrace" width={960} height={264} sizes="200px" className="h-auto w-[200px]" />
          <p className="mt-2 text-xs text-slate-500">Smart proximity and tracking platform</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tracking-tight text-slate-900">{invoice.status === "VOID" ? "Tax invoice (void)" : "Tax invoice"}</p>
          <p className="mt-1 font-medium text-slate-900">{invoice.number}</p>
          <p className="text-slate-500">Date: {formatDate(invoice.issueDate)}</p>
          <p className="text-slate-500">Due: {formatDate(invoice.dueDate)}</p>
        </div>
      </header>

      <section className="grid gap-6 border-b border-slate-200 py-5 md:grid-cols-2">
        <Party
          title="From"
          name={invoice.seller.legalName}
          address={invoice.seller.address}
          stateCode={invoice.seller.stateCode}
          gstin={invoice.seller.gstin}
          extra={[invoice.seller.pan ? `PAN: ${invoice.seller.pan}` : "", invoice.seller.email, invoice.seller.phone]}
        />
        <Party
          title="Bill to"
          name={invoice.billTo.name}
          address={invoice.billTo.address}
          stateCode={invoice.billTo.stateCode}
          gstin={invoice.billTo.gstin}
          extra={[invoice.billTo.email, `Place of supply: ${stateName(invoice.billTo.stateCode)}`]}
        />
      </section>

      <section className="flex flex-wrap gap-x-8 gap-y-1 border-b border-slate-200 py-4 text-slate-600">
        <p><span className="text-slate-500">Service period:</span> {formatPeriod(period)} ({formatDate(dates.from)} to {formatDate(dates.to)})</p>
        <p><span className="text-slate-500">Cycle:</span> {cycleLabels[invoice.cycle]}</p>
        {invoice.planName ? <p><span className="text-slate-500">Plan:</span> {invoice.planName}</p> : null}
        {invoice.seller.sacCode ? <p><span className="text-slate-500">SAC:</span> {invoice.seller.sacCode}</p> : null}
      </section>

      <div className="-mx-6 overflow-x-auto md:-mx-8">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-6 py-2.5 font-semibold md:px-8">Description</th>
              <th className="px-3 py-2.5 text-right font-semibold">Count</th>
              <th className="px-3 py-2.5 text-right font-semibold">Rate / month</th>
              <th className="px-3 py-2.5 text-right font-semibold">Months</th>
              <th className="px-6 py-2.5 text-right font-semibold md:px-8">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.code} className="border-b border-slate-100">
                <td className="px-6 py-2.5 text-slate-900 md:px-8">{line.description}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{line.code === "BASE" ? "—" : line.quantity}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(line.unitPricePaise)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{line.months}</td>
                <td className="px-6 py-2.5 text-right tabular-nums text-slate-900 md:px-8">{formatINR(line.amountPaise)}</td>
              </tr>
            ))}
            {invoice.lines.length === 0 ? (
              <tr><td className="px-6 py-4 text-slate-500 md:px-8" colSpan={5}>Nothing was chargeable in this period.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <section className="flex flex-wrap justify-between gap-6 pt-5">
        <div className="max-w-sm space-y-3">
          <p className="text-slate-600"><span className="text-slate-500">Amount in words:</span> {amountInWords(invoice.totalPaise)}</p>
          {invoice.seller.bankDetails ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pay to</p>
              <p className="mt-1 whitespace-pre-line text-slate-600">{invoice.seller.bankDetails}</p>
            </div>
          ) : null}
        </div>
        <dl className="w-full max-w-xs space-y-1.5 tabular-nums">
          <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatINR(invoice.subtotalPaise)}</dd></div>
          {intra ? (
            <>
              <div className="flex justify-between"><dt className="text-slate-500">CGST {half}%</dt><dd>{formatINR(invoice.cgstPaise)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">SGST {half}%</dt><dd>{formatINR(invoice.sgstPaise)}</dd></div>
            </>
          ) : (
            <div className="flex justify-between"><dt className="text-slate-500">IGST {invoice.taxRate}%</dt><dd>{formatINR(invoice.igstPaise)}</dd></div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900"><dt>Total</dt><dd>{formatINR(invoice.totalPaise)}</dd></div>
        </dl>
      </section>

      {invoice.payment ? (
        <p className="mt-5 rounded-lg bg-aqua-50 px-3 py-2 text-aqua-900">
          Paid on {formatDate(invoice.payment.paidOn)} by {paymentMethodLabel(invoice.payment.method)}{invoice.payment.reference ? `, reference ${invoice.payment.reference}` : ""}.
        </p>
      ) : null}
      {invoice.status === "VOID" ? <p className="mt-5 rounded-lg bg-slate-100 px-3 py-2 text-slate-700">This invoice was voided: {invoice.voidReason}</p> : null}
      <p className="mt-6 text-xs text-slate-400">Counts were taken on {formatDate(calendarDate(new Date(invoice.countedAt)))}. This is a computer-generated invoice.</p>
    </article>
  );
}

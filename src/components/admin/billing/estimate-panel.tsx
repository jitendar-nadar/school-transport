"use client";

import type { ReactNode } from "react";
import { cycleLabels, formatINR, formatPeriod, metricLabels, metricsFor, type BillingEntityType, type Counts, type Cycle, type Period } from "@/modules/billing/billing-rules";
import type { Estimate } from "@/components/admin/billing/billing-types";

export function CountTiles({ entityType, counts }: { entityType: BillingEntityType; counts: Counts }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {metricsFor[entityType].map((metric) => (
        <div key={metric} className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">{metricLabels[metric].label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{counts[metric] ?? 0}</p>
        </div>
      ))}
    </div>
  );
}

export function EstimatePanel({ period, cycle, estimate, ready, action }: { period: Period; cycle: Cycle; estimate: Estimate; ready: boolean; action?: ReactNode }) {
  const tax = estimate.cgstPaise + estimate.sgstPaise + estimate.igstPaise;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Next invoice: {formatPeriod(period)} ({cycleLabels[cycle].toLowerCase()})</p>
          <p className="text-xs text-slate-500">{ready ? "This period has ended and can be invoiced now." : "Estimate from today's counts. The invoice uses the counts when the period ends."}</p>
        </div>
        {action}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {estimate.lines.map((line) => (
            <tr key={line.code} className="border-b border-slate-100">
              <td className="py-2 text-slate-700">{line.description}{line.code === "BASE" ? "" : ` × ${line.quantity}`}{line.months > 1 ? ` × ${line.months} months` : ""}</td>
              <td className="py-2 text-right tabular-nums">{formatINR(line.amountPaise)}</td>
            </tr>
          ))}
          {estimate.lines.length === 0 ? <tr><td className="py-2 text-slate-500" colSpan={2}>No prices are set, so the invoice would be zero.</td></tr> : null}
          <tr>
            <td className="pt-2 text-slate-500">GST {estimate.taxRate}% ({estimate.taxType === "INTRA" ? "CGST + SGST" : "IGST"})</td>
            <td className="pt-2 text-right tabular-nums">{formatINR(tax)}</td>
          </tr>
          <tr>
            <td className="pt-1 font-semibold text-slate-900">Total</td>
            <td className="pt-1 text-right font-semibold tabular-nums text-slate-900">{formatINR(estimate.totalPaise)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { useResource } from "@/components/admin/billing/use-resource";
import type { Dues } from "@/components/admin/billing/billing-types";
import { formatINR } from "@/modules/billing/billing-rules";

export function OverdueBanner() {
  const dues = useResource<Dues>("/api/v1/billing/dues");
  const overdue = dues.data?.overdue;
  if (!overdue?.count) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 md:px-6 print:hidden" role="alert">
      <TriangleAlert className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
      <span className="flex-1">
        {overdue.count} invoice{overdue.count === 1 ? " is" : "s are"} overdue, totalling <span className="font-semibold tabular-nums">{formatINR(overdue.totalPaise)}</span>. Please arrange payment to avoid interruption.
      </span>
      <Link className="font-medium text-red-900 underline underline-offset-2 hover:text-red-950" href="/admin/my-billing">View billing</Link>
    </div>
  );
}

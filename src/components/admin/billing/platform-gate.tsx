"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useScope } from "@/components/admin/shell";
import { Notice, PageHeader } from "@/components/admin/ui";

export function PlatformGate({ title, children }: { title: string; children: ReactNode }) {
  const { user } = useScope();
  if (user.role === "PLATFORM_ADMIN") return <>{children}</>;
  return (
    <div className="space-y-5">
      <PageHeader title={title} subtitle="Subscriptions and invoices for every organisation on the platform." />
      <Notice>Only platform administrators manage billing.</Notice>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-800 hover:underline print:hidden" href={href}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

export const primaryLinkClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand-700/20 transition-colors hover:bg-brand-800";

export const secondaryButtonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export const textLinkClass = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50";

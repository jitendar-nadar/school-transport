"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Inbox, Pencil, Search, Trash2, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { Children, cloneElement, isValidElement, useId, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useFieldError } from "@/components/admin/form-error-context";
import { CountUp, easeOut, riseVariants } from "@/components/admin/motion";
import { iconForPath } from "@/components/admin/nav";
import { PAGE_SIZE } from "@/components/admin/use-records";

function HeaderIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-800 ring-1 ring-brand-100" aria-hidden="true">
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function PageHeader({ title, subtitle, icon }: { title: string; subtitle: string; icon?: LucideIcon }) {
  const pathname = usePathname();
  const headerIcon = icon || iconForPath(pathname);
  return (
    <motion.div className="mb-6 flex items-start gap-3.5" variants={riseVariants}>
      {headerIcon ? <HeaderIcon icon={headerIcon} /> : null}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>
      </div>
    </motion.div>
  );
}

export function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]" variants={riseVariants}>
      {children}
    </motion.section>
  );
}

export function StatCard({ label, value, icon: Icon, tone = "brand" }: { label: string; value: number; icon?: LucideIcon; tone?: "brand" | "amber" | "red" }) {
  const tint = tone === "red" ? "bg-red-50 text-red-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-800";
  return (
    <motion.section
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-brand-200"
      variants={riseVariants}
      whileHover={{ y: -3, boxShadow: "0 10px 24px rgba(8,40,71,0.10)" }}
      transition={{ duration: 0.2, ease: easeOut }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        {Icon ? <span className={`grid h-8 w-8 place-items-center rounded-lg ${tint}`} aria-hidden="true"><Icon className="h-4 w-4" /></span> : null}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900"><CountUp value={value} /></p>
    </motion.section>
  );
}

function namedControl(children: ReactNode) {
  let found = "";
  Children.forEach(children, (child) => {
    if (found || !isValidElement(child)) return;
    const name = (child.props as { name?: string }).name;
    if (typeof name === "string") found = name;
  });
  return found;
}

export function Field({ label, name, error, children }: { label: string; name?: string; error?: string; children: React.ReactNode }) {
  const fieldName = name || namedControl(children);
  const contextError = useFieldError(fieldName);
  const message = error || contextError;
  const errorId = useId();
  const control = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const childName = (child.props as { name?: string }).name;
    if (!message || childName !== fieldName) return child;
    return cloneElement(child as ReactElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string }>, {
      "aria-invalid": true,
      "aria-describedby": errorId,
    });
  });
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {control}
      {message ? (
        <motion.span key={message} className="mt-1 block text-sm leading-5 text-red-700" id={errorId} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: easeOut }}>
          {message}
        </motion.span>
      ) : null}
    </label>
  );
}

export const controlClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-700/15";

export function Notice({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "ok" }) {
  const color = tone === "ok" ? "border-aqua-200 bg-aqua-50 text-aqua-900" : "border-red-200 bg-red-50 text-red-800";
  const Icon = tone === "ok" ? CircleCheck : CircleAlert;
  return (
    <motion.div
      key={typeof children === "string" ? children : undefined}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm leading-5 ${color}`}
      initial={{ opacity: 0, y: -6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: easeOut }}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </motion.div>
  );
}

export function PrimaryButton({
  children,
  type = "submit",
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  type?: "submit" | "button";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <motion.button
      className={`inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand-700/20 transition-colors hover:bg-brand-800 active:bg-brand-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none ${className}`}
      disabled={disabled}
      type={type}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15, ease: easeOut }}
    >
      {children}
    </motion.button>
  );
}

export function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete: () => void }) {
  return (
    <span className="inline-flex gap-1 whitespace-nowrap">
      {onEdit ? (
        <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50" type="button" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </button>
      ) : null}
      <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-red-700 transition-colors hover:bg-red-50" type="button" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Delete
      </button>
    </span>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{children}</span>;
}

function cellText(cell: ReactNode): string {
  if (cell == null || typeof cell === "boolean") return "";
  if (typeof cell === "string" || typeof cell === "number") return String(cell);
  if (Array.isArray(cell)) return cell.map(cellText).join(" ");
  if (!isValidElement(cell)) return "";
  const props = cell.props as { children?: ReactNode; value?: string | number };
  if (cell.type === "select") {
    const value = props.value == null ? "" : String(props.value);
    const match = Children.toArray(props.children).find((option) => (
      isValidElement(option) && String((option.props as { value?: string | number }).value ?? "") === value
    ));
    if (isValidElement(match)) return cellText((match.props as { children?: ReactNode }).children);
    return value;
  }
  return cellText(props.children);
}

export function DataTable({
  columns,
  rows,
  empty = "Nothing here yet.",
  paging,
  query,
  onQuery,
}: {
  columns: string[];
  rows: React.ReactNode[][];
  empty?: string;
  paging?: { page: number; totalPages: number; total: number; limit: number; onPage: (page: number) => void };
  query?: string;
  onQuery?: (value: string) => void;
}) {
  const [localQuery, setLocalQuery] = useState("");
  const [localPage, setLocalPage] = useState(1);
  const serverPaged = Boolean(paging);
  const searchValue = serverPaged ? query ?? "" : localQuery;
  const needle = searchValue.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (serverPaged || !needle) return rows;
    return rows.filter((row) => row.some((cell) => cellText(cell).toLowerCase().includes(needle)));
  }, [needle, rows, serverPaged]);
  const total = paging?.total ?? filtered.length;
  const size = paging?.limit || PAGE_SIZE;
  const totalPages = paging?.totalPages ?? Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(paging?.page ?? localPage, totalPages);
  const visible = serverPaged ? rows : filtered.slice((current - 1) * size, current * size);
  const from = total === 0 ? 0 : (current - 1) * size + 1;
  const to = total === 0 ? 0 : Math.min((current - 1) * size + visible.length, total);

  function changeQuery(value: string) {
    if (onQuery) onQuery(value);
    else {
      setLocalQuery(value);
      setLocalPage(1);
    }
  }

  function go(next: number) {
    const page = Math.min(Math.max(next, 1), totalPages);
    if (paging) paging.onPage(page);
    else setLocalPage(page);
  }

  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          className={`${controlClass} pl-9`}
          type="search"
          value={searchValue}
          onChange={(event) => changeQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          placeholder="Search this list"
          aria-label="Search this list"
        />
      </div>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column} className="border-y border-slate-200 px-5 py-2.5 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length ? (
              visible.map((row, index) => (
                <motion.tr
                  key={`${current}-${index}`}
                  className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50/80"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: easeOut, delay: Math.min(index, 12) * 0.025 }}
                >
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-5 py-3 align-middle text-slate-700">
                      {cell}
                    </td>
                  ))}
                </motion.tr>
              ))
            ) : (
              <tr>
                <td className="px-5 py-10 text-center text-slate-500" colSpan={columns.length}>
                  <span className="inline-flex flex-col items-center gap-2">
                    {needle ? <Search className="h-6 w-6 text-slate-300" aria-hidden="true" /> : <Inbox className="h-6 w-6 text-slate-300" aria-hidden="true" />}
                    {needle ? "No rows match that search." : empty}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <p>{total === 0 ? "0 rows" : `${from}–${to} of ${total}`}</p>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-3 text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={current <= 1} onClick={() => go(current - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </button>
          <span>Page {current} of {totalPages}</span>
          <button className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-2 text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={current >= totalPages} onClick={() => go(current + 1)}>
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Children, cloneElement, isValidElement, useId, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useFieldError } from "@/components/admin/form-error-context";
import { PAGE_SIZE } from "@/components/admin/use-records";

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>
    </div>
  );
}

export function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">{children}</section>;
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
  const control = message
    ? Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const childName = (child.props as { name?: string }).name;
        if (childName !== fieldName) return child;
        return cloneElement(child as ReactElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string }>, {
          "aria-invalid": true,
          "aria-describedby": errorId,
        });
      })
    : children;
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {control}
      {message ? <span className="mt-1 block text-sm leading-5 text-red-700" id={errorId}>{message}</span> : null}
    </label>
  );
}

export const controlClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15";

export function Notice({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "ok" }) {
  const color = tone === "ok" ? "border-teal-200 bg-teal-50 text-teal-900" : "border-red-200 bg-red-50 text-red-800";
  return <p className={`rounded-lg border px-3 py-2.5 text-sm leading-5 ${color}`}>{children}</p>;
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
    <button
      className={`inline-flex items-center justify-center rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-900 active:bg-teal-950 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none ${className}`}
      disabled={disabled}
      type={type}
    >
      {children}
    </button>
  );
}

export function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete: () => void }) {
  return (
    <span className="inline-flex gap-3 whitespace-nowrap">
      {onEdit ? <button className="text-sm font-medium text-teal-800 hover:underline" type="button" onClick={onEdit}>Edit</button> : null}
      <button className="text-sm font-medium text-red-700 hover:underline" type="button" onClick={onDelete}>Delete</button>
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
      <div className="mb-4 max-w-sm">
        <input
          className={controlClass}
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
                <tr key={index} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50/80">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-5 py-3 align-middle text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-5 py-10 text-center text-slate-500" colSpan={columns.length}>
                  {needle ? "No rows match that search." : empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <p>{total === 0 ? "0 rows" : `${from}–${to} of ${total}`}</p>
        <div className="flex items-center gap-2">
          <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={current <= 1} onClick={() => go(current - 1)}>Previous</button>
          <span>Page {current} of {totalPages}</span>
          <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={current >= totalPages} onClick={() => go(current + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}

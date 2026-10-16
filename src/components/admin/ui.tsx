"use client";

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
    </div>
  );
}

export function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{children}</section>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export const controlClass = "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-700";

export function Notice({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "ok" }) {
  const color = tone === "ok" ? "border-teal-200 bg-teal-50 text-teal-900" : "border-red-200 bg-red-50 text-red-800";
  return <p className={`rounded-lg border px-3 py-2 text-sm ${color}`}>{children}</p>;
}

export function PrimaryButton({
  children,
  type = "submit",
  disabled = false,
}: {
  children: React.ReactNode;
  type?: "submit" | "button";
  disabled?: boolean;
}) {
  return (
    <button
      className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-slate-300"
      disabled={disabled}
      type={type}
    >
      {children}
    </button>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{children}</span>;
}

export function DataTable({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column} className="border-b border-slate-200 px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={index} className="border-b border-slate-100">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-3 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-3 py-6 text-slate-500" colSpan={columns.length}>
                Nothing here yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

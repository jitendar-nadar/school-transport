"use client";

import { Download, FileSpreadsheet, FileUp, X } from "lucide-react";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { Notice, PrimaryButton } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/admin/api";
import { AGENCY_CARD_CSV_TEMPLATE, readAgencyCardCsv } from "@/modules/agencies/agency-rules";
import { CARD_CSV_TEMPLATE, MAX_IMPORT_ROWS, readCardCsv, type CardImportProblem, type CardImportRow } from "@/modules/ble/ble-import";

const MAX_FILE_BYTES = 1024 * 1024;
const SHOWN_PROBLEMS = 50;
const PREVIEW_ROWS = 5;

type Parsed = { fileName: string; rows: CardImportRow[]; problems: CardImportProblem[] };

function problemsFrom(caught: unknown): CardImportProblem[] {
  if (!(caught instanceof ApiError)) return [];
  const rows = (caught.details as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as CardImportProblem[]) : [];
}

function downloadTemplate(content: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

const headCell = "px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const bodyCell = "px-3 py-1.5 align-top text-slate-700";

export function BleBulkUpload({ onImported, agencyId }: { onImported: (summary: string) => Promise<void> | void; agencyId?: string }) {
  const forAgency = Boolean(agencyId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);

  function clear() {
    setParsed(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function readFile(file: File | undefined) {
    setError("");
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setParsed(null);
      setError("Choose a .csv file. In Excel, use Save As and pick CSV (Comma delimited).");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setParsed(null);
      setError("The file is larger than 1 MB. Split it into smaller files.");
      return;
    }
    const text = await file.text();
    setParsed({ fileName: file.name, ...(forAgency ? readAgencyCardCsv(text) : readCardCsv(text)) });
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files[0]);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed || parsed.problems.length || !parsed.rows.length) return;
    setPending(true);
    setError("");
    try {
      if (forAgency) {
        const rows = parsed.rows.map(({ row, tagIdentifier }) => ({ row, tagIdentifier }));
        const result = await api<{ created: number }>("/api/v1/agency-cards", { method: "POST", school: false, body: { agencyId, rows } });
        clear();
        const { created } = result.data;
        await onImported(`${created} ${created === 1 ? "card" : "cards"} added to stock.`);
        return;
      }
      const result = await api<{ created: number; assigned: number }>("/api/v1/ble-tags/import", { method: "POST", body: { rows: parsed.rows } });
      clear();
      const { created, assigned } = result.data;
      await onImported(`${created} ${created === 1 ? "card" : "cards"} registered${assigned ? `, ${assigned} assigned to ${assigned === 1 ? "a student" : "students"}` : ""}.`);
    } catch (caught) {
      const problems = problemsFrom(caught);
      if (problems.length) setParsed((current) => (current ? { ...current, problems } : current));
      setError(caught instanceof Error ? caught.message : "Could not upload the cards.");
    } finally {
      setPending(false);
    }
  }

  const withStudent = parsed?.rows.filter((row) => row.studentCode).length ?? 0;
  const ready = Boolean(parsed && parsed.rows.length && !parsed.problems.length);

  return (
    <form className="grid gap-3" onSubmit={upload} noValidate>
      <div className="flex items-start justify-between gap-3">
        {forAgency ? (
          <p className="text-sm leading-6 text-slate-600">
            One card per row in a <code className="rounded bg-slate-100 px-1 text-[13px]">tagIdentifier</code> column. Other columns are ignored. Up to {MAX_IMPORT_ROWS} cards per file. New cards go into stock.
          </p>
        ) : (
          <p className="text-sm leading-6 text-slate-600">
            One card per row. Put the card in <code className="rounded bg-slate-100 px-1 text-[13px]">tagIdentifier</code>. Add a <code className="rounded bg-slate-100 px-1 text-[13px]">studentCode</code> to assign the card, or leave it empty. Up to {MAX_IMPORT_ROWS} cards per file.
          </p>
        )}
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50"
          type="button"
          onClick={() => (forAgency ? downloadTemplate(AGENCY_CARD_CSV_TEMPLATE, "agency-cards-template.csv") : downloadTemplate(CARD_CSV_TEMPLATE, "ble-cards-template.csv"))}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Template
        </button>
      </div>
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${dragging ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <FileUp className="h-6 w-6 text-slate-400" aria-hidden="true" />
        <span className="text-sm font-medium text-slate-700">Choose a CSV file</span>
        <span className="text-xs text-slate-500">or drop it here</span>
        <input ref={inputRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event.target.files?.[0])} />
      </label>
      {parsed ? (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{parsed.fileName}</span>
            <span className="shrink-0 text-xs text-slate-500">
              {parsed.rows.length} {parsed.rows.length === 1 ? "card" : "cards"}{forAgency ? "" : ` · ${withStudent} with a student`}
            </span>
            <button className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700" type="button" onClick={clear} aria-label="Remove file">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-60 overflow-auto">
            {parsed.problems.length ? (
              <table className="w-full text-sm">
                <caption className="px-3 pt-2 text-left text-xs font-medium text-red-700">
                  Fix {parsed.problems.length === 1 ? "this problem" : `these ${parsed.problems.length} problems`} in the file, then choose it again.
                </caption>
                <thead>
                  <tr><th className={headCell}>Row</th><th className={headCell}>Card</th><th className={headCell}>Problem</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsed.problems.slice(0, SHOWN_PROBLEMS).map((problem, index) => (
                    <tr key={`${problem.row}-${index}`}>
                      <td className={`${bodyCell} whitespace-nowrap`}>{problem.row || "File"}</td>
                      <td className={`${bodyCell} break-all`}>{problem.tagIdentifier || "—"}</td>
                      <td className={`${bodyCell} text-red-700`}>{problem.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <caption className="px-3 pt-2 text-left text-xs text-slate-500">
                  {parsed.rows.length > PREVIEW_ROWS ? `First ${PREVIEW_ROWS} of ${parsed.rows.length} rows` : "Rows to upload"}
                </caption>
                <thead>
                  <tr><th className={headCell}>Row</th><th className={headCell}>Card</th>{forAgency ? null : <th className={headCell}>Student code</th>}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsed.rows.slice(0, PREVIEW_ROWS).map((row) => (
                    <tr key={row.row}>
                      <td className={bodyCell}>{row.row}</td>
                      <td className={`${bodyCell} break-all`}>{row.tagIdentifier}</td>
                      {forAgency ? null : <td className={bodyCell}>{row.studentCode || <span className="text-slate-400">Unassigned</span>}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {parsed.problems.length > SHOWN_PROBLEMS ? (
              <p className="px-3 py-2 text-xs text-slate-500">And {parsed.problems.length - SHOWN_PROBLEMS} more.</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      <PrimaryButton disabled={!ready || pending}>
        {pending ? "Uploading…" : parsed && ready ? `Upload ${parsed.rows.length} ${parsed.rows.length === 1 ? "card" : "cards"}` : "Upload cards"}
      </PrimaryButton>
    </form>
  );
}

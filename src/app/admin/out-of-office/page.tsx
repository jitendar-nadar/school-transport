"use client";

import { useEffect, useState } from "react";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Company = { id: string; name: string };
type Employee = { id: string; name: string };
type Gap = { id: string; reason: string; status: string; startedAt: string; endedAt: string; employeeId?: { name?: string; employeeCode?: string } };

export default function OutOfOfficePage() {
  const { user } = useScope();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState(user.companyId || "");
  const [employeeOptions, setEmployeeOptions] = useState<Employee[]>([]);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const gaps = usePagedRecords<Gap>(companyId ? `/api/v1/attendance-gaps?companyId=${companyId}` : null, false);

  useEffect(() => {
    if (user.role !== "PLATFORM_ADMIN") return;
    api<Company[]>("/api/v1/companies?limit=100", { school: false }).then((result) => setCompanies(result.data)).catch(() => setCompanies([]));
  }, [user.role]);

  useEffect(() => {
    if (!companyId) return;
    let ignore = false;
    api<Employee[]>(`/api/v1/employees?companyId=${companyId}&limit=100`, { school: false }).then((result) => {
      if (ignore) return;
      setEmployeeOptions(result.data);
      setError("");
    }).catch((caught: unknown) => {
      if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load employees.");
    });
    return () => {
      ignore = true;
    };
  }, [companyId]);

  async function save(formElement: HTMLFormElement) {
    const form = new FormData(formElement);
    setMessage("");
    setFieldErrors({});
    try {
      await api("/api/v1/attendance-gaps", {
        method: "POST",
        school: false,
        body: {
          companyId,
          employeeId: form.get("employeeId"),
          startedAt: form.get("startedAt"),
          endedAt: form.get("endedAt"),
          reason: form.get("reason"),
        },
      });
      formElement.reset();
      setMessage("Gap saved.");
      await gaps.reload();
    } catch (caught) {
      const result = failureOf(caught, "Could not save the gap.");
      setFieldErrors(result.fields);
      setMessage(result.message);
    }
  }

  async function removeGap(id: string) {
    if (!window.confirm("Delete this gap?")) return;
    try {
      await api(`/api/v1/attendance/gaps/${id}?companyId=${companyId}`, { method: "DELETE", school: false });
      setMessage("Gap deleted.");
      await gaps.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete this gap.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Out of office" subtitle="Log time an employee was away from the office by hand. Gaps found from card readings appear here too, and are reviewed on Attendance." />
      {user.role === "PLATFORM_ADMIN" ? (
        <Field label="Company">
          <select className={controlClass} value={companyId} onChange={(event) => { setCompanyId(event.target.value); setMessage(""); setFieldErrors({}); }}>
            <option value="">Select a company</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </Field>
      ) : null}
      {error || gaps.error ? <Notice>{error || gaps.error}</Notice> : null}
      {message ? <Notice tone={message.endsWith("saved.") || message.endsWith("deleted.") ? "ok" : "error"}>{message}</Notice> : null}
      {!companyId ? <Notice>Choose a company to log out-of-office gaps.</Notice> : null}
      {companyId ? (
        <>
          <Panel>
            <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={(event) => {
              event.preventDefault();
              void save(event.currentTarget);
            }}>
              <Field label="Employee">
                <select className={controlClass} name="employeeId" required>
                  <option value="">Select</option>
                  {employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
              </Field>
              <Field label="Gap started"><input className={controlClass} name="startedAt" type="datetime-local" required /></Field>
              <Field label="Gap ended"><input className={controlClass} name="endedAt" type="datetime-local" required /></Field>
              <Field label="Reason"><input className={controlClass} name="reason" /></Field>
              <div className="md:col-span-3"><PrimaryButton>Log out-of-office gap</PrimaryButton></div>
            </ValidatedForm>
          </Panel>
          <Panel>
            <DataTable
              {...listControls(gaps)}
              columns={["Employee", "From", "To", "Status", "Reason", ""]}
              rows={gaps.rows.map((gap) => [
                gap.employeeId?.name || "",
                gap.startedAt?.replace("T", " ").slice(0, 16),
                gap.endedAt?.replace("T", " ").slice(0, 16),
                gap.status,
                gap.reason,
                <RowActions key={gap.id} onDelete={() => { void removeGap(gap.id); }} />,
              ])}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Company = { id: string; name: string };
type Department = { id: string; name: string };
type Employee = { id: string; name: string; employeeCode: string; email?: string; phone?: string; tagIdentifier?: string; consentGranted?: boolean; workMode?: string; departmentId?: { id?: string; name?: string } | string };
type Gap = { id: string; reason: string; status: string; startedAt: string; endedAt: string; employeeId?: { name?: string; employeeCode?: string } };

export default function EmployeesPage() {
  const { user } = useScope();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState(user.companyId || "");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<Employee[]>([]);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [error, setError] = useState("");
  const employees = usePagedRecords<Employee>(companyId ? `/api/v1/employees?companyId=${companyId}` : null, false);
  const gaps = usePagedRecords<Gap>(companyId ? `/api/v1/attendance-gaps?companyId=${companyId}` : null, false);

  useEffect(() => {
    if (user.role !== "PLATFORM_ADMIN") return;
    api<Company[]>("/api/v1/companies?limit=100", { school: false }).then((result) => setCompanies(result.data)).catch(() => setCompanies([]));
  }, [user.role]);

  useEffect(() => {
    if (!companyId) return;
    let ignore = false;
    const query = `?companyId=${companyId}&limit=100`;
    Promise.all([
      api<Department[]>(`/api/v1/departments${query}`, { school: false }),
      api<Employee[]>(`/api/v1/employees${query}`, { school: false }),
    ]).then(([departmentResult, employeeResult]) => {
      if (ignore) return;
      setDepartments(departmentResult.data);
      setEmployeeOptions(employeeResult.data);
      setError("");
    }).catch((caught: unknown) => {
      if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load company records.");
    });
    return () => {
      ignore = true;
    };
  }, [companyId, message]);

  async function save(path: string, body: Record<string, unknown>, formElement: HTMLFormElement, success: string, method: "POST" | "PATCH" = "POST") {
    setMessage("");
    try {
      await api(path, { method, school: false, body: { ...body, companyId } });
      formElement.reset();
      setMessage(success);
      await Promise.all([employees.reload(), gaps.reload()]);
      return true;
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save.");
      return false;
    }
  }

  function departmentIdOf(employee: Employee) {
    return typeof employee.departmentId === "object" ? employee.departmentId?.id || "" : employee.departmentId || "";
  }

  async function removeRecord(path: string, label: string) {
    if (!window.confirm(`Delete ${label}?`)) return;
    try {
      await api(`${path}?companyId=${companyId}`, { method: "DELETE", school: false });
      if (editing && path.includes(editing.id)) setEditing(null);
      setMessage("Record deleted.");
      await Promise.all([employees.reload(), gaps.reload()]);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete this record.");
    }
  }

  function departmentName(employee: Employee) {
    return typeof employee.departmentId === "object" ? employee.departmentId?.name || "" : "";
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Employees" subtitle="Departments, employees, and out-of-office gaps belong to the company, not to a school." />
      {user.role === "PLATFORM_ADMIN" ? (
        <Field label="Company">
          <select className={controlClass} value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">Select a company</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </Field>
      ) : null}
      {error || employees.error || gaps.error ? <Notice>{error || employees.error || gaps.error}</Notice> : null}
      {message ? <Notice tone={message.endsWith("saved.") || message.endsWith("deleted.") ? "ok" : "error"}>{message}</Notice> : null}
      {!companyId ? <Notice>Choose a company to add departments and employees.</Notice> : null}
      {companyId ? (
        <>
          <Panel>
            <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save("/api/v1/departments", { name: form.get("name") }, formElement, "Department saved.");
            }}>
              <Field label="Department"><input className={controlClass} name="name" required /></Field>
              <div className="md:col-span-3"><PrimaryButton>Add department</PrimaryButton></div>
            </form>
          </Panel>
          <Panel>
            <form key={editing?.id || "new"} className="grid gap-3 md:grid-cols-3" onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save(editing ? `/api/v1/employees/${editing.id}?section=profile` : "/api/v1/employees", {
                departmentId: form.get("departmentId"),
                employeeCode: form.get("employeeCode"),
                name: form.get("name"),
                email: form.get("email"),
                phone: form.get("phone"),
              }, formElement, "Employee saved.", editing ? "PATCH" : "POST").then((saved) => {
                if (saved) setEditing(null);
              });
            }}>
              <Field label="Department">
                <select className={controlClass} name="departmentId" defaultValue={editing ? departmentIdOf(editing) : ""} required>
                  <option value="">Select</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </Field>
              <Field label="Employee code"><input className={controlClass} name="employeeCode" defaultValue={editing?.employeeCode || ""} required /></Field>
              <Field label="Name"><input className={controlClass} name="name" defaultValue={editing?.name || ""} required /></Field>
              <Field label="Email"><input className={controlClass} name="email" type="email" defaultValue={editing?.email || ""} /></Field>
              <Field label="Phone"><input className={controlClass} name="phone" defaultValue={editing?.phone || ""} /></Field>
              <div className="flex items-end gap-3 md:col-span-3">
                <PrimaryButton>{editing ? "Save changes" : "Add employee"}</PrimaryButton>
                {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditing(null)}>Cancel</button> : null}
              </div>
            </form>
          </Panel>
          <Panel>
            <DataTable
              {...listControls(employees)}
              columns={["Employee", "Code", "Department", "Card", "Consent", ""]}
              rows={employees.rows.map((employee) => [
                employee.name,
                employee.employeeCode,
                departmentName(employee),
                employee.tagIdentifier || "—",
                employee.consentGranted ? "Yes" : "No",
                <RowActions
                  key={employee.id}
                  onEdit={() => { setEditing(employee); setMessage(""); }}
                  onDelete={() => { void removeRecord(`/api/v1/employees/${employee.id}`, employee.name); }}
                />,
              ])}
            />
          </Panel>
          <Panel>
            <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save(`/api/v1/employees/${form.get("employeeId")}`, {
                tagIdentifier: form.get("tagIdentifier"),
                workMode: form.get("workMode"),
                consentGranted: form.get("consent") === "on",
                loginEmail: form.get("loginEmail"),
                loginPassword: form.get("loginPassword"),
              }, formElement, "Card saved.", "PATCH");
            }}>
              <Field label="Employee">
                <select className={controlClass} name="employeeId" required>
                  <option value="">Select</option>
                  {employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
              </Field>
              <Field label="Card id"><input className={controlClass} name="tagIdentifier" /></Field>
              <Field label="Work">
                <select className={controlClass} name="workMode" defaultValue="OFFICE">
                  <option value="OFFICE">Office</option>
                  <option value="FIELD">Field</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input name="consent" type="checkbox" /> Written monitoring consent received</label>
              <Field label="Login email"><input className={controlClass} name="loginEmail" type="email" /></Field>
              <Field label="Login password"><input className={controlClass} name="loginPassword" type="password" /></Field>
              <div className="md:col-span-3"><PrimaryButton>Save card and consent</PrimaryButton></div>
            </form>
          </Panel>
          <Panel>
            <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save("/api/v1/attendance-gaps", {
                employeeId: form.get("employeeId"),
                startedAt: form.get("startedAt"),
                endedAt: form.get("endedAt"),
                reason: form.get("reason"),
              }, formElement, "Gap saved.");
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
            </form>
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
                <RowActions key={gap.id} onDelete={() => { void removeRecord(`/api/v1/attendance/gaps/${gap.id}`, "this gap"); }} />,
              ])}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

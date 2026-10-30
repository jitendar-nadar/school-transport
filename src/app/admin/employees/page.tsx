"use client";

import { useEffect, useState } from "react";
import { EMPTY_FIELD_ERRORS } from "@/components/admin/form-error-context";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Company = { id: string; name: string };
type Department = { id: string; name: string };
type Employee = { id: string; name: string; employeeCode: string; email?: string; phone?: string; tagIdentifier?: string; consentGranted?: boolean; workMode?: string; departmentId?: { id?: string; name?: string } | string };
export default function EmployeesPage() {
  const { user } = useScope();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState(user.companyId || "");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorOwner, setErrorOwner] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [error, setError] = useState("");
  const employees = usePagedRecords<Employee>(companyId ? `/api/v1/employees?companyId=${companyId}` : null, false);

  useEffect(() => {
    if (user.role !== "PLATFORM_ADMIN") return;
    api<Company[]>("/api/v1/companies?limit=100", { school: false }).then((result) => setCompanies(result.data)).catch(() => setCompanies([]));
  }, [user.role]);

  useEffect(() => {
    if (!companyId) return;
    let ignore = false;
    api<Department[]>(`/api/v1/departments?companyId=${companyId}&limit=100`, { school: false }).then((result) => {
      if (ignore) return;
      setDepartments(result.data);
      setError("");
    }).catch((caught: unknown) => {
      if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load company records.");
    });
    return () => {
      ignore = true;
    };
  }, [companyId, message]);

  async function save(owner: string, path: string, body: Record<string, unknown>, formElement: HTMLFormElement, success: string, method: "POST" | "PATCH" = "POST") {
    setMessage("");
    setErrorOwner(owner);
    setFieldErrors({});
    try {
      await api(path, { method, school: false, body: { ...body, companyId } });
      formElement.reset();
      setErrorOwner("");
      setMessage(success);
      await employees.reload();
      return true;
    } catch (caught) {
      const result = failureOf(caught, "Could not save.");
      setErrorOwner(owner);
      setFieldErrors(result.fields);
      setMessage(result.message);
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
      await employees.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete this record.");
    }
  }

  function departmentName(employee: Employee) {
    return typeof employee.departmentId === "object" ? employee.departmentId?.name || "" : "";
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Employees" subtitle="Departments and employees belong to the company, not to a school. Assign cards on Cards and consent, and log gaps on Out of office." />
      {user.role === "PLATFORM_ADMIN" ? (
        <Field label="Company">
          <select className={controlClass} value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">Select a company</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </Field>
      ) : null}
      {error || employees.error ? <Notice>{error || employees.error}</Notice> : null}
      {message ? <Notice tone={message.endsWith("saved.") || message.endsWith("deleted.") ? "ok" : "error"}>{message}</Notice> : null}
      {!companyId ? <Notice>Choose a company to add departments and employees.</Notice> : null}
      {companyId ? (
        <>
          <Panel>
            <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "department" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save("department", "/api/v1/departments", { name: form.get("name") }, formElement, "Department saved.");
            }}>
              <Field label="Department"><input className={controlClass} name="name" minLength={2} required /></Field>
              <div className="md:col-span-3"><PrimaryButton>Add department</PrimaryButton></div>
            </ValidatedForm>
          </Panel>
          <Panel>
            <ValidatedForm key={editing?.id || "new"} className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "employee" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save("employee", editing ? `/api/v1/employees/${editing.id}?section=profile` : "/api/v1/employees", {
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
              <Field label="Employee code"><input className={controlClass} name="employeeCode" minLength={2} maxLength={40} defaultValue={editing?.employeeCode || ""} required /></Field>
              <Field label="Name"><input className={controlClass} name="name" minLength={2} defaultValue={editing?.name || ""} required /></Field>
              <Field label="Email"><input className={controlClass} name="email" type="email" defaultValue={editing?.email || ""} /></Field>
              <Field label="Phone"><input className={controlClass} name="phone" maxLength={20} defaultValue={editing?.phone || ""} /></Field>
              <div className="flex items-end gap-3 md:col-span-3">
                <PrimaryButton>{editing ? "Save changes" : "Add employee"}</PrimaryButton>
                {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditing(null)}>Cancel</button> : null}
              </div>
            </ValidatedForm>
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
        </>
      ) : null}
    </div>
  );
}

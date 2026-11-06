"use client";

import { useEffect, useState } from "react";
import { failureOf, passwordHint, passwordPattern, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Employee = { id: string; name: string; employeeCode: string; tagIdentifier?: string; consentGranted?: boolean; workMode?: string };
type AgencyCard = { id: string; tagIdentifier: string; agencyName: string };

export default function EmployeeCardsPage() {
  const companyId = useScope().companyId || "";
  const [employeeOptions, setEmployeeOptions] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [agencyCards, setAgencyCards] = useState<AgencyCard[]>([]);
  const employees = usePagedRecords<Employee>(companyId ? `/api/v1/employees?companyId=${companyId}` : null, false);
  const selected = employeeOptions.find((employee) => employee.id === selectedId) || null;

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
    api<AgencyCard[]>(`/api/v1/agency-cards/company?companyId=${companyId}`, { school: false })
      .then((result) => {
        if (!ignore) setAgencyCards(result.data);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [companyId, message]);

  function choose(id: string) {
    setSelectedId(id);
    setFieldErrors({});
    setMessage("");
  }

  async function save(formElement: HTMLFormElement) {
    const form = new FormData(formElement);
    setMessage("");
    setFieldErrors({});
    try {
      await api(`/api/v1/employees/${form.get("employeeId")}`, {
        method: "PATCH",
        school: false,
        body: {
          companyId,
          tagIdentifier: form.get("tagIdentifier"),
          workMode: form.get("workMode"),
          consentGranted: form.get("consent") === "on",
          loginEmail: form.get("loginEmail"),
          loginPassword: form.get("loginPassword"),
        },
      });
      setSelectedId("");
      setMessage("Card saved.");
      await employees.reload();
    } catch (caught) {
      const result = failureOf(caught, "Could not save the card.");
      setFieldErrors(result.fields);
      setMessage(result.message);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Cards and consent" subtitle="Give each employee an office card, mark office or field work, and record written monitoring consent. A card is not read until consent is ticked." />
      {error || employees.error ? <Notice>{error || employees.error}</Notice> : null}
      {message ? <Notice tone={message.endsWith("saved.") ? "ok" : "error"}>{message}</Notice> : null}
      {!companyId ? <Notice>Choose a company in the header to manage employee cards.</Notice> : null}
      {companyId ? (
        <>
          <Panel>
            <ValidatedForm key={selectedId || "none"} className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={(event) => {
              event.preventDefault();
              void save(event.currentTarget);
            }}>
              <Field label="Employee">
                <select className={controlClass} name="employeeId" value={selectedId} onChange={(event) => choose(event.target.value)} required>
                  <option value="">Select</option>
                  {employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
              </Field>
              <Field label="Card id">
                <input className={controlClass} name="tagIdentifier" minLength={2} maxLength={64} defaultValue={selected?.tagIdentifier || ""} list={agencyCards.length ? "agency-cards" : undefined} />
              </Field>
              {agencyCards.length ? (
                <datalist id="agency-cards">
                  {agencyCards.map((card) => <option key={card.id} value={card.tagIdentifier}>{`From ${card.agencyName}`}</option>)}
                </datalist>
              ) : null}
              <Field label="Work">
                <select className={controlClass} name="workMode" defaultValue={selected?.workMode || "OFFICE"}>
                  <option value="OFFICE">Office</option>
                  <option value="FIELD">Field</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input name="consent" type="checkbox" defaultChecked={Boolean(selected?.consentGranted)} /> Written monitoring consent received</label>
              <Field label="Login email"><input className={controlClass} name="loginEmail" type="email" /></Field>
              <Field label="Login password"><input className={controlClass} name="loginPassword" type="password" minLength={8} pattern={passwordPattern} title={passwordHint} /></Field>
              <p className="text-sm text-slate-500 md:col-span-3">Fill the login email and password only to create or reset the employee’s My day sign-in.</p>
              {agencyCards.length ? (
                <p className="text-sm text-slate-500 md:col-span-3">{agencyCards.length} {agencyCards.length === 1 ? "card" : "cards"} from your transport agency {agencyCards.length === 1 ? "is" : "are"} waiting to be mapped. Start typing in Card id to pick one.</p>
              ) : null}
              <div className="flex items-end gap-3 md:col-span-3">
                <PrimaryButton>Save card and consent</PrimaryButton>
                {selectedId ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => choose("")}>Cancel</button> : null}
              </div>
            </ValidatedForm>
          </Panel>
          <Panel>
            <DataTable
              {...listControls(employees)}
              columns={["Employee", "Code", "Card", "Work", "Consent", ""]}
              rows={employees.rows.map((employee) => [
                employee.name,
                employee.employeeCode,
                employee.tagIdentifier || "—",
                employee.workMode === "FIELD" ? "Field" : "Office",
                employee.consentGranted ? "Yes" : "No",
                <button key={employee.id} className="text-sm font-medium text-brand-800 hover:underline" type="button" onClick={() => choose(employee.id)}>Edit</button>,
              ])}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

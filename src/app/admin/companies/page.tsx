"use client";

import { FormEvent, useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Company = { id: string; name: string; companyCode: string; status: string; contactEmail: string; contactPhone: string };

export default function CompaniesPage() {
  const companies = usePagedRecords<Company>("/api/v1/companies", false);
  const { rows, error, reload, user } = companies;
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    try {
      await api("/api/v1/companies", {
        method: "POST",
        school: false,
        body: {
          name: form.get("name"),
          companyCode: form.get("companyCode"),
          address: form.get("address"),
          contactEmail: form.get("contactEmail"),
          contactPhone: form.get("contactPhone"),
          adminName: form.get("adminName"),
          adminEmail: form.get("adminEmail"),
          adminPassword: form.get("adminPassword"),
        },
      });
      formElement.reset();
      setMessage("Company created.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not create the company.");
    }
  }

  async function setStatus(id: string, status: string) {
    await api(`/api/v1/companies/${id}`, { method: "PATCH", school: false, body: { status } });
    await reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Companies" subtitle="Company attendance is stored separately from schools. Each company gets its own admin login." />
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone={message.includes("created") ? "ok" : "error"}>{message}</Notice> : null}
      {user.role === "PLATFORM_ADMIN" ? (
        <Panel>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
            <Field label="Company name"><input className={controlClass} name="name" required /></Field>
            <Field label="Company code"><input className={controlClass} name="companyCode" required /></Field>
            <Field label="Address"><input className={controlClass} name="address" /></Field>
            <Field label="Contact email"><input className={controlClass} name="contactEmail" type="email" required /></Field>
            <Field label="Contact phone"><input className={controlClass} name="contactPhone" required /></Field>
            <Field label="Admin name"><input className={controlClass} name="adminName" required /></Field>
            <Field label="Admin email"><input className={controlClass} name="adminEmail" type="email" required /></Field>
            <Field label="Admin password">
              <input className={controlClass} name="adminPassword" type="password" required />
              <span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters, with a letter and a number.</span>
            </Field>
            <div className="md:col-span-3"><PrimaryButton>Create company</PrimaryButton></div>
          </form>
        </Panel>
      ) : null}
      <Panel>
        <DataTable
          {...listControls(companies)}
          columns={["Company", "Code", "Contact", "Status"]}
          rows={rows.map((company) => [
            company.name,
            company.companyCode,
            `${company.contactEmail} · ${company.contactPhone}`,
            user.role === "PLATFORM_ADMIN" ? (
              <select key={company.id} className={controlClass} value={company.status} onChange={(event) => void setStatus(company.id, event.target.value)}>
                <option value="TRIAL">TRIAL</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            ) : company.status,
          ])}
        />
      </Panel>
    </div>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { useScope } from "@/components/admin/shell";
import { failureOf, passwordHint, passwordPattern, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Person = { id: string; name: string; email: string; phone: string; role: string; status: string };

export default function UsersPage() {
  const { user, schoolId } = useScope();
  const people = usePagedRecords<Person>("/api/v1/users");
  const { rows, error, reload } = people;
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Person | null>(null);
  const roles = ["SCHOOL_ADMIN", "DRIVER", "ATTENDANT", "PARENT"];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setFieldErrors({});
    const password = String(form.get("password") || "");
    const body: Record<string, unknown> = {
      name: form.get("name"),
      phone: form.get("phone"),
      role: form.get("role"),
    };
    if (!editing) body.email = form.get("email");
    if (password) body.password = password;
    try {
      await api(editing ? `/api/v1/users/${editing.id}` : "/api/v1/users", {
        method: editing ? "PATCH" : "POST",
        body,
      });
      formElement.reset();
      setEditing(null);
      setMessage("Person saved.");
      await reload();
    } catch (caught) {
      const result = failureOf(caught, "Could not save this person.");
      setFieldErrors(result.fields);
      setMessage(result.message);
    }
  }

  async function removePerson(person: Person) {
    if (!window.confirm(`Delete ${person.name}?`)) return;
    try {
      await api(`/api/v1/users/${person.id}`, { method: "DELETE" });
      if (editing?.id === person.id) setEditing(null);
      setMessage("Person deleted.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete this person.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="People" subtitle="Parents, drivers, attendants, and school administrators for the selected school." />
      {user.role === "PLATFORM_ADMIN" && !schoolId ? <Notice>Select a school before adding people.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") || message.includes("deleted") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <ValidatedForm key={editing?.id || "new"} className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={onSubmit}>
          <Field label="Name"><input className={controlClass} name="name" minLength={2} defaultValue={editing?.name || ""} required /></Field>
          <Field label="Email"><input className={controlClass} name="email" type="email" defaultValue={editing?.email || ""} required disabled={Boolean(editing)} /></Field>
          <Field label="Phone"><input className={controlClass} name="phone" minLength={8} maxLength={20} defaultValue={editing?.phone || ""} required /></Field>
          <Field label={editing ? "New password" : "Temporary password"} name="password">
            <input className={controlClass} name="password" type="password" minLength={8} pattern={passwordPattern} title={passwordHint} required={!editing} />
            <span className="mt-1 block text-xs font-normal text-slate-500">{editing ? "Leave blank to keep the current password." : "At least 8 characters, with a letter and a number."}</span>
          </Field>
          <Field label="Role">
            <select className={controlClass} name="role" defaultValue={editing?.role || "PARENT"}>
              {roles.map((role) => <option key={role}>{role}</option>)}
            </select>
          </Field>
          <div className="flex items-end gap-3">
            <PrimaryButton>{editing ? "Save changes" : "Add person"}</PrimaryButton>
            {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditing(null)}>Cancel</button> : null}
          </div>
        </ValidatedForm>
      </Panel>
      <Panel>
        <DataTable
          {...listControls(people)}
          columns={["Name", "Role", "Email", "Phone", "Status", ""]}
          rows={rows.map((person) => [
            person.name,
            person.role,
            person.email,
            person.phone,
            person.status,
            <RowActions key={person.id} onEdit={() => { setEditing(person); setMessage(""); setFieldErrors({}); }} onDelete={() => { void removePerson(person); }} />,
          ])}
        />
      </Panel>
    </div>
  );
}

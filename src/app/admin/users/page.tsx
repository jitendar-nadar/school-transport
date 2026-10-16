"use client";

import { FormEvent, useState } from "react";
import { useScope } from "@/components/admin/shell";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Person = { id: string; name: string; email: string; phone: string; role: string; status: string };

export default function UsersPage() {
  const { user, schoolId } = useScope();
  const { rows, error, reload } = useRecords<Person>("/api/v1/users?limit=100");
  const [message, setMessage] = useState("");
  const roles = user.role === "PLATFORM_ADMIN" ? ["SCHOOL_ADMIN", "DRIVER", "ATTENDANT", "PARENT"] : ["SCHOOL_ADMIN", "DRIVER", "ATTENDANT", "PARENT"];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/api/v1/users", {
        method: "POST",
        body: {
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          password: form.get("password"),
          role: form.get("role"),
        },
      });
      formElement.reset();
      setMessage("Person saved.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save this person.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="People" subtitle="Parents, drivers, attendants, and school administrators for the selected school." />
      {user.role === "PLATFORM_ADMIN" && !schoolId ? <Notice>Select a school before adding people.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          <Field label="Name"><input className={controlClass} name="name" required /></Field>
          <Field label="Email"><input className={controlClass} name="email" type="email" required /></Field>
          <Field label="Phone"><input className={controlClass} name="phone" required /></Field>
          <Field label="Temporary password">
            <input className={controlClass} name="password" type="password" minLength={8} required />
            <span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters, with a letter and a number.</span>
          </Field>
          <Field label="Role">
            <select className={controlClass} name="role" defaultValue="PARENT">
              {roles.map((role) => <option key={role}>{role}</option>)}
            </select>
          </Field>
          <div className="flex items-end"><PrimaryButton>Add person</PrimaryButton></div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          columns={["Name", "Role", "Email", "Phone", "Status"]}
          rows={rows.map((person) => [person.name, person.role, person.email, person.phone, person.status])}
        />
      </Panel>
    </div>
  );
}

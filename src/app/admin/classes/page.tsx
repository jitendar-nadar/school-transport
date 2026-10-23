"use client";

import { FormEvent, useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type SchoolClass = { id: string; name: string; division: string };

export default function ClassesPage() {
  const classes = usePagedRecords<SchoolClass>("/api/v1/classes");
  const { rows, error, reload, user, schoolId } = classes;
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<SchoolClass | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    try {
      await api(editing ? `/api/v1/classes/${editing.id}` : "/api/v1/classes", {
        method: editing ? "PATCH" : "POST",
        body: { name: form.get("name"), division: form.get("division"), schoolId },
      });
      formElement.reset();
      setEditing(null);
      setMessage("Class saved.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save the class.");
    }
  }

  async function removeClass(row: SchoolClass) {
    if (!window.confirm(`Delete ${row.name}${row.division ? ` ${row.division}` : ""}?`)) return;
    try {
      await api(`/api/v1/classes/${row.id}`, { method: "DELETE" });
      if (editing?.id === row.id) setEditing(null);
      setMessage("Class deleted.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the class.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Classes" subtitle="Classes belong to the school and are used for classroom attendance. They are not company departments." />
      {user.role === "PLATFORM_ADMIN" && !schoolId ? <Notice>Select a school in the header first.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") || message.includes("deleted") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <form key={editing?.id || "new"} className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          <Field label="Class"><input className={controlClass} name="name" defaultValue={editing?.name || ""} required /></Field>
          <Field label="Division"><input className={controlClass} name="division" defaultValue={editing?.division || ""} /></Field>
          <div className="flex items-end gap-3 md:col-span-3">
            <PrimaryButton>{editing ? "Save changes" : "Add class"}</PrimaryButton>
            {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditing(null)}>Cancel</button> : null}
          </div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          {...listControls(classes)}
          columns={["Class", "Division", ""]}
          rows={rows.map((row) => [
            row.name,
            row.division || "—",
            <RowActions key={row.id} onEdit={() => { setEditing(row); setMessage(""); }} onDelete={() => { void removeClass(row); }} />,
          ])}
        />
      </Panel>
    </div>
  );
}

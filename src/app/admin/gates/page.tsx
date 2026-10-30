"use client";

import { FormEvent, useState } from "react";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Gate = { id: string; name: string };

export default function GatesPage() {
  const gates = usePagedRecords<Gate>("/api/v1/gates");
  const { rows, error, reload, user, schoolId } = gates;
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Gate | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setFieldErrors({});
    try {
      await api(editing ? `/api/v1/gates/${editing.id}` : "/api/v1/gates", {
        method: editing ? "PATCH" : "POST",
        body: { name: form.get("name"), schoolId },
      });
      formElement.reset();
      setEditing(null);
      setMessage("Gate saved.");
      await reload();
    } catch (caught) {
      const result = failureOf(caught, "Could not save the gate.");
      setFieldErrors(result.fields);
      setMessage(result.message);
    }
  }

  async function removeGate(gate: Gate) {
    if (!window.confirm(`Delete ${gate.name}?`)) return;
    try {
      await api(`/api/v1/gates/${gate.id}`, { method: "DELETE" });
      if (editing?.id === gate.id) setEditing(null);
      setMessage("Gate deleted.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the gate.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="School gates" subtitle="Gate entry and exit stay on the school. A gate uses two nodes: outside, then inside, marks an entry." />
      {user.role === "PLATFORM_ADMIN" && !schoolId ? <Notice>Select a school in the header first.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") || message.includes("deleted") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <ValidatedForm key={editing?.id || "new"} className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={onSubmit}>
          <Field label="Gate name"><input className={controlClass} name="name" minLength={2} defaultValue={editing?.name || ""} required /></Field>
          <div className="flex items-end gap-3 md:col-span-3">
            <PrimaryButton>{editing ? "Save changes" : "Add gate"}</PrimaryButton>
            {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditing(null)}>Cancel</button> : null}
          </div>
        </ValidatedForm>
      </Panel>
      <Panel>
        <DataTable
          {...listControls(gates)}
          columns={["Gate", ""]}
          rows={rows.map((gate) => [
            gate.name,
            <RowActions key={gate.id} onEdit={() => { setEditing(gate); setMessage(""); setFieldErrors({}); }} onDelete={() => { void removeGate(gate); }} />,
          ])}
        />
      </Panel>
    </div>
  );
}

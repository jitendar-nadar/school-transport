"use client";

import { FormEvent, useState } from "react";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords, useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Named = { id: string; name: string; routeCode?: string };
type Linked = { id?: string; name?: string };
type Assignment = {
  id: string;
  status: string;
  studentId?: Linked;
  morningRouteId?: Linked | null;
  afternoonRouteId?: Linked | null;
  morningStopId?: Linked | null;
  afternoonStopId?: Linked | null;
};

export default function AssignmentsPage() {
  const assignments = usePagedRecords<Assignment>("/api/v1/transport-assignments");
  const students = useRecords<Named>("/api/v1/students?limit=100");
  const routes = useRecords<Named & { direction?: string }>("/api/v1/routes?limit=100");
  const stops = useRecords<Named>("/api/v1/stops?limit=100");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Assignment | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const value = (name: string) => String(form.get(name) || "") || null;
    setMessage("");
    setFieldErrors({});
    try {
      await api(editing ? `/api/v1/transport-assignments/${editing.id}` : "/api/v1/transport-assignments", {
        method: editing ? "PATCH" : "POST",
        body: {
          studentId: form.get("studentId"),
          morningRouteId: value("morningRouteId"),
          morningStopId: value("morningStopId"),
          afternoonRouteId: value("afternoonRouteId"),
          afternoonStopId: value("afternoonStopId"),
        },
      });
      formElement.reset();
      setEditing(null);
      setMessage("Assignment saved.");
      await assignments.reload();
    } catch (caught) {
      const result = failureOf(caught, "Could not save the assignment.");
      setFieldErrors(result.fields);
      setMessage(result.message);
    }
  }

  async function removeAssignment(item: Assignment) {
    const name = item.studentId?.name || "this assignment";
    if (!window.confirm(`Delete the assignment for ${name}?`)) return;
    try {
      await api(`/api/v1/transport-assignments/${item.id}`, { method: "DELETE" });
      if (editing?.id === item.id) setEditing(null);
      setMessage("Assignment deleted.");
      await assignments.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the assignment.");
    }
  }

  const pickup = routes.rows.filter((route) => route.direction === "PICKUP");
  const drop = routes.rows.filter((route) => route.direction === "DROP");

  return (
    <div className="space-y-5">
      <PageHeader title="Assignments" subtitle="A student can have a different morning pickup and afternoon drop. Later edits do not rewrite old trips." />
      {assignments.error ? <Notice>{assignments.error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") || message.includes("deleted") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <ValidatedForm key={editing?.id || "new"} className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={onSubmit}>
          <Field label="Student">
            <select className={controlClass} name="studentId" defaultValue={editing?.studentId?.id || ""} required>
              <option value="">Choose</option>
              {students.rows.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
            </select>
          </Field>
          <Field label="Morning route">
            <select className={controlClass} name="morningRouteId" defaultValue={editing?.morningRouteId?.id || ""}><option value="">None</option>{pickup.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select>
          </Field>
          <Field label="Morning stop">
            <select className={controlClass} name="morningStopId" defaultValue={editing?.morningStopId?.id || ""}><option value="">None</option>{stops.rows.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}</select>
          </Field>
          <Field label="Afternoon route">
            <select className={controlClass} name="afternoonRouteId" defaultValue={editing?.afternoonRouteId?.id || ""}><option value="">None</option>{drop.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select>
          </Field>
          <Field label="Afternoon stop">
            <select className={controlClass} name="afternoonStopId" defaultValue={editing?.afternoonStopId?.id || ""}><option value="">None</option>{stops.rows.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}</select>
          </Field>
          <div className="flex items-end gap-3">
            <PrimaryButton>{editing ? "Save changes" : "Save assignment"}</PrimaryButton>
            {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditing(null)}>Cancel</button> : null}
          </div>
        </ValidatedForm>
      </Panel>
      <Panel>
        <DataTable
          {...listControls(assignments)}
          columns={["Student", "Morning", "Morning stop", "Afternoon", "Afternoon stop", "Status", ""]}
          rows={assignments.rows.map((item) => [
            item.studentId?.name || "",
            item.morningRouteId?.name || "—",
            item.morningStopId?.name || "—",
            item.afternoonRouteId?.name || "—",
            item.afternoonStopId?.name || "—",
            item.status,
            <RowActions key={item.id} onEdit={() => { setEditing(item); setMessage(""); setFieldErrors({}); }} onDelete={() => { void removeAssignment(item); }} />,
          ])}
        />
      </Panel>
    </div>
  );
}

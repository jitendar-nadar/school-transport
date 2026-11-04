"use client";

import { FormEvent, useState } from "react";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords, useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Named = { id: string; name: string; routeCode?: string };
type Linked = { id?: string; name?: string };
type RouteRow = Named & { direction?: string; stops?: Array<Linked | string> };
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
  const routes = useRecords<RouteRow>("/api/v1/routes?limit=100");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [pickupRouteId, setPickupRouteId] = useState("");
  const [dropRouteId, setDropRouteId] = useState("");

  function startEditing(item: Assignment | null) {
    setEditing(item);
    setPickupRouteId(item?.morningRouteId?.id || "");
    setDropRouteId(item?.afternoonRouteId?.id || "");
  }

  function stopsOn(routeId: string) {
    const route = routes.rows.find((item) => item.id === routeId);
    return (route?.stops || []).filter((stop): stop is Linked => typeof stop === "object" && Boolean(stop?.id));
  }

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
      startEditing(null);
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
      if (editing?.id === item.id) startEditing(null);
      setMessage("Assignment deleted.");
      await assignments.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the assignment.");
    }
  }

  const pickup = routes.rows.filter((route) => route.direction === "PICKUP");
  const drop = routes.rows.filter((route) => route.direction === "DROP");

  function stopSelect(name: string, routeId: string, savedRouteId?: string, savedStopId?: string) {
    const options = stopsOn(routeId);
    const initial = routeId && routeId === savedRouteId ? savedStopId || "" : "";
    const placeholder = !routeId ? "Choose a route first" : options.length ? "None" : "This route has no stops";
    return (
      <select key={`${name}-${routeId}`} className={controlClass} name={name} defaultValue={initial} disabled={!routeId}>
        <option value="">{placeholder}</option>
        {options.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
      </select>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Assignments" subtitle="A student can have a different pickup and drop route and stop. Later edits do not rewrite old trips." />
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
          <Field label="Pickup route">
            <select className={controlClass} name="morningRouteId" value={pickupRouteId} onChange={(event) => setPickupRouteId(event.target.value)}><option value="">None</option>{pickup.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select>
          </Field>
          <Field label="Pickup stop">
            {stopSelect("morningStopId", pickupRouteId, editing?.morningRouteId?.id, editing?.morningStopId?.id)}
          </Field>
          <Field label="Drop route">
            <select className={controlClass} name="afternoonRouteId" value={dropRouteId} onChange={(event) => setDropRouteId(event.target.value)}><option value="">None</option>{drop.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select>
          </Field>
          <Field label="Drop stop">
            {stopSelect("afternoonStopId", dropRouteId, editing?.afternoonRouteId?.id, editing?.afternoonStopId?.id)}
          </Field>
          <div className="flex items-end gap-3">
            <PrimaryButton>{editing ? "Save changes" : "Save assignment"}</PrimaryButton>
            {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => startEditing(null)}>Cancel</button> : null}
          </div>
        </ValidatedForm>
      </Panel>
      <Panel>
        <DataTable
          {...listControls(assignments)}
          columns={["Student", "Pickup route", "Pickup stop", "Drop route", "Drop stop", "Status", ""]}
          rows={assignments.rows.map((item) => [
            item.studentId?.name || "",
            item.morningRouteId?.name || "—",
            item.morningStopId?.name || "—",
            item.afternoonRouteId?.name || "—",
            item.afternoonStopId?.name || "—",
            item.status,
            <RowActions key={item.id} onEdit={() => { startEditing(item); setMessage(""); setFieldErrors({}); }} onDelete={() => { void removeAssignment(item); }} />,
          ])}
        />
      </Panel>
    </div>
  );
}

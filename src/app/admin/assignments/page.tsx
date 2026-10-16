"use client";

import { FormEvent, useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Named = { id: string; name: string; routeCode?: string };
type Assignment = {
  id: string;
  status: string;
  studentId?: { name?: string };
  morningRouteId?: { name?: string };
  afternoonRouteId?: { name?: string };
  morningStopId?: { name?: string };
  afternoonStopId?: { name?: string };
};

export default function AssignmentsPage() {
  const assignments = useRecords<Assignment>("/api/v1/transport-assignments?limit=100");
  const students = useRecords<Named>("/api/v1/students?limit=100");
  const routes = useRecords<Named & { direction?: string }>("/api/v1/routes?limit=100");
  const stops = useRecords<Named>("/api/v1/stops?limit=100");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const value = (name: string) => String(form.get(name) || "") || null;
    try {
      await api("/api/v1/transport-assignments", {
        method: "POST",
        body: {
          studentId: form.get("studentId"),
          morningRouteId: value("morningRouteId"),
          morningStopId: value("morningStopId"),
          afternoonRouteId: value("afternoonRouteId"),
          afternoonStopId: value("afternoonStopId"),
        },
      });
      formElement.reset();
      setMessage("Assignment saved.");
      await assignments.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save the assignment.");
    }
  }

  const pickup = routes.rows.filter((route) => route.direction === "PICKUP");
  const drop = routes.rows.filter((route) => route.direction === "DROP");

  return (
    <div className="space-y-5">
      <PageHeader title="Assignments" subtitle="A student can have a different morning pickup and afternoon drop. Later edits do not rewrite old trips." />
      {assignments.error ? <Notice>{assignments.error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          <Field label="Student">
            <select className={controlClass} name="studentId" required>
              <option value="">Choose</option>
              {students.rows.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
            </select>
          </Field>
          <Field label="Morning route">
            <select className={controlClass} name="morningRouteId"><option value="">None</option>{pickup.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select>
          </Field>
          <Field label="Morning stop">
            <select className={controlClass} name="morningStopId"><option value="">None</option>{stops.rows.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}</select>
          </Field>
          <Field label="Afternoon route">
            <select className={controlClass} name="afternoonRouteId"><option value="">None</option>{drop.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select>
          </Field>
          <Field label="Afternoon stop">
            <select className={controlClass} name="afternoonStopId"><option value="">None</option>{stops.rows.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}</select>
          </Field>
          <div className="flex items-end"><PrimaryButton>Save assignment</PrimaryButton></div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          columns={["Student", "Morning", "Morning stop", "Afternoon", "Afternoon stop", "Status"]}
          rows={assignments.rows.map((item) => [
            item.studentId?.name || "",
            item.morningRouteId?.name || "—",
            item.morningStopId?.name || "—",
            item.afternoonRouteId?.name || "—",
            item.afternoonStopId?.name || "—",
            item.status,
          ])}
        />
      </Panel>
    </div>
  );
}

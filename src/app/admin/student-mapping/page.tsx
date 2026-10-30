"use client";

import { FormEvent, useState } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords, useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Student = { id: string; name: string; studentCode: string; className?: string; division?: string };
type MappedRow = { vehicleId: string; studentId: string; vehicleNumber: string; studentName: string; className?: string; division?: string; studentCode: string };
type MappedStudent = { id: string; name: string; studentCode: string; className?: string; division?: string };
type Vehicle = {
  id: string;
  vehicleNumber: string;
  capacity: number;
  studentIds?: Array<MappedStudent | string>;
};

function mappedStudents(vehicle: Vehicle) {
  return (vehicle.studentIds ?? []).filter((student): student is MappedStudent => (
    typeof student === "object" && student !== null && "name" in student
  ));
}

export default function StudentMappingPage() {
  const vehicles = useRecords<Vehicle>("/api/v1/vehicles?limit=100");
  const mapped = usePagedRecords<MappedRow>("/api/v1/vehicles?mapped=1");
  const students = useRecords<Student>("/api/v1/students?limit=100");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [vehicleId, setVehicleId] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const chosen = vehicles.rows.find((vehicle) => vehicle.id === vehicleId);
  const studentOptions = students.rows.map((student) => ({
    id: student.id,
    name: student.name,
    detail: [[student.className, student.division].filter(Boolean).join("-"), student.studentCode].filter(Boolean).join(" · "),
  }));
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedVehicleId = String(form.get("vehicleId") || "");
    setMessage("");
    if (!selectedVehicleId) {
      setFieldErrors({ vehicleId: "Choose a vehicle before mapping students." });
      return;
    }
    setFieldErrors({});
    try {
      await api(`/api/v1/vehicles/${selectedVehicleId}`, {
        method: "PATCH",
        body: { studentIds: form.getAll("studentIds").map(String).filter(Boolean) },
      });
      setFormVersion((version) => version + 1);
      setMessage("Student mapping saved.");
      await Promise.all([vehicles.reload(), mapped.reload()]);
    } catch (caught) {
      const result = failureOf(caught, "Could not save the student mapping.");
      setFieldErrors(result.fields);
      setMessage(result.message);
    }
  }

  async function removeMapping(row: MappedRow) {
    if (!window.confirm(`Remove ${row.studentName} from ${row.vehicleNumber}?`)) return;
    try {
      await api(`/api/v1/vehicles/${row.vehicleId}/students/${row.studentId}`, { method: "DELETE" });
      setMessage("Student mapping deleted.");
      await Promise.all([vehicles.reload(), mapped.reload()]);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not remove this student.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Student mapping" subtitle="Choose a vehicle, then choose the students who ride it." />
      {vehicles.error || mapped.error ? <Notice>{vehicles.error || mapped.error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") || message.includes("deleted") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={onSubmit}>
          <Field label="Vehicle">
            <select className={controlClass} name="vehicleId" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} required>
              <option value="">Choose a vehicle</option>
              {vehicles.rows.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicleNumber}</option>
              ))}
            </select>
          </Field>
          <SearchSelect
            key={`${vehicleId}-${formVersion}`}
            label="Students"
            name="studentIds"
            options={studentOptions}
            initialIds={chosen ? mappedStudents(chosen).map((student) => student.id) : []}
            placeholder="Search students"
            anotherPlaceholder="Search to add another student"
            emptyMatch="No students match that search."
            emptyOptions="Add a student first."
            max={chosen?.capacity || 80}
          />
          <div className="flex items-end"><PrimaryButton>Save mapping</PrimaryButton></div>
        </ValidatedForm>
      </Panel>
      <Panel>
        <DataTable
          {...listControls(mapped)}
          columns={["Vehicle number", "Student name", "Class", "Division", "Student code", ""]}
          empty="No students mapped."
          rows={mapped.rows.map((row) => [
            row.vehicleNumber,
            row.studentName,
            row.className || "—",
            row.division || "—",
            row.studentCode,
            <RowActions
              key={`${row.vehicleId}-${row.studentId}`}
              onEdit={() => { setVehicleId(row.vehicleId); setFormVersion((version) => version + 1); setMessage(""); setFieldErrors({}); }}
              onDelete={() => { void removeMapping(row); }}
            />,
          ])}
        />
      </Panel>
    </div>
  );
}

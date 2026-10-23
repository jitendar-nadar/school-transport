"use client";

import { FormEvent, useState } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords, useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Person = { id: string; name: string; email?: string; role: string };
type Vehicle = {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  capacity: number;
  status: string;
  driverIds?: Array<{ id?: string } | string>;
  attendantIds?: Array<{ id?: string } | string>;
};

function idsOf(value?: Array<{ id?: string } | string>) {
  return (value || []).map((item) => typeof item === "string" ? item : item.id || "").filter(Boolean);
}

export default function VehiclesPage() {
  const vehicles = usePagedRecords<Vehicle>("/api/v1/vehicles");
  const people = useRecords<Person>("/api/v1/users?limit=100");
  const [message, setMessage] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const drivers = people.rows.filter((person) => person.role === "DRIVER");
  const attendants = people.rows.filter((person) => person.role === "ATTENDANT");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(editing ? `/api/v1/vehicles/${editing.id}` : "/api/v1/vehicles", {
        method: editing ? "PATCH" : "POST",
        body: {
          vehicleNumber: form.get("vehicleNumber"),
          vehicleType: form.get("vehicleType"),
          capacity: Number(form.get("capacity")),
          driverIds: form.getAll("driverIds").map(String).filter(Boolean),
          attendantIds: form.getAll("attendantIds").map(String).filter(Boolean),
        },
      });
      formElement.reset();
      setEditing(null);
      setFormVersion((version) => version + 1);
      setMessage("Vehicle saved.");
      await vehicles.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save the vehicle.");
    }
  }

  async function removeVehicle(vehicle: Vehicle) {
    if (!window.confirm(`Delete ${vehicle.vehicleNumber}?`)) return;
    try {
      await api(`/api/v1/vehicles/${vehicle.id}`, { method: "DELETE" });
      if (editing?.id === vehicle.id) setEditing(null);
      setMessage("Vehicle deleted.");
      await vehicles.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the vehicle.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Vehicles" subtitle="Add the bus or van, and the drivers and attendants who may run it." />
      {vehicles.error ? <Notice>{vehicles.error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") || message.includes("deleted") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <form key={`${editing?.id || "new"}-${formVersion}`} className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          <Field label="Number"><input className={controlClass} name="vehicleNumber" defaultValue={editing?.vehicleNumber || ""} required /></Field>
          <Field label="Type">
            <select className={controlClass} name="vehicleType" defaultValue={editing?.vehicleType || "BUS"}><option>BUS</option><option>VAN</option></select>
          </Field>
          <Field label="Capacity"><input className={controlClass} name="capacity" type="number" min={1} defaultValue={editing?.capacity ?? ""} required /></Field>
          <SearchSelect
            key={`drivers-${editing?.id || "new"}-${formVersion}`}
            label="Drivers"
            name="driverIds"
            initialIds={idsOf(editing?.driverIds)}
            options={drivers}
            placeholder="Search drivers"
            anotherPlaceholder="Search to add another driver"
            emptyMatch="No drivers match that search."
            emptyOptions="Add a driver on People first."
          />
          <SearchSelect
            key={`attendants-${editing?.id || "new"}-${formVersion}`}
            label="Attendants"
            name="attendantIds"
            initialIds={idsOf(editing?.attendantIds)}
            options={attendants}
            placeholder="Search attendants"
            anotherPlaceholder="Search to add another attendant"
            emptyMatch="No attendants match that search."
            emptyOptions="Add an attendant on People first."
          />
          <div className="flex items-end gap-3">
            <PrimaryButton>{editing ? "Save changes" : "Add vehicle"}</PrimaryButton>
            {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => { setEditing(null); setFormVersion((version) => version + 1); }}>Cancel</button> : null}
          </div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          {...listControls(vehicles)}
          columns={["Number", "Type", "Capacity", "Status", ""]}
          rows={vehicles.rows.map((vehicle) => [
            vehicle.vehicleNumber,
            vehicle.vehicleType,
            String(vehicle.capacity),
            vehicle.status,
            <RowActions key={vehicle.id} onEdit={() => { setEditing(vehicle); setMessage(""); }} onDelete={() => { void removeVehicle(vehicle); }} />,
          ])}
        />
      </Panel>
    </div>
  );
}

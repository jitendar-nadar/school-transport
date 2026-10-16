"use client";

import { FormEvent, useState } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Person = { id: string; name: string; email?: string; role: string };
type Vehicle = { id: string; vehicleNumber: string; vehicleType: string; capacity: number; status: string };

export default function VehiclesPage() {
  const vehicles = useRecords<Vehicle>("/api/v1/vehicles?limit=100");
  const people = useRecords<Person>("/api/v1/users?limit=100");
  const [message, setMessage] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const drivers = people.rows.filter((person) => person.role === "DRIVER");
  const attendants = people.rows.filter((person) => person.role === "ATTENDANT");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/api/v1/vehicles", {
        method: "POST",
        body: {
          vehicleNumber: form.get("vehicleNumber"),
          vehicleType: form.get("vehicleType"),
          capacity: Number(form.get("capacity")),
          driverIds: form.getAll("driverIds").map(String).filter(Boolean),
          attendantIds: form.getAll("attendantIds").map(String).filter(Boolean),
        },
      });
      formElement.reset();
      setFormVersion((version) => version + 1);
      setMessage("Vehicle saved.");
      await vehicles.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save the vehicle.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Vehicles" subtitle="Assign the drivers and attendants who are allowed to start trips for each bus or van." />
      {vehicles.error ? <Notice>{vehicles.error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          <Field label="Number"><input className={controlClass} name="vehicleNumber" required /></Field>
          <Field label="Type">
            <select className={controlClass} name="vehicleType"><option>BUS</option><option>VAN</option></select>
          </Field>
          <Field label="Capacity"><input className={controlClass} name="capacity" type="number" min={1} required /></Field>
          <SearchSelect
            key={`drivers-${formVersion}`}
            label="Drivers"
            name="driverIds"
            options={drivers}
            placeholder="Search drivers"
            anotherPlaceholder="Search to add another driver"
            emptyMatch="No drivers match that search."
            emptyOptions="Add a driver on People first."
          />
          <SearchSelect
            key={`attendants-${formVersion}`}
            label="Attendants"
            name="attendantIds"
            options={attendants}
            placeholder="Search attendants"
            anotherPlaceholder="Search to add another attendant"
            emptyMatch="No attendants match that search."
            emptyOptions="Add an attendant on People first."
          />
          <div className="flex items-end"><PrimaryButton>Add vehicle</PrimaryButton></div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          columns={["Number", "Type", "Capacity", "Status"]}
          rows={vehicles.rows.map((vehicle) => [vehicle.vehicleNumber, vehicle.vehicleType, String(vehicle.capacity), vehicle.status])}
        />
      </Panel>
    </div>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import { useScope } from "@/components/admin/shell";
import { clientTypeLabel, useAgencyClients } from "@/components/admin/use-agency-clients";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";

type AgencyVehicle = {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  capacity: number;
  seatsUsed?: number;
  status: string;
  clients: Array<{ key: string; type: string; name: string }>;
};

const statusLabels: Record<string, string> = { ACTIVE: "Active", MAINTENANCE: "Maintenance", INACTIVE: "Inactive" };

export default function AgencyVehiclesPage() {
  const { agencyId } = useScope();
  const vehicles = usePagedRecords<AgencyVehicle>(agencyId ? `/api/v1/agency-vehicles?agencyId=${agencyId}` : null, false);
  const clients = useAgencyClients(agencyId);
  const [editing, setEditing] = useState<AgencyVehicle | null>(null);
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("ok");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const options = clients.clients.map((client) => ({ id: client.key, name: client.name, detail: clientTypeLabel(client.type) }));

  function report(text: string, nextTone: "ok" | "error") {
    setMessage(text);
    setTone(nextTone);
  }

  function startEdit(vehicle: AgencyVehicle | null) {
    setEditing(vehicle);
    setFieldErrors({});
    setMessage("");
    setVersion((value) => value + 1);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setFieldErrors({});
    const body: Record<string, unknown> = {
      agencyId,
      vehicleNumber: form.get("vehicleNumber"),
      vehicleType: form.get("vehicleType"),
      capacity: Number(form.get("capacity")),
      clients: form.getAll("clients").map(String),
    };
    if (editing) body.status = form.get("status");
    try {
      await api(editing ? `/api/v1/agency-vehicles/${editing.id}` : "/api/v1/agency-vehicles", { method: editing ? "PATCH" : "POST", school: false, body });
      startEdit(null);
      report(editing ? "Vehicle saved." : "Vehicle added.", "ok");
      await Promise.all([vehicles.reload(), clients.reload()]);
    } catch (caught) {
      const result = failureOf(caught, "Could not save the vehicle.");
      setFieldErrors(result.fields);
      if (result.message) report(result.message, "error");
    }
  }

  async function remove(vehicle: AgencyVehicle) {
    if (!window.confirm(`Delete ${vehicle.vehicleNumber}?`)) return;
    try {
      await api(`/api/v1/agency-vehicles/${vehicle.id}?agencyId=${agencyId}`, { method: "DELETE", school: false });
      if (editing?.id === vehicle.id) startEdit(null);
      report("Vehicle deleted.", "ok");
      await vehicles.reload();
    } catch (caught) {
      report(caught instanceof Error ? caught.message : "Could not delete the vehicle.", "error");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Agency vehicles" subtitle="The agency's buses and vans, and the clients each one serves. One vehicle can serve several clients, for example a school in the morning and a company in the evening." />
      {!agencyId ? <Notice>Choose a transport agency in the header to manage its vehicles.</Notice> : null}
      {vehicles.error || clients.error ? <Notice>{vehicles.error || clients.error}</Notice> : null}
      {message ? <Notice tone={tone}>{message}</Notice> : null}
      {agencyId ? (
        <>
          <Panel>
            <ValidatedForm key={`${editing?.id || "new"}-${version}-${clients.loading}`} className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={onSubmit}>
              <Field label="Vehicle number"><input className={controlClass} name="vehicleNumber" maxLength={30} defaultValue={editing?.vehicleNumber || ""} required /></Field>
              <Field label="Type">
                <select className={controlClass} name="vehicleType" defaultValue={editing?.vehicleType || "BUS"}>
                  <option value="BUS">Bus</option>
                  <option value="VAN">Van</option>
                </select>
              </Field>
              <Field label="Seats"><input className={controlClass} name="capacity" type="number" min={1} max={80} defaultValue={editing?.capacity ?? ""} required /></Field>
              <div className="md:col-span-2">
                <SearchSelect
                  label="Clients"
                  name="clients"
                  max={50}
                  initialIds={editing?.clients.map((client) => client.key) || []}
                  options={options}
                  placeholder="Search this agency's clients"
                  anotherPlaceholder="Search to add another client"
                  emptyMatch="No client matches that search."
                  emptyOptions="This agency has no clients yet. Link them on Clients."
                />
              </div>
              {editing ? (
                <Field label="Status">
                  <select className={controlClass} name="status" defaultValue={editing.status}>
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
              ) : null}
              <p className="text-sm text-slate-500 md:col-span-3">Each school it serves sees this vehicle on its Vehicles page as supplied by the agency, and adds its own drivers, students, and routes. Students from all its schools share the seats. A vehicle under maintenance or inactive cannot start school trips.</p>
              <div className="flex items-end gap-3 md:col-span-3">
                <PrimaryButton>{editing ? "Save changes" : "Add vehicle"}</PrimaryButton>
                {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => startEdit(null)}>Cancel</button> : null}
              </div>
            </ValidatedForm>
          </Panel>
          <Panel>
            <DataTable
              {...listControls(vehicles)}
              columns={["Vehicle", "Type", "Seats", "Status", "Serves", ""]}
              empty="No vehicles yet."
              rows={vehicles.rows.map((vehicle) => [
                vehicle.vehicleNumber,
                vehicle.vehicleType === "VAN" ? "Van" : "Bus",
                <span key="seats">{vehicle.capacity}<span className="block text-xs text-slate-500">{vehicle.seatsUsed ?? 0} students mapped</span></span>,
                statusLabels[vehicle.status] || vehicle.status,
                vehicle.clients.length ? vehicle.clients.map((client) => client.name).join(", ") : "No client yet",
                <RowActions key={vehicle.id} onEdit={() => startEdit(vehicle)} onDelete={() => void remove(vehicle)} />,
              ])}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

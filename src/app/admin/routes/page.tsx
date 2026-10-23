"use client";

import { FormEvent, useState } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords, useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Vehicle = { id: string; vehicleNumber: string };
type Stop = { id: string; name: string; address?: string };
type Linked = { id?: string; name?: string; vehicleNumber?: string };
type Route = {
  id: string;
  name: string;
  routeCode: string;
  direction: string;
  scheduledStartTime: string;
  scheduledEndTime?: string;
  vehicleId?: Linked | string;
  stops?: Array<Linked | string>;
};

function idOf(value?: Linked | string | null) {
  if (!value) return "";
  return typeof value === "string" ? value : value.id || "";
}

export default function RoutesPage() {
  const routes = usePagedRecords<Route>("/api/v1/routes");
  const vehicles = useRecords<Vehicle>("/api/v1/vehicles?limit=100");
  const stops = useRecords<Stop>("/api/v1/stops?limit=100");
  const [message, setMessage] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const [editing, setEditing] = useState<Route | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const stopIds = form.getAll("stops").map(String).filter(Boolean);
    if (!stopIds.length) {
      setMessage("Choose at least one stop.");
      return;
    }
    try {
      await api(editing ? `/api/v1/routes/${editing.id}` : "/api/v1/routes", {
        method: editing ? "PATCH" : "POST",
        body: {
          name: form.get("name"),
          routeCode: form.get("routeCode"),
          direction: form.get("direction"),
          vehicleId: form.get("vehicleId"),
          stops: stopIds,
          scheduledStartTime: form.get("scheduledStartTime"),
          scheduledEndTime: form.get("scheduledEndTime"),
        },
      });
      formElement.reset();
      setEditing(null);
      setFormVersion((version) => version + 1);
      setMessage("Route saved.");
      await routes.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save the route.");
    }
  }

  async function removeRoute(route: Route) {
    if (!window.confirm(`Delete ${route.name}?`)) return;
    try {
      await api(`/api/v1/routes/${route.id}`, { method: "DELETE" });
      if (editing?.id === route.id) setEditing(null);
      setMessage("Route deleted.");
      await routes.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the route.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Routes" subtitle="Morning routes use pickup direction. Afternoon routes use drop direction. Stop order follows the selection order." />
      {routes.error ? <Notice>{routes.error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") || message.includes("deleted") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <form key={`${editing?.id || "new"}-${formVersion}`} className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          <Field label="Name"><input className={controlClass} name="name" defaultValue={editing?.name || ""} required /></Field>
          <Field label="Code"><input className={controlClass} name="routeCode" defaultValue={editing?.routeCode || ""} required /></Field>
          <Field label="Direction"><select className={controlClass} name="direction" defaultValue={editing?.direction || "PICKUP"}><option>PICKUP</option><option>DROP</option></select></Field>
          <Field label="Vehicle">
            <select className={controlClass} name="vehicleId" defaultValue={idOf(editing?.vehicleId)} required>
              <option value="">Choose</option>
              {vehicles.rows.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicleNumber}</option>)}
            </select>
          </Field>
          <Field label="Start"><input className={controlClass} name="scheduledStartTime" placeholder="07:10" defaultValue={editing?.scheduledStartTime || ""} required /></Field>
          <Field label="End"><input className={controlClass} name="scheduledEndTime" placeholder="08:00" defaultValue={editing?.scheduledEndTime || ""} required /></Field>
          <SearchSelect
            key={`stops-${editing?.id || "new"}-${formVersion}`}
            label="Stops"
            name="stops"
            initialIds={(editing?.stops || []).map((stop) => idOf(stop)).filter(Boolean)}
            options={stops.rows.map((stop) => ({ id: stop.id, name: stop.name, detail: stop.address || undefined }))}
            placeholder="Search stops"
            anotherPlaceholder="Search to add the next stop"
            emptyMatch="No stops match that search."
            emptyOptions="Add a stop first."
            max={40}
          />
          <div className="flex items-end gap-3">
            <PrimaryButton>{editing ? "Save changes" : "Add route"}</PrimaryButton>
            {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => { setEditing(null); setFormVersion((version) => version + 1); }}>Cancel</button> : null}
          </div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          {...listControls(routes)}
          columns={["Route", "Code", "Direction", "Vehicle", "Start", ""]}
          rows={routes.rows.map((route) => [
            route.name,
            route.routeCode,
            route.direction,
            typeof route.vehicleId === "object" ? route.vehicleId?.vehicleNumber || "" : "",
            route.scheduledStartTime,
            <RowActions key={route.id} onEdit={() => { setEditing(route); setMessage(""); }} onDelete={() => { void removeRoute(route); }} />,
          ])}
        />
      </Panel>
    </div>
  );
}

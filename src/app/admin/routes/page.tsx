"use client";

import { FormEvent, useState } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Vehicle = { id: string; vehicleNumber: string };
type Stop = { id: string; name: string; address?: string };
type Route = { id: string; name: string; routeCode: string; direction: string; scheduledStartTime: string; vehicleId?: { vehicleNumber?: string } };

export default function RoutesPage() {
  const routes = useRecords<Route>("/api/v1/routes?limit=100");
  const vehicles = useRecords<Vehicle>("/api/v1/vehicles?limit=100");
  const stops = useRecords<Stop>("/api/v1/stops?limit=100");
  const [message, setMessage] = useState("");
  const [formVersion, setFormVersion] = useState(0);

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
      await api("/api/v1/routes", {
        method: "POST",
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
      setFormVersion((version) => version + 1);
      setMessage("Route saved.");
      await routes.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save the route.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Routes" subtitle="Morning routes use pickup direction. Afternoon routes use drop direction. Stop order follows the selection order." />
      {routes.error ? <Notice>{routes.error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          <Field label="Name"><input className={controlClass} name="name" required /></Field>
          <Field label="Code"><input className={controlClass} name="routeCode" required /></Field>
          <Field label="Direction"><select className={controlClass} name="direction"><option>PICKUP</option><option>DROP</option></select></Field>
          <Field label="Vehicle">
            <select className={controlClass} name="vehicleId" required>
              <option value="">Choose</option>
              {vehicles.rows.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicleNumber}</option>)}
            </select>
          </Field>
          <Field label="Start"><input className={controlClass} name="scheduledStartTime" placeholder="07:10" required /></Field>
          <Field label="End"><input className={controlClass} name="scheduledEndTime" placeholder="08:00" required /></Field>
          <SearchSelect
            key={`stops-${formVersion}`}
            label="Stops"
            name="stops"
            options={stops.rows.map((stop) => ({ id: stop.id, name: stop.name, detail: stop.address || undefined }))}
            placeholder="Search stops"
            anotherPlaceholder="Search to add the next stop"
            emptyMatch="No stops match that search."
            emptyOptions="Add a stop first."
            max={40}
          />
          <div className="flex items-end"><PrimaryButton>Add route</PrimaryButton></div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          columns={["Route", "Code", "Direction", "Vehicle", "Start"]}
          rows={routes.rows.map((route) => [route.name, route.routeCode, route.direction, route.vehicleId?.vehicleNumber || "", route.scheduledStartTime])}
        />
      </Panel>
    </div>
  );
}

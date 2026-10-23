"use client";

import { FormEvent, useState } from "react";
import { LocationPicker, defaultMapPoint, type MapPoint } from "@/components/admin/location-picker";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Stop = { id: string; name: string; stopType: string; address: string; latitude: number | null; longitude: number | null; geofenceRadiusMeters?: number };

export default function StopsPage() {
  const stops = usePagedRecords<Stop>("/api/v1/stops");
  const [message, setMessage] = useState("");
  const [point, setPoint] = useState<MapPoint>(defaultMapPoint);
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState<Stop | null>(null);
  const [address, setAddress] = useState("");
  const [lookupQuery, setLookupQuery] = useState("");

  function movePin(next: MapPoint) {
    setPoint(next);
    setConfirmed(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) {
      setMessage("Confirm the pin on the map before saving.");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(editing ? `/api/v1/stops/${editing.id}` : "/api/v1/stops", {
        method: editing ? "PATCH" : "POST",
        body: {
          name: form.get("name"),
          address: form.get("address"),
          stopType: form.get("stopType"),
          latitude: point.latitude,
          longitude: point.longitude,
          geofenceRadiusMeters: Number(form.get("radius") || 80),
        },
      });
      formElement.reset();
      setEditing(null);
      setAddress("");
      setLookupQuery("");
      setPoint(defaultMapPoint);
      setConfirmed(false);
      setMessage("Stop saved.");
      await stops.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save the stop.");
    }
  }

  function beginEdit(stop: Stop) {
    setEditing(stop);
    setAddress(stop.address || "");
    setLookupQuery("");
    setPoint({ latitude: stop.latitude ?? defaultMapPoint.latitude, longitude: stop.longitude ?? defaultMapPoint.longitude });
    setConfirmed(stop.latitude != null && stop.longitude != null);
    setMessage("");
  }

  function cancelEdit() {
    setEditing(null);
    setAddress("");
    setLookupQuery("");
    setPoint(defaultMapPoint);
    setConfirmed(false);
  }

  async function removeStop(stop: Stop) {
    if (!window.confirm(`Delete ${stop.name}?`)) return;
    try {
      await api(`/api/v1/stops/${stop.id}`, { method: "DELETE" });
      if (editing?.id === stop.id) cancelEdit();
      setMessage("Stop deleted.");
      await stops.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the stop.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Stops" subtitle="Search a building or landmark, or type the address. Confirm the pin to fill the address, then save." />
      {stops.error ? <Notice>{stops.error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") || message.includes("deleted") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <form key={editing?.id || "new"} className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          <Field label="Name"><input className={controlClass} name="name" defaultValue={editing?.name || ""} required /></Field>
          <Field label="Address">
            <input
              className={controlClass}
              name="address"
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setLookupQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            />
          </Field>
          <Field label="Type">
            <select className={controlClass} name="stopType" defaultValue={editing?.stopType || "PICKUP"}><option>PICKUP</option><option>DROP</option><option>SCHOOL</option></select>
          </Field>
          <Field label="Radius (m)"><input className={controlClass} name="radius" type="number" defaultValue={editing?.geofenceRadiusMeters || 80} /></Field>
          <LocationPicker
            confirmed={confirmed}
            lookupQuery={lookupQuery}
            point={point}
            onAddressChange={(next) => {
              setAddress(next);
              setLookupQuery("");
            }}
            onConfirm={() => setConfirmed(true)}
            onPointChange={movePin}
          />
          <div className="flex items-end gap-3">
            <PrimaryButton disabled={!confirmed}>{editing ? "Save changes" : "Add stop"}</PrimaryButton>
            {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={cancelEdit}>Cancel</button> : null}
          </div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          {...listControls(stops)}
          columns={["Name", "Type", "Address", "Location", ""]}
          rows={stops.rows.map((stop) => [
            stop.name,
            stop.stopType,
            stop.address,
            stop.latitude == null || stop.longitude == null ? "" : `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`,
            <RowActions key={stop.id} onEdit={() => beginEdit(stop)} onDelete={() => { void removeStop(stop); }} />,
          ])}
        />
      </Panel>
    </div>
  );
}

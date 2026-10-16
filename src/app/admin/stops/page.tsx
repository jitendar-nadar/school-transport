"use client";

import { FormEvent, useState } from "react";
import { LocationPicker, defaultMapPoint, type MapPoint } from "@/components/admin/location-picker";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Stop = { id: string; name: string; stopType: string; address: string; latitude: number | null; longitude: number | null };

export default function StopsPage() {
  const stops = useRecords<Stop>("/api/v1/stops?limit=100");
  const [message, setMessage] = useState("");
  const [point, setPoint] = useState<MapPoint>(defaultMapPoint);
  const [confirmed, setConfirmed] = useState(false);

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
      await api("/api/v1/stops", {
        method: "POST",
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
      setConfirmed(false);
      setMessage("Stop saved.");
      await stops.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save the stop.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Stops" subtitle="Place each stop by dragging the pin on the map, then confirm it before saving." />
      {stops.error ? <Notice>{stops.error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          <Field label="Name"><input className={controlClass} name="name" required /></Field>
          <Field label="Address"><input className={controlClass} name="address" /></Field>
          <Field label="Type">
            <select className={controlClass} name="stopType"><option>PICKUP</option><option>DROP</option><option>SCHOOL</option></select>
          </Field>
          <Field label="Radius (m)"><input className={controlClass} name="radius" type="number" defaultValue={80} /></Field>
          <LocationPicker confirmed={confirmed} onConfirm={() => setConfirmed(true)} onPointChange={movePin} point={point} />
          <div><PrimaryButton disabled={!confirmed}>Add stop</PrimaryButton></div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          columns={["Name", "Type", "Address", "Location"]}
          rows={stops.rows.map((stop) => [
            stop.name,
            stop.stopType,
            stop.address,
            stop.latitude == null || stop.longitude == null ? "" : `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`,
          ])}
        />
      </Panel>
    </div>
  );
}

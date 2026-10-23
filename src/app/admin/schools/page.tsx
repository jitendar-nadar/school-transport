"use client";

import { FormEvent, useState } from "react";
import { LocationPicker, defaultMapPoint, type MapPoint } from "@/components/admin/location-picker";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type School = { id: string; name: string; schoolCode: string; status: string; contactEmail: string; contactPhone: string };

export default function SchoolsPage() {
  const schools = usePagedRecords<School>("/api/v1/schools", false);
  const { rows, error, reload, user } = schools;
  const [message, setMessage] = useState("");
  const [point, setPoint] = useState<MapPoint>(defaultMapPoint);
  const [confirmed, setConfirmed] = useState(false);
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
    setMessage("");
    try {
      await api("/api/v1/schools", {
        method: "POST",
        school: false,
        body: {
          name: form.get("name"),
          schoolCode: form.get("schoolCode"),
          address: form.get("address"),
          contactEmail: form.get("contactEmail"),
          contactPhone: form.get("contactPhone"),
          latitude: point.latitude,
          longitude: point.longitude,
        },
      });
      formElement.reset();
      setAddress("");
      setLookupQuery("");
      setConfirmed(false);
      setMessage("School created.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not create the school.");
    }
  }

  async function setStatus(id: string, status: string) {
    await api(`/api/v1/schools/${id}`, { method: "PATCH", school: false, body: { status } });
    await reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Schools" subtitle="Platform administrators create schools, place them on the map, and control subscription status." />
      {user.role !== "PLATFORM_ADMIN" ? <Notice>You can review your own school here. Platform administrators create new schools.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone={message.includes("created") ? "ok" : "error"}>{message}</Notice> : null}
      {user.role === "PLATFORM_ADMIN" ? (
        <Panel>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
            <Field label="Name"><input className={controlClass} name="name" required /></Field>
            <Field label="School code"><input className={controlClass} name="schoolCode" required /></Field>
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
            <Field label="Contact email"><input className={controlClass} name="contactEmail" type="email" required /></Field>
            <Field label="Contact phone"><input className={controlClass} name="contactPhone" required /></Field>
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
            <div className="md:col-span-3"><PrimaryButton disabled={!confirmed}>Create school</PrimaryButton></div>
          </form>
        </Panel>
      ) : null}
      <Panel>
        <DataTable
          {...listControls(schools)}
          columns={["School", "Code", "Contact", "Status", ""]}
          rows={rows.map((school) => [
            school.name,
            school.schoolCode,
            `${school.contactEmail} · ${school.contactPhone}`,
            school.status,
            user.role === "PLATFORM_ADMIN" ? (
              <select key={school.id} className={controlClass} value={school.status} onChange={(event) => void setStatus(school.id, event.target.value)}>
                <option value="TRIAL">TRIAL</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            ) : null,
          ])}
        />
      </Panel>
    </div>
  );
}

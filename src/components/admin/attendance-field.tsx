"use client";

import { FormEvent, useState } from "react";
import { EMPTY_FIELD_ERRORS } from "@/components/admin/form-error-context";
import { LocationPicker, defaultMapPoint, type MapPoint } from "@/components/admin/location-picker";
import { DataTable, Field, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { ValidatedForm } from "@/components/admin/validated-form";

export type FieldSite = { name: string; latitude: number; longitude: number; radiusMeters: number };
export type FieldDay = {
  id: string;
  workDate: string;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  fieldSite?: string;
  fieldInLatitude?: number | null;
  fieldInLongitude?: number | null;
  employeeId?: { name?: string; employeeCode?: string };
};

function clock(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
}

export function FieldSitesPanel({ sites, onSave }: { sites: FieldSite[]; onSave: (sites: FieldSite[], done: string) => Promise<Record<string, string> | null> }) {
  const [point, setPoint] = useState<MapPoint>(defaultMapPoint);
  const [confirmed, setConfirmed] = useState(false);
  const [address, setAddress] = useState("");
  const [lookup, setLookup] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formKey, setFormKey] = useState(0);

  async function addSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) {
      setErrors({ location: "Confirm the pin before adding the site." });
      return;
    }
    const form = new FormData(event.currentTarget);
    const site = {
      name: String(form.get("name") || "").trim(),
      latitude: point.latitude,
      longitude: point.longitude,
      radiusMeters: Number(form.get("radius") || 200),
    };
    const failed = await onSave([...sites, site], "Field site added.");
    if (failed) {
      setErrors(failed);
      return;
    }
    setErrors({});
    setAddress("");
    setLookup("");
    setConfirmed(false);
    setPoint(defaultMapPoint);
    setFormKey((key) => key + 1);
  }

  return (
    <Panel>
      <h3 className="mb-1 font-medium">Field sites</h3>
      <p className="mb-3 text-sm text-slate-500">
        Field staff can check in from a phone only inside one of these circles. With no sites, a phone check-in is accepted anywhere and the location is kept.
      </p>
      <DataTable
        columns={["Site", "Radius", "Pin", ""]}
        rows={sites.map((site, index) => [
          site.name,
          `${site.radiusMeters} m`,
          `${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`,
          <button
            key={`${site.name}-${index}`}
            className="text-sm text-red-700"
            type="button"
            onClick={() => {
              if (!window.confirm(`Remove ${site.name}?`)) return;
              void onSave(sites.filter((_, at) => at !== index), "Field site removed.");
            }}
          >
            Remove
          </button>,
        ])}
      />
      <ValidatedForm key={formKey} className="mt-4 grid gap-3 md:grid-cols-3" serverErrors={Object.keys(errors).length ? errors : EMPTY_FIELD_ERRORS} onSubmit={(event) => void addSite(event)}>
        <Field label="Site name"><input className={controlClass} name="name" minLength={2} maxLength={80} required /></Field>
        <Field label="Radius (m)"><input className={controlClass} name="radius" type="number" min={25} max={5000} defaultValue={200} required /></Field>
        <Field label="Address">
          <input className={controlClass} name="address" value={address} onChange={(event) => { setAddress(event.target.value); setLookup(event.target.value); }} />
        </Field>
        <LocationPicker
          confirmed={confirmed}
          lookupQuery={lookup}
          point={point}
          onAddressChange={(next) => { setAddress(next); setLookup(""); }}
          onConfirm={() => setConfirmed(true)}
          onPointChange={(next) => { setPoint(next); setConfirmed(false); }}
        />
        <div className="md:col-span-3"><PrimaryButton>Add site</PrimaryButton></div>
      </ValidatedForm>
    </Panel>
  );
}

export function FieldDaysPanel({ days, onReview }: { days: FieldDay[]; onReview: (id: string, action: "APPROVE" | "REJECT", note: string) => void }) {
  return (
    <Panel>
      <h3 className="mb-1 font-medium">Field check-ins waiting for approval</h3>
      <p className="mb-3 text-sm text-slate-500">A phone day counts toward working hours only after HR approves it. Until then its hours show as pending in the report.</p>
      <DataTable
        columns={["Employee", "Date", "In", "Out", "Where", ""]}
        rows={days.map((day) => [
          [day.employeeId?.name, day.employeeId?.employeeCode].filter(Boolean).join(" · "),
          day.workDate,
          clock(day.checkedInAt),
          clock(day.checkedOutAt),
          day.fieldSite || (day.fieldInLatitude != null && day.fieldInLongitude != null ? `${day.fieldInLatitude.toFixed(4)}, ${day.fieldInLongitude.toFixed(4)}` : "—"),
          <span key={day.id} className="flex gap-2">
            <button className="text-sm text-brand-800" type="button" onClick={() => onReview(day.id, "APPROVE", "")}>Approve</button>
            <button
              className="text-sm text-red-700"
              type="button"
              onClick={() => {
                const note = window.prompt("Why is this field day rejected?");
                if (note != null) onReview(day.id, "REJECT", note);
              }}
            >
              Reject
            </button>
          </span>,
        ])}
      />
    </Panel>
  );
}

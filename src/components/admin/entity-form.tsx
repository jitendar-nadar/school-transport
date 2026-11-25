"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FormEvent, useState } from "react";
import { LocationPicker, defaultMapPoint, type MapPoint } from "@/components/admin/location-picker";
import { failureOf, passwordHint, passwordPattern, ValidatedForm } from "@/components/admin/validated-form";
import { Field, Notice, PrimaryButton, controlClass } from "@/components/admin/ui";
import { capitalised, entityStatuses, entityTypes, typeOrder, type EntityRecord, type EntityType } from "@/components/admin/entity-types";
import { api } from "@/lib/admin/api";

type EntityFormProps = {
  type: EntityType;
  entity?: EntityRecord;
  onTypeChange?: (type: EntityType) => void;
  onSaved: (saved: { type: EntityType; name: string }) => void;
};

export function BackToEntities({ slug }: { slug: string }) {
  return (
    <Link className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-800 hover:underline" href={`/admin/entities?type=${slug}`}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      All entities
    </Link>
  );
}

function startingPoint(entity?: EntityRecord): MapPoint {
  if (entity?.latitude == null || entity.longitude == null) return defaultMapPoint;
  return { latitude: entity.latitude, longitude: entity.longitude };
}

export function EntityForm({ type, entity, onTypeChange, onSaved }: EntityFormProps) {
  const editing = Boolean(entity);
  const config = entityTypes[type];
  const title = capitalised(config.noun);
  const Icon = config.icon;
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [point, setPoint] = useState<MapPoint>(() => startingPoint(entity));
  const [confirmed, setConfirmed] = useState(() => editing && entity?.latitude != null);
  const [address, setAddress] = useState(entity?.address ?? "");
  const [lookupQuery, setLookupQuery] = useState("");

  function movePin(next: MapPoint) {
    setPoint(next);
    setConfirmed(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (type === "SCHOOL" && !confirmed) {
      setFieldErrors({ location: "Confirm the pin on the map before saving." });
      return;
    }
    const form = new FormData(event.currentTarget);
    setFieldErrors({});
    const body: Record<string, unknown> = {
      name: form.get("name"),
      [config.codeField]: form.get("code"),
      address: form.get("address") ?? "",
      contactEmail: form.get("contactEmail"),
      contactPhone: form.get("contactPhone"),
    };
    if (type === "SCHOOL") {
      body.latitude = point.latitude;
      body.longitude = point.longitude;
    }
    if (editing) {
      body.status = form.get("status");
    } else {
      if (config.withAdmin) {
        body.adminName = form.get("adminName");
        body.adminEmail = form.get("adminEmail");
        body.adminPassword = form.get("adminPassword");
      }
    }
    setPending(true);
    try {
      if (entity) {
        await api(`${config.endpoint}/${entity.id}`, { method: "PATCH", school: false, body });
      } else {
        await api(config.endpoint, { method: "POST", school: false, body });
      }
      onSaved({ type, name: String(body.name) });
    } catch (caught) {
      const result = failureOf(caught, editing ? `Could not save the ${config.noun}.` : `Could not create the ${config.noun}.`);
      const fields = { ...result.fields };
      if (fields[config.codeField]) fields.code = fields[config.codeField];
      setFieldErrors(fields);
      setMessage(result.message);
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <Notice>{message}</Notice> : null}
      <div className="flex flex-wrap items-end gap-4 border-b border-slate-100 pb-5">
        {onTypeChange ? (
          <label className="block w-full max-w-xs text-sm font-medium text-slate-700">
            <span>Entity type</span>
            <select className={`${controlClass} mt-1`} value={type} onChange={(event) => onTypeChange(event.target.value as EntityType)}>
              {typeOrder.map((value) => (
                <option key={value} value={value}>{entityTypes[value].label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <p className="flex min-w-0 flex-1 items-start gap-2 text-sm leading-6 text-slate-500">
          <Icon className="mt-1 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
          {editing ? `Editing ${entity?.name}. ${config.withAdmin ? "The admin login is managed separately and does not change here." : ""}` : config.hint}
        </p>
      </div>
      <ValidatedForm key={type} className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={onSubmit}>
        <Field label={`${title} name`}><input className={controlClass} name="name" minLength={2} defaultValue={entity?.name} required /></Field>
        <Field label={`${title} code`}><input className={controlClass} name="code" minLength={2} maxLength={20} defaultValue={entity?.[config.codeField]} required /></Field>
        <Field label="Address">
          {type === "SCHOOL" ? (
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
          ) : (
            <input className={controlClass} name="address" maxLength={300} defaultValue={entity?.address} />
          )}
        </Field>
        <Field label="Contact email"><input className={controlClass} name="contactEmail" type="email" defaultValue={entity?.contactEmail} required /></Field>
        <Field label="Contact phone"><input className={controlClass} name="contactPhone" minLength={8} maxLength={20} defaultValue={entity?.contactPhone} required /></Field>
        {editing ? (
          <Field label="Status">
            <select className={controlClass} name="status" defaultValue={entity?.status}>
              {entityStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </Field>
        ) : config.withAdmin ? (
          <>
            <Field label="Admin name"><input className={controlClass} name="adminName" minLength={2} required /></Field>
            <Field label="Admin email"><input className={controlClass} name="adminEmail" type="email" required /></Field>
            <Field label="Admin password" name="adminPassword">
              <input className={controlClass} name="adminPassword" type="password" minLength={8} pattern={passwordPattern} title={passwordHint} required />
              <span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters, with a letter and a number.</span>
            </Field>
          </>
        ) : null}
        {type === "SCHOOL" ? (
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
        ) : null}
        <div className="md:col-span-3">
          <PrimaryButton disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : `Create ${config.noun}`}</PrimaryButton>
        </div>
      </ValidatedForm>
    </div>
  );
}

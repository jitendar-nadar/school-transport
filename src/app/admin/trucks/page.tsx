"use client";

import { FormEvent, useEffect, useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Fleet = { id: string; name: string };
type Truck = { id: string; registrationNumber: string; imei: string; status: string };
type Place = { id: string; name: string; kind: string; address: string };
type FleetTrip = { id: string; origin: string; destination: string; status: string; truckId?: { id?: string; registrationNumber?: string } | string };

export default function TrucksPage() {
  const { user } = useScope();
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [fleetId, setFleetId] = useState(user.fleetId || "");
  const [truckOptions, setTruckOptions] = useState<Truck[]>([]);
  const [message, setMessage] = useState("");
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [editingTrip, setEditingTrip] = useState<FleetTrip | null>(null);
  const [error, setError] = useState("");
  const trucks = usePagedRecords<Truck>(fleetId ? `/api/v1/trucks?fleetId=${fleetId}` : null, false);
  const places = usePagedRecords<Place>(fleetId ? `/api/v1/fleet-geofences?fleetId=${fleetId}` : null, false);
  const trips = usePagedRecords<FleetTrip>(fleetId ? `/api/v1/fleet-trips?fleetId=${fleetId}` : null, false);

  useEffect(() => {
    if (user.role !== "PLATFORM_ADMIN") return;
    api<Fleet[]>("/api/v1/fleets?limit=100", { school: false }).then((result) => setFleets(result.data)).catch(() => setFleets([]));
  }, [user.role]);

  useEffect(() => {
    if (!fleetId) return;
    let ignore = false;
    api<Truck[]>(`/api/v1/trucks?fleetId=${fleetId}&limit=100`, { school: false }).then((result) => {
      if (!ignore) setTruckOptions(result.data);
    }).catch(() => {
      if (!ignore) setTruckOptions([]);
    });
    return () => {
      ignore = true;
    };
  }, [fleetId, message]);

  async function save(path: string, body: Record<string, unknown>, formElement: HTMLFormElement, success: string, method: "POST" | "PATCH" = "POST") {
    setMessage("");
    try {
      await api(path, { method, school: false, body: { ...body, fleetId } });
      formElement.reset();
      setMessage(success);
      await Promise.all([trucks.reload(), places.reload(), trips.reload()]);
      return true;
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save.");
      return false;
    }
  }

  async function removeRecord(path: string, label: string) {
    if (!window.confirm(`Delete ${label}?`)) return;
    try {
      await api(`${path}?fleetId=${fleetId}`, { method: "DELETE", school: false });
      if (editingTruck && path.includes(editingTruck.id)) setEditingTruck(null);
      if (editingPlace && path.includes(editingPlace.id)) setEditingPlace(null);
      if (editingTrip && path.includes(editingTrip.id)) setEditingTrip(null);
      setMessage("Record deleted.");
      await Promise.all([trucks.reload(), places.reload(), trips.reload()]);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete this record.");
    }
  }

  function truckIdOf(trip: FleetTrip) {
    if (!trip.truckId) return "";
    return typeof trip.truckId === "string" ? trip.truckId : trip.truckId.id || "";
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Trucks" subtitle="Each truck has its own GPS tracker. These trips are not school-bus trips." />
      {user.role === "PLATFORM_ADMIN" ? (
        <Field label="Fleet">
          <select className={controlClass} value={fleetId} onChange={(event) => setFleetId(event.target.value)}>
            <option value="">Select a fleet</option>
            {fleets.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.name}</option>)}
          </select>
        </Field>
      ) : null}
      {error || trucks.error || places.error || trips.error ? <Notice>{error || trucks.error || places.error || trips.error}</Notice> : null}
      {message ? <Notice tone={message.endsWith("saved.") || message.endsWith("deleted.") ? "ok" : "error"}>{message}</Notice> : null}
      {!fleetId ? <Notice>Choose a fleet to add trucks and trips.</Notice> : null}
      {fleetId ? (
        <>
          <Panel>
            <form key={editingTruck?.id || "new-truck"} className="grid gap-3 md:grid-cols-3" onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save(editingTruck ? `/api/v1/trucks/${editingTruck.id}` : "/api/v1/trucks", { registrationNumber: form.get("registrationNumber"), imei: form.get("imei") }, formElement, "Truck saved.", editingTruck ? "PATCH" : "POST").then((saved) => {
                if (saved) setEditingTruck(null);
              });
            }}>
              <Field label="Vehicle number"><input className={controlClass} name="registrationNumber" defaultValue={editingTruck?.registrationNumber || ""} required /></Field>
              <Field label="Tracker IMEI"><input className={controlClass} name="imei" defaultValue={editingTruck?.imei || ""} required /></Field>
              <div className="flex items-end gap-3 md:col-span-3">
                <PrimaryButton>{editingTruck ? "Save changes" : "Add truck"}</PrimaryButton>
                {editingTruck ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditingTruck(null)}>Cancel</button> : null}
              </div>
            </form>
          </Panel>
          <Panel>
            <DataTable
              {...listControls(trucks)}
              columns={["Vehicle", "IMEI", "Status", ""]}
              rows={trucks.rows.map((truck) => [
                truck.registrationNumber,
                truck.imei,
                truck.status,
                <RowActions key={truck.id} onEdit={() => { setEditingTruck(truck); setMessage(""); }} onDelete={() => { void removeRecord(`/api/v1/trucks/${truck.id}`, truck.registrationNumber); }} />,
              ])}
            />
          </Panel>
          <Panel>
            <form key={editingPlace?.id || "new-place"} className="grid gap-3 md:grid-cols-3" onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save(editingPlace ? `/api/v1/fleet-geofences/${editingPlace.id}` : "/api/v1/fleet-geofences", { name: form.get("name"), kind: form.get("kind"), address: form.get("address") }, formElement, "Place saved.", editingPlace ? "PATCH" : "POST").then((saved) => {
                if (saved) setEditingPlace(null);
              });
            }}>
              <Field label="Place"><input className={controlClass} name="name" defaultValue={editingPlace?.name || ""} required /></Field>
              <Field label="Kind">
                <select className={controlClass} name="kind" defaultValue={editingPlace?.kind || "DEPOT"} required>
                  <option value="DEPOT">Depot</option>
                  <option value="CUSTOMER">Customer site</option>
                </select>
              </Field>
              <Field label="Address"><input className={controlClass} name="address" defaultValue={editingPlace?.address || ""} /></Field>
              <div className="flex items-end gap-3 md:col-span-3">
                <PrimaryButton>{editingPlace ? "Save changes" : "Add place"}</PrimaryButton>
                {editingPlace ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditingPlace(null)}>Cancel</button> : null}
              </div>
            </form>
          </Panel>
          <Panel>
            <DataTable
              {...listControls(places)}
              columns={["Place", "Kind", "Address", ""]}
              rows={places.rows.map((place) => [
                place.name,
                place.kind,
                place.address,
                <RowActions key={place.id} onEdit={() => { setEditingPlace(place); setMessage(""); }} onDelete={() => { void removeRecord(`/api/v1/fleet-geofences/${place.id}`, place.name); }} />,
              ])}
            />
          </Panel>
          <Panel>
            <form key={editingTrip?.id || "new-trip"} className="grid gap-3 md:grid-cols-3" onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save(editingTrip ? `/api/v1/fleet-trips/${editingTrip.id}` : "/api/v1/fleet-trips", { truckId: form.get("truckId"), origin: form.get("origin"), destination: form.get("destination") }, formElement, "Trip saved.", editingTrip ? "PATCH" : "POST").then((saved) => {
                if (saved) setEditingTrip(null);
              });
            }}>
              <Field label="Truck">
                <select className={controlClass} name="truckId" defaultValue={editingTrip ? truckIdOf(editingTrip) : ""} required>
                  <option value="">Select</option>
                  {truckOptions.map((truck) => <option key={truck.id} value={truck.id}>{truck.registrationNumber}</option>)}
                </select>
              </Field>
              <Field label="Origin"><input className={controlClass} name="origin" defaultValue={editingTrip?.origin || ""} required /></Field>
              <Field label="Destination"><input className={controlClass} name="destination" defaultValue={editingTrip?.destination || ""} required /></Field>
              <div className="flex items-end gap-3 md:col-span-3">
                <PrimaryButton>{editingTrip ? "Save changes" : "Plan trip"}</PrimaryButton>
                {editingTrip ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditingTrip(null)}>Cancel</button> : null}
              </div>
            </form>
          </Panel>
          <Panel>
            <DataTable
              {...listControls(trips)}
              columns={["Truck", "Origin", "Destination", "Status", ""]}
              rows={trips.rows.map((trip) => [
                typeof trip.truckId === "object" ? trip.truckId?.registrationNumber || "" : "",
                trip.origin,
                trip.destination,
                trip.status,
                <RowActions key={trip.id} onEdit={() => { setEditingTrip(trip); setMessage(""); }} onDelete={() => { void removeRecord(`/api/v1/fleet-trips/${trip.id}`, "this trip"); }} />,
              ])}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

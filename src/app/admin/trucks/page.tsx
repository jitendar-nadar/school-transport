"use client";

import { useEffect, useState } from "react";
import { LocationPicker, defaultMapPoint, type MapPoint } from "@/components/admin/location-picker";
import { RouteStops, type RouteStop } from "@/components/admin/route-stops";
import { EMPTY_FIELD_ERRORS } from "@/components/admin/form-error-context";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Fleet = { id: string; name: string };
type Truck = { id: string; registrationNumber: string; imei: string; certification?: string; status: string };
type Place = { id: string; name: string; kind: string; address: string; latitude?: number | null; longitude?: number | null; radiusMeters?: number };
type FleetTrip = { id: string; origin: string; destination: string; status: string; route?: RouteStop[]; truckId?: { id?: string; registrationNumber?: string } | string };

export default function TrucksPage() {
  const { user } = useScope();
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [fleetId, setFleetId] = useState(user.fleetId || "");
  const [truckOptions, setTruckOptions] = useState<Truck[]>([]);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorOwner, setErrorOwner] = useState("");
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [editingTrip, setEditingTrip] = useState<FleetTrip | null>(null);
  const [placePoint, setPlacePoint] = useState<MapPoint>(defaultMapPoint);
  const [placeConfirmed, setPlaceConfirmed] = useState(false);
  const [placeAddress, setPlaceAddress] = useState("");
  const [placeLookup, setPlaceLookup] = useState("");
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
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

  async function save(owner: string, path: string, body: Record<string, unknown>, formElement: HTMLFormElement, success: string, method: "POST" | "PATCH" = "POST") {
    setMessage("");
    setErrorOwner(owner);
    setFieldErrors({});
    try {
      await api(path, { method, school: false, body: { ...body, fleetId } });
      formElement.reset();
      setErrorOwner("");
      setMessage(success);
      await Promise.all([trucks.reload(), places.reload(), trips.reload()]);
      return true;
    } catch (caught) {
      const result = failureOf(caught, "Could not save.");
      setErrorOwner(owner);
      setFieldErrors(result.fields);
      setMessage(result.message);
      return false;
    }
  }

  async function removeRecord(path: string, label: string) {
    if (!window.confirm(`Delete ${label}?`)) return;
    try {
      await api(`${path}?fleetId=${fleetId}`, { method: "DELETE", school: false });
      if (editingTruck && path.includes(editingTruck.id)) setEditingTruck(null);
      if (editingPlace && path.includes(editingPlace.id)) setEditingPlace(null);
      if (editingTrip && path.includes(editingTrip.id)) beginTrip(null);
      setMessage("Record deleted.");
      await Promise.all([trucks.reload(), places.reload(), trips.reload()]);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete this record.");
    }
  }

  function beginPlace(place: Place | null) {
    setEditingPlace(place);
    setPlaceAddress(place?.address || "");
    setPlaceLookup("");
    setPlacePoint({
      latitude: place?.latitude ?? defaultMapPoint.latitude,
      longitude: place?.longitude ?? defaultMapPoint.longitude,
    });
    setPlaceConfirmed(place?.latitude != null && place?.longitude != null);
    setMessage("");
  }

  function beginTrip(trip: FleetTrip | null) {
    setEditingTrip(trip);
    setRouteStops((trip?.route || []).map((stop) => ({
      latitude: stop.latitude,
      longitude: stop.longitude,
      label: stop.label || `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`,
    })));
    setMessage("");
  }

  async function setTripStatus(trip: FleetTrip, status: "ACTIVE" | "COMPLETED") {
    try {
      await api(`/api/v1/fleet-trips/${trip.id}/status`, { method: "POST", school: false, body: { fleetId, status } });
      setMessage("Trip saved.");
      await trips.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not update the trip.");
    }
  }

  function truckIdOf(trip: FleetTrip) {
    if (!trip.truckId) return "";
    return typeof trip.truckId === "string" ? trip.truckId : trip.truckId.id || "";
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Trucks" subtitle="Pair each truck with a tracker IMEI. Places need a map pin so geofence alerts can fire. Search each stop on a trip; the address becomes the map point." />
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
            <ValidatedForm key={editingTruck?.id || "new-truck"} className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "truck" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save("truck", editingTruck ? `/api/v1/trucks/${editingTruck.id}` : "/api/v1/trucks", { registrationNumber: form.get("registrationNumber"), imei: form.get("imei"), certification: form.get("certification") }, formElement, "Truck saved.", editingTruck ? "PATCH" : "POST").then((saved) => {
                if (saved) setEditingTruck(null);
              });
            }}>
              <Field label="Vehicle number"><input className={controlClass} name="registrationNumber" minLength={2} maxLength={20} defaultValue={editingTruck?.registrationNumber || ""} required /></Field>
              <Field label="Tracker IMEI"><input className={controlClass} name="imei" minLength={8} maxLength={32} defaultValue={editingTruck?.imei || ""} required /></Field>
              <Field label="Tracker standard">
                <select className={controlClass} name="certification" defaultValue={editingTruck?.certification || "STANDARD"}>
                  <option value="STANDARD">Standard GPS</option>
                  <option value="AIS140">AIS-140</option>
                </select>
              </Field>
              <div className="flex items-end gap-3 md:col-span-3">
                <PrimaryButton>{editingTruck ? "Save changes" : "Add truck"}</PrimaryButton>
                {editingTruck ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditingTruck(null)}>Cancel</button> : null}
              </div>
            </ValidatedForm>
          </Panel>
          <Panel>
            <DataTable
              {...listControls(trucks)}
              columns={["Vehicle", "IMEI", "Standard", "Status", ""]}
              rows={trucks.rows.map((truck) => [
                truck.registrationNumber,
                truck.imei,
                truck.certification === "AIS140" ? "AIS-140" : "Standard GPS",
                truck.status,
                <RowActions key={truck.id} onEdit={() => { setEditingTruck(truck); setMessage(""); }} onDelete={() => { void removeRecord(`/api/v1/trucks/${truck.id}`, truck.registrationNumber); }} />,
              ])}
            />
          </Panel>
          <Panel>
            <ValidatedForm key={editingPlace?.id || "new-place"} className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "place" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => {
              event.preventDefault();
              if (!placeConfirmed) {
                setErrorOwner("place");
                setFieldErrors({ location: "Confirm the pin before saving the place." });
                setMessage("");
                return;
              }
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save("place", editingPlace ? `/api/v1/fleet-geofences/${editingPlace.id}` : "/api/v1/fleet-geofences", {
                name: form.get("name"),
                kind: form.get("kind"),
                address: placeAddress,
                latitude: placePoint.latitude,
                longitude: placePoint.longitude,
                radiusMeters: Number(form.get("radius") || 150),
              }, formElement, "Place saved.", editingPlace ? "PATCH" : "POST").then((saved) => {
                if (saved) beginPlace(null);
              });
            }}>
              <Field label="Place"><input className={controlClass} name="name" minLength={2} defaultValue={editingPlace?.name || ""} required /></Field>
              <Field label="Kind">
                <select className={controlClass} name="kind" defaultValue={editingPlace?.kind || "DEPOT"} required>
                  <option value="DEPOT">Depot</option>
                  <option value="CUSTOMER">Customer site</option>
                </select>
              </Field>
              <Field label="Radius (m)"><input className={controlClass} name="radius" type="number" defaultValue={editingPlace?.radiusMeters || 150} min={30} /></Field>
              <Field label="Address">
                <input className={controlClass} name="address" value={placeAddress} onChange={(event) => { setPlaceAddress(event.target.value); setPlaceLookup(event.target.value); }} />
              </Field>
              <LocationPicker
                confirmed={placeConfirmed}
                lookupQuery={placeLookup}
                point={placePoint}
                onAddressChange={(next) => { setPlaceAddress(next); setPlaceLookup(""); }}
                onConfirm={() => setPlaceConfirmed(true)}
                onPointChange={(next) => { setPlacePoint(next); setPlaceConfirmed(false); }}
              />
              <div className="flex items-end gap-3 md:col-span-3">
                <PrimaryButton>{editingPlace ? "Save changes" : "Add place"}</PrimaryButton>
                {editingPlace ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => beginPlace(null)}>Cancel</button> : null}
              </div>
            </ValidatedForm>
          </Panel>
          <Panel>
            <DataTable
              {...listControls(places)}
              columns={["Place", "Kind", "Address", "Radius", ""]}
              rows={places.rows.map((place) => [
                place.name,
                place.kind,
                place.address,
                place.radiusMeters ? `${place.radiusMeters} m` : "",
                <RowActions key={place.id} onEdit={() => beginPlace(place)} onDelete={() => { void removeRecord(`/api/v1/fleet-geofences/${place.id}`, place.name); }} />,
              ])}
            />
          </Panel>
          <Panel>
            <ValidatedForm key={editingTrip?.id || "new-trip"} className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "trip" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              void save("trip", editingTrip ? `/api/v1/fleet-trips/${editingTrip.id}` : "/api/v1/fleet-trips", { truckId: form.get("truckId"), origin: form.get("origin"), destination: form.get("destination"), route: routeStops }, formElement, "Trip saved.", editingTrip ? "PATCH" : "POST").then((saved) => {
                if (saved) beginTrip(null);
              });
            }}>
              <Field label="Truck">
                <select className={controlClass} name="truckId" defaultValue={editingTrip ? truckIdOf(editingTrip) : ""} required>
                  <option value="">Select</option>
                  {truckOptions.map((truck) => <option key={truck.id} value={truck.id}>{truck.registrationNumber}</option>)}
                </select>
              </Field>
              <Field label="Origin"><input className={controlClass} name="origin" minLength={2} defaultValue={editingTrip?.origin || ""} required /></Field>
              <Field label="Destination"><input className={controlClass} name="destination" minLength={2} defaultValue={editingTrip?.destination || ""} required /></Field>
              <RouteStops places={places.rows} stops={routeStops} onChange={setRouteStops} />
              <div className="flex items-end gap-3 md:col-span-3">
                <PrimaryButton>{editingTrip ? "Save changes" : "Plan trip"}</PrimaryButton>
                {editingTrip ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => beginTrip(null)}>Cancel</button> : null}
              </div>
            </ValidatedForm>
          </Panel>
          <Panel>
            <DataTable
              {...listControls(trips)}
              columns={["Truck", "Origin", "Destination", "Route", "Status", ""]}
              rows={trips.rows.map((trip) => [
                typeof trip.truckId === "object" ? trip.truckId?.registrationNumber || "" : "",
                trip.origin,
                trip.destination,
                trip.route?.length ? `${trip.route.length} points` : "",
                trip.status,
                <span key={trip.id} className="flex flex-wrap items-center gap-2">
                  {trip.status === "PLANNED" ? <button className="text-sm font-medium text-teal-800 hover:underline" type="button" onClick={() => { void setTripStatus(trip, "ACTIVE"); }}>Start</button> : null}
                  {trip.status === "ACTIVE" ? <button className="text-sm font-medium text-teal-800 hover:underline" type="button" onClick={() => { void setTripStatus(trip, "COMPLETED"); }}>Complete</button> : null}
                  <RowActions onEdit={() => beginTrip(trip)} onDelete={() => { void removeRecord(`/api/v1/fleet-trips/${trip.id}`, "this trip"); }} />
                </span>,
              ])}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

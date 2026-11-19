"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { api } from "@/lib/admin/api";

const FleetPlaybackMap = dynamic(() => import("@/components/admin/fleet-playback-map"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-slate-100" />,
});

type DailyRow = {
  truckId: string;
  registrationNumber: string;
  distanceKm: number;
  idleMinutes: number;
  stoppages: Array<{ startedAt: string; endedAt: string }>;
};

type Playback = {
  points: Array<{ latitude: number; longitude: number; speedKmh: number; recordedAt: string }>;
  distanceKm: number;
  idleMinutes: number;
  stoppages: number;
};

type TripHistoryRow = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  truckId?: { id?: string; registrationNumber?: string } | string;
};

type TripReport = {
  trip: {
    id: string;
    origin: string;
    destination: string;
    status: string;
    startedAt: string | null;
    endedAt: string | null;
  };
  registrationNumber: string;
  distanceKm: number;
  idleMinutes: number;
  stoppageCount: number;
  stoppages: Array<{ startedAt: string; endedAt: string; latitude: number; longitude: number }>;
  points: Array<{ latitude: number; longitude: number; speedKmh: number; recordedAt: string }>;
  alerts: Array<{ id: string; type: string; message: string; recordedAt: string }>;
};

function today() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function truckLabel(truckId?: TripHistoryRow["truckId"]) {
  if (!truckId) return "";
  if (typeof truckId === "string") return truckId;
  return truckId.registrationNumber || truckId.id || "";
}

function clock(value?: string | null) {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 16);
}

export default function FleetReportsPage() {
  const fleetId = useScope().fleetId || "";
  const [mode, setMode] = useState<"daily" | "trips">("daily");
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [selectedTruck, setSelectedTruck] = useState("");
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [trips, setTrips] = useState<TripHistoryRow[]>([]);
  const [tripStatus, setTripStatus] = useState("");
  const [selectedTripId, setSelectedTripId] = useState("");
  const [tripReport, setTripReport] = useState<TripReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!fleetId || mode !== "daily" || !date) return;
    let ignore = false;
    api<DailyRow[]>(`/api/v1/fleet-reports/daily?fleetId=${fleetId}&date=${date}`, { school: false })
      .then((result) => {
        if (ignore) return;
        setRows(result.data);
        setError("");
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load the report.");
      });
    return () => {
      ignore = true;
    };
  }, [fleetId, mode, date]);

  useEffect(() => {
    if (!fleetId || mode !== "daily" || !selectedTruck || !date) return;
    let ignore = false;
    api<Playback>(`/api/v1/fleet-reports/playback?fleetId=${fleetId}&truckId=${selectedTruck}&date=${date}`, {
      school: false,
    })
      .then((result) => {
        if (!ignore) setPlayback(result.data);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load the route.");
      });
    return () => {
      ignore = true;
    };
  }, [fleetId, mode, selectedTruck, date]);

  useEffect(() => {
    if (!fleetId || mode !== "trips") return;
    let ignore = false;
    const statusQuery = tripStatus ? `&status=${tripStatus}` : "";
    api<TripHistoryRow[]>(`/api/v1/fleet-reports/trips?fleetId=${fleetId}&limit=50${statusQuery}`, { school: false })
      .then((result) => {
        if (ignore) return;
        setTrips(result.data);
        setError("");
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load trip history.");
      });
    return () => {
      ignore = true;
    };
  }, [fleetId, mode, tripStatus]);

  useEffect(() => {
    if (!fleetId || mode !== "trips" || !selectedTripId) return;
    let ignore = false;
    api<TripReport>(`/api/v1/fleet-reports/trips/${selectedTripId}?fleetId=${fleetId}`, { school: false })
      .then((result) => {
        if (!ignore) setTripReport(result.data);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load the trip report.");
      });
    return () => {
      ignore = true;
    };
  }, [fleetId, mode, selectedTripId]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fleet reports"
        subtitle="Daily distance and idle time, or open a trip to see its history, stoppages, alerts, and route playback for that journey only."
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "daily" ? "bg-brand-700 text-white" : "border border-slate-300 text-slate-700"}`}
          onClick={() => {
            setMode("daily");
            setSelectedTripId("");
            setTripReport(null);
            setError("");
          }}
        >
          Daily
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "trips" ? "bg-brand-700 text-white" : "border border-slate-300 text-slate-700"}`}
          onClick={() => {
            setMode("trips");
            setSelectedTruck("");
            setPlayback(null);
          }}
        >
          Trips
        </button>
      </div>

      {mode === "daily" ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Date">
            <input className={controlClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Trip status">
            <select className={controlClass} value={tripStatus} onChange={(event) => setTripStatus(event.target.value)}>
              <option value="">All started trips</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </Field>
        </div>
      )}

      {error ? <Notice>{error}</Notice> : null}
      {!fleetId ? <Notice>Choose a fleet in the header to see reports.</Notice> : null}

      {fleetId && mode === "daily" ? (
        <>
          <Panel>
            <DataTable
              columns={["Vehicle", "Distance", "Idle", "Stoppages", ""]}
              rows={rows.map((row) => [
                row.registrationNumber,
                `${row.distanceKm} km`,
                `${row.idleMinutes} min`,
                String(row.stoppages.length),
                <button
                  key={row.truckId}
                  className="text-sm font-medium text-brand-800 hover:underline"
                  type="button"
                  onClick={() => setSelectedTruck(row.truckId)}
                >
                  Play route
                </button>,
              ])}
            />
          </Panel>
          {selectedTruck && playback ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                {playback.distanceKm} km · {playback.idleMinutes} min idle · {playback.stoppages} stoppages
              </p>
              <div className="h-96 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                <FleetPlaybackMap points={playback.points || []} />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {fleetId && mode === "trips" ? (
        <>
          <Panel>
            <DataTable
              columns={["Trip", "Vehicle", "Status", "Started", "Ended", ""]}
              rows={trips.map((trip) => [
                `${trip.origin} → ${trip.destination}`,
                truckLabel(trip.truckId),
                trip.status,
                clock(trip.startedAt),
                clock(trip.endedAt),
                <button
                  key={trip.id}
                  className="text-sm font-medium text-brand-800 hover:underline"
                  type="button"
                  onClick={() => setSelectedTripId(trip.id)}
                >
                  Open trip
                </button>,
              ])}
            />
          </Panel>

          {selectedTripId && tripReport && tripReport.trip.id === selectedTripId ? (
            <Panel>
              <div className="mb-3 space-y-1">
                <h3 className="text-base font-semibold text-slate-900">
                  {tripReport.trip.origin} → {tripReport.trip.destination}
                </h3>
                <p className="text-sm text-slate-600">
                  {tripReport.registrationNumber} · {tripReport.trip.status} · {clock(tripReport.trip.startedAt)} –{" "}
                  {clock(tripReport.trip.endedAt)}
                </p>
                <p className="text-sm text-slate-700">
                  {tripReport.distanceKm} km · {tripReport.idleMinutes} min idle · {tripReport.stoppageCount} stoppages ·{" "}
                  {tripReport.alerts.length} alerts
                </p>
              </div>
              <div className="mb-4 h-96 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                <FleetPlaybackMap points={tripReport.points || []} />
              </div>
              <DataTable
                columns={["When", "Alert", "Message"]}
                rows={tripReport.alerts.map((alert) => [
                  clock(alert.recordedAt),
                  alert.type,
                  alert.message,
                ])}
              />
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

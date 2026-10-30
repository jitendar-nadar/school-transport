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

type Fleet = { id: string; name: string };
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

function today() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export default function FleetReportsPage() {
  const { user } = useScope();
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [fleetId, setFleetId] = useState(user.fleetId || "");
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [selected, setSelected] = useState("");
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user.role !== "PLATFORM_ADMIN") return;
    api<Fleet[]>("/api/v1/fleets?limit=100", { school: false }).then((result) => setFleets(result.data)).catch(() => setFleets([]));
  }, [user.role]);

  useEffect(() => {
    if (!fleetId || !date) return;
    let ignore = false;
    api<DailyRow[]>(`/api/v1/fleet-reports/daily?fleetId=${fleetId}&date=${date}`, { school: false }).then((result) => {
      if (!ignore) {
        setRows(result.data);
        setError("");
      }
    }).catch((caught: unknown) => {
      if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load the report.");
    });
    return () => { ignore = true; };
  }, [fleetId, date]);

  useEffect(() => {
    if (!fleetId || !selected || !date) {
      setPlayback(null);
      return;
    }
    let ignore = false;
    api<Playback>(`/api/v1/fleet-reports/playback?fleetId=${fleetId}&truckId=${selected}&date=${date}`, { school: false }).then((result) => {
      if (!ignore) setPlayback(result.data);
    }).catch((caught: unknown) => {
      if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load the route.");
    });
    return () => { ignore = true; };
  }, [fleetId, selected, date]);

  return (
    <div className="space-y-5">
      <PageHeader title="Fleet reports" subtitle="Distance, idle time, stoppages, and the route driven that day. Points are kept for the retention window, including uploads that arrive late." />
      <div className="grid gap-3 md:grid-cols-3">
        {user.role === "PLATFORM_ADMIN" ? (
          <Field label="Fleet">
            <select className={controlClass} value={fleetId} onChange={(event) => { setFleetId(event.target.value); setSelected(""); }}>
              <option value="">Select a fleet</option>
              {fleets.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.name}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Date">
          <input className={controlClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {!fleetId ? <Notice>Choose a fleet to see the daily report.</Notice> : null}
      {fleetId ? (
        <>
          <Panel>
            <DataTable
              columns={["Vehicle", "Distance", "Idle", "Stoppages", ""]}
              rows={rows.map((row) => [
                row.registrationNumber,
                `${row.distanceKm} km`,
                `${row.idleMinutes} min`,
                String(row.stoppages.length),
                <button key={row.truckId} className="text-sm font-medium text-teal-800 hover:underline" type="button" onClick={() => setSelected(row.truckId)}>Play route</button>,
              ])}
            />
          </Panel>
          {selected ? (
            <div className="h-96 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <FleetPlaybackMap points={playback?.points || []} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { api } from "@/lib/admin/api";
import type { LiveTruck } from "@/components/admin/fleet-live-map";

const FleetLiveMap = dynamic(() => import("@/components/admin/fleet-live-map"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-slate-100" />,
});

type Fleet = { id: string; name: string };
type AlertRow = { id: string; type: string; message: string; recordedAt: string; truckId?: { registrationNumber?: string } | string };

const legend = [
  ["MOVING", "bg-teal-700"],
  ["IDLE", "bg-amber-700"],
  ["STOPPED", "bg-slate-600"],
  ["OFFLINE", "bg-red-700"],
];

export default function FleetMapPage() {
  const { user } = useScope();
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [fleetId, setFleetId] = useState(user.fleetId || "");
  const [trucks, setTrucks] = useState<LiveTruck[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user.role !== "PLATFORM_ADMIN") return;
    api<Fleet[]>("/api/v1/fleets?limit=100", { school: false }).then((result) => setFleets(result.data)).catch(() => setFleets([]));
  }, [user.role]);

  const load = useCallback(async () => {
    if (!fleetId) return;
    try {
      const [live, alertList] = await Promise.all([
        api<LiveTruck[]>(`/api/v1/fleet-live?fleetId=${fleetId}`, { school: false }),
        api<AlertRow[]>(`/api/v1/fleet-alerts?fleetId=${fleetId}&limit=20`, { school: false }),
      ]);
      setTrucks(live.data);
      setAlerts(alertList.data);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the live map.");
    }
  }, [fleetId]);

  useEffect(() => {
    void load();
    if (!fleetId) return undefined;
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [fleetId, load]);

  return (
    <div className="space-y-5">
      <PageHeader title="Live map" subtitle="Moving, idle, stopped, and offline come from the latest tracker point. The map refreshes every few seconds." />
      {user.role === "PLATFORM_ADMIN" ? (
        <Field label="Fleet">
          <select className={controlClass} value={fleetId} onChange={(event) => setFleetId(event.target.value)}>
            <option value="">Select a fleet</option>
            {fleets.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.name}</option>)}
          </select>
        </Field>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {!fleetId ? <Notice>Choose a fleet to see its trucks.</Notice> : null}
      {fleetId ? (
        <>
          <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-600">
            {legend.map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                {label}
              </span>
            ))}
          </div>
          <div className="h-96 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            <FleetLiveMap trucks={trucks} />
          </div>
          <Panel>
            <DataTable
              columns={["Vehicle", "Status", "Speed", "Ignition", "Last point"]}
              rows={trucks.map((truck) => [
                truck.registrationNumber,
                truck.status,
                truck.speedKmh == null ? "" : `${Math.round(truck.speedKmh)} km/h`,
                truck.ignition == null ? "" : truck.ignition ? "On" : "Off",
                truck.recordedAt ? new Date(truck.recordedAt).toLocaleString() : "",
              ])}
            />
          </Panel>
          <Panel>
            <DataTable
              columns={["When", "Vehicle", "Alert", "Detail"]}
              rows={alerts.map((alert) => [
                alert.recordedAt ? new Date(alert.recordedAt).toLocaleString() : "",
                typeof alert.truckId === "object" ? alert.truckId?.registrationNumber || "" : "",
                alert.type,
                alert.message,
              ])}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

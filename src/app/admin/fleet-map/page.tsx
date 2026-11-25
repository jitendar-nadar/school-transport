"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { DataTable, Notice, PageHeader, Panel } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { api } from "@/lib/admin/api";
import type { LiveTruck } from "@/components/admin/fleet-live-map";

const FleetLiveMap = dynamic(() => import("@/components/admin/fleet-live-map"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-slate-100" />,
});

type AlertRow = { id: string; type: string; message: string; recordedAt: string; truckId?: { registrationNumber?: string } | string };

const legend = [
  ["MOVING", "bg-brand-700"],
  ["IDLE", "bg-amber-700"],
  ["STOPPED", "bg-slate-600"],
  ["OFFLINE", "bg-red-700"],
];

export default function FleetMapPage() {
  const fleetId = useScope().fleetId || "";
  const [trucks, setTrucks] = useState<LiveTruck[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState("");

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
      {error ? <Notice>{error}</Notice> : null}
      {!fleetId ? <Notice>Choose a fleet in the header to see its vehicles.</Notice> : null}
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

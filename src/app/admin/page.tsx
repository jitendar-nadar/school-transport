"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useScope } from "@/components/admin/shell";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";

type Overview = { students: number; vehicles: number; activeTrips: number; onboardNow: number; safetyAlerts: number };
type Trip = {
  id: string;
  direction: string;
  totalBoarded: number;
  totalAssignedStudents: number;
  vehicleId?: { vehicleNumber?: string };
  routeId?: { name?: string };
  liveLocation?: { latitude?: number; longitude?: number } | null;
};

export default function OverviewPage() {
  const { user, schoolId } = useScope();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user.role === "PLATFORM_ADMIN" && !schoolId) return;
    let stop = false;
    async function load() {
      try {
        const [summary, active] = await Promise.all([
          api<Overview>("/api/v1/dashboard/overview"),
          api<Trip[]>("/api/v1/dashboard/trips/active"),
        ]);
        if (!stop) {
          setOverview(summary.data);
          setTrips(active.data);
          setError("");
        }
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "Could not load the dashboard.");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [user.role, schoolId]);

  return (
    <div>
      <PageHeader title="Transport overview" subtitle="Active buses, boarding progress, and safety alerts for the selected school." />
      {user.role === "PLATFORM_ADMIN" && !schoolId ? <Panel>Select a school in the header to see its operations.</Panel> : null}
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {overview ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Students", overview.students],
            ["Vehicles", overview.vehicles],
            ["Active trips", overview.activeTrips],
            ["On board now", overview.onboardNow],
            ["Safety alerts", overview.safetyAlerts],
          ].map(([label, value]) => (
            <Panel key={String(label)}>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-3xl font-semibold">{value}</p>
            </Panel>
          ))}
        </div>
      ) : null}
      <Panel>
        <h3 className="mb-3 font-medium">Active trips</h3>
        <div className="space-y-3">
          {trips.length ? (
            trips.map((trip) => (
              <Link key={trip.id} href={`/admin/trips/${trip.id}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3">
                <div>
                  <p className="font-medium">{trip.vehicleId?.vehicleNumber || "Vehicle"} · {trip.routeId?.name || "Route"}</p>
                  <p className="text-sm text-slate-500">{trip.totalBoarded}/{trip.totalAssignedStudents} boarded</p>
                </div>
                <Badge>{trip.direction}</Badge>
              </Link>
            ))
          ) : (
            <p className="text-sm text-slate-500">No trip is active right now.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

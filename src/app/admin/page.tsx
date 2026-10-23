"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useScope } from "@/components/admin/shell";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { MyDay } from "@/components/admin/my-day";

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
  const { user } = useScope();
  if (user.role === "COMPANY_ADMIN") return <CompanyHome />;
  if (user.role === "FLEET_ADMIN") return <FleetHome />;
  if (user.role === "EMPLOYEE") return <EmployeeHome />;
  return <SchoolHome />;
}

function EmployeeHome() {
  return <MyDay />;
}

function CompanyHome() {
  const [summary, setSummary] = useState<{ departments: number; employees: number; openGaps: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ departments: number; employees: number; openGaps: number }>("/api/v1/companies/summary", { school: false })
      .then((result) => setSummary(result.data))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load the company."));
  }, []);
  return (
    <div>
      <PageHeader title="Company overview" subtitle="Attendance records for this company. School students and bus trips are not included." />
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[["Departments", summary.departments], ["Employees", summary.employees], ["Open gaps", summary.openGaps]].map(([label, value]) => (
            <Panel key={String(label)}>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
            </Panel>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FleetHome() {
  const [summary, setSummary] = useState<{ trucks: number; activeTrips: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ trucks: number; activeTrips: number }>("/api/v1/fleets/summary", { school: false })
      .then((result) => setSummary(result.data))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load the fleet."));
  }, []);
  return (
    <div>
      <PageHeader title="Fleet overview" subtitle="Trucks and fleet trips. These are separate from school buses." />
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[["Trucks", summary.trucks], ["Active fleet trips", summary.activeTrips]].map(([label, value]) => (
            <Panel key={String(label)}>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
            </Panel>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SchoolHome() {
  const { user, schoolId } = useScope();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user.role === "PLATFORM_ADMIN" && !schoolId) return;
    let stop = false;
    async function load() {
      try {
        const [summaryResult, activeResult] = await Promise.allSettled([
          api<Overview>("/api/v1/dashboard/overview"),
          api<Trip[]>("/api/v1/dashboard/trips/active"),
        ]);
        if (stop) return;
        const problems: string[] = [];
        if (summaryResult.status === "fulfilled") setOverview(summaryResult.value.data);
        else problems.push(summaryResult.reason instanceof Error ? summaryResult.reason.message : "Could not load the overview.");
        if (activeResult.status === "fulfilled") setTrips(activeResult.value.data);
        else problems.push(activeResult.reason instanceof Error ? activeResult.reason.message : "Could not load active trips.");
        setError(problems.join(" "));
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
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
            </Panel>
          ))}
        </div>
      ) : null}
      <Panel>
        <h3 className="mb-3 font-medium">Active trips</h3>
        <div className="space-y-3">
          {trips.length ? (
            trips.map((trip) => (
              <Link key={trip.id} href={`/admin/trips/${trip.id}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 transition hover:border-teal-200 hover:bg-slate-50">
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

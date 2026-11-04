"use client";

import { Backpack, Briefcase, Building2, Bus, CalendarCheck, CalendarClock, ChevronRight, Navigation, Route, TriangleAlert, Truck, UserCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useScope } from "@/components/admin/shell";
import { Badge, PageHeader, Panel, StatCard } from "@/components/admin/ui";
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
  const { user, scope, companyId, fleetId } = useScope();
  if (user.role === "PLATFORM_ADMIN") {
    if (scope.active === "COMPANY" && companyId) return <CompanyHome companyId={companyId} name={scope.COMPANY?.name} />;
    if (scope.active === "FLEET" && fleetId) return <FleetHome fleetId={fleetId} name={scope.FLEET?.name} />;
    return <SchoolHome />;
  }
  if (user.role === "COMPANY_ADMIN") return <CompanyHome />;
  if (user.role === "COMPANY_HR") return <HrHome />;
  if (user.role === "FLEET_ADMIN") return <FleetHome />;
  if (user.role === "EMPLOYEE") return <EmployeeHome />;
  return <SchoolHome />;
}

function HrHome() {
  return (
    <>
      <PageHeader title="HR review" subtitle="Approve or reject out-of-office gaps, and download the monthly attendance report." />
      <Panel>
        <Link className="inline-flex items-center gap-2 text-sm font-medium text-brand-800 hover:underline" href="/admin/attendance">
          <CalendarCheck className="h-4 w-4" aria-hidden="true" />
          Open attendance
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Panel>
    </>
  );
}

function EmployeeHome() {
  return <MyDay />;
}

function CompanyHome({ companyId, name }: { companyId?: string; name?: string }) {
  const [summary, setSummary] = useState<{ departments: number; employees: number; openGaps: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ departments: number; employees: number; openGaps: number }>(`/api/v1/companies/summary${companyId ? `?companyId=${companyId}` : ""}`, { school: false })
      .then((result) => setSummary(result.data))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load the company."));
  }, [companyId]);
  return (
    <div>
      <PageHeader title={name ? `${name} overview` : "Company overview"} subtitle="Attendance records for this company. School students and bus trips are not included." icon={Building2} />
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Departments" value={summary.departments} icon={Building2} />
          <StatCard label="Employees" value={summary.employees} icon={Briefcase} />
          <StatCard label="Open gaps" value={summary.openGaps} icon={CalendarClock} tone={summary.openGaps ? "amber" : "brand"} />
        </div>
      ) : null}
    </div>
  );
}

function FleetHome({ fleetId, name }: { fleetId?: string; name?: string }) {
  const [summary, setSummary] = useState<{ trucks: number; activeTrips: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ trucks: number; activeTrips: number }>(`/api/v1/fleets/summary${fleetId ? `?fleetId=${fleetId}` : ""}`, { school: false })
      .then((result) => setSummary(result.data))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load the fleet."));
  }, [fleetId]);
  return (
    <div>
      <PageHeader title={name ? `${name} overview` : "Fleet overview"} subtitle="Vehicles and fleet trips. These are separate from school buses." icon={Truck} />
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="Trucks" value={summary.trucks} icon={Truck} />
          <StatCard label="Active fleet trips" value={summary.activeTrips} icon={Route} />
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
      {user.role === "PLATFORM_ADMIN" && !schoolId ? <Panel>Choose a school, company, or fleet in the header to see its overview.</Panel> : null}
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {overview ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Students" value={overview.students} icon={Backpack} />
          <StatCard label="Vehicles" value={overview.vehicles} icon={Bus} />
          <StatCard label="Active trips" value={overview.activeTrips} icon={Navigation} />
          <StatCard label="On board now" value={overview.onboardNow} icon={UserCheck} />
          <StatCard label="Safety alerts" value={overview.safetyAlerts} icon={TriangleAlert} tone={overview.safetyAlerts ? "red" : "brand"} />
        </div>
      ) : null}
      <Panel>
        <h3 className="mb-3 font-medium">Active trips</h3>
        <div className="space-y-3">
          {trips.length ? (
            trips.map((trip) => (
              <Link key={trip.id} href={`/admin/trips/${trip.id}`} className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 transition hover:border-brand-200 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-800" aria-hidden="true"><Bus className="h-4 w-4" /></span>
                  <div>
                    <p className="font-medium">{trip.vehicleId?.vehicleNumber || "Vehicle"} · {trip.routeId?.name || "Route"}</p>
                    <p className="text-sm text-slate-500">{trip.totalBoarded}/{trip.totalAssignedStudents} boarded</p>
                  </div>
                </div>
                <span className="flex items-center gap-2">
                  <Badge>{trip.direction}</Badge>
                  <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
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

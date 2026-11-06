"use client";

import { Backpack, Briefcase, Building2, Bus, BusFront, CalendarCheck, CalendarClock, ChevronRight, CreditCard, Handshake, Navigation, Package, Route, School, TriangleAlert, Truck, UserCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useScope } from "@/components/admin/shell";
import { Badge, DataTable, PageHeader, Panel, StatCard } from "@/components/admin/ui";
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
  const { user, scope, companyId, fleetId, agencyId } = useScope();
  if (user.role === "PLATFORM_ADMIN") {
    if (scope.active === "COMPANY" && companyId) return <CompanyHome companyId={companyId} name={scope.COMPANY?.name} />;
    if (scope.active === "FLEET" && fleetId) return <FleetHome fleetId={fleetId} name={scope.FLEET?.name} />;
    if (scope.active === "AGENCY" && agencyId) return <AgencyHome agencyId={agencyId} name={scope.AGENCY?.name} />;
    return <SchoolHome />;
  }
  if (user.role === "COMPANY_ADMIN") return <CompanyHome />;
  if (user.role === "COMPANY_HR") return <HrHome />;
  if (user.role === "FLEET_ADMIN") return <FleetHome />;
  if (user.role === "AGENCY_ADMIN") return <AgencyHome />;
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

type SuppliedVehicle = { id: string; vehicleNumber: string; vehicleType: string; capacity: number; status: string; agencyName: string; agencyPhone: string };

function CompanyHome({ companyId, name }: { companyId?: string; name?: string }) {
  const [summary, setSummary] = useState<{ departments: number; employees: number; openGaps: number } | null>(null);
  const [supplied, setSupplied] = useState<SuppliedVehicle[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const query = companyId ? `?companyId=${companyId}` : "";
    api<{ departments: number; employees: number; openGaps: number }>(`/api/v1/companies/summary${query}`, { school: false })
      .then((result) => setSummary(result.data))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load the company."));
    api<SuppliedVehicle[]>(`/api/v1/agency-vehicles/supplied${query}`, { school: false })
      .then((result) => setSupplied(result.data))
      .catch(() => setSupplied([]));
  }, [companyId]);
  return (
    <div className="space-y-5">
      <PageHeader title={name ? `${name} overview` : "Company overview"} subtitle="Attendance records for this company. School students and bus trips are not included." icon={Building2} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Departments" value={summary.departments} icon={Building2} />
          <StatCard label="Employees" value={summary.employees} icon={Briefcase} />
          <StatCard label="Open gaps" value={summary.openGaps} icon={CalendarClock} tone={summary.openGaps ? "amber" : "brand"} />
        </div>
      ) : null}
      {supplied.length ? (
        <Panel>
          <h3 className="mb-1 font-medium">Vehicles from transport agencies</h3>
          <p className="mb-3 text-sm text-slate-500">Buses and vans an agency runs for this company. Commute trips with boarding come later.</p>
          <DataTable
            columns={["Vehicle", "Type", "Seats", "Status", "Agency"]}
            rows={supplied.map((vehicle) => [
              vehicle.vehicleNumber,
              vehicle.vehicleType,
              String(vehicle.capacity),
              vehicle.status,
              [vehicle.agencyName, vehicle.agencyPhone].filter(Boolean).join(" · "),
            ])}
          />
        </Panel>
      ) : null}
    </div>
  );
}

type AgencySummary = { schools: number; companies: number; vehicles: number; cardsInStock: number; cardsWaiting: number; cardsIssued: number };

function AgencyHome({ agencyId, name }: { agencyId?: string; name?: string }) {
  const [summary, setSummary] = useState<AgencySummary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<AgencySummary>(`/api/v1/agencies/summary${agencyId ? `?agencyId=${agencyId}` : ""}`, { school: false })
      .then((result) => setSummary(result.data))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load the agency."));
  }, [agencyId]);
  const links = [
    { href: "/admin/agency-clients", label: "Clients", icon: Handshake },
    { href: "/admin/agency-vehicles", label: "Agency vehicles", icon: BusFront },
    { href: "/admin/agency-cards", label: "Agency cards", icon: CreditCard },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title={name ? `${name} overview` : "Agency overview"} subtitle="Buses and vans this agency runs for schools and companies, and the BLE cards it gives their students and employees." icon={BusFront} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Client schools" value={summary.schools} icon={School} />
          <StatCard label="Client companies" value={summary.companies} icon={Building2} />
          <StatCard label="Vehicles" value={summary.vehicles} icon={BusFront} />
          <StatCard label="Cards issued" value={summary.cardsIssued} icon={CreditCard} />
          <StatCard label="Cards in stock" value={summary.cardsInStock} icon={Package} />
        </div>
      ) : null}
      {summary?.cardsWaiting ? (
        <p className="text-sm text-slate-600">{summary.cardsWaiting} {summary.cardsWaiting === 1 ? "card is" : "cards are"} with clients but not yet given to a person.</p>
      ) : null}
      <Panel>
        <div className="grid gap-2 sm:grid-cols-3">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 transition hover:border-brand-200 hover:bg-slate-50">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <link.icon className="h-4 w-4 text-brand-700" aria-hidden="true" />
                {link.label}
              </span>
              <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </Panel>
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
      {user.role === "PLATFORM_ADMIN" && !schoolId ? <Panel>Choose a school, company, fleet, or transport agency in the header to see its overview.</Panel> : null}
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

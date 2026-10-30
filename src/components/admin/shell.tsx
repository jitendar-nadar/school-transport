"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api, setApiScope } from "@/lib/admin/api";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId: string | null;
  companyId: string | null;
  fleetId: string | null;
};

type SchoolOption = { id: string; name: string; schoolCode: string };

type ScopeValue = {
  user: SessionUser;
  schoolId: string | null;
  schools: SchoolOption[];
  setSchoolId: (id: string) => void;
};

const ScopeContext = createContext<ScopeValue | null>(null);

export function useScope() {
  const value = useContext(ScopeContext);
  if (!value) throw new Error("Admin shell is missing.");
  return value;
}

const listeners = new Set<() => void>();

function subscribeSchool(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function selectedSchoolId() {
  return window.localStorage.getItem("st-school-id");
}

function rememberSchool(id: string) {
  window.localStorage.setItem("st-school-id", id);
  listeners.forEach((listener) => listener());
}
const groups = [
  {
    label: "School",
    roles: ["PLATFORM_ADMIN", "SCHOOL_ADMIN"],
    links: [
      { href: "/admin/schools", label: "Schools", platform: true },
      { href: "/admin/users", label: "People" },
      { href: "/admin/classes", label: "Classes" },
      { href: "/admin/students", label: "Students" },
      { href: "/admin/ble-tags", label: "BLE cards" },
      { href: "/admin/gates", label: "Gates" },
      { href: "/admin/vehicles", label: "Vehicles" },
      { href: "/admin/student-mapping", label: "Student mapping" },
      { href: "/admin/stops", label: "Stops" },
      { href: "/admin/routes", label: "Routes" },
      { href: "/admin/assignments", label: "Assignments" },
      { href: "/admin/trips", label: "Trips" },
      { href: "/admin/tours", label: "Tours" },
      { href: "/admin/notifications", label: "Alerts" },
    ],
  },
  {
    label: "Company",
    roles: ["PLATFORM_ADMIN", "COMPANY_ADMIN"],
    links: [
      { href: "/admin/companies", label: "Companies" },
      { href: "/admin/employees", label: "Employees" },
      { href: "/admin/employee-cards", label: "Cards and consent" },
      { href: "/admin/out-of-office", label: "Out of office" },
      { href: "/admin/attendance", label: "Attendance" },
    ],
  },
  {
    label: "Company",
    roles: ["COMPANY_HR"],
    links: [
      { href: "/admin/attendance", label: "Attendance" },
    ],
  },
  {
    label: "My attendance",
    roles: ["EMPLOYEE"],
    links: [
      { href: "/admin/my-day", label: "My day" },
    ],
  },
  {
    label: "Transport",
    roles: ["PLATFORM_ADMIN", "FLEET_ADMIN"],
    links: [
      { href: "/admin/fleets", label: "Fleets" },
      { href: "/admin/trucks", label: "Trucks" },
      { href: "/admin/fleet-map", label: "Live map" },
      { href: "/admin/fleet-reports", label: "Reports" },
    ],
  },
];

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolsError, setSchoolsError] = useState("");
  const storedSchoolId = useSyncExternalStore(subscribeSchool, selectedSchoolId, () => null);
  const schoolId = user.schoolId || storedSchoolId;
  setApiScope({ role: user.role, schoolId });

  useEffect(() => {
    if (user.role !== "PLATFORM_ADMIN") return;
    let ignore = false;
    api<SchoolOption[]>("/api/v1/schools?limit=100", { school: false }).then((result) => {
      if (!ignore) {
        setSchools(result.data);
        setSchoolsError("");
      }
    }).catch((caught: unknown) => {
      if (!ignore) {
        setSchools([]);
        setSchoolsError(caught instanceof Error ? caught.message : "Could not load schools.");
      }
    });
    return () => {
      ignore = true;
    };
  }, [user.role]);

  const value = useMemo(
    () => ({
      user,
      schoolId,
      schools,
      setSchoolId: (id: string) => rememberSchool(id),
    }),
    [user, schoolId, schools],
  );

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    router.replace("/login");
    router.refresh();
  }

  const showSchoolSelect = user.role === "PLATFORM_ADMIN" && !["/admin/companies", "/admin/employees", "/admin/employee-cards", "/admin/out-of-office", "/admin/attendance", "/admin/my-day", "/admin/fleets", "/admin/trucks", "/admin/fleet-map", "/admin/fleet-reports"].some((path) => pathname.startsWith(path));
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "A";

  return (
    <ScopeContext.Provider value={value}>
      <div className="min-h-screen bg-[#f4f7fb] md:grid md:grid-cols-[252px_1fr]">
        <aside className="bg-[#10233f] text-white md:sticky md:top-0 md:flex md:h-screen md:flex-col">
          <div className="flex items-center gap-3 px-5 py-5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-700 text-sm font-semibold">T</span>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-teal-200/90">Tracking platform</p>
              <h1 className="text-base font-semibold leading-tight">Operations</h1>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-4 md:block md:flex-1 md:space-y-0.5 md:overflow-y-auto md:px-3">
            <Link href="/admin" className={navClass(pathname === "/admin")}>
              Overview
            </Link>
            {groups.filter((group) => group.roles.includes(user.role)).map((group) => (
              <div key={group.label} className="flex gap-1 md:block md:pt-4">
                <p className="hidden px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 md:block">{group.label}</p>
                {group.links.filter((link) => !link.platform || user.role === "PLATFORM_ADMIN").map((link) => {
                  const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <Link key={link.href} href={link.href} className={navClass(active)}>
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-6 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{initials}</span>
              <div>
                <p className="text-sm font-medium text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.role.replaceAll("_", " ")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {showSchoolSelect ? (
                <select
                  className="min-w-52 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition hover:border-slate-300 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
                  value={schoolId || ""}
                  onChange={(event) => value.setSchoolId(event.target.value)}
                >
                  <option value="">Select a school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50" onClick={() => void logout()} type="button">
                Sign out
              </button>
            </div>
          </header>
          <main className="px-6 py-7">
            {schoolsError ? <p className="mb-4 text-sm text-red-700">{schoolsError}</p> : null}
            {children}
          </main>
        </div>
      </div>
    </ScopeContext.Provider>
  );
}

function navClass(active: boolean) {
  return `block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${active ? "bg-white font-medium text-[#10233f]" : "text-slate-300 hover:bg-white/10 hover:text-white"}`;
}

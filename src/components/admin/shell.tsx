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
const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/schools", label: "Schools", platform: true },
  { href: "/admin/users", label: "People" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/ble-tags", label: "BLE cards" },
  { href: "/admin/vehicles", label: "Vehicles" },
  { href: "/admin/stops", label: "Stops" },
  { href: "/admin/routes", label: "Routes" },
  { href: "/admin/assignments", label: "Assignments" },
  { href: "/admin/trips", label: "Trips" },
  { href: "/admin/notifications", label: "Alerts" },
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

  const visible = links.filter((link) => !link.platform || user.role === "PLATFORM_ADMIN");

  return (
    <ScopeContext.Provider value={value}>
      <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
        <aside className="bg-[#10233f] text-white md:min-h-screen">
          <div className="px-5 py-5">
            <p className="text-xs uppercase tracking-[0.18em] text-teal-200">School transport</p>
            <h1 className="mt-1 text-lg font-semibold">Operations</h1>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:px-3">
            {visible.map((link) => {
              const active = pathname === link.href || (link.href !== "/admin" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? "bg-white/15" : "text-slate-200 hover:bg-white/10"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
            <div>
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-slate-500">{user.role.replaceAll("_", " ")}</p>
            </div>
            <div className="flex items-center gap-3">
              {user.role === "PLATFORM_ADMIN" ? (
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => void logout()} type="button">
                Sign out
              </button>
            </div>
          </header>
          <main className="px-5 py-6">
            {schoolsError ? <p className="mb-4 text-sm text-red-700">{schoolsError}</p> : null}
            {children}
          </main>
        </div>
      </div>
    </ScopeContext.Provider>
  );
}

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { pageVariants } from "@/components/admin/motion";
import { EntitySwitcher } from "@/components/admin/entity-switcher";
import { OverdueBanner } from "@/components/admin/billing/overdue-banner";
import { activeChild, linkMatches, navGroups, overviewLink, scopeForPath, visibleLinks, type EntityKind, type NavItem } from "@/components/admin/nav";
import { setApiScope } from "@/lib/admin/api";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId: string | null;
  companyId: string | null;
  fleetId: string | null;
  agencyId: string | null;
};

export type ScopedEntity = { id: string; name: string };

export type StoredScope = {
  active: EntityKind | null;
  SCHOOL: ScopedEntity | null;
  COMPANY: ScopedEntity | null;
  FLEET: ScopedEntity | null;
  AGENCY: ScopedEntity | null;
};

type ScopeValue = {
  user: SessionUser;
  schoolId: string | null;
  companyId: string | null;
  fleetId: string | null;
  agencyId: string | null;
  scope: StoredScope;
  selectEntity: (kind: EntityKind, entity: ScopedEntity) => void;
};

const ScopeContext = createContext<ScopeValue | null>(null);

export function useScope() {
  const value = useContext(ScopeContext);
  if (!value) throw new Error("Admin shell is missing.");
  return value;
}

const listeners = new Set<() => void>();

function subscribeStorage(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const emptyScope: StoredScope = { active: null, SCHOOL: null, COMPANY: null, FLEET: null, AGENCY: null };

function storedScopeText() {
  return window.localStorage.getItem("st-scope") ?? `legacy:${window.localStorage.getItem("st-school-id") ?? ""}`;
}

function parseScope(text: string | null): StoredScope {
  if (!text) return emptyScope;
  if (text.startsWith("legacy:")) {
    const id = text.slice("legacy:".length);
    return id ? { ...emptyScope, active: "SCHOOL", SCHOOL: { id, name: "" } } : emptyScope;
  }
  try {
    return { ...emptyScope, ...(JSON.parse(text) as Partial<StoredScope>) };
  } catch {
    return emptyScope;
  }
}

function rememberEntity(kind: EntityKind, entity: ScopedEntity) {
  const next: StoredScope = { ...parseScope(storedScopeText()), [kind]: entity, active: kind };
  window.localStorage.setItem("st-scope", JSON.stringify(next));
  window.localStorage.removeItem("st-school-id");
  listeners.forEach((listener) => listener());
}

function sidebarCollapsed() {
  return window.localStorage.getItem("st-sidebar") === "collapsed";
}

function rememberSidebar(collapsed: boolean) {
  window.localStorage.setItem("st-sidebar", collapsed ? "collapsed" : "open");
  listeners.forEach((listener) => listener());
}

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const scopeText = useSyncExternalStore(subscribeStorage, storedScopeText, () => null);
  const collapsed = useSyncExternalStore(subscribeStorage, sidebarCollapsed, () => false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const platform = user.role === "PLATFORM_ADMIN";
  const scope = useMemo(() => (platform ? parseScope(scopeText) : emptyScope), [platform, scopeText]);
  const schoolId = user.schoolId || scope.SCHOOL?.id || null;
  const companyId = user.companyId || scope.COMPANY?.id || null;
  const fleetId = user.fleetId || scope.FLEET?.id || null;
  const agencyId = user.agencyId || scope.AGENCY?.id || null;
  setApiScope({ role: user.role, schoolId });

  useEffect(() => {
    if (!drawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [drawerOpen]);

  const value = useMemo(
    () => ({
      user,
      schoolId,
      companyId,
      fleetId,
      agencyId,
      scope,
      selectEntity: rememberEntity,
    }),
    [user, schoolId, companyId, fleetId, agencyId, scope],
  );

  function chooseEntity(kind: EntityKind, entity: ScopedEntity) {
    rememberEntity(kind, entity);
    const section = scopeForPath(pathname);
    if (section && section !== kind) router.push("/admin");
  }

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    router.replace("/login");
    router.refresh();
  }

  const currentKind = scopeForPath(pathname) ?? scope.active;
  const tenantAdmin = ["SCHOOL_ADMIN", "COMPANY_ADMIN", "FLEET_ADMIN", "AGENCY_ADMIN"].includes(user.role);
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "A";

  return (
    <ScopeContext.Provider value={value}>
      <div className="min-h-screen bg-background md:flex">
        <motion.aside
          className="hidden shrink-0 flex-col overflow-hidden bg-linear-to-b from-sidebar to-sidebar-deep text-white md:sticky md:top-0 md:flex md:h-screen print:hidden"
          initial={false}
          animate={{ width: collapsed ? 72 : 252 }}
          transition={{ type: "spring", stiffness: 380, damping: 38 }}
        >
          <Sidebar role={user.role} pathname={pathname} collapsed={collapsed} layoutId="admin-nav-active" />
        </motion.aside>
        <AnimatePresence>
          {drawerOpen ? (
            <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <motion.div
                className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setDrawerOpen(false)}
              />
              <motion.aside
                className="absolute inset-y-0 left-0 flex w-[272px] max-w-[85vw] flex-col bg-linear-to-b from-sidebar to-sidebar-deep text-white shadow-2xl"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 420, damping: 40 }}
              >
                <button
                  className="absolute right-3 top-5 grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
                  onClick={() => setDrawerOpen(false)}
                  type="button"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
                <Sidebar role={user.role} pathname={pathname} collapsed={false} layoutId="admin-drawer-active" onNavigate={() => setDrawerOpen(false)} />
              </motion.aside>
            </div>
          ) : null}
        </AnimatePresence>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur md:px-6 print:hidden">
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-linear-to-r from-brand-700 via-brand-500 to-aqua-400" aria-hidden="true" />
            <div className="flex items-center gap-3">
              <button
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 md:hidden"
                onClick={() => setDrawerOpen(true)}
                type="button"
                aria-label="Open menu"
                aria-expanded={drawerOpen}
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                className="hidden h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 md:grid"
                onClick={() => rememberSidebar(!collapsed)}
                type="button"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
              </button>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{initials}</span>
              <div>
                <p className="text-sm font-medium text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.role.replaceAll("_", " ")}</p>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              {platform ? <EntitySwitcher kind={currentKind} selected={currentKind ? scope[currentKind] : null} onSelect={chooseEntity} onResolve={rememberEntity} /> : null}
              <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50" onClick={() => void logout()} type="button">
                <LogOut className="h-4 w-4 text-slate-500" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </header>
          {tenantAdmin ? <OverdueBanner /> : null}
          <main className="px-4 py-6 md:px-6 md:py-7 print:p-0">
            <motion.div key={`${pathname}|${schoolId}|${companyId}|${fleetId}|${agencyId}`} variants={pageVariants} initial="hidden" animate="show">
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </ScopeContext.Provider>
  );
}

type SidebarProps = {
  role: string;
  pathname: string;
  collapsed: boolean;
  layoutId: string;
  onNavigate?: () => void;
};

function Sidebar({ role, pathname, collapsed, layoutId, onNavigate }: SidebarProps) {
  const fade = `transition-opacity duration-200 ${collapsed ? "opacity-0" : "opacity-100"}`;
  return (
    <>
      <div className="flex items-center gap-3 px-[18px] py-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white shadow-sm" aria-hidden="true">
          <Image src="/brand/proxitrace-mark.png" alt="" width={28} height={28} preload />
        </span>
        <div className={`min-w-0 whitespace-nowrap ${fade}`} aria-hidden={collapsed}>
          <h1 className="text-base font-semibold leading-tight tracking-tight">ProxiTrace</h1>
          <p className="text-[11px] uppercase tracking-[0.16em] text-aqua-300">Smart tracking</p>
        </div>
      </div>
      <nav
        className={`flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-4 pb-4 ${collapsed ? "[scrollbar-width:none]" : "[scrollbar-color:rgb(255_255_255/0.18)_transparent] [scrollbar-width:thin]"}`}
        aria-label="Main"
      >
        <NavLink href={overviewLink.href} active={pathname === overviewLink.href} label={overviewLink.label} icon={overviewLink.icon} collapsed={collapsed} layoutId={layoutId} onNavigate={onNavigate} />
        {navGroups.filter((group) => group.roles.includes(role)).map((group) => (
          <div key={group.label} className="space-y-0.5 pt-4">
            <div className="relative h-5 px-3">
              <p className={`whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 ${fade}`}>{group.label}</p>
              <span className={`absolute inset-x-2 top-1/2 h-px bg-white/10 transition-opacity duration-200 ${collapsed ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
            </div>
            {visibleLinks(group.links, role).map((link) => {
              if (link.children) {
                return <NavSection key={link.href} item={link} pathname={pathname} collapsed={collapsed} layoutId={layoutId} onNavigate={onNavigate} />;
              }
              return <NavLink key={link.href} href={link.href} active={linkMatches(pathname, link.href)} label={link.label} icon={link.icon} collapsed={collapsed} layoutId={layoutId} onNavigate={onNavigate} />;
            })}
          </div>
        ))}
      </nav>
    </>
  );
}

type NavSectionProps = {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  layoutId: string;
  onNavigate?: () => void;
};

function NavSection({ item, pathname, collapsed, layoutId, onNavigate }: NavSectionProps) {
  const [open, setOpen] = useState(true);
  const children = item.children ?? [];
  const current = activeChild(pathname, children);
  const Icon = item.icon;
  const links = children.map((child) => (
    <NavLink key={child.href} href={child.href} active={current?.href === child.href} label={child.label} icon={child.icon} collapsed={collapsed} layoutId={layoutId} onNavigate={onNavigate} />
  ));

  if (collapsed) return <>{links}</>;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`group flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors duration-150 hover:bg-white/10 hover:text-white ${current ? "text-white" : "text-slate-300"}`}
      >
        <Icon className={`h-4 w-4 shrink-0 transition-colors ${current ? "text-aqua-300" : "text-slate-400 group-hover:text-white"}`} aria-hidden="true" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="ml-5 space-y-0.5 border-l border-white/10 py-0.5 pl-2">{links}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type NavLinkProps = {
  href: string;
  active: boolean;
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
  layoutId: string;
  onNavigate?: () => void;
};

function NavLink({ href, active, label, icon: Icon, collapsed, layoutId, onNavigate }: NavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${active ? "font-medium text-brand-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
    >
      {active ? (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded-lg bg-white"
          transition={{ type: "spring", stiffness: 520, damping: 42 }}
        />
      ) : null}
      <span className="relative flex items-center gap-2.5">
        <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? "text-brand-700" : "text-slate-400 group-hover:text-white"}`} aria-hidden="true" />
        <span className={`transition-opacity duration-200 ${collapsed ? "opacity-0" : "opacity-100"}`}>{label}</span>
      </span>
    </Link>
  );
}

import {
  Backpack,
  BadgeCheck,
  Bell,
  Briefcase,
  Building2,
  Bus,
  CalendarCheck,
  CalendarClock,
  ChartColumn,
  CirclePlus,
  ClipboardList,
  DoorOpen,
  GraduationCap,
  IdCard,
  IndianRupee,
  Layers,
  LayoutDashboard,
  Link2,
  List,
  Map as MapIcon,
  MapPin,
  Navigation,
  Nfc,
  ReceiptText,
  Repeat,
  Route,
  Settings2,
  Shapes,
  Sun,
  Tent,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; platform?: boolean; tenantOnly?: boolean; children?: NavItem[] };

export const overviewLink: NavItem = { href: "/admin", label: "Overview", icon: LayoutDashboard };

export type EntityKind = "SCHOOL" | "COMPANY" | "FLEET";

export const navGroups: Array<{ label: string; roles: string[]; scope?: EntityKind; links: NavItem[] }> = [
  {
    label: "Platform",
    roles: ["PLATFORM_ADMIN"],
    links: [
      {
        href: "/admin/entities",
        label: "Entities",
        icon: Shapes,
        children: [
          { href: "/admin/entities", label: "All entities", icon: List },
          { href: "/admin/entities/new", label: "Add entity", icon: CirclePlus },
        ],
      },
      {
        href: "/admin/billing",
        label: "Billing",
        icon: IndianRupee,
        children: [
          { href: "/admin/billing", label: "Subscriptions", icon: Repeat },
          { href: "/admin/billing/invoices", label: "Invoices", icon: ReceiptText },
          { href: "/admin/billing/plans", label: "Plans", icon: Layers },
          { href: "/admin/billing/settings", label: "Settings", icon: Settings2 },
        ],
      },
    ],
  },
  {
    label: "School",
    roles: ["PLATFORM_ADMIN", "SCHOOL_ADMIN"],
    scope: "SCHOOL",
    links: [
      { href: "/admin/users", label: "People", icon: Users },
      { href: "/admin/classes", label: "Classes", icon: GraduationCap },
      { href: "/admin/students", label: "Students", icon: Backpack },
      { href: "/admin/ble-tags", label: "BLE cards", icon: Nfc },
      { href: "/admin/gates", label: "Gates", icon: DoorOpen },
      { href: "/admin/vehicles", label: "Vehicles", icon: Bus },
      { href: "/admin/student-mapping", label: "Student mapping", icon: Link2 },
      { href: "/admin/stops", label: "Stops", icon: MapPin },
      { href: "/admin/routes", label: "Routes", icon: Route },
      { href: "/admin/assignments", label: "Assignments", icon: ClipboardList },
      { href: "/admin/trips", label: "Trips", icon: Navigation },
      { href: "/admin/tours", label: "Tours", icon: Tent },
      { href: "/admin/notifications", label: "Alerts", icon: Bell },
    ],
  },
  {
    label: "Company",
    roles: ["PLATFORM_ADMIN", "COMPANY_ADMIN"],
    scope: "COMPANY",
    links: [
      { href: "/admin/companies", label: "Companies", icon: Building2, tenantOnly: true },
      { href: "/admin/employees", label: "Employees", icon: Briefcase },
      { href: "/admin/employee-cards", label: "Cards and consent", icon: IdCard },
      { href: "/admin/out-of-office", label: "Out of office", icon: CalendarClock },
      { href: "/admin/attendance", label: "Attendance", icon: CalendarCheck },
    ],
  },
  {
    label: "Company",
    roles: ["COMPANY_HR"],
    links: [
      { href: "/admin/attendance", label: "Attendance", icon: BadgeCheck },
    ],
  },
  {
    label: "My attendance",
    roles: ["EMPLOYEE"],
    links: [
      { href: "/admin/my-day", label: "My day", icon: Sun },
    ],
  },
  {
    label: "Transport",
    roles: ["PLATFORM_ADMIN", "FLEET_ADMIN"],
    scope: "FLEET",
    links: [
      { href: "/admin/fleets", label: "Fleets", icon: Warehouse, tenantOnly: true },
      { href: "/admin/trucks", label: "Trucks", icon: Truck },
      { href: "/admin/fleet-map", label: "Live map", icon: MapIcon },
      { href: "/admin/fleet-reports", label: "Reports", icon: ChartColumn },
    ],
  },
  {
    label: "Account",
    roles: ["SCHOOL_ADMIN", "COMPANY_ADMIN", "FLEET_ADMIN"],
    links: [
      { href: "/admin/my-billing", label: "Billing", icon: Wallet },
    ],
  },
];

export function visibleLinks(links: NavItem[], role: string) {
  const platform = role === "PLATFORM_ADMIN";
  return links.filter((link) => (link.platform ? platform : true) && (link.tenantOnly ? !platform : true));
}

export function linkMatches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeChild(pathname: string, children: NavItem[]) {
  return children
    .filter((child) => linkMatches(pathname, child.href))
    .sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

export function scopeForPath(pathname: string): EntityKind | null {
  for (const group of navGroups) {
    if (!group.scope) continue;
    if (group.links.some((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))) return group.scope;
  }
  return null;
}

export function iconForPath(pathname: string): LucideIcon | null {
  if (pathname === overviewLink.href) return overviewLink.icon;
  for (const group of navGroups) {
    const match = group.links.find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`));
    if (match) return (match.children && activeChild(pathname, match.children)?.icon) || match.icon;
  }
  return null;
}

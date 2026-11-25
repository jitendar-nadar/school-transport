import { Building2, BusFront, School, Truck, type LucideIcon } from "lucide-react";

export type EntityType = "SCHOOL" | "COMPANY" | "TRANSPORT" | "AGENCY";

export type EntityRecord = {
  id: string;
  name: string;
  status: string;
  address?: string;
  contactEmail: string;
  contactPhone: string;
  schoolCode?: string;
  companyCode?: string;
  fleetCode?: string;
  agencyCode?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type EntityConfig = {
  slug: string;
  label: string;
  noun: string;
  plural: string;
  icon: LucideIcon;
  endpoint: string;
  list: string;
  codeField: "schoolCode" | "companyCode" | "fleetCode" | "agencyCode";
  withAdmin: boolean;
  hint: string;
};

export const entityTypes: Record<EntityType, EntityConfig> = {
  SCHOOL: {
    slug: "school",
    label: "School",
    noun: "school",
    plural: "schools",
    icon: School,
    endpoint: "/api/v1/schools",
    list: "/api/v1/schools",
    codeField: "schoolCode",
    withAdmin: false,
    hint: "Place the school on the map. Add its school admins from People after it is created.",
  },
  COMPANY: {
    slug: "company",
    label: "Company",
    noun: "company",
    plural: "companies",
    icon: Building2,
    endpoint: "/api/v1/companies",
    list: "/api/v1/companies",
    codeField: "companyCode",
    withAdmin: true,
    hint: "Employee attendance is kept apart from schools. The company admin login is created with it.",
  },
  TRANSPORT: {
    slug: "fleet",
    label: "Fleet",
    noun: "fleet",
    plural: "fleets",
    icon: Truck,
    endpoint: "/api/v1/fleets",
    list: "/api/v1/fleets",
    codeField: "fleetCode",
    withAdmin: true,
    hint: "Transport fleets track trucks by GPS. The fleet admin login is created with it.",
  },
  AGENCY: {
    slug: "agency",
    label: "Transport agency",
    noun: "agency",
    plural: "transport agencies",
    icon: BusFront,
    endpoint: "/api/v1/agencies",
    list: "/api/v1/agencies",
    codeField: "agencyCode",
    withAdmin: true,
    hint: "A bus or van agency supplies vehicles to schools and companies, and gives BLE cards to their students and employees. The agency admin login is created with it; link its clients after.",
  },
};

export const typeOrder: EntityType[] = ["SCHOOL", "COMPANY", "TRANSPORT", "AGENCY"];

export function typeFromSlug(slug: string | null | undefined): EntityType | null {
  return typeOrder.find((type) => entityTypes[type].slug === slug) ?? null;
}

export function capitalised(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const entityStatuses = ["TRIAL", "ACTIVE", "SUSPENDED"];

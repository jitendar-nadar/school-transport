export const ROLES = {
  PLATFORM_ADMIN: "PLATFORM_ADMIN",
  SCHOOL_ADMIN: "SCHOOL_ADMIN",
  DRIVER: "DRIVER",
  ATTENDANT: "ATTENDANT",
  PARENT: "PARENT",
  COMPANY_ADMIN: "COMPANY_ADMIN",
  FLEET_ADMIN: "FLEET_ADMIN",
  EMPLOYEE: "EMPLOYEE",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const SCHOOL_STATUSES = ["TRIAL", "ACTIVE", "SUSPENDED"] as const;
export const USER_STATUSES = ["ACTIVE", "DISABLED"] as const;
export const STUDENT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const TAG_STATUSES = ["UNASSIGNED", "ACTIVE", "LOST", "RETIRED"] as const;
export const VEHICLE_TYPES = ["BUS", "VAN"] as const;
export const VEHICLE_STATUSES = ["ACTIVE", "MAINTENANCE", "INACTIVE"] as const;
export const ROUTE_DIRECTIONS = ["PICKUP", "DROP"] as const;
export const ROUTE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const STOP_TYPES = ["PICKUP", "DROP", "SCHOOL"] as const;
export const ASSIGNMENT_STATUSES = ["ACTIVE", "ENDED"] as const;
export const TRIP_STATUSES = ["SCHEDULED", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
export const BOARDING_STATUSES = ["NOT_BOARDED", "DETECTED", "BOARDED"] as const;
export const DROP_STATUSES = ["NOT_DROPPED", "DROPPED"] as const;
export const VERIFICATION_METHODS = ["MANUAL", "ASSISTED", "OVERRIDE"] as const;
export const DEVICE_PLATFORMS = ["ANDROID", "IOS", "WEB"] as const;

export const NOTIFICATION_TYPES = [
  "BUS_APPROACHING_PICKUP",
  "STUDENT_BOARDING_CONFIRMED",
  "BUS_ARRIVED_AT_SCHOOL",
  "STUDENT_DROPPED_AT_SCHOOL",
  "STUDENT_BOARDING_FOR_HOME",
  "BUS_APPROACHING_HOME_STOP",
  "STUDENT_DROPPED_AT_HOME",
  "STUDENT_NOT_BOARDED",
  "STUDENT_WRONG_BUS",
  "STUDENT_WRONG_STOP",
  "CHILD_STILL_ON_BUS",
  "BUS_TRACKING_OFFLINE",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type RouteDirection = (typeof ROUTE_DIRECTIONS)[number];
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export type AuthUser = {
  id: string;
  schoolId: string | null;
  companyId: string | null;
  fleetId: string | null;
  employeeId: string | null;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: (typeof USER_STATUSES)[number];
};

export type Point = {
  type: "Point";
  coordinates: [number, number];
};

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

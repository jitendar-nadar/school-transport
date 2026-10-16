import { requireSchoolId } from "@/lib/auth/guard";
import { Vehicle } from "@/models/fleet";
import { Notification } from "@/models/ops";
import { Student } from "@/models/student";
import { Trip, TripStudent } from "@/models/trip";
import type { AuthUser } from "@/types/domain";

export async function overview(user: AuthUser, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [students, vehicles, activeTrips, boarded, safetyAlerts] = await Promise.all([
    Student.countDocuments({ schoolId: tenant, status: "ACTIVE" }),
    Vehicle.countDocuments({ schoolId: tenant, status: "ACTIVE" }),
    Trip.countDocuments({ schoolId: tenant, status: "ACTIVE" }),
    TripStudent.countDocuments({ schoolId: tenant, boardingStatus: "BOARDED", dropStatus: "NOT_DROPPED" }),
    Notification.countDocuments({
      schoolId: tenant,
      type: { $in: ["CHILD_STILL_ON_BUS", "STUDENT_WRONG_BUS", "BUS_TRACKING_OFFLINE"] },
      createdAt: { $gte: since },
    }),
  ]);
  return { students, vehicles, activeTrips, onboardNow: boarded, safetyAlerts };
}

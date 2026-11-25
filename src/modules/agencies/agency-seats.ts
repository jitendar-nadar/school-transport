import { Types } from "mongoose";
import { AgencyVehicle } from "@/models/agency";
import { Vehicle } from "@/models/fleet";

export type SeatsBySchool = Map<string, Map<string, number>>;

export async function seatsBySchool(agencyVehicleIds: string[], options: { servedOnly?: boolean } = {}): Promise<SeatsBySchool> {
  const seats: SeatsBySchool = new Map();
  const unique = [...new Set(agencyVehicleIds)];
  if (!unique.length) return seats;
  const servedOnly = options.servedOnly ?? true;
  const agencyVehicles = servedOnly ? await AgencyVehicle.find({ _id: { $in: unique } }).select("schoolIds").lean<Array<{ _id: unknown; schoolIds?: unknown[] }>>() : [];
  const served = new Map(agencyVehicles.map((vehicle) => [String(vehicle._id), new Set((vehicle.schoolIds || []).map(String))]));
  const counts = await Vehicle.aggregate<{ _id: { agencyVehicleId: unknown; schoolId: unknown }; seats: number }>([
    { $match: { agencyVehicleId: { $in: unique.map((id) => new Types.ObjectId(id)) } } },
    { $group: { _id: { agencyVehicleId: "$agencyVehicleId", schoolId: "$schoolId" }, seats: { $sum: { $size: { $ifNull: ["$studentIds", []] } } } } },
  ]);
  for (const count of counts) {
    const agencyVehicleId = String(count._id.agencyVehicleId);
    const schoolId = String(count._id.schoolId);
    if (servedOnly && !served.get(agencyVehicleId)?.has(schoolId)) continue;
    const bySchool = seats.get(agencyVehicleId) ?? new Map<string, number>();
    bySchool.set(schoolId, count.seats);
    seats.set(agencyVehicleId, bySchool);
  }
  return seats;
}

export function seatsUsed(seats: SeatsBySchool, agencyVehicleId: string, schoolIds?: string[], exceptSchoolId?: string) {
  let total = 0;
  for (const [schoolId, count] of seats.get(agencyVehicleId) ?? []) {
    if (schoolId === exceptSchoolId) continue;
    if (schoolIds && !schoolIds.includes(schoolId)) continue;
    total += count;
  }
  return total;
}

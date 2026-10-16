"use client";

import Link from "next/link";
import { DataTable, PageHeader, Panel } from "@/components/admin/ui";
import { useRecords } from "@/components/admin/use-records";

type Trip = {
  id: string;
  status: string;
  direction: string;
  scheduledDate: string;
  totalBoarded: number;
  totalDropped: number;
  totalAssignedStudents: number;
  vehicleId?: { vehicleNumber?: string };
  routeId?: { name?: string };
};

export default function TripsPage() {
  const trips = useRecords<Trip>("/api/v1/trips?limit=50");
  return (
    <div className="space-y-5">
      <PageHeader title="Trips" subtitle="Each trip keeps its own student roster, so later route changes do not alter history." />
      <Panel>
        <DataTable
          columns={["Date", "Vehicle", "Route", "Direction", "Progress", "Status", ""]}
          rows={trips.rows.map((trip) => [
            trip.scheduledDate,
            trip.vehicleId?.vehicleNumber || "",
            trip.routeId?.name || "",
            trip.direction,
            `${trip.totalBoarded}/${trip.totalAssignedStudents} boarded · ${trip.totalDropped} dropped`,
            trip.status,
            <Link key={trip.id} className="text-teal-800 underline" href={`/admin/trips/${trip.id}`}>Open</Link>,
          ])}
        />
      </Panel>
    </div>
  );
}

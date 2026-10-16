"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, DataTable, Notice, PageHeader, Panel } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";

type Trip = {
  id: string;
  status: string;
  direction: string;
  totalBoarded: number;
  totalDropped: number;
  totalAssignedStudents: number;
  safetyOverrideReason?: string;
  vehicleId?: { vehicleNumber?: string };
  routeId?: { name?: string };
  liveLocation?: { latitude?: number; longitude?: number; speedKmh?: number | null; updatedAt?: number } | null;
};
type StudentRow = {
  id: string;
  boardingStatus: string;
  dropStatus: string;
  notificationsEnabled?: boolean;
  studentId?: { name?: string; className?: string };
  assignedStopId?: { name?: string };
};
type EventRow = { id: string; type: string; message: string; occurredAt: string };

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const [tripResult, studentResult, eventResult] = await Promise.all([
          api<Trip>(`/api/v1/dashboard/trips/${params.id}`),
          api<StudentRow[]>(`/api/v1/dashboard/trips/${params.id}/students`),
          api<EventRow[]>(`/api/v1/dashboard/trips/${params.id}/events`),
        ]);
        if (stop) return;
        setTrip(tripResult.data);
        setStudents(studentResult.data);
        setEvents(eventResult.data);
        setError("");
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "Could not load this trip.");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [params.id]);

  const mapUrl = trip?.liveLocation?.latitude
    ? `https://www.google.com/maps?q=${trip.liveLocation.latitude},${trip.liveLocation.longitude}`
    : "";

  return (
    <div className="space-y-5">
      <PageHeader
        title={trip?.vehicleId?.vehicleNumber || "Trip"}
        subtitle={trip ? `${trip.routeId?.name || "Route"} · ${trip.direction} · ${trip.totalBoarded}/${trip.totalAssignedStudents} boarded` : "Loading trip"}
      />
      {error ? <Notice>{error}</Notice> : null}
      {trip?.safetyOverrideReason ? <Notice>Unresolved onboard override: {trip.safetyOverrideReason}</Notice> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Badge>{trip?.status}</Badge>
        {mapUrl ? <a className="text-sm text-teal-800 underline" href={mapUrl} target="_blank" rel="noreferrer">Open live location</a> : <span className="text-sm text-slate-500">Waiting for a GPS fix</span>}
      </div>
      <Panel>
        <DataTable
          columns={["Student", "Stop", "Boarding", "Drop-off", "Alerts"]}
          rows={students.map((student) => [
            student.studentId?.name || "",
            student.assignedStopId?.name || "",
            student.boardingStatus,
            student.dropStatus,
            student.notificationsEnabled === false ? "Consent missing" : "Enabled",
          ])}
        />
      </Panel>
      <Panel>
        <h3 className="mb-3 font-medium">Timeline</h3>
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium">{event.type}</p>
              <p>{event.message}</p>
              <p className="text-xs text-slate-500">{new Date(event.occurredAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

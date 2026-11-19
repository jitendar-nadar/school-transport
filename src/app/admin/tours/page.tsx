"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import { EMPTY_FIELD_ERRORS } from "@/components/admin/form-error-context";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Person = { id: string; name: string; role: string };
type Vehicle = { id: string; vehicleNumber: string };
type Student = { id: string; name: string; studentCode: string; className?: string; photoUrl?: string };
type Tour = {
  id: string;
  name: string;
  tripDate: string;
  status: string;
  watchMinutes?: number;
  leadCoordinatorId?: string | null;
  busCount?: number;
  studentCount?: number;
  presentCount?: number;
  missingCount?: number;
};
type TourBus = {
  id: string;
  tourId: string;
  vehicleId: string;
  vehicleNumber?: string;
  label?: string;
  coordinatorIds: string[];
  coordinators?: Array<{ id: string; name: string }>;
};
type RosterRow = {
  id: string;
  tourId: string;
  tourBusId: string;
  studentId: string;
  status: string;
  studentName?: string;
  studentCode?: string;
  photoUrl?: string;
  lastSeenAt?: string | null;
  lastSeenLatitude?: number | null;
  lastSeenLongitude?: number | null;
};
type Headcount = {
  id: string;
  tourId: string;
  tourBusId?: string | null;
  presentCount: number;
  missingStudentIds?: string[];
  wrongBusStudentIds?: string[];
  note: string;
  phase?: string;
  source?: string;
  takenAt: string;
};
type Incident = {
  id: string;
  tourId: string;
  type: string;
  message: string;
  occurredAt: string;
  studentId?: string | null;
};
type BusDraft = {
  key: string;
  vehicleId: string;
  label: string;
  coordinatorIds: string[];
  studentIds: string[];
};

type Report = {
  totals: { students: number; present: number; missing: number; wrongBus: number; expected: number };
  headcounts: Headcount[];
  incidents: Incident[];
  roster: RosterRow[];
};

const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planned",
  DEPARTED: "Departed",
  AT_DESTINATION: "At destination",
  RETURNING: "Returning",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const NEXT_STATUS: Record<string, string[]> = {
  PLANNED: ["DEPARTED", "CANCELLED"],
  DEPARTED: ["AT_DESTINATION", "CANCELLED"],
  AT_DESTINATION: ["RETURNING", "CANCELLED"],
  RETURNING: ["COMPLETED", "CANCELLED"],
};

function newBusDraft(): BusDraft {
  return { key: `${Date.now()}-${Math.random().toString(16).slice(2)}`, vehicleId: "", label: "", coordinatorIds: [], studentIds: [] };
}

export default function ToursPage() {
  const { user, schoolId } = useScope();
  const vehicles = useRecords<Vehicle>("/api/v1/vehicles?limit=100");
  const students = useRecords<Student>("/api/v1/students?limit=100");
  const people = useRecords<Person>("/api/v1/users?limit=100");
  const [tours, setTours] = useState<Tour[]>([]);
  const [buses, setBuses] = useState<TourBus[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [headcounts, setHeadcounts] = useState<Headcount[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Tour | null>(null);
  const [busDrafts, setBusDrafts] = useState<BusDraft[]>([newBusDraft()]);
  const [formVersion, setFormVersion] = useState(0);
  const [manualBusId, setManualBusId] = useState("");
  const [manualPresentIds, setManualPresentIds] = useState<string[]>([]);
  const blocked = user.role === "PLATFORM_ADMIN" && !schoolId;

  const staff = useMemo(
    () => people.rows.filter((person) => ["SCHOOL_ADMIN", "DRIVER", "ATTENDANT", "TOUR_COORDINATOR"].includes(person.role)),
    [people.rows],
  );
  const selected = tours.find((tour) => tour.id === selectedId) || null;
  const selectedBuses = buses.filter((bus) => bus.tourId === selectedId);
  const selectedRoster = roster.filter((row) => row.tourId === selectedId);
  const selectedHeadcounts = headcounts.filter((row) => row.tourId === selectedId);
  const selectedIncidents = incidents.filter((row) => row.tourId === selectedId);
  const manualBusRoster = selectedRoster.filter((row) => row.tourBusId === manualBusId);

  async function reload() {
    const result = await api<{
      tours: Tour[];
      buses: TourBus[];
      roster: RosterRow[];
      headcounts: Headcount[];
      incidents: Incident[];
    }>("/api/v1/tours");
    setTours(result.data.tours);
    setBuses(result.data.buses);
    setRoster(result.data.roster);
    setHeadcounts(result.data.headcounts);
    setIncidents(result.data.incidents);
    if (selectedId && !result.data.tours.some((tour) => tour.id === selectedId)) {
      setSelectedId("");
      setReport(null);
    }
  }

  useEffect(() => {
    if (blocked) return;
    let ignore = false;
    api<{
      tours: Tour[];
      buses: TourBus[];
      roster: RosterRow[];
      headcounts: Headcount[];
      incidents: Incident[];
    }>("/api/v1/tours")
      .then((result) => {
        if (ignore) return;
        setTours(result.data.tours);
        setBuses(result.data.buses);
        setRoster(result.data.roster);
        setHeadcounts(result.data.headcounts);
        setIncidents(result.data.incidents);
        setError("");
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load tours.");
      });
    return () => {
      ignore = true;
    };
  }, [blocked, schoolId]);

  function loadDraftsFromTour(tourId: string) {
    const tourBuses = buses.filter((bus) => bus.tourId === tourId);
    const tourRoster = roster.filter((row) => row.tourId === tourId);
    if (!tourBuses.length) {
      setBusDrafts([newBusDraft()]);
      return;
    }
    setBusDrafts(
      tourBuses.map((bus) => ({
        key: bus.id,
        vehicleId: bus.vehicleId,
        label: bus.label || "",
        coordinatorIds: bus.coordinatorIds || [],
        studentIds: tourRoster.filter((row) => row.tourBusId === bus.id).map((row) => row.studentId),
      })),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setFieldErrors({});
    const busesPayload = busDrafts
      .filter((bus) => bus.vehicleId && bus.studentIds.length)
      .map((bus) => ({
        vehicleId: bus.vehicleId,
        label: bus.label,
        coordinatorIds: bus.coordinatorIds,
        studentIds: bus.studentIds,
      }));
    if (!busesPayload.length) {
      setFieldErrors({ buses: "Add at least one bus with a vehicle and students." });
      setMessage("Add at least one bus with a vehicle and students.");
      return;
    }
    try {
      const body = {
        name: form.get("name"),
        tripDate: form.get("tripDate"),
        watchMinutes: Number(form.get("watchMinutes") || 15),
        leadCoordinatorId: form.get("leadCoordinatorId") || null,
        buses: busesPayload,
        schoolId,
      };
      const result = await api<{ tour: Tour }>(editing ? `/api/v1/tours/${editing.id}` : "/api/v1/tours", {
        method: editing ? "PATCH" : "POST",
        body,
      });
      formElement.reset();
      setEditing(null);
      setBusDrafts([newBusDraft()]);
      setFormVersion((version) => version + 1);
      setSelectedId(result.data.tour.id);
      setMessage("Tour saved.");
      await reload();
    } catch (caught) {
      const result = failureOf(caught, "Could not save the tour.");
      setFieldErrors(result.fields);
      setMessage(result.message);
    }
  }

  async function removeTour(tour: Tour) {
    if (!window.confirm(`Delete ${tour.name}? Buses, roster, headcounts, and incidents will be removed.`)) return;
    try {
      await api(`/api/v1/tours/${tour.id}`, { method: "DELETE" });
      if (editing?.id === tour.id) setEditing(null);
      if (selectedId === tour.id) {
        setSelectedId("");
        setReport(null);
      }
      setMessage("Tour deleted.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the tour.");
    }
  }

  async function advanceStatus(status: string) {
    if (!selected) return;
    try {
      await api(`/api/v1/tours/${selected.id}/status`, { method: "POST", body: { status, schoolId } });
      setMessage(`Tour marked ${STATUS_LABEL[status] || status}.`);
      await reload();
      if (status === "COMPLETED") await loadReport(selected.id);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not update status.");
    }
  }

  async function loadReport(tourId: string) {
    try {
      const result = await api<Report>(`/api/v1/tours/${tourId}/report`);
      setReport(result.data);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not load report.");
    }
  }

  async function runWatch() {
    if (!selected) return;
    try {
      const result = await api<{ timedOutStudentIds: string[] }>(`/api/v1/tours/${selected.id}/watch-check`, { method: "POST", body: { schoolId } });
      setMessage(
        result.data.timedOutStudentIds.length
          ? `Watch check flagged ${result.data.timedOutStudentIds.length} student(s).`
          : "Watch check complete. No timeouts.",
      );
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Watch check failed.");
    }
  }

  async function markFound(row: RosterRow) {
    if (!selected) return;
    try {
      await api(`/api/v1/tours/${selected.id}/students/${row.studentId}/found`, {
        method: "POST",
        body: { tourBusId: row.tourBusId, schoolId },
      });
      setMessage(`${row.studentName || "Student"} marked found.`);
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not mark found.");
    }
  }

  async function markMissing(row: RosterRow) {
    if (!selected) return;
    try {
      await api(`/api/v1/tours/${selected.id}/students/${row.studentId}/missing`, {
        method: "POST",
        body: { schoolId },
      });
      setMessage(`${row.studentName || "Student"} marked missing.`);
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not mark missing.");
    }
  }

  async function recordManualHeadcount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !manualBusId) {
      setMessage("Choose a bus for the headcount.");
      return;
    }
    try {
      await api(`/api/v1/tours/${selected.id}/headcounts`, {
        method: "POST",
        body: {
          tourBusId: manualBusId,
          source: "MANUAL_ADMIN",
          phase: (new FormData(event.currentTarget).get("phase") as string) || "OTHER",
          note: new FormData(event.currentTarget).get("note") || "",
          presentStudentIds: manualPresentIds,
          schoolId,
        },
      });
      setMessage("Headcount recorded.");
      setManualPresentIds([]);
      await reload();
    } catch (caught) {
      const result = failureOf(caught, "Could not record headcount.");
      setMessage(result.message);
    }
  }

  const studentOptions = students.rows.map((student) => ({
    id: student.id,
    name: student.name,
    detail: `${student.studentCode}${student.className ? ` · ${student.className}` : ""}`,
  }));
  const staffOptions = staff.map((person) => ({
    id: person.id,
    name: person.name,
    detail: person.role.replaceAll("_", " "),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tours"
        subtitle="Plan picnic and outing buses, assign coordinators and students, run BLE headcounts, and close with a trip report. Coordinator phones use the same APIs."
      />
      {blocked ? <Notice>Select a school in the header first.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {vehicles.error || students.error || people.error ? (
        <Notice>{vehicles.error || students.error || people.error}</Notice>
      ) : null}
      {message ? (
        <Notice tone={/saved|deleted|marked|recorded|complete|flagged/i.test(message) ? "ok" : "error"}>{message}</Notice>
      ) : null}

      <Panel>
        <ValidatedForm
          key={`${editing?.id || "new"}-${formVersion}`}
          className="space-y-4"
          serverErrors={fieldErrors}
          onInvalid={() => setMessage("")}
          onSubmit={onSubmit}
        >
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Tour">
              <input className={controlClass} name="name" minLength={2} defaultValue={editing?.name || ""} required />
            </Field>
            <Field label="Date">
              <input className={controlClass} name="tripDate" type="date" defaultValue={editing?.tripDate || ""} required />
            </Field>
            <Field label="Watch minutes">
              <input
                className={controlClass}
                name="watchMinutes"
                type="number"
                min={1}
                max={180}
                defaultValue={editing?.watchMinutes ?? 15}
                required
              />
            </Field>
            <Field label="Trip lead">
              <select className={controlClass} name="leadCoordinatorId" defaultValue={editing?.leadCoordinatorId || ""}>
                <option value="">Optional</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Buses</h3>
              <button
                type="button"
                className="text-sm text-slate-600 hover:underline"
                onClick={() => setBusDrafts((current) => [...current, newBusDraft()])}
              >
                Add bus
              </button>
            </div>
            {fieldErrors.buses ? <p className="text-sm text-red-700">{fieldErrors.buses}</p> : null}
            {busDrafts.map((bus, index) => (
              <div key={bus.key} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
                <Field label={`Vehicle ${index + 1}`}>
                  <select
                    className={controlClass}
                    value={bus.vehicleId}
                    onChange={(event) =>
                      setBusDrafts((current) =>
                        current.map((row) => (row.key === bus.key ? { ...row, vehicleId: event.target.value } : row)),
                      )
                    }
                    required
                  >
                    <option value="">Choose</option>
                    {vehicles.rows.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.vehicleNumber}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Label">
                  <input
                    className={controlClass}
                    value={bus.label}
                    onChange={(event) =>
                      setBusDrafts((current) =>
                        current.map((row) => (row.key === bus.key ? { ...row, label: event.target.value } : row)),
                      )
                    }
                    placeholder="Optional bus label"
                  />
                </Field>
                <SearchSelect
                  label="Coordinators"
                  name={`coordinators-${bus.key}`}
                  options={staffOptions}
                  placeholder="Add coordinator"
                  anotherPlaceholder="Add another coordinator"
                  emptyMatch="No matching staff"
                  emptyOptions="No staff available"
                  initialIds={bus.coordinatorIds}
                  max={8}
                  onChange={(ids) =>
                    setBusDrafts((current) => current.map((row) => (row.key === bus.key ? { ...row, coordinatorIds: ids } : row)))
                  }
                />
                <SearchSelect
                  label="Students"
                  name={`students-${bus.key}`}
                  options={studentOptions}
                  placeholder="Add student"
                  anotherPlaceholder="Add another student"
                  emptyMatch="No matching students"
                  emptyOptions="No students available"
                  initialIds={bus.studentIds}
                  max={80}
                  onChange={(ids) =>
                    setBusDrafts((current) => current.map((row) => (row.key === bus.key ? { ...row, studentIds: ids } : row)))
                  }
                />
                {busDrafts.length > 1 ? (
                  <button
                    type="button"
                    className="text-left text-sm text-red-700 hover:underline md:col-span-2"
                    onClick={() => setBusDrafts((current) => current.filter((row) => row.key !== bus.key))}
                  >
                    Remove bus
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex items-end gap-3">
            <PrimaryButton>{editing ? "Save changes" : "Create tour"}</PrimaryButton>
            {editing ? (
              <button
                className="text-sm text-slate-600 hover:underline"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setBusDrafts([newBusDraft()]);
                  setFormVersion((version) => version + 1);
                  setFieldErrors(EMPTY_FIELD_ERRORS);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </ValidatedForm>
      </Panel>

      <Panel>
        <DataTable
          columns={["Tour", "Date", "Status", "Buses", "Present / Missing", ""]}
          rows={tours.map((tour) => [
            <button
              key={`${tour.id}-name`}
              type="button"
              className="text-left font-medium text-slate-900 hover:underline"
              onClick={() => {
                setSelectedId(tour.id);
                setManualBusId("");
                setReport(null);
                void loadReport(tour.id);
              }}
            >
              {tour.name}
            </button>,
            tour.tripDate,
            STATUS_LABEL[tour.status] || tour.status,
            tour.busCount ?? 0,
            `${tour.presentCount ?? 0} / ${tour.missingCount ?? 0}`,
            <RowActions
              key={tour.id}
              onEdit={() => {
                setEditing(tour);
                loadDraftsFromTour(tour.id);
                setFormVersion((version) => version + 1);
                setMessage("");
                setFieldErrors({});
              }}
              onDelete={() => {
                void removeTour(tour);
              }}
            />,
          ])}
        />
      </Panel>

      {selected ? (
        <>
          <Panel>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{selected.name}</h3>
                <p className="text-sm text-slate-600">
                  {STATUS_LABEL[selected.status] || selected.status} · {selected.tripDate} · watch {selected.watchMinutes ?? 15} min
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(NEXT_STATUS[selected.status] || []).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
                    onClick={() => void advanceStatus(status)}
                  >
                    Mark {STATUS_LABEL[status] || status}
                  </button>
                ))}
                {selected.status === "AT_DESTINATION" || selected.status === "RETURNING" ? (
                  <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => void runWatch()}>
                    Run watch check
                  </button>
                ) : null}
                <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => void loadReport(selected.id)}>
                  Refresh report
                </button>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              {selectedBuses.map((bus) => {
                const busRoster = selectedRoster.filter((row) => row.tourBusId === bus.id);
                const present = busRoster.filter((row) => row.status === "PRESENT" || row.status === "FOUND").length;
                const missing = busRoster.filter((row) => row.status === "MISSING").length;
                return (
                  <div key={bus.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-medium text-slate-900">{bus.label || bus.vehicleNumber || "Bus"}</p>
                    <p className="text-sm text-slate-600">
                      {busRoster.length} students · {present} present · {missing} missing
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {(bus.coordinators || []).map((person) => person.name).join(", ") || "No coordinators"}
                    </p>
                  </div>
                );
              })}
            </div>

            <DataTable
              columns={["Student", "Bus", "Status", "Last seen", ""]}
              rows={selectedRoster.map((row) => {
                const bus = selectedBuses.find((item) => item.id === row.tourBusId);
                return [
                  <span key={`${row.id}-name`} className="inline-flex items-center gap-2">
                    {row.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.photoUrl} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : null}
                    <span>
                      {row.studentName}
                      <span className="block text-xs text-slate-500">{row.studentCode}</span>
                    </span>
                  </span>,
                  bus?.label || bus?.vehicleNumber || "",
                  row.status,
                  row.lastSeenAt
                    ? `${row.lastSeenAt.replace("T", " ").slice(0, 16)}${
                        row.lastSeenLatitude != null && row.lastSeenLongitude != null
                          ? ` · ${row.lastSeenLatitude.toFixed(4)}, ${row.lastSeenLongitude.toFixed(4)}`
                          : ""
                      }`
                    : "—",
                  <div key={`${row.id}-actions`} className="flex gap-2 text-sm">
                    {row.status !== "FOUND" && row.status !== "PRESENT" ? (
                      <button type="button" className="text-emerald-700 hover:underline" onClick={() => void markFound(row)}>
                        Found
                      </button>
                    ) : null}
                    {row.status !== "MISSING" ? (
                      <button type="button" className="text-red-700 hover:underline" onClick={() => void markMissing(row)}>
                        Missing
                      </button>
                    ) : null}
                  </div>,
                ];
              })}
            />
          </Panel>

          <Panel>
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Manual headcount</h3>
            <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => void recordManualHeadcount(event)}>
              <Field label="Bus">
                <select
                  className={controlClass}
                  value={manualBusId}
                  onChange={(event) => {
                    setManualBusId(event.target.value);
                    setManualPresentIds([]);
                  }}
                  required
                >
                  <option value="">Choose</option>
                  {selectedBuses.map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      {bus.label || bus.vehicleNumber}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Phase">
                <select className={controlClass} name="phase" defaultValue="OTHER">
                  <option value="BOARDING">Boarding</option>
                  <option value="STOP">Stop</option>
                  <option value="DESTINATION">Destination</option>
                  <option value="RETURN">Return</option>
                  <option value="OTHER">Other</option>
                </select>
              </Field>
              <Field label="Note">
                <input className={controlClass} name="note" />
              </Field>
              <div className="md:col-span-3">
                <SearchSelect
                  key={`${manualBusId}-${manualBusRoster.length}`}
                  label="Present students"
                  name="presentStudentIds"
                  options={manualBusRoster.map((row) => ({
                    id: row.studentId,
                    name: row.studentName || row.studentId,
                    detail: row.studentCode,
                  }))}
                  placeholder="Mark present"
                  anotherPlaceholder="Add another present student"
                  emptyMatch="No matching students on this bus"
                  emptyOptions="Choose a bus first"
                  initialIds={manualPresentIds}
                  max={80}
                  onChange={setManualPresentIds}
                />
              </div>
              <div className="md:col-span-3">
                <PrimaryButton>Record headcount</PrimaryButton>
              </div>
            </form>
          </Panel>

          <Panel>
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Headcounts</h3>
            <DataTable
              columns={["When", "Phase", "Present", "Missing", "Wrong bus", "Source", "Note"]}
              rows={selectedHeadcounts.map((row) => [
                row.takenAt?.replace("T", " ").slice(0, 16),
                row.phase || "—",
                row.presentCount,
                row.missingStudentIds?.length ?? 0,
                row.wrongBusStudentIds?.length ?? 0,
                row.source || "—",
                row.note || "",
              ])}
            />
          </Panel>

          <Panel>
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Incidents</h3>
            <DataTable
              columns={["When", "Type", "Message"]}
              rows={selectedIncidents.map((row) => [
                row.occurredAt?.replace("T", " ").slice(0, 16),
                row.type,
                row.message,
              ])}
            />
          </Panel>

          {report ? (
            <Panel>
              <h3 className="mb-3 text-sm font-semibold text-slate-800">End-of-tour report</h3>
              <p className="text-sm text-slate-700">
                {report.totals.students} students · {report.totals.present} present · {report.totals.missing} missing ·{" "}
                {report.totals.wrongBus} wrong bus · {report.totals.expected} still expected
              </p>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

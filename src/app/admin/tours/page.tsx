"use client";

import { FormEvent, useEffect, useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { api } from "@/lib/admin/api";

type Tour = { id: string; name: string; tripDate: string; status: string };
type Headcount = { id: string; tourId: string; presentCount: number; note: string; takenAt: string };

export default function ToursPage() {
  const { user, schoolId } = useScope();
  const [tours, setTours] = useState<Tour[]>([]);
  const [headcounts, setHeadcounts] = useState<Headcount[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingTour, setEditingTour] = useState<Tour | null>(null);
  const [editingCount, setEditingCount] = useState<Headcount | null>(null);
  const blocked = user.role === "PLATFORM_ADMIN" && !schoolId;

  async function reload() {
    const result = await api<{ tours: Tour[]; headcounts: Headcount[] }>("/api/v1/tours");
    setTours(result.data.tours);
    setHeadcounts(result.data.headcounts);
  }

  useEffect(() => {
    if (blocked) return;
    let ignore = false;
    reload().then(() => {
      if (!ignore) setError("");
    }).catch((caught: unknown) => {
      if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load tours.");
    });
    return () => {
      ignore = true;
    };
  }, [blocked, schoolId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    try {
      await api(editingTour ? `/api/v1/tours/${editingTour.id}` : "/api/v1/tours", {
        method: editingTour ? "PATCH" : "POST",
        body: { name: form.get("name"), tripDate: form.get("tripDate"), schoolId },
      });
      formElement.reset();
      setEditingTour(null);
      setMessage("Tour saved.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save the tour.");
    }
  }

  async function onHeadcount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    try {
      const body = { tourId: form.get("tourId"), presentCount: Number(form.get("presentCount")), note: form.get("note"), schoolId };
      await api(editingCount ? `/api/v1/tours/headcounts/${editingCount.id}` : "/api/v1/tours", {
        method: editingCount ? "PATCH" : "PUT",
        body,
      });
      formElement.reset();
      setEditingCount(null);
      setMessage("Headcount saved.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save the headcount.");
    }
  }

  async function removeTour(tour: Tour) {
    if (!window.confirm(`Delete ${tour.name}? Its headcounts will be removed too.`)) return;
    try {
      await api(`/api/v1/tours/${tour.id}`, { method: "DELETE" });
      if (editingTour?.id === tour.id) setEditingTour(null);
      setMessage("Tour deleted.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the tour.");
    }
  }

  async function removeHeadcount(row: Headcount) {
    if (!window.confirm("Delete this headcount?")) return;
    try {
      await api(`/api/v1/tours/headcounts/${row.id}`, { method: "DELETE" });
      if (editingCount?.id === row.id) setEditingCount(null);
      setMessage("Headcount deleted.");
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the headcount.");
    }
  }

  const tourName = new Map(tours.map((tour) => [tour.id, tour.name]));

  return (
    <div className="space-y-5">
      <PageHeader title="Tours" subtitle="Picnic and tour headcounts use the school's students and cards. They are stored apart from daily bus trips." />
      {blocked ? <Notice>Select a school in the header first.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") || message.includes("deleted") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <form key={editingTour?.id || "new-tour"} className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          <Field label="Tour"><input className={controlClass} name="name" defaultValue={editingTour?.name || ""} required /></Field>
          <Field label="Date"><input className={controlClass} name="tripDate" type="date" defaultValue={editingTour?.tripDate || ""} required /></Field>
          <div className="flex items-end gap-3 md:col-span-3">
            <PrimaryButton>{editingTour ? "Save changes" : "Add tour"}</PrimaryButton>
            {editingTour ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditingTour(null)}>Cancel</button> : null}
          </div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          columns={["Tour", "Date", "Status", ""]}
          rows={tours.map((tour) => [
            tour.name,
            tour.tripDate,
            tour.status,
            <RowActions key={tour.id} onEdit={() => { setEditingTour(tour); setMessage(""); }} onDelete={() => { void removeTour(tour); }} />,
          ])}
        />
      </Panel>
      <Panel>
        <form key={editingCount?.id || "new-count"} className="grid gap-3 md:grid-cols-3" onSubmit={onHeadcount}>
          <Field label="Tour">
            <select className={controlClass} name="tourId" defaultValue={editingCount?.tourId || ""} required>
              <option value="">Select</option>
              {tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.name}</option>)}
            </select>
          </Field>
          <Field label="Present"><input className={controlClass} name="presentCount" type="number" min={0} defaultValue={editingCount?.presentCount ?? ""} required /></Field>
          <Field label="Note"><input className={controlClass} name="note" defaultValue={editingCount?.note || ""} /></Field>
          <div className="flex items-end gap-3 md:col-span-3">
            <PrimaryButton>{editingCount ? "Save changes" : "Record headcount"}</PrimaryButton>
            {editingCount ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditingCount(null)}>Cancel</button> : null}
          </div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          columns={["Tour", "Present", "Note", "Taken", ""]}
          rows={headcounts.map((row) => [
            tourName.get(row.tourId) || "",
            row.presentCount,
            row.note,
            row.takenAt?.replace("T", " ").slice(0, 16),
            <RowActions key={row.id} onEdit={() => { setEditingCount(row); setMessage(""); }} onDelete={() => { void removeHeadcount(row); }} />,
          ])}
        />
      </Panel>
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";

type Gap = { id: string; startedAt: string; endedAt: string; personalMinutes: number; outcome: string; status: string; reason: string };
type Day = { checkedInAt?: string | null; lastSeenAt?: string | null; checkedOutAt?: string | null; fieldLatitude?: number | null; fieldLongitude?: number | null };
type Mine = {
  policy: { monitoringPolicy: string; fieldCheckInAllowed: boolean; gracePeriodMinutes: number };
  employee: { name: string; workMode: string; consentGranted: boolean };
  workDate: string;
  presence: string;
  day: Day | null;
  gaps: Gap[];
};

const presenceLabel: Record<string, string> = {
  NOT_ARRIVED: "Not arrived",
  IN_OFFICE: "In office",
  AWAY: "Not heard",
  CHECKED_OUT: "Checked out",
};

function when(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function MyDay() {
  const [mine, setMine] = useState<Mine | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("error");

  function reload() {
    return api<Mine>("/api/v1/attendance/me", { school: false }).then((result) => setMine(result.data));
  }

  useEffect(() => {
    let ignore = false;
    reload().catch((caught: unknown) => {
      if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load your day.");
    });
    return () => {
      ignore = true;
    };
  }, [message]);

  async function dispute(event: FormEvent<HTMLFormElement>, gapId: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const reason = String(new FormData(formElement).get("reason") || "");
    setMessage("");
    try {
      await api(`/api/v1/attendance/gaps/${gapId}`, { method: "PATCH", school: false, body: { action: "DISPUTE", reason } });
      formElement.reset();
      setTone("ok");
      setMessage("Dispute sent.");
    } catch (caught) {
      setTone("error");
      setMessage(caught instanceof Error ? caught.message : "Could not dispute the gap.");
    }
  }

  async function field(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "OUT" ? "OUT" : "IN";
    setMessage("");
    try {
      await api("/api/v1/attendance/field", {
        method: "POST",
        school: false,
        body: { action, latitude: Number(form.get("latitude")), longitude: Number(form.get("longitude")) },
      });
      setTone("ok");
      setMessage(action === "IN" ? "Checked in." : "Checked out.");
    } catch (caught) {
      setTone("error");
      setMessage(caught instanceof Error ? caught.message : "Could not update field attendance.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="My day" subtitle="Your card's first reading is check-in. A silence longer than the grace period becomes an out-of-office gap when the card is heard again. You can dispute that gap before it counts as personal time." />
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone={tone}>{message}</Notice> : null}
      {mine ? (
        <>
          <Panel>
            <p className="text-sm text-slate-600">{mine.policy.monitoringPolicy || "Your company has not published a monitoring policy yet."}</p>
            <p className="mt-3 text-sm">Today: <strong>{presenceLabel[mine.presence] || mine.presence}</strong></p>
            <p className="mt-1 text-sm text-slate-600">Check-in {when(mine.day?.checkedInAt)} · Last seen {when(mine.day?.lastSeenAt)} · Check-out {when(mine.day?.checkedOutAt)}</p>
            {mine.presence === "AWAY" ? <p className="mt-2 text-sm text-slate-600">The card has been quiet for more than {mine.policy.gracePeriodMinutes} minutes. The gap is logged from this last-seen time until the next reading.</p> : null}
          </Panel>
          <Panel>
            <DataTable
              columns={["From", "To", "Minutes", "Status", "Reason"]}
              rows={mine.gaps.map((gap) => [when(gap.startedAt), when(gap.endedAt), gap.personalMinutes, gap.outcome, gap.reason || ""])}
            />
          </Panel>
          {mine.gaps.filter((gap) => gap.status === "OPEN").map((gap) => (
            <Panel key={gap.id}>
              <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => void dispute(event, gap.id)}>
                <Field label={`Dispute ${when(gap.startedAt)} to ${when(gap.endedAt)}`}>
                  <input className={controlClass} name="reason" placeholder="Client meeting, site visit" required />
                </Field>
                <div className="md:col-span-3"><PrimaryButton>Dispute gap</PrimaryButton></div>
              </form>
            </Panel>
          ))}
          {mine.employee.workMode === "FIELD" && mine.policy.fieldCheckInAllowed ? (
            <Panel>
              <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => void field(event)}>
                <Field label="Latitude"><input className={controlClass} name="latitude" required /></Field>
                <Field label="Longitude"><input className={controlClass} name="longitude" required /></Field>
                <div className="flex gap-2 md:col-span-3">
                  <button className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white" type="submit" value="IN">Phone check-in</button>
                  <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm" type="submit" value="OUT">Phone check-out</button>
                </div>
              </form>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

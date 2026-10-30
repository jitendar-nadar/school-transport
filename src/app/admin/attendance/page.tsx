"use client";

import { FormEvent, useEffect, useState } from "react";
import { EMPTY_FIELD_ERRORS } from "@/components/admin/form-error-context";
import { failureOf, passwordHint, passwordPattern, timeHint, timePattern, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { useScope } from "@/components/admin/shell";
import { api } from "@/lib/admin/api";

type Company = { id: string; name: string };
type Policy = {
  gracePeriodMinutes: number;
  shiftStart: string;
  shiftEnd: string;
  lunchStart: string;
  lunchEnd: string;
  silenceCountsAsPersonal: boolean;
  lunchCountsAsPersonal: boolean;
  manualCountsAsPersonal: boolean;
  pilotOneFloor: boolean;
  reviewWindowHours: number;
  fieldCheckInAllowed: boolean;
  monitoringPolicy: string;
};
type Gateway = { id: string; name: string; zone: string };
type Person = {
  id: string;
  name: string;
  tagIdentifier?: string;
  workMode?: string;
  consentGranted?: boolean;
  presence: string;
  checkedInAt?: string | null;
  lastSeenAt?: string | null;
  checkedOutAt?: string | null;
};
type Gap = {
  id: string;
  startedAt: string;
  endedAt: string;
  personalMinutes?: number;
  outcome: string;
  status: string;
  reason?: string;
  employeeId?: { name?: string };
};
type Board = { policy: Policy; gateways: Gateway[]; people: Person[]; gaps: Gap[] };
type Report = { rows: { employee: string; employeeCode: string; workingMinutes: number; personalMinutes: number; pendingMinutes: number; lateDays: number; earlyDays: number; daysPresent: number }[] };

const presenceLabel: Record<string, string> = {
  NOT_ARRIVED: "Not arrived",
  IN_OFFICE: "In office",
  AWAY: "Not heard",
  CHECKED_OUT: "Checked out",
};

function when(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
}

const emptyPolicy: Policy = {
  gracePeriodMinutes: 15,
  shiftStart: "09:30",
  shiftEnd: "18:30",
  lunchStart: "13:00",
  lunchEnd: "14:00",
  silenceCountsAsPersonal: true,
  lunchCountsAsPersonal: false,
  manualCountsAsPersonal: true,
  pilotOneFloor: false,
  reviewWindowHours: 48,
  fieldCheckInAllowed: false,
  monitoringPolicy: "",
};

export default function AttendancePage() {
  const { user } = useScope();
  const reviewerOnly = user.role === "COMPANY_HR";
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState(user.companyId || "");
  const [board, setBoard] = useState<Board | null>(null);
  const [policy, setPolicy] = useState<Policy>(emptyPolicy);
  const [report, setReport] = useState<Report | null>(null);
  const [month, setMonth] = useState(() => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value || "2026";
    const monthPart = parts.find((part) => part.type === "month")?.value || "01";
    return `${year}-${monthPart}`;
  });
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorOwner, setErrorOwner] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("error");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user.role !== "PLATFORM_ADMIN") return;
    api<Company[]>("/api/v1/companies?limit=100", { school: false }).then((result) => setCompanies(result.data)).catch(() => setCompanies([]));
  }, [user.role]);

  useEffect(() => {
    if (!companyId) return;
    let ignore = false;
    api<Board>(`/api/v1/attendance/board?companyId=${companyId}`, { school: false }).then((result) => {
      if (ignore) return;
      setBoard(result.data);
      setPolicy(result.data.policy);
      setError("");
    }).catch((caught: unknown) => {
      if (!ignore) setError(caught instanceof Error ? caught.message : "Could not load attendance.");
    });
    return () => {
      ignore = true;
    };
  }, [companyId, message]);

  function say(text: string, next: "ok" | "error") {
    setTone(next);
    setMessage(text);
  }

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorOwner("policy");
    setFieldErrors({});
    try {
      await api("/api/v1/attendance/policy", { method: "PATCH", school: false, body: { ...policy, companyId } });
      setErrorOwner("");
      say("Rules saved.", "ok");
    } catch (caught) {
      const result = failureOf(caught, "Could not save the rules.");
      setErrorOwner("policy");
      setFieldErrors(result.fields);
      if (result.message) say(result.message, "error");
    }
  }

  async function addReviewer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setErrorOwner("hr");
    setFieldErrors({});
    try {
      await api("/api/v1/attendance/reviewers", {
        method: "POST",
        school: false,
        body: { companyId, name: form.get("name"), email: form.get("email"), phone: form.get("phone"), password: form.get("password") },
      });
      formElement.reset();
      setErrorOwner("");
      say("HR reviewer saved.", "ok");
    } catch (caught) {
      const result = failureOf(caught, "Could not add the HR reviewer.");
      setErrorOwner("hr");
      setFieldErrors(result.fields);
      if (result.message) say(result.message, "error");
    }
  }

  async function addGateway(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setErrorOwner("gateway");
    setFieldErrors({});
    try {
      await api("/api/v1/attendance/gateways", { method: "POST", school: false, body: { companyId, name: form.get("name"), zone: form.get("zone") } });
      formElement.reset();
      setErrorOwner("");
      say("Gateway saved.", "ok");
    } catch (caught) {
      const result = failureOf(caught, "Could not add the gateway.");
      setErrorOwner("gateway");
      setFieldErrors(result.fields);
      if (result.message) say(result.message, "error");
    }
  }

  async function detect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setErrorOwner("detect");
    setFieldErrors({});
    try {
      await api("/api/v1/attendance/detections", {
        method: "POST",
        school: false,
        body: {
          companyId,
          gatewayId: form.get("gatewayId"),
          tagIdentifier: form.get("tagIdentifier"),
          occurredAt: String(form.get("occurredAt") || ""),
        },
      });
      formElement.reset();
      setErrorOwner("");
      say("Detection saved.", "ok");
    } catch (caught) {
      const result = failureOf(caught, "Could not record the detection.");
      setErrorOwner("detect");
      setFieldErrors(result.fields);
      if (result.message) say(result.message, "error");
    }
  }

  async function review(id: string, action: "APPROVE" | "REJECT") {
    setMessage("");
    try {
      await api(`/api/v1/attendance/gaps/${id}`, { method: "PATCH", school: false, body: { action } });
      say(action === "APPROVE" ? "Gap approved." : "Gap rejected.", "ok");
    } catch (caught) {
      say(caught instanceof Error ? caught.message : "Could not review the gap.", "error");
    }
  }

  async function loadReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const result = await api<Report>(`/api/v1/attendance/report?companyId=${companyId}&month=${month}`, { school: false });
      setReport(result.data);
      say("Report loaded.", "ok");
    } catch (caught) {
      say(caught instanceof Error ? caught.message : "Could not load the report.", "error");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Attendance" subtitle="Office gateways hear the employee card. The first reading is check-in, a silence past the grace period becomes out-of-office time, and the last reading of the day is check-out. Pilot one floor first: a dead zone creates a false gap." />
      {user.role === "PLATFORM_ADMIN" ? (
        <Field label="Company">
          <select className={controlClass} value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">Select a company</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </Field>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone={tone}>{message}</Notice> : null}
      {!companyId ? <Notice>Choose a company to set attendance rules.</Notice> : null}
      {policy.pilotOneFloor ? <Notice>Pilot is on. Only a floor gateway can hear cards. Turn the pilot off after that floor is tuned.</Notice> : null}
      {companyId && board ? (
        <>
          {reviewerOnly ? null : <Panel>
            <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "policy" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => void savePolicy(event)}>
              <Field label="Grace period (minutes)"><input className={controlClass} name="gracePeriodMinutes" type="number" min={1} max={180} value={policy.gracePeriodMinutes} onChange={(event) => setPolicy({ ...policy, gracePeriodMinutes: Number(event.target.value) })} required /></Field>
              <Field label="Shift starts"><input className={controlClass} name="shiftStart" value={policy.shiftStart} pattern={timePattern} title={timeHint} onChange={(event) => setPolicy({ ...policy, shiftStart: event.target.value })} required /></Field>
              <Field label="Shift ends"><input className={controlClass} name="shiftEnd" value={policy.shiftEnd} pattern={timePattern} title={timeHint} onChange={(event) => setPolicy({ ...policy, shiftEnd: event.target.value })} required /></Field>
              <Field label="Lunch starts"><input className={controlClass} name="lunchStart" value={policy.lunchStart} pattern={timePattern} title={timeHint} onChange={(event) => setPolicy({ ...policy, lunchStart: event.target.value })} required /></Field>
              <Field label="Lunch ends"><input className={controlClass} name="lunchEnd" value={policy.lunchEnd} pattern={timePattern} title={timeHint} onChange={(event) => setPolicy({ ...policy, lunchEnd: event.target.value })} required /></Field>
              <Field label="Review window (hours)"><input className={controlClass} name="reviewWindowHours" type="number" min={1} max={336} value={policy.reviewWindowHours} onChange={(event) => setPolicy({ ...policy, reviewWindowHours: Number(event.target.value) })} required /></Field>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={policy.silenceCountsAsPersonal} onChange={(event) => setPolicy({ ...policy, silenceCountsAsPersonal: event.target.checked })} /> Unexplained silence counts as personal time</label>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={policy.lunchCountsAsPersonal} onChange={(event) => setPolicy({ ...policy, lunchCountsAsPersonal: event.target.checked })} /> Lunch gaps count as personal time</label>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={policy.manualCountsAsPersonal} onChange={(event) => setPolicy({ ...policy, manualCountsAsPersonal: event.target.checked })} /> Hand-logged gaps count as personal time</label>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={policy.pilotOneFloor} onChange={(event) => setPolicy({ ...policy, pilotOneFloor: event.target.checked })} /> Pilot one floor before covering the whole office</label>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={policy.fieldCheckInAllowed} onChange={(event) => setPolicy({ ...policy, fieldCheckInAllowed: event.target.checked })} /> Allow phone GPS check-in for field staff</label>
              <Field label="Monitoring policy">
                <textarea className={controlClass} name="monitoringPolicy" rows={3} minLength={20} maxLength={2000} value={policy.monitoringPolicy} onChange={(event) => setPolicy({ ...policy, monitoringPolicy: event.target.value })} required />
              </Field>
              <div className="md:col-span-3"><PrimaryButton>Save rules</PrimaryButton></div>
            </ValidatedForm>
          </Panel>}
          {reviewerOnly ? null : <Panel>
            <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "hr" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => void addReviewer(event)}>
              <Field label="HR name"><input className={controlClass} name="name" minLength={2} required /></Field>
              <Field label="HR email"><input className={controlClass} name="email" type="email" required /></Field>
              <Field label="HR phone"><input className={controlClass} name="phone" minLength={8} maxLength={20} required /></Field>
              <Field label="HR password"><input className={controlClass} name="password" type="password" minLength={8} pattern={passwordPattern} title={passwordHint} required /></Field>
              <div className="md:col-span-3"><PrimaryButton>Add HR reviewer</PrimaryButton></div>
            </ValidatedForm>
          </Panel>}
          {reviewerOnly ? null : <Panel>
            <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "gateway" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => void addGateway(event)}>
              <Field label="Gateway"><input className={controlClass} name="name" minLength={2} required /></Field>
              <Field label="Where">
                <select className={controlClass} name="zone" defaultValue="FLOOR">
                  <option value="FLOOR">Floor</option>
                  {policy.pilotOneFloor ? null : <>
                    <option value="MEETING_ROOM">Meeting room</option>
                    <option value="CAFETERIA">Cafeteria</option>
                    <option value="CORRIDOR">Corridor</option>
                    <option value="OTHER">Other</option>
                  </>}
                </select>
              </Field>
              <div className="md:col-span-3"><PrimaryButton>Add gateway</PrimaryButton></div>
            </ValidatedForm>
          </Panel>}
          <Panel>
            <DataTable columns={["Gateway", "Where"]} rows={board.gateways.map((gateway) => [gateway.name, gateway.zone.replaceAll("_", " ")])} />
          </Panel>
          {reviewerOnly ? null : <Panel>
            <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "detect" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => void detect(event)}>
              <Field label="Gateway">
                <select className={controlClass} name="gatewayId" required>
                  <option value="">Select</option>
                  {board.gateways.map((gateway) => <option key={gateway.id} value={gateway.id}>{gateway.name}</option>)}
                </select>
              </Field>
              <Field label="Card id"><input className={controlClass} name="tagIdentifier" minLength={2} maxLength={64} required /></Field>
              <Field label="Time (blank = now)"><input className={controlClass} name="occurredAt" type="datetime-local" /></Field>
              <div className="md:col-span-3"><PrimaryButton>Record detection</PrimaryButton></div>
            </ValidatedForm>
          </Panel>}
          <Panel>
            <DataTable
              columns={["Employee", "Card", "Presence", "In", "Last seen", "Out"]}
              rows={board.people.map((person) => [
                person.name,
                person.tagIdentifier || "—",
                presenceLabel[person.presence] || person.presence,
                when(person.checkedInAt),
                when(person.lastSeenAt),
                when(person.checkedOutAt),
              ])}
            />
          </Panel>
          <Panel>
            <DataTable
              columns={["Employee", "From", "To", "Minutes", "Result", ""]}
              rows={board.gaps.map((gap) => [
                gap.employeeId?.name || "",
                when(gap.startedAt),
                when(gap.endedAt),
                gap.personalMinutes ?? "",
                gap.outcome,
                gap.status === "OPEN" || gap.status === "DISPUTED" ? (
                  <span key={gap.id} className="flex gap-2">
                    <button className="text-sm text-teal-800" type="button" onClick={() => void review(gap.id, "APPROVE")}>Approve</button>
                    <button className="text-sm text-red-700" type="button" onClick={() => void review(gap.id, "REJECT")}>Reject</button>
                  </span>
                ) : gap.reason || "",
              ])}
            />
          </Panel>
          <Panel>
            <ValidatedForm className="flex flex-wrap items-end gap-3" serverErrors={errorOwner === "report" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => void loadReport(event)}>
              <Field label="Month"><input className={controlClass} name="month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} required /></Field>
              <PrimaryButton>Load report</PrimaryButton>
              <a className="rounded-lg border border-slate-300 px-4 py-2 text-sm" href={`/api/v1/attendance/report?companyId=${companyId}&month=${month}&format=csv`}>Download CSV</a>
            </ValidatedForm>
          </Panel>
          {report ? (
            <Panel>
              <DataTable
                columns={["Employee", "Working h", "Personal h", "Pending h", "Late", "Early", "Days"]}
                rows={report.rows.map((row) => [
                  `${row.employee} · ${row.employeeCode}`,
                  (row.workingMinutes / 60).toFixed(2),
                  (row.personalMinutes / 60).toFixed(2),
                  (row.pendingMinutes / 60).toFixed(2),
                  row.lateDays,
                  row.earlyDays,
                  row.daysPresent,
                ])}
              />
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

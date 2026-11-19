"use client";

import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { EMPTY_FIELD_ERRORS } from "@/components/admin/form-error-context";
import { failureOf, passwordHint, passwordPattern, timeHint, timePattern, ValidatedForm } from "@/components/admin/validated-form";
import { Badge, DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { FieldDaysPanel, FieldSitesPanel, type FieldDay, type FieldSite } from "@/components/admin/attendance-field";
import { SearchSelect } from "@/components/admin/search-select";
import { useScope } from "@/components/admin/shell";
import { api } from "@/lib/admin/api";

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
  fieldApprovalRequired: boolean;
  fieldSites: FieldSite[];
  gatewaySilentMinutes: number;
  monitoringPolicy: string;
};
type Gateway = { id: string; name: string; zone: string; status?: string; minRssi?: number | null; lastContactAt?: string | null; health: "ONLINE" | "SILENT" | "NEVER" };
type Reviewer = { id: string; name: string; email: string; reviewDepartmentIds?: string[] };
type Department = { id: string; name: string };
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
type Board = {
  policy: Policy;
  reviewScope: string[] | null;
  departments: Department[];
  reviewers: Reviewer[];
  fieldDays: FieldDay[];
  gateways: Gateway[];
  people: Person[];
  gaps: Gap[];
};

const healthLabel: Record<Gateway["health"], string> = { ONLINE: "Online", SILENT: "Silent", NEVER: "Never heard" };
const detectionMessage: Record<string, string> = {
  APPLIED: "Detection saved.",
  LATE: "Detection saved. It was older than the last reading, so the day's gaps were adjusted.",
  DUPLICATE: "This reading was already recorded.",
  IGNORED_WEAK_SIGNAL: "Reading stored but ignored: the signal is weaker than this gateway's minimum.",
};
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

function heardAt(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
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
  fieldApprovalRequired: false,
  fieldSites: [],
  gatewaySilentMinutes: 30,
  monitoringPolicy: "",
};

export default function AttendancePage() {
  const { user, companyId: scopedCompanyId } = useScope();
  const reviewerOnly = user.role === "COMPANY_HR";
  const companyId = scopedCompanyId || "";
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
  const [hrFormKey, setHrFormKey] = useState(0);
  const [gatewayFormKey, setGatewayFormKey] = useState(0);
  const [editingGateway, setEditingGateway] = useState<Gateway | null>(null);
  const [editingReviewer, setEditingReviewer] = useState<Reviewer | null>(null);

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
        body: {
          companyId,
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          password: form.get("password"),
          departmentIds: form.getAll("departmentIds").map(String),
        },
      });
      setHrFormKey((key) => key + 1);
      setErrorOwner("");
      say("HR reviewer saved.", "ok");
    } catch (caught) {
      const result = failureOf(caught, "Could not add the HR reviewer.");
      setErrorOwner("hr");
      setFieldErrors(result.fields);
      if (result.message) say(result.message, "error");
    }
  }

  async function saveReviewerScope(event: FormEvent<HTMLFormElement>, reviewer: Reviewer) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setErrorOwner("scope");
    setFieldErrors({});
    try {
      await api(`/api/v1/attendance/reviewers/${reviewer.id}`, {
        method: "PATCH",
        school: false,
        body: { companyId, departmentIds: form.getAll("departmentIds").map(String) },
      });
      setEditingReviewer(null);
      setErrorOwner("");
      say(`${reviewer.name} now reviews the chosen departments.`, "ok");
    } catch (caught) {
      const result = failureOf(caught, "Could not save the departments.");
      setErrorOwner("scope");
      setFieldErrors(result.fields);
      if (result.message) say(result.message, "error");
    }
  }

  async function saveSites(fieldSites: FieldSite[], done: string) {
    if (!board) return null;
    setMessage("");
    try {
      await api("/api/v1/attendance/policy", { method: "PATCH", school: false, body: { ...board.policy, fieldSites, companyId } });
      say(done, "ok");
      return null;
    } catch (caught) {
      const result = failureOf(caught, "Could not save the field sites.");
      if (result.message) say(result.message, "error");
      return result.fields;
    }
  }

  async function reviewDay(id: string, action: "APPROVE" | "REJECT", note: string) {
    setMessage("");
    try {
      await api(`/api/v1/attendance/days/${id}/review`, { method: "PATCH", school: false, body: { action, note } });
      say(action === "APPROVE" ? "Field day approved." : "Field day rejected.", "ok");
    } catch (caught) {
      say(caught instanceof Error ? caught.message : "Could not review the field day.", "error");
    }
  }

  async function saveGateway(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setErrorOwner("gateway");
    setFieldErrors({});
    try {
      const body = { companyId, name: form.get("name"), zone: form.get("zone"), minRssi: String(form.get("minRssi") || "") };
      if (editingGateway) await api(`/api/v1/attendance/gateways/${editingGateway.id}`, { method: "PATCH", school: false, body });
      else await api("/api/v1/attendance/gateways", { method: "POST", school: false, body });
      setEditingGateway(null);
      setGatewayFormKey((key) => key + 1);
      setErrorOwner("");
      say("Gateway saved.", "ok");
    } catch (caught) {
      const result = failureOf(caught, "Could not save the gateway.");
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
      const result = await api<{ status: string }>("/api/v1/attendance/detections", {
        method: "POST",
        school: false,
        body: {
          companyId,
          gatewayId: form.get("gatewayId"),
          tagIdentifier: form.get("tagIdentifier"),
          occurredAt: String(form.get("occurredAt") || ""),
          rssi: String(form.get("rssi") || ""),
        },
      });
      formElement.reset();
      setErrorOwner("");
      say(detectionMessage[result.data.status] || "Detection saved.", "ok");
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

  const silentGateways = (board?.gateways || []).filter((gateway) => gateway.status !== "INACTIVE" && gateway.health !== "ONLINE");

  return (
    <div className="space-y-5">
      <PageHeader title="Attendance" subtitle="Office gateways hear the employee card. The first reading is check-in, a silence past the grace period becomes out-of-office time, and the last reading of the day is check-out. Pilot one floor first: a dead zone creates a false gap." />
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone={tone}>{message}</Notice> : null}
      {!companyId ? <Notice>Choose a company in the header to set attendance rules.</Notice> : null}
      {policy.pilotOneFloor ? <Notice>Pilot is on. Only a floor gateway can hear cards. Turn the pilot off after that floor is tuned.</Notice> : null}
      {companyId && board ? (
        <>
          {board.reviewScope ? (
            <Notice tone="ok">
              You review employees in {board.departments.filter((department) => board.reviewScope?.includes(department.id)).map((department) => department.name).join(", ")}. Other departments are hidden.
            </Notice>
          ) : null}
          {reviewerOnly ? null : <Panel>
            <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "policy" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => void savePolicy(event)}>
              <Field label="Grace period (minutes)"><input className={controlClass} name="gracePeriodMinutes" type="number" min={1} max={180} value={policy.gracePeriodMinutes} onChange={(event) => setPolicy({ ...policy, gracePeriodMinutes: Number(event.target.value) })} required /></Field>
              <Field label="Shift starts"><input className={controlClass} name="shiftStart" value={policy.shiftStart} pattern={timePattern} title={timeHint} onChange={(event) => setPolicy({ ...policy, shiftStart: event.target.value })} required /></Field>
              <Field label="Shift ends"><input className={controlClass} name="shiftEnd" value={policy.shiftEnd} pattern={timePattern} title={timeHint} onChange={(event) => setPolicy({ ...policy, shiftEnd: event.target.value })} required /></Field>
              <Field label="Lunch starts"><input className={controlClass} name="lunchStart" value={policy.lunchStart} pattern={timePattern} title={timeHint} onChange={(event) => setPolicy({ ...policy, lunchStart: event.target.value })} required /></Field>
              <Field label="Lunch ends"><input className={controlClass} name="lunchEnd" value={policy.lunchEnd} pattern={timePattern} title={timeHint} onChange={(event) => setPolicy({ ...policy, lunchEnd: event.target.value })} required /></Field>
              <Field label="Review window (hours)"><input className={controlClass} name="reviewWindowHours" type="number" min={1} max={336} value={policy.reviewWindowHours} onChange={(event) => setPolicy({ ...policy, reviewWindowHours: Number(event.target.value) })} required /></Field>
              <Field label="Gateway silent after (minutes)"><input className={controlClass} name="gatewaySilentMinutes" type="number" min={5} max={1440} value={policy.gatewaySilentMinutes} onChange={(event) => setPolicy({ ...policy, gatewaySilentMinutes: Number(event.target.value) })} required /></Field>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={policy.silenceCountsAsPersonal} onChange={(event) => setPolicy({ ...policy, silenceCountsAsPersonal: event.target.checked })} /> Unexplained silence counts as personal time</label>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={policy.lunchCountsAsPersonal} onChange={(event) => setPolicy({ ...policy, lunchCountsAsPersonal: event.target.checked })} /> Lunch gaps count as personal time</label>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={policy.manualCountsAsPersonal} onChange={(event) => setPolicy({ ...policy, manualCountsAsPersonal: event.target.checked })} /> Hand-logged gaps count as personal time</label>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={policy.pilotOneFloor} onChange={(event) => setPolicy({ ...policy, pilotOneFloor: event.target.checked })} /> Pilot one floor before covering the whole office</label>
              <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={policy.fieldCheckInAllowed} onChange={(event) => setPolicy({ ...policy, fieldCheckInAllowed: event.target.checked })} /> Allow phone GPS check-in for field staff</label>
              {policy.fieldCheckInAllowed ? <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={policy.fieldApprovalRequired} onChange={(event) => setPolicy({ ...policy, fieldApprovalRequired: event.target.checked })} /> HR approves each phone check-in day before it counts</label> : null}
              <Field label="Monitoring policy">
                <textarea className={controlClass} name="monitoringPolicy" rows={3} minLength={20} maxLength={2000} value={policy.monitoringPolicy} onChange={(event) => setPolicy({ ...policy, monitoringPolicy: event.target.value })} required />
              </Field>
              <div className="md:col-span-3"><PrimaryButton>Save rules</PrimaryButton></div>
            </ValidatedForm>
          </Panel>}
          {reviewerOnly || !policy.fieldCheckInAllowed ? null : <FieldSitesPanel sites={board.policy.fieldSites} onSave={saveSites} />}
          {board.fieldDays.length ? <FieldDaysPanel days={board.fieldDays} onReview={(id, action, note) => void reviewDay(id, action, note)} /> : null}
          {reviewerOnly ? null : <Panel>
            <ValidatedForm key={hrFormKey} className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "hr" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => void addReviewer(event)}>
              <Field label="HR name"><input className={controlClass} name="name" minLength={2} required /></Field>
              <Field label="HR email"><input className={controlClass} name="email" type="email" required /></Field>
              <Field label="HR phone"><input className={controlClass} name="phone" minLength={8} maxLength={20} required /></Field>
              <Field label="HR password"><input className={controlClass} name="password" type="password" minLength={8} pattern={passwordPattern} title={passwordHint} required /></Field>
              <div className="md:col-span-2">
                <SearchSelect
                  label="Departments they review"
                  name="departmentIds"
                  options={board.departments}
                  placeholder="All departments (leave empty)"
                  anotherPlaceholder="Add another department"
                  emptyMatch="No department matches."
                  emptyOptions="This company has no departments yet."
                  max={50}
                />
              </div>
              <div className="md:col-span-3"><PrimaryButton>Add HR reviewer</PrimaryButton></div>
            </ValidatedForm>
          </Panel>}
          {reviewerOnly || !board.reviewers.length ? null : <Panel>
            <h3 className="mb-1 font-medium">HR reviewers</h3>
            <p className="mb-3 text-sm text-slate-500">A reviewer limited to departments sees and reviews only those employees. Leave departments empty for a reviewer who covers everyone.</p>
            <DataTable
              columns={["Reviewer", "Email", "Departments", ""]}
              rows={board.reviewers.map((reviewer) => [
                reviewer.name,
                reviewer.email,
                reviewer.reviewDepartmentIds?.length
                  ? board.departments.filter((department) => reviewer.reviewDepartmentIds?.includes(department.id)).map((department) => department.name).join(", ")
                  : "All departments",
                <button key={reviewer.id} className="text-sm text-brand-800" type="button" onClick={() => { setEditingReviewer(reviewer); setMessage(""); }}>Edit</button>,
              ])}
            />
            {editingReviewer ? (
              <ValidatedForm key={editingReviewer.id} className="mt-4 grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "scope" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => void saveReviewerScope(event, editingReviewer)}>
                <div className="md:col-span-2">
                  <SearchSelect
                    label={`Departments ${editingReviewer.name} reviews`}
                    name="departmentIds"
                    options={board.departments}
                    initialIds={editingReviewer.reviewDepartmentIds || []}
                    placeholder="All departments (leave empty)"
                    anotherPlaceholder="Add another department"
                    emptyMatch="No department matches."
                    emptyOptions="This company has no departments yet."
                    max={50}
                  />
                </div>
                <div className="flex items-end gap-3">
                  <PrimaryButton>Save departments</PrimaryButton>
                  <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditingReviewer(null)}>Cancel</button>
                </div>
              </ValidatedForm>
            ) : null}
          </Panel>}
          {reviewerOnly ? null : <Panel>
            <ValidatedForm key={editingGateway?.id || `new-gateway-${gatewayFormKey}`} className="grid gap-3 md:grid-cols-3" serverErrors={errorOwner === "gateway" ? fieldErrors : EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={(event) => void saveGateway(event)}>
              <Field label="Gateway"><input className={controlClass} name="name" minLength={2} defaultValue={editingGateway?.name || ""} required /></Field>
              <Field label="Where">
                <select className={controlClass} name="zone" defaultValue={editingGateway?.zone || "FLOOR"}>
                  <option value="FLOOR">Floor</option>
                  {policy.pilotOneFloor && editingGateway?.zone !== "MEETING_ROOM" ? null : <option value="MEETING_ROOM">Meeting room</option>}
                  {policy.pilotOneFloor && editingGateway?.zone !== "CAFETERIA" ? null : <option value="CAFETERIA">Cafeteria</option>}
                  {policy.pilotOneFloor && editingGateway?.zone !== "CORRIDOR" ? null : <option value="CORRIDOR">Corridor</option>}
                  {policy.pilotOneFloor && editingGateway?.zone !== "OTHER" ? null : <option value="OTHER">Other</option>}
                </select>
              </Field>
              <Field label="Minimum signal (dBm, optional)">
                <input className={controlClass} name="minRssi" type="number" min={-110} max={-30} step={1} placeholder="e.g. -80" defaultValue={editingGateway?.minRssi ?? ""} />
              </Field>
              <p className="text-sm text-slate-500 md:col-span-3">Readings weaker than the minimum are kept but don&apos;t count, so a card heard faintly through a wall from the next room doesn&apos;t mark someone present.</p>
              <div className="flex items-end gap-3 md:col-span-3">
                <PrimaryButton>{editingGateway ? "Save changes" : "Add gateway"}</PrimaryButton>
                {editingGateway ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditingGateway(null)}>Cancel</button> : null}
              </div>
            </ValidatedForm>
          </Panel>}
          {silentGateways.length ? (
            <Notice>
              {silentGateways.map((gateway) => gateway.name).join(", ")} {silentGateways.length === 1 ? "has" : "have"} not been heard from in the last {board.policy.gatewaySilentMinutes} minutes. Readings from {silentGateways.length === 1 ? "that area" : "those areas"} may be missing, so new gaps there may be false.
            </Notice>
          ) : null}
          <Panel>
            <DataTable
              columns={reviewerOnly ? ["Gateway", "Where", "Last heard", "Health"] : ["Gateway", "Where", "Min signal", "Last heard", "Health", ""]}
              rows={board.gateways.map((gateway) => {
                const cells: ReactNode[] = [
                  gateway.name,
                  gateway.zone.replaceAll("_", " "),
                  heardAt(gateway.lastContactAt),
                  gateway.status === "INACTIVE" ? "Off" : <Badge key={`${gateway.id}-health`}>{healthLabel[gateway.health]}</Badge>,
                ];
                if (reviewerOnly) return cells;
                cells.splice(2, 0, gateway.minRssi != null ? `${gateway.minRssi} dBm` : "Any");
                cells.push(<button key={gateway.id} className="text-sm text-brand-800" type="button" onClick={() => { setEditingGateway(gateway); setMessage(""); }}>Edit</button>);
                return cells;
              })}
            />
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
              <Field label="Signal (dBm, optional)"><input className={controlClass} name="rssi" type="number" min={-120} max={0} step={1} /></Field>
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
                    <button className="text-sm text-brand-800" type="button" onClick={() => void review(gap.id, "APPROVE")}>Approve</button>
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

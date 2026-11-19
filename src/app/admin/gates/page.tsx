"use client";

import { FormEvent, useEffect, useState } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import { EMPTY_FIELD_ERRORS } from "@/components/admin/form-error-context";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { Badge, DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords, useRecords } from "@/components/admin/use-records";
import { useScope } from "@/components/admin/shell";
import { api } from "@/lib/admin/api";

type Gate = { id: string; name: string };
type Student = { id: string; name: string; className: string; division?: string; studentCode?: string };
type GateNode = {
  id: string;
  gateId: string;
  gateName: string;
  name: string;
  side: "OUTSIDE" | "INSIDE";
  hardwareId: string;
  status: string;
  lastContactAt: string | null;
};
type GatePolicy = {
  cutOffTime: string;
  schoolEndTime: string;
  debounceMinutes: number;
  pairWindowSeconds: number;
  absenceAlertsEnabled: boolean;
};
type BoardStudent = {
  studentId: string;
  name: string;
  className: string;
  division: string;
  studentCode: string;
  presence: string;
  enteredAt: string | null;
  exitedAt: string | null;
  leftEarly: boolean;
  absenceAlertedAt: string | null;
};
type Board = {
  day: string;
  policy: GatePolicy;
  cutOffPassed: boolean;
  counts: { inCampus: number; notArrived: number; leftEarly: number; waiting: number; activeStudents: number };
  inCampus: BoardStudent[];
  notArrived: BoardStudent[];
  leftEarly: BoardStudent[];
  recentEvents: Array<{
    id: string;
    studentName: string;
    gateName: string;
    direction: string;
    source: string;
    reason: string;
    earlyExit: boolean;
    occurredAt: string;
  }>;
  nodes: GateNode[];
};

const defaultPolicy: GatePolicy = {
  cutOffTime: "08:30",
  schoolEndTime: "14:30",
  debounceMinutes: 3,
  pairWindowSeconds: 45,
  absenceAlertsEnabled: true,
};

function clock(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default function GatesPage() {
  const { schoolId, user } = useScope();
  const gates = usePagedRecords<Gate>("/api/v1/gates");
  const students = useRecords<Student>("/api/v1/students?limit=100");
  const { rows, error, reload } = gates;
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>(EMPTY_FIELD_ERRORS);
  const [nodeErrors, setNodeErrors] = useState<Record<string, string>>(EMPTY_FIELD_ERRORS);
  const [policyErrors, setPolicyErrors] = useState<Record<string, string>>(EMPTY_FIELD_ERRORS);
  const [overrideErrors, setOverrideErrors] = useState<Record<string, string>>(EMPTY_FIELD_ERRORS);
  const [editing, setEditing] = useState<Gate | null>(null);
  const [nodes, setNodes] = useState<GateNode[]>([]);
  const [policy, setPolicy] = useState<GatePolicy>(defaultPolicy);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardError, setBoardError] = useState("");
  const [overrideKey, setOverrideKey] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const scoped = !(user.role === "PLATFORM_ADMIN" && !schoolId);

  useEffect(() => {
    if (!scoped) return;
    let ignore = false;
    Promise.all([
      api<GateNode[]>("/api/v1/gate-nodes?limit=100", { school: true }),
      api<{ policy: GatePolicy }>("/api/v1/gates/policy", { school: true }),
      api<Board>("/api/v1/gates/board", { school: true }),
    ])
      .then(([nodeResult, policyResult, boardResult]) => {
        if (ignore) return;
        setNodes(nodeResult.data);
        setPolicy(policyResult.data.policy);
        setBoard(boardResult.data);
        setBoardError("");
      })
      .catch((caught: unknown) => {
        if (!ignore) setBoardError(caught instanceof Error ? caught.message : "Could not load the gate board.");
      });
    const timer = window.setInterval(() => setRefresh((value) => value + 1), 15000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [scoped, schoolId, refresh, message]);

  function bump() {
    setRefresh((value) => value + 1);
  }

  async function onSubmitGate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setFieldErrors(EMPTY_FIELD_ERRORS);
    try {
      await api(editing ? `/api/v1/gates/${editing.id}` : "/api/v1/gates", {
        method: editing ? "PATCH" : "POST",
        body: { name: form.get("name"), schoolId },
      });
      formElement.reset();
      setEditing(null);
      setMessage("Gate saved.");
      await reload();
      bump();
    } catch (caught) {
      const result = failureOf(caught, "Could not save the gate.");
      setFieldErrors(result.fields);
      setMessage(result.message);
    }
  }

  async function removeGate(gate: Gate) {
    if (!window.confirm(`Delete ${gate.name} and its nodes?`)) return;
    try {
      await api(`/api/v1/gates/${gate.id}`, { method: "DELETE" });
      if (editing?.id === gate.id) setEditing(null);
      setMessage("Gate deleted.");
      await reload();
      bump();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the gate.");
    }
  }

  async function onSubmitNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setNodeErrors(EMPTY_FIELD_ERRORS);
    try {
      await api("/api/v1/gate-nodes", {
        method: "POST",
        body: {
          gateId: form.get("gateId"),
          name: form.get("name"),
          side: form.get("side"),
          hardwareId: form.get("hardwareId"),
          status: "ACTIVE",
          schoolId,
        },
      });
      formElement.reset();
      setMessage("Gate node saved.");
      bump();
    } catch (caught) {
      const result = failureOf(caught, "Could not save the node.");
      setNodeErrors(result.fields);
      setMessage(result.message);
    }
  }

  async function removeNode(node: GateNode) {
    if (!window.confirm(`Remove node ${node.name}?`)) return;
    try {
      await api(`/api/v1/gate-nodes/${node.id}`, { method: "DELETE" });
      setMessage("Node removed.");
      bump();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not remove the node.");
    }
  }

  async function onSubmitPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setPolicyErrors(EMPTY_FIELD_ERRORS);
    try {
      const result = await api<{ policy: GatePolicy }>("/api/v1/gates/policy", {
        method: "PATCH",
        body: { ...policy, schoolId },
      });
      setPolicy(result.data.policy);
      setMessage("Gate rules saved.");
      bump();
    } catch (caught) {
      const result = failureOf(caught, "Could not save the gate rules.");
      setPolicyErrors(result.fields);
      setMessage(result.message);
    }
  }

  async function onSubmitOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setOverrideErrors(EMPTY_FIELD_ERRORS);
    try {
      await api("/api/v1/gates/override", {
        method: "POST",
        body: {
          studentId: form.get("studentId"),
          gateId: form.get("gateId") || undefined,
          direction: form.get("direction"),
          reason: form.get("reason"),
          occurredAt: form.get("occurredAt") || undefined,
          schoolId,
        },
      });
      formElement.reset();
      setOverrideKey((value) => value + 1);
      setMessage("Manual entry/exit saved.");
      bump();
    } catch (caught) {
      const result = failureOf(caught, "Could not save the override.");
      setOverrideErrors(result.fields);
      setMessage(result.message);
    }
  }

  async function sendAbsence() {
    setMessage("");
    try {
      const result = await api<{ sent: number; notArrived: number }>("/api/v1/gates/absence-alerts", {
        method: "POST",
        body: { schoolId },
      });
      setMessage(`Absence alerts sent to ${result.data.sent} of ${result.data.notArrived} not-arrived students.`);
      bump();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not send absence alerts.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="School gates"
        subtitle="Two nodes per gate (outside and inside) decide entry and exit. Parents get a push when a student enters or leaves."
      />
      {user.role === "PLATFORM_ADMIN" && !schoolId ? <Notice>Select a school in the header first.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {boardError ? <Notice>{boardError}</Notice> : null}
      {message ? (
        <Notice tone={/saved|deleted|removed|sent|Manual/i.test(message) ? "ok" : "error"}>{message}</Notice>
      ) : null}

      {scoped && board ? (
        <Panel>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-medium">Live gate board · {board.day}</h3>
              <p className="text-sm text-slate-500">
                Cut-off {board.policy.cutOffTime}
                {board.cutOffPassed ? " has passed" : " not yet"}. School ends {board.policy.schoolEndTime}.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              onClick={() => void sendAbsence()}
            >
              Send absence alerts
            </button>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm"><div className="text-slate-500">In campus</div><div className="text-xl font-semibold">{board.counts.inCampus}</div></div>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm"><div className="text-slate-500">Not arrived</div><div className="text-xl font-semibold">{board.counts.notArrived}</div></div>
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm"><div className="text-slate-500">Left early</div><div className="text-xl font-semibold">{board.counts.leftEarly}</div></div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><div className="text-slate-500">Active students</div><div className="text-xl font-semibold">{board.counts.activeStudents}</div></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <h4 className="mb-2 text-sm font-medium">In campus now</h4>
              <DataTable
                columns={["Student", "Entered"]}
                rows={board.inCampus.map((row) => [`${row.name} (${row.className}${row.division ? `-${row.division}` : ""})`, clock(row.enteredAt)])}
              />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium">Not arrived</h4>
              <DataTable
                columns={["Student", "Alert"]}
                rows={board.notArrived.map((row) => [
                  `${row.name} (${row.className}${row.division ? `-${row.division}` : ""})`,
                  row.absenceAlertedAt ? "Sent" : "—",
                ])}
              />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium">Left early</h4>
              <DataTable
                columns={["Student", "Exited"]}
                rows={board.leftEarly.map((row) => [`${row.name} (${row.className}${row.division ? `-${row.division}` : ""})`, clock(row.exitedAt)])}
              />
            </div>
          </div>
        </Panel>
      ) : null}

      {scoped ? (
        <Panel>
          <h3 className="mb-3 font-medium">Gate rules</h3>
          <ValidatedForm className="grid gap-3 md:grid-cols-3" serverErrors={policyErrors} onInvalid={() => setMessage("")} onSubmit={onSubmitPolicy}>
            <Field label="Arrival cut-off (HH:mm)">
              <input className={controlClass} value={policy.cutOffTime} onChange={(event) => setPolicy({ ...policy, cutOffTime: event.target.value })} required />
            </Field>
            <Field label="School end (HH:mm)">
              <input className={controlClass} value={policy.schoolEndTime} onChange={(event) => setPolicy({ ...policy, schoolEndTime: event.target.value })} required />
            </Field>
            <Field label="Debounce (minutes)">
              <input className={controlClass} type="number" min={1} max={60} value={policy.debounceMinutes} onChange={(event) => setPolicy({ ...policy, debounceMinutes: Number(event.target.value) })} required />
            </Field>
            <Field label="Pair window (seconds)">
              <input className={controlClass} type="number" min={5} max={300} value={policy.pairWindowSeconds} onChange={(event) => setPolicy({ ...policy, pairWindowSeconds: Number(event.target.value) })} required />
            </Field>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" checked={policy.absenceAlertsEnabled} onChange={(event) => setPolicy({ ...policy, absenceAlertsEnabled: event.target.checked })} />
              Allow absence alerts after cut-off
            </label>
            <div className="md:col-span-3">
              <PrimaryButton>Save gate rules</PrimaryButton>
            </div>
          </ValidatedForm>
        </Panel>
      ) : null}

      <Panel>
        <h3 className="mb-3 font-medium">{editing ? "Edit gate" : "Add gate"}</h3>
        <ValidatedForm key={editing?.id || "new"} className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={onSubmitGate}>
          <Field label="Gate name"><input className={controlClass} name="name" minLength={2} defaultValue={editing?.name || ""} required /></Field>
          <div className="flex items-end gap-3 md:col-span-3">
            <PrimaryButton>{editing ? "Save changes" : "Add gate"}</PrimaryButton>
            {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => setEditing(null)}>Cancel</button> : null}
          </div>
        </ValidatedForm>
      </Panel>

      <Panel>
        <DataTable
          {...listControls(gates)}
          columns={["Gate", ""]}
          rows={rows.map((gate) => [
            gate.name,
            <RowActions key={gate.id} onEdit={() => { setEditing(gate); setMessage(""); setFieldErrors(EMPTY_FIELD_ERRORS); }} onDelete={() => { void removeGate(gate); }} />,
          ])}
        />
      </Panel>

      {scoped ? (
        <Panel>
          <h3 className="mb-1 font-medium">Gate nodes</h3>
          <p className="mb-3 text-sm text-slate-500">Each gate needs one outside and one inside node. Devices post to /api/v1/gate-nodes/ingest with header x-gate-node-key.</p>
          <ValidatedForm className="mb-4 grid gap-3 md:grid-cols-4" serverErrors={nodeErrors} onInvalid={() => setMessage("")} onSubmit={onSubmitNode}>
            <Field label="Gate">
              <select className={controlClass} name="gateId" required defaultValue="">
                <option value="" disabled>Choose gate</option>
                {rows.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}
              </select>
            </Field>
            <Field label="Node name"><input className={controlClass} name="name" minLength={2} required /></Field>
            <Field label="Side">
              <select className={controlClass} name="side" required defaultValue="OUTSIDE">
                <option value="OUTSIDE">Outside</option>
                <option value="INSIDE">Inside</option>
              </select>
            </Field>
            <Field label="Hardware id"><input className={controlClass} name="hardwareId" minLength={4} required /></Field>
            <div className="md:col-span-4"><PrimaryButton>Add node</PrimaryButton></div>
          </ValidatedForm>
          <DataTable
            columns={["Gate", "Node", "Side", "Hardware", "Last heard", ""]}
            rows={nodes.map((node) => [
              node.gateName,
              node.name,
              <Badge key={`${node.id}-side`}>{node.side === "OUTSIDE" ? "Outside" : "Inside"}</Badge>,
              node.hardwareId,
              clock(node.lastContactAt),
              <RowActions key={node.id} onDelete={() => { void removeNode(node); }} />,
            ])}
          />
        </Panel>
      ) : null}

      {scoped ? (
        <Panel>
          <h3 className="mb-3 font-medium">Manual entry / exit</h3>
          <ValidatedForm key={overrideKey} className="grid gap-3 md:grid-cols-3" serverErrors={overrideErrors} onInvalid={() => setMessage("")} onSubmit={onSubmitOverride}>
            <SearchSelect
              label="Student"
              name="studentId"
              single
              max={1}
              options={(students.rows || []).map((student) => ({
                id: student.id,
                name: student.name,
                detail: `${student.className}${student.division ? `-${student.division}` : ""} · ${student.studentCode || ""}`,
              }))}
              placeholder="Search student"
              anotherPlaceholder="Search student"
              emptyMatch="No matching student."
              emptyOptions="No students loaded."
            />
            <Field label="Gate (optional)">
              <select className={controlClass} name="gateId" defaultValue="">
                <option value="">No specific gate</option>
                {rows.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}
              </select>
            </Field>
            <Field label="Direction">
              <select className={controlClass} name="direction" required defaultValue="ENTRY">
                <option value="ENTRY">Entry</option>
                <option value="EXIT">Exit</option>
              </select>
            </Field>
            <Field label="When (optional)"><input className={controlClass} name="occurredAt" type="datetime-local" /></Field>
            <Field label="Reason"><input className={controlClass} name="reason" minLength={4} required placeholder="Forgotten or dead card" /></Field>
            <div className="flex items-end"><PrimaryButton>Record override</PrimaryButton></div>
          </ValidatedForm>
        </Panel>
      ) : null}

      {scoped && board?.recentEvents?.length ? (
        <Panel>
          <h3 className="mb-3 font-medium">Recent crossings</h3>
          <DataTable
            columns={["When", "Student", "Gate", "Direction", "Source"]}
            rows={board.recentEvents.map((event) => [
              clock(event.occurredAt),
              event.studentName,
              event.gateName || "—",
              event.earlyExit ? "Exit (early)" : event.direction === "ENTRY" ? "Entry" : "Exit",
              event.source === "MANUAL" ? `Manual${event.reason ? `: ${event.reason}` : ""}` : "Nodes",
            ])}
          />
        </Panel>
      ) : null}
    </div>
  );
}

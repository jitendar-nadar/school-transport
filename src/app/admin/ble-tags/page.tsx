"use client";

import { FormEvent, useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords, useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type StudentRef = { id?: string; name?: string; studentCode?: string; className?: string; division?: string };
type Tag = {
  id: string;
  tagIdentifier: string;
  status: string;
  batteryStatus: string;
  studentId?: StudentRef | string | null;
};
type Student = { id: string; name: string; studentCode?: string; className?: string; division?: string };

function classAndDivision(student?: { className?: string; division?: string } | null) {
  return [student?.className, student?.division].filter(Boolean).join("-");
}

function studentOptionLabel(student: { name: string; studentCode?: string; className?: string; division?: string }) {
  const room = classAndDivision(student);
  return [student.name, room, student.studentCode].filter(Boolean).join(" · ");
}

function studentIdOf(tag: Tag) {
  if (!tag.studentId) return "";
  if (typeof tag.studentId === "string") return tag.studentId;
  return tag.studentId.id || "";
}

function assignedStudent(tag: Tag) {
  return typeof tag.studentId === "object" && tag.studentId ? tag.studentId : null;
}

function statusChoices(current: string) {
  const choices = ["ACTIVE", "UNASSIGNED", "INACTIVE"];
  if (current && !choices.includes(current)) choices.push(current);
  return choices;
}

export default function BlePage() {
  const tags = usePagedRecords<Tag>("/api/v1/ble-tags");
  const assignable = useRecords<Tag>("/api/v1/ble-tags?limit=100");
  const students = useRecords<Student>("/api/v1/students?limit=100");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("ok");

  function report(text: string, nextTone: "ok" | "error" = "ok") {
    setMessage(text);
    setTone(nextTone);
  }

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/api/v1/ble-tags", { method: "POST", body: { tagIdentifier: form.get("tagIdentifier"), tagType: "CARD" } });
      formElement.reset();
      report("Card registered.");
      await Promise.all([tags.reload(), assignable.reload()]);
    } catch (caught) {
      report(caught instanceof Error ? caught.message : "Could not register the card.", "error");
    }
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(`/api/v1/ble-tags/${form.get("tagId")}/assign`, { method: "POST", body: { studentId: form.get("studentId") } });
      report("Card assigned.");
      await Promise.all([tags.reload(), assignable.reload()]);
    } catch (caught) {
      report(caught instanceof Error ? caught.message : "Could not assign the card.", "error");
    }
  }

  async function changeStudent(tag: Tag, studentId: string) {
    if (studentId === studentIdOf(tag)) return;
    try {
      if (!studentId) {
        await api(`/api/v1/ble-tags/${tag.id}/unassign`, { method: "POST" });
        report("Student removed from the card.");
      } else {
        await api(`/api/v1/ble-tags/${tag.id}/assign`, { method: "POST", body: { studentId } });
        report("Student updated.");
      }
      await Promise.all([tags.reload(), assignable.reload()]);
    } catch (caught) {
      report(caught instanceof Error ? caught.message : "Could not update the student.", "error");
      await Promise.all([tags.reload(), assignable.reload()]);
    }
  }

  async function changeStatus(tag: Tag, status: string) {
    if (status === tag.status) return;
    try {
      if (status === "UNASSIGNED" && studentIdOf(tag)) {
        await api(`/api/v1/ble-tags/${tag.id}/unassign`, { method: "POST" });
      } else {
        await api(`/api/v1/ble-tags/${tag.id}`, { method: "PATCH", body: { status } });
      }
      report(status === "INACTIVE" ? "Card marked inactive. Assign a new card to the student." : "Card status saved.");
      await Promise.all([tags.reload(), assignable.reload()]);
    } catch (caught) {
      report(caught instanceof Error ? caught.message : "Could not update the card status.", "error");
      await Promise.all([tags.reload(), assignable.reload()]);
    }
  }

  async function removeTag(tag: Tag) {
    if (!window.confirm(`Delete ${tag.tagIdentifier}?`)) return;
    try {
      await api(`/api/v1/ble-tags/${tag.id}`, { method: "DELETE" });
      report("Card deleted.");
      await Promise.all([tags.reload(), assignable.reload()]);
    } catch (caught) {
      report(caught instanceof Error ? caught.message : "Could not delete the card.", "error");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="BLE cards" subtitle="Change the student on a card from the list. If a card is lost, mark it inactive, then assign a new card to that student." />
      {tags.error ? <Notice>{tags.error}</Notice> : null}
      {message ? <Notice tone={tone}>{message}</Notice> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <form className="grid gap-3" onSubmit={createTag}>
            <Field label="Tag identifier"><input className={controlClass} name="tagIdentifier" required /></Field>
            <PrimaryButton>Register card</PrimaryButton>
          </form>
        </Panel>
        <Panel>
          <form className="grid gap-3" onSubmit={assign}>
            <Field label="Card">
              <select className={controlClass} name="tagId" required>
                <option value="">Choose</option>
                {assignable.rows.map((tag) => <option key={tag.id} value={tag.id}>{tag.tagIdentifier}</option>)}
              </select>
            </Field>
            <Field label="Student">
              <select className={controlClass} name="studentId" required>
                <option value="">Choose</option>
                {students.rows.map((student) => <option key={student.id} value={student.id}>{studentOptionLabel(student)}</option>)}
              </select>
            </Field>
            <PrimaryButton>Assign</PrimaryButton>
          </form>
        </Panel>
      </div>
      <Panel>
        <DataTable
          {...listControls(tags)}
          columns={["Identifier", "Student", "Class", "Division", "Battery", "Status", ""]}
          rows={tags.rows.map((tag) => [
            tag.tagIdentifier,
            <select
              key={`${tag.id}-student`}
              className={controlClass}
              value={studentIdOf(tag)}
              onChange={(event) => changeStudent(tag, event.target.value)}
            >
              <option value="">Unassigned</option>
              {students.rows.map((student) => (
                <option key={student.id} value={student.id}>{studentOptionLabel(student)}</option>
              ))}
            </select>,
            assignedStudent(tag)?.className || "—",
            assignedStudent(tag)?.division || "—",
            tag.batteryStatus,
            <select
              key={`${tag.id}-status`}
              className={controlClass}
              value={tag.status}
              onChange={(event) => changeStatus(tag, event.target.value)}
            >
              {statusChoices(tag.status).map((status) => (
                <option key={status} value={status}>{status === "ACTIVE" ? "Active" : status === "UNASSIGNED" ? "Unassigned" : status === "INACTIVE" ? "Inactive" : status}</option>
              ))}
            </select>,
            <RowActions key={`${tag.id}-delete`} onDelete={() => { void removeTag(tag); }} />,
          ])}
        />
      </Panel>
    </div>
  );
}

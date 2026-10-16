"use client";

import { FormEvent, useState } from "react";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Tag = { id: string; tagIdentifier: string; status: string; batteryStatus: string; studentId?: { name?: string } | string | null };
type Student = { id: string; name: string };

export default function BlePage() {
  const tags = useRecords<Tag>("/api/v1/ble-tags?limit=100");
  const students = useRecords<Student>("/api/v1/students?limit=100");
  const [message, setMessage] = useState("");

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/api/v1/ble-tags", { method: "POST", body: { tagIdentifier: form.get("tagIdentifier"), tagType: "CARD" } });
      formElement.reset();
      setMessage("Card registered.");
      await tags.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not register the card.");
    }
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(`/api/v1/ble-tags/${form.get("tagId")}/assign`, { method: "POST", body: { studentId: form.get("studentId") } });
      setMessage("Card assigned.");
      await tags.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not assign the card.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="BLE cards" subtitle="An active card can belong to only one student. Detections alone never mark a student as boarded." />
      {tags.error ? <Notice>{tags.error}</Notice> : null}
      {message ? <Notice tone={message.includes("not") ? "error" : "ok"}>{message}</Notice> : null}
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
                {tags.rows.map((tag) => <option key={tag.id} value={tag.id}>{tag.tagIdentifier}</option>)}
              </select>
            </Field>
            <Field label="Student">
              <select className={controlClass} name="studentId" required>
                <option value="">Choose</option>
                {students.rows.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
              </select>
            </Field>
            <PrimaryButton>Assign</PrimaryButton>
          </form>
        </Panel>
      </div>
      <Panel>
        <DataTable
          columns={["Identifier", "Student", "Battery", "Status"]}
          rows={tags.rows.map((tag) => [
            tag.tagIdentifier,
            typeof tag.studentId === "object" && tag.studentId ? tag.studentId.name : "Unassigned",
            tag.batteryStatus,
            tag.status,
          ])}
        />
      </Panel>
    </div>
  );
}

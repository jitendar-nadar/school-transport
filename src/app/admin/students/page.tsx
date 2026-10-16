"use client";

import { FormEvent, useEffect, useState } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import { useScope } from "@/components/admin/shell";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Student = {
  id: string;
  name: string;
  studentCode: string;
  className: string;
  division: string;
  status: string;
  schoolId?: string;
  schoolName?: string;
  schoolCode?: string;
  parentConsent?: { granted?: boolean };
};
type Person = { id: string; name: string; email?: string; role: string };

export default function StudentsPage() {
  const { user, schoolId, schools, setSchoolId } = useScope();
  const isPlatformAdmin = user.role === "PLATFORM_ADMIN";
  const students = useRecords<Student>("/api/v1/students?limit=100");
  const parents = useRecords<Person>("/api/v1/users?limit=100&role=PARENT");
  const [chosenSchoolId, setChosenSchoolId] = useState(schoolId || "");
  const [message, setMessage] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const guardians = parents.rows.filter((person) => person.role === "PARENT");

  useEffect(() => {
    if (schoolId) setChosenSchoolId(schoolId);
  }, [schoolId]);

  function chooseSchool(id: string) {
    setChosenSchoolId(id);
    setSchoolId(id);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedSchoolId = isPlatformAdmin ? String(form.get("schoolId") || "") : schoolId || "";
    if (!selectedSchoolId) {
      setMessage("Select a school before adding a student.");
      return;
    }
    const parentIds = form.getAll("parentIds").map(String).filter(Boolean);
    try {
      await api("/api/v1/students", {
        method: "POST",
        body: {
          schoolId: selectedSchoolId,
          name: form.get("name"),
          studentCode: form.get("studentCode"),
          className: form.get("className"),
          division: form.get("division"),
          parentIds,
          parentConsent: { granted: form.get("consent") === "on" },
        },
      });
      formElement.reset();
      setFormVersion((version) => version + 1);
      setMessage("Student saved.");
      await students.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save the student.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Students"
        subtitle={isPlatformAdmin
          ? "Choose the school in the dropdown. The student is saved against that school. Tracking alerts require parent consent."
          : "Students are saved to your school. Tracking alerts require parent consent."}
      />
      {isPlatformAdmin && !chosenSchoolId ? <Notice>Select a school before adding a student.</Notice> : null}
      {students.error ? <Notice>{students.error}</Notice> : null}
      {message ? <Notice tone={message.includes("saved") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
          {isPlatformAdmin ? (
            <Field label="School">
              <select className={controlClass} name="schoolId" required value={chosenSchoolId} onChange={(event) => chooseSchool(event.target.value)}>
                <option value="">Select a school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>{school.name} · {school.schoolCode}</option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Name"><input className={controlClass} name="name" required /></Field>
          <Field label="Student code"><input className={controlClass} name="studentCode" required /></Field>
          <Field label="Class"><input className={controlClass} name="className" required /></Field>
          <Field label="Division"><input className={controlClass} name="division" /></Field>
          <SearchSelect
            key={`${chosenSchoolId}-${formVersion}`}
            label="Guardians"
            name="parentIds"
            options={guardians}
            placeholder="Search guardians"
            anotherPlaceholder="Search to add another guardian"
            emptyMatch="No guardians match that search."
            emptyOptions="Add a parent on People first."
            max={6}
          />
          <label className="flex items-center gap-2 text-sm md:col-span-3">
            <input name="consent" type="checkbox" />
            Parent consent granted for transport tracking
          </label>
          <div><PrimaryButton disabled={isPlatformAdmin && !chosenSchoolId}>Add student</PrimaryButton></div>
        </form>
      </Panel>
      <Panel>
        <DataTable
          columns={["Student", "Code", "Class", "School", "Consent", "Status"]}
          rows={students.rows.map((student) => [
            student.name,
            student.studentCode,
            `${student.className} ${student.division}`.trim(),
            student.schoolName ? `${student.schoolName}${student.schoolCode ? ` · ${student.schoolCode}` : ""}` : student.schoolId || "",
            student.parentConsent?.granted ? "Granted" : "Missing",
            student.status,
          ])}
        />
      </Panel>
    </div>
  );
}

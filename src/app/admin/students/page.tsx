"use client";

import { FormEvent, useEffect, useState } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import { useScope } from "@/components/admin/shell";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, RowActions, controlClass } from "@/components/admin/ui";
import { listControls, usePagedRecords, useRecords } from "@/components/admin/use-records";
import { api } from "@/lib/admin/api";

type Student = {
  id: string;
  name: string;
  studentCode: string;
  className: string;
  division: string;
  status: string;
  parentIds?: Array<{ id?: string } | string>;
  schoolId?: string;
  schoolName?: string;
  schoolCode?: string;
  parentConsent?: { granted?: boolean };
};
type Person = { id: string; name: string; email?: string; role: string };
type SchoolClass = { id: string; name: string; division: string };

export default function StudentsPage() {
  const { user, schoolId, schools, setSchoolId } = useScope();
  const isPlatformAdmin = user.role === "PLATFORM_ADMIN";
  const students = usePagedRecords<Student>("/api/v1/students");
  const parents = useRecords<Person>("/api/v1/users?limit=100&role=PARENT");
  const classes = useRecords<SchoolClass>("/api/v1/classes?limit=100");
  const [chosenSchoolId, setChosenSchoolId] = useState(schoolId || "");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formVersion, setFormVersion] = useState(0);
  const [className, setClassName] = useState("");
  const [editing, setEditing] = useState<Student | null>(null);
  const guardians = parents.rows.filter((person) => person.role === "PARENT");
  const classOptions = [...new Set(classes.rows.map((item) => item.name))].sort().map((name) => ({ id: name, name }));
  const divisionOptions = [...new Set(
    classes.rows.filter((item) => item.name === className && item.division).map((item) => item.division),
  )].sort().map((division) => ({ id: division, name: division }));

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
    setMessage("");
    const selectedSchoolId = isPlatformAdmin ? String(form.get("schoolId") || "") : schoolId || "";
    if (!selectedSchoolId) {
      setFieldErrors({ schoolId: "Select a school before adding a student." });
      return;
    }
    const parentIds = form.getAll("parentIds").map(String).filter(Boolean);
    const selectedClass = String(form.get("className") || "");
    if (!selectedClass) {
      setFieldErrors({ className: "Choose a class." });
      return;
    }
    setFieldErrors({});
    const body = {
      schoolId: selectedSchoolId,
      name: form.get("name"),
      studentCode: form.get("studentCode"),
      className: form.get("className"),
      division: form.get("division"),
      parentIds,
      parentConsent: { granted: form.get("consent") === "on" },
    };
    try {
      await api(editing ? `/api/v1/students/${editing.id}` : "/api/v1/students", {
        method: editing ? "PATCH" : "POST",
        body,
      });
      formElement.reset();
      setEditing(null);
      setClassName("");
      setFormVersion((version) => version + 1);
      setMessage("Student saved.");
      await students.reload();
    } catch (caught) {
      const result = failureOf(caught, "Could not save the student.");
      setFieldErrors(result.fields);
      setMessage(result.message);
    }
  }

  async function removeStudent(student: Student) {
    if (!window.confirm(`Delete ${student.name}?`)) return;
    try {
      await api(`/api/v1/students/${student.id}`, { method: "DELETE" });
      if (editing?.id === student.id) {
        setEditing(null);
        setClassName("");
      }
      setMessage("Student deleted.");
      await students.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete the student.");
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
      {message ? <Notice tone={message.includes("saved") || message.includes("deleted") ? "ok" : "error"}>{message}</Notice> : null}
      <Panel>
        <ValidatedForm key={`${editing?.id || "new"}-${formVersion}`} className="grid gap-3 md:grid-cols-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={onSubmit}>
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
          <Field label="Name"><input className={controlClass} name="name" minLength={2} maxLength={120} defaultValue={editing?.name || ""} required /></Field>
          <Field label="Student code"><input className={controlClass} name="studentCode" maxLength={40} defaultValue={editing?.studentCode || ""} required /></Field>
          <SearchSelect
            key={`class-${chosenSchoolId}-${editing?.id || "new"}-${formVersion}`}
            label="Class"
            name="className"
            initialIds={editing ? [editing.className] : []}
            options={classOptions}
            placeholder="Search classes"
            anotherPlaceholder="Search classes"
            emptyMatch="No classes match that search."
            emptyOptions="Add a class on Classes first."
            single
            max={1}
            onChange={(ids) => setClassName(ids[0] || "")}
          />
          <SearchSelect
            key={`division-${chosenSchoolId}-${className}-${editing?.id || "new"}-${formVersion}`}
            label="Division"
            name="division"
            initialIds={editing?.division ? [editing.division] : []}
            options={divisionOptions}
            placeholder={className ? "Search divisions" : "Choose a class first"}
            anotherPlaceholder="Search divisions"
            emptyMatch="No divisions match that search."
            emptyOptions={className ? "This class has no divisions." : "Choose a class first."}
            single
            max={1}
          />
          <SearchSelect
            key={`${chosenSchoolId}-${editing?.id || "new"}-${formVersion}`}
            label="Guardians"
            name="parentIds"
            initialIds={(editing?.parentIds || []).map((parent) => typeof parent === "string" ? parent : parent.id || "").filter(Boolean)}
            options={guardians}
            placeholder="Search guardians"
            anotherPlaceholder="Search to add another guardian"
            emptyMatch="No guardians match that search."
            emptyOptions="Add a parent on People first."
            max={6}
          />
          <label className="flex items-center gap-2 text-sm md:col-span-3">
            <input name="consent" type="checkbox" defaultChecked={Boolean(editing?.parentConsent?.granted)} />
            Parent consent granted for transport tracking
          </label>
          <div className="flex items-center gap-3">
            <PrimaryButton disabled={isPlatformAdmin && !chosenSchoolId}>{editing ? "Save changes" : "Add student"}</PrimaryButton>
            {editing ? <button className="text-sm text-slate-600 hover:underline" type="button" onClick={() => { setEditing(null); setClassName(""); setFormVersion((version) => version + 1); }}>Cancel</button> : null}
          </div>
        </ValidatedForm>
      </Panel>
      <Panel>
        <DataTable
          {...listControls(students)}
          columns={["Student", "Code", "Class", "School", "Consent", "Status", ""]}
          rows={students.rows.map((student) => [
            student.name,
            student.studentCode,
            `${student.className} ${student.division}`.trim(),
            student.schoolName ? `${student.schoolName}${student.schoolCode ? ` · ${student.schoolCode}` : ""}` : student.schoolId || "",
            student.parentConsent?.granted ? "Granted" : "Missing",
            student.status,
            <RowActions
              key={student.id}
              onEdit={() => { setEditing(student); setClassName(student.className); setMessage(""); setFieldErrors({}); }}
              onDelete={() => { void removeStudent(student); }}
            />,
          ])}
        />
      </Panel>
    </div>
  );
}

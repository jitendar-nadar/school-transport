"use client";

import { DataTable, PageHeader, Panel } from "@/components/admin/ui";
import { listControls, usePagedRecords } from "@/components/admin/use-records";

type NoticeRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  deliveryStatus: string;
  createdAt: string;
  studentId?: { name?: string };
};

export default function NotificationsPage() {
  const notes = usePagedRecords<NoticeRow>("/api/v1/notifications");
  return (
    <div className="space-y-5">
      <PageHeader title="Alerts" subtitle="Push delivery is best effort. This history is the authoritative record parents can also read from the API." />
      <Panel>
        <DataTable
          {...listControls(notes)}
          columns={["When", "Type", "Student", "Message", "Delivery"]}
          rows={notes.rows.map((note) => [
            new Date(note.createdAt).toLocaleString(),
            note.type,
            note.studentId?.name || "",
            note.body,
            note.deliveryStatus,
          ])}
        />
      </Panel>
    </div>
  );
}

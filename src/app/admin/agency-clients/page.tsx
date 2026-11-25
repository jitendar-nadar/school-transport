"use client";

import { FormEvent, useEffect, useState } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import { useScope } from "@/components/admin/shell";
import { clientTypeLabel, useAgencyClients, type AgencyClient } from "@/components/admin/use-agency-clients";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Notice, PageHeader, Panel, PrimaryButton } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";

type Option = { id: string; name: string; detail?: string };

export default function AgencyClientsPage() {
  const { user, agencyId } = useScope();
  const platform = user.role === "PLATFORM_ADMIN";
  const clients = useAgencyClients(agencyId);
  const [options, setOptions] = useState<Option[]>([]);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("ok");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!platform) return;
    api<Option[]>("/api/v1/agency-clients/options", { school: false })
      .then((result) => setOptions(result.data))
      .catch((caught: unknown) => {
        setTone("error");
        setMessage(caught instanceof Error ? caught.message : "Could not load schools and companies.");
      });
  }, [platform]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setFieldErrors({});
    setPending(true);
    try {
      const result = await api<AgencyClient[]>("/api/v1/agency-clients", {
        method: "PUT",
        school: false,
        body: { agencyId, clients: form.getAll("clients").map(String) },
      });
      clients.setClients(result.data);
      setVersion((value) => value + 1);
      setTone("ok");
      setMessage("Clients saved.");
    } catch (caught) {
      const result = failureOf(caught, "Could not save the clients.");
      setFieldErrors(result.fields);
      setTone("error");
      setMessage(result.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Clients" subtitle="The schools and companies this agency runs buses and vans for. Its vehicles and BLE cards can only go to these clients." />
      {!agencyId ? <Notice>Choose a transport agency in the header to see its clients.</Notice> : null}
      {clients.error ? <Notice>{clients.error}</Notice> : null}
      {message ? <Notice tone={tone}>{message}</Notice> : null}
      {agencyId && platform ? (
        <Panel>
          <ValidatedForm key={`${agencyId}-${version}-${clients.loading}`} className="grid gap-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={save}>
            <SearchSelect
              label="Schools and companies served"
              name="clients"
              max={200}
              initialIds={clients.clients.map((client) => client.key)}
              options={options}
              placeholder="Search schools and companies"
              anotherPlaceholder="Search to add another client"
              emptyMatch="No school or company matches that search."
              emptyOptions="Add a school or company on Entities first."
            />
            <p className="text-sm text-slate-500">Removing a client is refused while an agency vehicle still serves it or its students or employees still hold agency cards.</p>
            <div><PrimaryButton disabled={pending || clients.loading}>{pending ? "Saving…" : "Save clients"}</PrimaryButton></div>
          </ValidatedForm>
        </Panel>
      ) : null}
      {agencyId ? (
        <Panel>
          <DataTable
            columns={["Client", "Type", "Code", "Vehicles", "Cards issued", "Cards not mapped yet"]}
            empty={clients.loading ? "Loading…" : platform ? "No clients yet. Add them above." : "No clients yet. The platform admin links the schools and companies you serve."}
            rows={clients.clients.map((client) => [
              client.name,
              clientTypeLabel(client.type),
              client.code,
              String(client.vehicles),
              String(client.cardsIssued),
              String(client.cardsWaiting),
            ])}
          />
        </Panel>
      ) : null}
    </div>
  );
}

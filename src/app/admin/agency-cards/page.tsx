"use client";

import { FormEvent, useEffect, useState } from "react";
import { BleBulkUpload } from "@/components/admin/ble-bulk-upload";
import { EMPTY_FIELD_ERRORS } from "@/components/admin/form-error-context";
import { SearchSelect } from "@/components/admin/search-select";
import { useScope } from "@/components/admin/shell";
import { clientTypeLabel, useAgencyClients } from "@/components/admin/use-agency-clients";
import { listControls, usePagedRecords } from "@/components/admin/use-records";
import { failureOf, ValidatedForm } from "@/components/admin/validated-form";
import { DataTable, Field, Notice, PageHeader, Panel, PrimaryButton, controlClass } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/admin/api";
import { MAX_IMPORT_ROWS } from "@/modules/ble/ble-import";

type Card = {
  id: string;
  tagIdentifier: string;
  status: string;
  clientKey: string;
  clientType: string;
  clientName: string;
  holderName: string;
  holderCode: string;
  held: boolean;
};
type Person = { id: string; name: string; detail?: string };
type Problem = { row: number; tagIdentifier: string; message: string };

const statusLabels: Record<string, string> = { ACTIVE: "Active", UNASSIGNED: "Not in use", INACTIVE: "Inactive", LOST: "Lost", RETIRED: "Retired" };

function statusChoices(card: Card) {
  const choices = [card.held ? "ACTIVE" : "UNASSIGNED", "INACTIVE", "LOST", "RETIRED"];
  if (!choices.includes(card.status)) choices.unshift(card.status);
  return choices;
}

function usePeople(agencyId: string | null, client: string) {
  const [loaded, setLoaded] = useState<{ key: string; people: Person[] } | null>(null);
  const key = `${agencyId}|${client}`;
  useEffect(() => {
    if (!agencyId || !client) return;
    let ignore = false;
    api<Person[]>(`/api/v1/agency-cards/people?agencyId=${agencyId}&client=${encodeURIComponent(client)}`, { school: false })
      .then((result) => {
        if (!ignore) setLoaded({ key, people: result.data });
      })
      .catch(() => {
        if (!ignore) setLoaded({ key, people: [] });
      });
    return () => {
      ignore = true;
    };
  }, [agencyId, client, key]);
  return loaded?.key === key ? loaded.people : [];
}

export default function AgencyCardsPage() {
  const { agencyId } = useScope();
  const cards = usePagedRecords<Card>(agencyId ? `/api/v1/agency-cards?agencyId=${agencyId}` : null, false);
  const clients = useAgencyClients(agencyId);
  const [choices, setChoices] = useState<Card[]>([]);
  const [client, setClient] = useState("");
  const people = usePeople(agencyId, client);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("ok");
  const [problems, setProblems] = useState<Problem[]>([]);
  const [addMode, setAddMode] = useState<"paste" | "bulk">("paste");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [issueVersion, setIssueVersion] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const selectedClient = clients.clients.find((item) => item.key === client) || null;

  useEffect(() => {
    if (!agencyId) return;
    let ignore = false;
    api<Card[]>(`/api/v1/agency-cards?agencyId=${agencyId}&limit=100`, { school: false })
      .then((result) => {
        if (!ignore) setChoices(result.data.filter((card) => card.status !== "LOST" && card.status !== "RETIRED"));
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [agencyId, refreshKey]);

  function report(text: string, nextTone: "ok" | "error") {
    setMessage(text);
    setTone(nextTone);
  }

  async function refresh() {
    setRefreshKey((value) => value + 1);
    await Promise.all([cards.reload(), clients.reload()]);
  }

  async function addCards(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setProblems([]);
    try {
      const result = await api<{ created: number }>("/api/v1/agency-cards", { method: "POST", school: false, body: { agencyId, cards: form.get("cards") } });
      formElement.reset();
      report(`${result.data.created} ${result.data.created === 1 ? "card" : "cards"} added to stock.`, "ok");
      await refresh();
    } catch (caught) {
      const rows = caught instanceof ApiError ? (caught.details as { rows?: Problem[] } | null)?.rows : undefined;
      setProblems(rows && rows.length > 1 ? rows : []);
      report(caught instanceof Error ? caught.message : "Could not add the cards.", "error");
    }
  }

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFieldErrors({});
    setMessage("");
    const personId = String(form.get("personId") || "");
    try {
      await api(`/api/v1/agency-cards/${form.get("cardId")}/issue`, { method: "POST", school: false, body: { agencyId, client, personId } });
      report(personId ? "Card given to the person. It is active now." : `Card handed to ${selectedClient?.name || "the client"}. They can map it to a person.`, "ok");
      setIssueVersion((value) => value + 1);
      setClient("");
      await refresh();
    } catch (caught) {
      const result = failureOf(caught, "Could not give the card.");
      setFieldErrors(result.fields);
      if (result.message) report(result.message, "error");
    }
  }

  async function takeBack(card: Card) {
    if (!window.confirm(`Take ${card.tagIdentifier} back from ${card.clientName}?`)) return;
    try {
      await api(`/api/v1/agency-cards/${card.id}/return?agencyId=${agencyId}`, { method: "POST", school: false });
      report(`${card.tagIdentifier} is back in stock.`, "ok");
      await refresh();
    } catch (caught) {
      report(caught instanceof Error ? caught.message : "Could not take the card back.", "error");
    }
  }

  async function changeStatus(card: Card, status: string) {
    if (status === card.status) return;
    try {
      await api(`/api/v1/agency-cards/${card.id}`, { method: "PATCH", school: false, body: { agencyId, status } });
      report(status === "ACTIVE" || status === "UNASSIGNED" ? "Card status saved." : `${card.tagIdentifier} marked ${statusLabels[status].toLowerCase()}. Its person no longer has a card.`, "ok");
    } catch (caught) {
      report(caught instanceof Error ? caught.message : "Could not change the status.", "error");
    }
    await refresh();
  }

  async function remove(card: Card) {
    if (!window.confirm(`Delete ${card.tagIdentifier}?`)) return;
    try {
      await api(`/api/v1/agency-cards/${card.id}?agencyId=${agencyId}`, { method: "DELETE", school: false });
      report("Card deleted.", "ok");
      await refresh();
    } catch (caught) {
      report(caught instanceof Error ? caught.message : "Could not delete the card.", "error");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Agency cards" subtitle="BLE cards the agency owns. Give a card straight to a student or employee, or hand it to the school or company to map." />
      {!agencyId ? <Notice>Choose a transport agency in the header to manage its cards.</Notice> : null}
      {cards.error || clients.error ? <Notice>{cards.error || clients.error}</Notice> : null}
      {message ? <Notice tone={tone}>{message}</Notice> : null}
      {problems.length ? (
        <Panel>
          <ul className="space-y-1 text-sm text-red-800">
            {problems.slice(0, 20).map((problem) => (
              <li key={`${problem.row}-${problem.tagIdentifier}-${problem.message}`}>Line {problem.row}{problem.tagIdentifier ? ` (${problem.tagIdentifier})` : ""}: {problem.message}</li>
            ))}
            {problems.length > 20 ? <li>…and {problems.length - 20} more.</li> : null}
          </ul>
        </Panel>
      ) : null}
      {agencyId ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="How to add cards">
                {([["paste", "Type or paste"], ["bulk", "Bulk upload (CSV)"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${addMode === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                    type="button"
                    aria-pressed={addMode === value}
                    onClick={() => {
                      setAddMode(value);
                      setProblems([]);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {addMode === "paste" ? (
                <ValidatedForm className="grid gap-3" serverErrors={EMPTY_FIELD_ERRORS} onInvalid={() => setMessage("")} onSubmit={addCards}>
                  <Field label="Card ids">
                    <textarea className={`${controlClass} min-h-28 font-mono`} name="cards" required placeholder={"6C08A1B2\n6C08A1B3"} />
                  </Field>
                  <p className="text-sm text-slate-500">One card id per line, or separated by commas. Up to {MAX_IMPORT_ROWS} at a time. New cards go into stock.</p>
                  <div><PrimaryButton>Add cards</PrimaryButton></div>
                </ValidatedForm>
              ) : (
                <BleBulkUpload
                  agencyId={agencyId}
                  onImported={async (summary) => {
                    report(summary, "ok");
                    await refresh();
                  }}
                />
              )}
            </Panel>
            <Panel>
              <ValidatedForm key={issueVersion} className="grid gap-3" serverErrors={fieldErrors} onInvalid={() => setMessage("")} onSubmit={issue}>
                <Field label="Card">
                  <select className={controlClass} name="cardId" required>
                    <option value="">Choose</option>
                    {choices.map((card) => (
                      <option key={card.id} value={card.id}>{card.tagIdentifier} · {card.holderName ? `${card.clientName}, ${card.holderName}` : card.clientName}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Client">
                  <select className={controlClass} name="client" value={client} onChange={(event) => setClient(event.target.value)} required>
                    <option value="">Choose</option>
                    {clients.clients.map((item) => <option key={item.key} value={item.key}>{item.name} ({clientTypeLabel(item.type)})</option>)}
                  </select>
                </Field>
                <SearchSelect
                  key={client || "none"}
                  label={!selectedClient ? "Person (optional)" : selectedClient.type === "COMPANY" ? "Employee (optional)" : "Student (optional)"}
                  name="personId"
                  single
                  options={people}
                  placeholder={client ? "Search by name or code" : "Choose a client first"}
                  anotherPlaceholder="Search to change the person"
                  emptyMatch="Nobody matches that search."
                  emptyOptions={client ? "No active people at this client." : "Choose a client first."}
                />
                <p className="text-sm text-slate-500">Leave the person empty to hand the card to the client; their admin maps it on BLE cards or Cards and consent. A company reads the card only after the employee’s consent is recorded.</p>
                <div><PrimaryButton>Give card</PrimaryButton></div>
              </ValidatedForm>
            </Panel>
          </div>
          <Panel>
            <DataTable
              {...listControls(cards)}
              columns={["Card", "Client", "Person", "Status", ""]}
              empty="No cards yet."
              rows={cards.rows.map((card) => [
                card.tagIdentifier,
                card.clientType ? <span key={`${card.id}-client`}>{card.clientName}<span className="block text-xs text-slate-500">{clientTypeLabel(card.clientType)}</span></span> : card.clientName,
                card.held ? <span key={`${card.id}-holder`}>{card.holderName}{card.holderCode ? <span className="block text-xs text-slate-500">{card.holderCode}</span> : null}</span> : card.holderName || "—",
                <select key={`${card.id}-status`} className={controlClass} value={card.status} onChange={(event) => void changeStatus(card, event.target.value)} aria-label={`Status of ${card.tagIdentifier}`}>
                  {statusChoices(card).map((status) => <option key={status} value={status}>{statusLabels[status] || status}</option>)}
                </select>,
                card.clientKey ? (
                  <button key={`${card.id}-back`} className="whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50" type="button" onClick={() => void takeBack(card)}>Take back</button>
                ) : (
                  <button key={`${card.id}-delete`} className="rounded-md px-2 py-1 text-sm font-medium text-red-700 transition-colors hover:bg-red-50" type="button" onClick={() => void remove(card)}>Delete</button>
                ),
              ])}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/admin/api";

export type AgencyClient = {
  key: string;
  type: "SCHOOL" | "COMPANY";
  id: string;
  name: string;
  code: string;
  status: string;
  vehicles: number;
  cardsIssued: number;
  cardsWaiting: number;
};

export function clientTypeLabel(type: string) {
  return type === "SCHOOL" ? "School" : type === "COMPANY" ? "Company" : "";
}

export function useAgencyClients(agencyId: string | null) {
  const [loaded, setLoaded] = useState<{ agencyId: string; clients: AgencyClient[]; error: string } | null>(null);

  const fetchClients = useCallback(
    (id: string) =>
      api<AgencyClient[]>(`/api/v1/agency-clients?agencyId=${id}`, { school: false }).then(
        (result) => ({ agencyId: id, clients: result.data, error: "" }),
        (caught: unknown) => ({ agencyId: id, clients: [], error: caught instanceof Error ? caught.message : "Could not load the clients." }),
      ),
    [],
  );

  const load = useCallback(async (id: string) => {
    setLoaded(await fetchClients(id));
  }, [fetchClients]);

  useEffect(() => {
    if (!agencyId) return undefined;
    let ignore = false;
    fetchClients(agencyId).then((next) => {
      if (!ignore) setLoaded(next);
    });
    return () => {
      ignore = true;
    };
  }, [agencyId, fetchClients]);

  const current = loaded && loaded.agencyId === agencyId ? loaded : null;
  return {
    clients: current?.clients ?? [],
    error: current?.error ?? "",
    loading: Boolean(agencyId) && !current,
    reload: async () => {
      if (agencyId) await load(agencyId);
    },
    setClients: (clients: AgencyClient[]) => {
      if (agencyId) setLoaded({ agencyId, clients, error: "" });
    },
  };
}

"use client";

import { useEffect, useState } from "react";
import { useScope } from "@/components/admin/shell";
import { api } from "@/lib/admin/api";

export function useRecords<T>(path: string, schoolScoped = true) {
  const { schoolId, user } = useScope();
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const blocked = schoolScoped && user.role === "PLATFORM_ADMIN" && !schoolId;

  useEffect(() => {
    if (blocked) return;
    let ignore = false;
    api<T[]>(path, { school: schoolScoped })
      .then((result) => {
        if (ignore) return;
        setRows(result.data);
        setError("");
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        setError(caught instanceof Error ? caught.message : "Could not load records.");
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [blocked, path, schoolId, schoolScoped, user.role]);

  return {
    rows: blocked ? [] : rows,
    error: blocked ? "" : error,
    loading: blocked ? false : loading,
    reload: async () => {
      if (blocked) return;
      const result = await api<T[]>(path, { school: schoolScoped });
      setRows(result.data);
      setError("");
    },
    schoolId,
    user,
  };
}

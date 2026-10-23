"use client";

import { useEffect, useState } from "react";
import { useScope } from "@/components/admin/shell";
import { api } from "@/lib/admin/api";

export const PAGE_SIZE = 20;

export type PageMeta = { page: number; limit: number; total: number; totalPages: number };

const emptyMeta: PageMeta = { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

function pagedPath(path: string, page: number, search: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (search) url.searchParams.set("search", search);
  else url.searchParams.delete("search");
  return `${url.pathname}${url.search}`;
}

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

export function usePagedRecords<T>(path: string | null, schoolScoped = true) {
  const { schoolId, user } = useScope();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [needle, setNeedle] = useState("");
  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<PageMeta>(emptyMeta);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(path));
  const blocked = !path || (schoolScoped && user.role === "PLATFORM_ADMIN" && !schoolId);
  const requestPath = path ? pagedPath(path, page, needle) : "";

  useEffect(() => {
    setPage(1);
    setQuery("");
    setNeedle("");
  }, [path, schoolId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setNeedle(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [needle]);

  useEffect(() => {
    if (blocked) return;
    let ignore = false;
    setLoading(true);
    api<T[]>(requestPath, { school: schoolScoped })
      .then((result) => {
        if (ignore) return;
        const nextMeta = result.meta ?? { ...emptyMeta, total: result.data.length };
        setRows(result.data);
        setMeta(nextMeta);
        setError("");
        setLoading(false);
        if (nextMeta.totalPages > 0 && page > nextMeta.totalPages) setPage(nextMeta.totalPages);
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        setRows([]);
        setMeta(emptyMeta);
        setError(caught instanceof Error ? caught.message : "Could not load records.");
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [blocked, page, requestPath, schoolId, schoolScoped, user.role]);

  return {
    rows: blocked ? [] : rows,
    meta: blocked ? emptyMeta : meta,
    error: blocked ? "" : error,
    loading: blocked ? false : loading,
    page,
    setPage,
    query,
    setQuery,
    reload: async () => {
      if (blocked) return;
      const result = await api<T[]>(requestPath, { school: schoolScoped });
      const nextMeta = result.meta ?? { ...emptyMeta, total: result.data.length };
      setRows(result.data);
      setMeta(nextMeta);
      setError("");
      if (nextMeta.totalPages > 0 && page > nextMeta.totalPages) setPage(nextMeta.totalPages);
    },
    schoolId,
    user,
  };
}

export function listControls(list: {
  page: number;
  setPage: (page: number) => void;
  query: string;
  setQuery: (value: string) => void;
  meta: PageMeta;
}) {
  return {
    paging: {
      page: list.page,
      totalPages: list.meta.totalPages,
      total: list.meta.total,
      limit: list.meta.limit,
      onPage: list.setPage,
    },
    query: list.query,
    onQuery: list.setQuery,
  };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/admin/api";

type Loaded<T> = { key: string; data: T | null; error: string };

export function useResource<T>(path: string | null) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [version, setVersion] = useState(0);
  const key = `${path}|${version}`;

  useEffect(() => {
    if (!path) return;
    let ignore = false;
    api<T>(path, { school: false })
      .then((result) => {
        if (!ignore) setLoaded({ key, data: result.data, error: "" });
      })
      .catch((caught) => {
        if (!ignore) setLoaded({ key, data: null, error: caught instanceof Error ? caught.message : "Could not load this page." });
      });
    return () => {
      ignore = true;
    };
  }, [path, key]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const fresh = loaded?.key === key;
  return {
    data: loaded?.data ?? null,
    error: fresh ? loaded.error : "",
    loading: Boolean(path) && !fresh,
    ready: fresh,
    reload,
  };
}

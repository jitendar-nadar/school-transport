"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Building2, Check, ChevronsUpDown, LoaderCircle, Luggage, School, Search, Shapes, Truck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { easeOut } from "@/components/admin/motion";
import type { EntityKind } from "@/components/admin/nav";
import type { ScopedEntity } from "@/components/admin/shell";
import { api } from "@/lib/admin/api";

type Group = { key: string; label: string; single: string; kind: EntityKind; icon: LucideIcon; path: string; codeField: string; category?: string };

const groups: Group[] = [
  { key: "SCHOOL", label: "Schools", single: "School", kind: "SCHOOL", icon: School, path: "/api/v1/schools", codeField: "schoolCode" },
  { key: "COMPANY", label: "Companies", single: "Company", kind: "COMPANY", icon: Building2, path: "/api/v1/companies", codeField: "companyCode" },
  { key: "TRANSPORT", label: "Fleets", single: "Fleet", kind: "FLEET", icon: Truck, path: "/api/v1/fleets?category=TRANSPORT", codeField: "fleetCode", category: "TRANSPORT" },
  { key: "TOUR_TRAVEL", label: "Tour and travel", single: "Tour and travel", kind: "FLEET", icon: Luggage, path: "/api/v1/fleets?category=TOUR_TRAVEL", codeField: "fleetCode", category: "TOUR_TRAVEL" },
];

const PER_GROUP = 6;

type Row = { id: string; name: string; code: string; status: string };
type GroupResult = { rows: Row[]; total: number; error?: string };
type Loaded = { key: string; results: Record<string, GroupResult> };

const placeholders: Record<EntityKind, string> = { SCHOOL: "Choose a school", COMPANY: "Choose a company", FLEET: "Choose a fleet" };

function groupFor(kind: EntityKind | null, entity: ScopedEntity | null) {
  if (!kind) return null;
  if (kind === "FLEET") return groups.find((group) => group.category === (entity?.category === "TOUR_TRAVEL" ? "TOUR_TRAVEL" : "TRANSPORT")) || null;
  return groups.find((group) => group.kind === kind) || null;
}

async function loadGroup(group: Group, search: string): Promise<GroupResult> {
  const url = new URL(group.path, "http://localhost");
  url.searchParams.set("limit", String(PER_GROUP));
  if (search) url.searchParams.set("search", search);
  try {
    const result = await api<Array<Record<string, string>>>(`${url.pathname}${url.search}`, { school: false });
    return {
      rows: result.data.map((item) => ({ id: item.id, name: item.name, code: item[group.codeField] || "", status: item.status || "" })),
      total: result.meta?.total ?? result.data.length,
    };
  } catch (caught) {
    return { rows: [], total: 0, error: caught instanceof Error ? caught.message : `Could not load ${group.label.toLowerCase()}.` };
  }
}

export function EntitySwitcher({
  kind,
  selected,
  onSelect,
  onResolve,
}: {
  kind: EntityKind | null;
  selected: ScopedEntity | null;
  onSelect: (kind: EntityKind, entity: ScopedEntity) => void;
  onResolve: (kind: EntityKind, entity: ScopedEntity) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [needle, setNeedle] = useState("");
  const [opened, setOpened] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const requestKey = `${opened}|${needle}`;
  const loading = open && loaded?.key !== requestKey;
  const results = loaded?.results;
  const current = groupFor(kind, selected);
  const CurrentIcon = current?.icon || Shapes;

  useEffect(() => {
    const timer = window.setTimeout(() => setNeedle(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    Promise.all(groups.map((group) => loadGroup(group, needle))).then((list) => {
      if (ignore) return;
      setLoaded({ key: requestKey, results: Object.fromEntries(groups.map((group, index) => [group.key, list[index]])) });
      setActiveIndex(0);
    });
    return () => {
      ignore = true;
    };
  }, [open, needle, requestKey]);

  useEffect(() => {
    if (!selected || selected.name || !kind) return;
    const group = groupFor(kind, selected);
    if (!group) return;
    let ignore = false;
    api<Array<{ id: string; name: string }>>(`${group.path}${group.path.includes("?") ? "&" : "?"}limit=100`, { school: false }).then((result) => {
      const match = result.data.find((item) => item.id === selected.id);
      if (!ignore && match) onResolve(kind, { ...selected, name: match.name });
    }).catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [kind, selected, onResolve]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  const options = useMemo(
    () => groups.flatMap((group) => (results?.[group.key]?.rows || []).map((row) => ({ group, row }))),
    [results],
  );

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setQuery("");
    setNeedle("");
    setActiveIndex(0);
    setOpened((count) => count + 1);
    setOpen(true);
  }

  function choose(group: Group, row: Row) {
    onSelect(group.kind, { id: row.id, name: row.name, category: group.category });
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        className="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-2.5 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700/15 sm:w-72"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-800" aria-hidden="true"><CurrentIcon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">
            {selected ? selected.name || `Selected ${current?.single.toLowerCase() || "entity"}` : kind ? placeholders[kind] : "Choose an entity"}
          </span>
          <span className="block truncate text-[11px] uppercase tracking-[0.12em] text-slate-500">{selected && current ? current.single : "Entity"}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="absolute right-0 z-40 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(8,40,71,0.16)]"
            role="dialog"
            aria-label="Choose an entity"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: easeOut }}
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-3">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                autoFocus
                className="w-full bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Search schools, companies, fleets, operators"
                role="combobox"
                aria-label="Search entities"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(index - 1, 0));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    const option = options[activeIndex];
                    if (option) choose(option.group, option.row);
                  } else if (event.key === "Escape") {
                    setOpen(false);
                    buttonRef.current?.focus();
                  }
                }}
              />
              {loading ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-label="Loading" /> : null}
            </div>
            <div id={listId} role="listbox" aria-label="Entities" className="max-h-[min(60vh,28rem)] overflow-y-auto py-1">
              {groups.map((group) => {
                const result = results?.[group.key];
                const GroupIcon = group.icon;
                return (
                  <div key={group.key} role="group" aria-label={group.label} className="py-1">
                    <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <GroupIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        {group.label}
                      </span>
                      {result && result.total > result.rows.length ? <span className="text-[11px] text-slate-400">{result.rows.length} of {result.total}</span> : null}
                    </div>
                    {result?.error ? <p className="px-3 py-1.5 text-sm text-red-700">{result.error}</p> : null}
                    {result && !result.error && !result.rows.length ? (
                      <p className="px-3 py-1.5 text-sm text-slate-400">{needle ? "No matches." : `No ${group.label.toLowerCase()} yet.`}</p>
                    ) : null}
                    {!result && loading ? <p className="px-3 py-1.5 text-sm text-slate-400">Loading…</p> : null}
                    {result?.rows.map((row) => {
                      const index = options.findIndex((option) => option.group.key === group.key && option.row.id === row.id);
                      const isActive = index === activeIndex;
                      const isSelected = row.id === selected?.id;
                      return (
                        <button
                          key={row.id}
                          id={`${listId}-${index}`}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${isActive ? "bg-brand-50" : "hover:bg-slate-50"}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => choose(group, row)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-800">{row.name}</span>
                            <span className="block truncate text-xs text-slate-500">{[row.code, row.status].filter(Boolean).join(" · ")}</span>
                          </span>
                          {isSelected ? <Check className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                    {result && result.total > result.rows.length ? (
                      <p className="px-3 pb-1 pt-0.5 text-xs text-slate-400">Type to search the other {result.total - result.rows.length}.</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-slate-100 px-3 py-2">
              <Link className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-800 hover:underline" href="/admin/entities" onClick={() => setOpen(false)}>
                <Shapes className="h-4 w-4" aria-hidden="true" />
                Manage entities
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

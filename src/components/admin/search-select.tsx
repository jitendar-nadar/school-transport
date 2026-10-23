"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { controlClass } from "@/components/admin/ui";

type Option = { id: string; name: string; email?: string; detail?: string };

export function SearchSelect({
  label,
  name,
  options,
  placeholder,
  anotherPlaceholder,
  emptyMatch,
  emptyOptions,
  initialIds = [],
  max = 12,
  single = false,
  onChange,
}: {
  label: string;
  name: string;
  options: Option[];
  placeholder: string;
  anotherPlaceholder: string;
  emptyMatch: string;
  emptyOptions: string;
  initialIds?: string[];
  max?: number;
  single?: boolean;
  onChange?: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const notify = useRef(onChange);
  const mounted = useRef(false);
  notify.current = onChange;

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    notify.current?.(selectedIds);
  }, [selectedIds]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const selected = options.filter((person) => selectedIds.includes(person.id));
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((person) => {
      if (selectedIds.includes(person.id)) return false;
      if (!needle) return true;
      const extra = `${person.email || ""} ${person.detail || ""}`.toLowerCase();
      return person.name.toLowerCase().includes(needle) || extra.includes(needle);
    });
  }, [options, query, selectedIds]);

  function addOption(id: string) {
    setSelectedIds((current) => {
      if (single) return [id];
      return current.includes(id) || current.length >= max ? current : [...current, id];
    });
    setQuery("");
    setActiveIndex(0);
    setOpen(!single);
  }

  function removeOption(id: string) {
    setSelectedIds((current) => current.filter((item) => item !== id));
  }

  return (
    <div ref={rootRef} className="relative">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        className={controlClass}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={selected.length ? anotherPlaceholder : placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Escape") {
            setOpen(false);
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            const match = matches[activeIndex];
            if (match) addOption(match.id);
          }
        }}
      />
      {selected.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {selected.map((person) => (
            <button
              key={person.id}
              type="button"
              className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-900 transition hover:bg-teal-100"
              onClick={() => removeOption(person.id)}
            >
              {person.name} ×
            </button>
          ))}
        </div>
      ) : null}
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {open ? (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {matches.length ? (
            matches.map((person, index) => (
              <li key={person.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm transition-colors ${index === activeIndex ? "bg-teal-50" : "hover:bg-slate-50"}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    addOption(person.id);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="block font-medium text-slate-800">{person.name}</span>
                  {person.email || person.detail ? <span className="block text-xs text-slate-500">{person.email || person.detail}</span> : null}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-sm text-slate-500">
              {options.length === 0 ? emptyOptions : query.trim() ? emptyMatch : `All ${label.toLowerCase()} are already selected.`}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

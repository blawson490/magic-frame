"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/LocaleProvider";

type Entity = {
  entity_id: string;
  friendly_name: string;
  domain: string;
  state: string;
};

type Props = {
  id?: string;
  value: string;
  onChange: (entityId: string) => void;
  /** Optional list of domains to restrict suggestions to — e.g. ["light", "switch"]. */
  domains?: string[];
  placeholder?: string;
  className?: string;
  /** Show an × in the right of the input to clear the value. */
  clearable?: boolean;
};

// Module-level cache shared by every HAEntityInput on the page. Multiple
// inspectors with multiple entity inputs would otherwise each fire their own
// fetch — this de-dupes them.
let cachedEntities: Entity[] | null = null;
let cachedAt = 0;
let inflight: Promise<Entity[]> | null = null;

async function loadAllEntities(): Promise<Entity[]> {
  const now = Date.now();
  if (cachedEntities && now - cachedAt < 60_000) return cachedEntities;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/ha/entities", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data?.error) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const list: Entity[] = Array.isArray(data.entities) ? data.entities : [];
      cachedEntities = list;
      cachedAt = Date.now();
      return list;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export default function HAEntityInput({
  id,
  value,
  onChange,
  domains,
  placeholder,
  className,
  clearable = false,
}: Props) {
  const t = useT();
  const [query, setQuery] = useState(value);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes into the input (e.g. when the user picks
  // a different entity row in the parent inspector).
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Load + filter by domain whenever the domains prop changes.
  useEffect(() => {
    let cancelled = false;
    loadAllEntities()
      .then((all) => {
        if (cancelled) return;
        const filtered =
          domains && domains.length > 0
            ? all.filter((e) => domains.includes(e.domain))
            : all;
        setEntities(filtered);
        setLoadError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e?.message || "load failed");
      });
    return () => {
      cancelled = true;
    };
  }, [domains?.join(",")]);

  // Close on click-outside.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const q = query.toLowerCase().trim();
  // Limit gegen riesige DOM-Listen, aber großzügig genug, dass bei normalen
  // HA-Setups nichts wegfällt (issue #22: sensor.* wurde vom 100er-Limit
  // abgeschnitten, weil binary_sensor/automation alphabetisch davor liegen).
  const LIMIT = 200;
  let matches: Entity[];
  if (!q) {
    matches = entities.slice(0, LIMIT);
  } else {
    const startsWith = (e: Entity) =>
      e.entity_id.toLowerCase().startsWith(q) ||
      e.friendly_name.toLowerCase().startsWith(q);
    matches = entities
      .filter(
        (e) =>
          e.entity_id.toLowerCase().includes(q) ||
          e.friendly_name.toLowerCase().includes(q),
      )
      // Präfix-Treffer zuerst: sonst verdrängt "binary_sensor" die "sensor"-
      // Treffer im Limit (issue #22). Stabiler Sort → sonst Reihenfolge unverändert.
      .sort((a, b) => (startsWith(a) ? 0 : 1) - (startsWith(b) ? 0 : 1))
      .slice(0, LIMIT);
  }

  const commit = (entityId: string) => {
    onChange(entityId);
    setQuery(entityId);
    setOpen(false);
  };

  const baseClass =
    className ||
    "w-full bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] font-mono text-xs p-2 rounded focus:outline-none focus:border-cyan-500";

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          onChange(v);
          setOpen(true);
          setHighlightIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlightIdx((i) => Math.min(matches.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIdx((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && open && matches[highlightIdx]) {
            e.preventDefault();
            commit(matches[highlightIdx].entity_id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder || "light.kitchen_ceiling"}
        className={baseClass}
        autoComplete="off"
        spellCheck={false}
      />
      {clearable && query && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--mf-fg)]/40 hover:text-[var(--mf-fg)] text-base leading-none"
          aria-label={t("Eintrag löschen")}
          tabIndex={-1}
        >
          ×
        </button>
      )}
      {open && (matches.length > 0 || loadError) && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-[var(--mf-surface-2)] border border-[var(--mf-bdr)]/10 rounded-lg shadow-2xl">
          {loadError && (
            <div className="px-3 py-2 text-[11px] text-amber-300/80">
              {t("Entities konnten nicht geladen werden")}: {loadError}
            </div>
          )}
          {matches.map((e, idx) => (
            <button
              key={e.entity_id}
              type="button"
              onMouseEnter={() => setHighlightIdx(idx)}
              onClick={() => commit(e.entity_id)}
              className={`w-full text-left px-3 py-1.5 border-b border-[var(--mf-bdr)]/5 last:border-0 flex flex-col gap-0.5 ${
                idx === highlightIdx ? "bg-[var(--mf-elev)]/10" : "hover:bg-[var(--mf-elev)]/5"
              }`}
            >
              {/* Gestapelt statt nebeneinander: im schmalen Inspector-Feld
                  verdrängte die entity_id sonst den Friendly Name (issue #23).
                  Jetzt beide volle Breite, Friendly Name prominent oben. */}
              <span className="text-[var(--mf-fg)] text-xs truncate w-full">
                {e.friendly_name}
              </span>
              <span className="text-[var(--mf-fg)]/40 text-[10px] font-mono truncate w-full">
                {e.entity_id}
              </span>
            </button>
          ))}
          {matches.length === 0 && !loadError && (
            <div className="px-3 py-2 text-[11px] text-[var(--mf-fg)]/40">
              {t("Keine passenden Entities")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n/LocaleProvider";
import { ENTITY_ITEM_FIELDS, type EntityEntry, type EntityItemField } from "@/lib/modules/manifest";
import HAEntityInput from "./HAEntityInput";
import IconPicker from "./IconPicker";
import AccordionCard from "./AccordionCard";

type Slot = EntityEntry & { decimals?: number };
const INPUT = "w-full bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] text-sm rounded-lg px-3 h-10 focus:outline-none focus:border-blue-500";

/** Controlled values; row identities and expanded state remain editor-local. */
export default function EntityListEditor({ value, onChange, domains, itemFields = ENTITY_ITEM_FIELDS,
  legacySensor = false, placeholder }: {
  value: Slot[];
  onChange: (value: Slot[]) => void;
  domains?: string[];
  itemFields?: readonly EntityItemField[];
  legacySensor?: boolean;
  placeholder?: string;
}) {
  const t = useT();
  const prefix = useId();
  const [open, setOpen] = useState<string | null>(null);
  // Object identity survives immutable parent updates for untouched entries.
  // IDs move with entries, including duplicate and unfinished entity IDs.
  const [state, setState] = useState(() => ({ rows: value.map((slot, i) => ({ slot, id: `${prefix}-${i}` })), next: value.length }));
  const rows = state.rows;
  let next = state.next;
  const nextId = () => `${prefix}-${next++}`;
  let current = rows;
  if (rows.length !== value.length || rows.some((row, i) => row.slot !== value[i])) {
    current = value.map(slot => rows.find(row => row.slot === slot) ?? { slot, id: nextId() });
    setState({ rows: current, next });
  }
  const commit = (nextRows: typeof rows) => {
    setState({ rows: nextRows, next });
    onChange(nextRows.map(row => row.slot));
  };
  const update = (idx: number, key: keyof Slot, nextValue: string | number | undefined) => {
    commit(current.map((row, i) => {
      if (i !== idx) return row;
      const slot = { ...row.slot };
      if (nextValue === undefined) delete slot[key];
      else Object.assign(slot, { [key]: nextValue });
      return { ...row, slot };
    }));
  };
  const move = (idx: number, dir: number) => {
    const next = [...current];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
  };
  return <div className="space-y-3">
    {value.length === 0 && <p className="text-xs text-[var(--mf-fg)]/40 px-1">{t("Noch keine Sensoren — unten hinzufügen.")}</p>}
    {current.map(({ slot, id }, idx) => <AccordionCard
      key={id}
      open={open === id}
      onToggle={() => setOpen(open === id ? null : id)}
      title={slot.label?.trim() || slot.entityId || `${t("Sensor")} ${idx + 1}`}
      dotColor={slot.color || "#14b8a6"}
      onDelete={() => { commit(current.filter(row => row.id !== id)); if (open === id) setOpen(null); }}
      headerExtra={<div className="flex gap-0.5 shrink-0">
        {([-1, 1] as const).map(dir => <button key={dir} type="button"
          onClick={() => move(idx, dir)} disabled={dir < 0 ? idx === 0 : idx === current.length - 1}
          className="text-[var(--mf-fg)]/40 hover:text-[var(--mf-fg)] disabled:opacity-20 px-1.5 py-0.5 text-xs"
          title={t(dir < 0 ? "Nach oben" : "Nach unten")}>{dir < 0 ? "▲" : "▼"}</button>)}
      </div>}
    >
      <div className="space-y-3">
        <div><label htmlFor={`${id}-entity`} className="text-xs text-[var(--mf-fg)]/50">{t("Entity-ID")}</label>
          <HAEntityInput id={`${id}-entity`} value={slot.entityId || ""} onChange={v => update(idx, "entityId", v)}
            domains={domains} placeholder={placeholder || "sensor.pool_temperature"} clearable />
        </div>
        {itemFields.includes("icon") && <IconPicker label={t("Icon")} value={slot.icon || ""}
          onChange={v => update(idx, "icon", v || undefined)} placeholder="mdi:gauge" defaultPrefix="mdi" />}
        {itemFields.includes("color") && <div>
          <label htmlFor={`${id}-color`} className="text-xs text-[var(--mf-fg)]/50 block mb-1.5">{t("Icon-Farbe")}</label>
          <div className="flex items-center gap-2">
            <input id={`${id}-color`} type="color" value={slot.color || "#14b8a6"}
              onChange={e => update(idx, "color", e.target.value)}
              className="h-9 w-14 bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 rounded-lg cursor-pointer" />
            {slot.color ? <button type="button" onClick={() => update(idx, "color", undefined)}>{t("Standard")}</button>
              : <span className="text-xs text-[var(--mf-fg)]/40">{t("Standard (keine Farbe)")}</span>}
          </div>
        </div>}
        {itemFields.includes("name") && <label className="block">
          <span className="text-xs text-[var(--mf-fg)]/50">{t("Name")}</span>
          <input type="text" value={slot.label || ""} onChange={e => update(idx, "label", e.target.value || undefined)}
            placeholder={t("Label (leer = HA-Name)")} className={INPUT} />
        </label>}
        {itemFields.includes("unit") && <div className="space-y-2">
          {!legacySensor && <label className="block">
            <span className="text-xs text-[var(--mf-fg)]/50">{t("Einheitenmodus")}</span>
            <select className={INPUT} value={slot.unit === undefined ? "auto" : "custom"}
              onChange={e => update(idx, "unit", e.target.value === "auto" ? undefined : "")}>
              <option value="auto">{t("Auto")}</option><option value="custom">{t("Benutzerdefiniert")}</option>
            </select>
          </label>}
          {(legacySensor || slot.unit !== undefined) && <label className="block">
            <span className="text-xs text-[var(--mf-fg)]/50">{t(legacySensor ? "Einheit" : "Benutzerdefinierte Einheit")}</span>
            <input type="text" value={slot.unit ?? ""} onChange={e => update(idx, "unit", e.target.value)} placeholder="°C" className={INPUT} />
          </label>}
        </div>}
        {legacySensor && <label className="block">
          <span className="text-xs text-[var(--mf-fg)]/50">{t("Einheit / Nachkommastellen")}</span>
          <select className={INPUT} value={typeof slot.decimals === "number" ? String(slot.decimals) : "auto"}
            onChange={e => update(idx, "decimals", e.target.value === "auto" ? undefined : parseInt(e.target.value))}>
            <option value="auto">{t("Auto")}</option>{[0, 1, 2].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>}
      </div>
    </AccordionCard>)}
    <button type="button" onClick={() => {
      const id = nextId();
      commit([...current, { id, slot: { entityId: "" } }]);
      setOpen(id);
    }} className="w-full flex items-center justify-center gap-2 bg-[var(--mf-elev)]/10 hover:bg-[var(--mf-elev)]/20 text-[var(--mf-fg)] py-2.5 rounded-lg text-sm font-medium transition-colors">
      <Plus size={16} /> {t("Sensor hinzufügen")}
    </button>
  </div>;
}

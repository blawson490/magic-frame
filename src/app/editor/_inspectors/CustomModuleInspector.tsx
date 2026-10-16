"use client";

import { useEffect, useState } from "react";
import type { WidgetLayoutItem } from "../_types";
import { useT } from "@/lib/i18n/LocaleProvider";
import { isEntityList, type ModuleManifestField } from "@/lib/modules/manifest";
import HAEntityInput from "../_components/HAEntityInput";
import EntityListEditor from "../_components/EntityListEditor";

type ModuleDescriptor = {
  type: string;
  label: string;
  iconEmoji: string;
  description?: string;
  fields: ModuleManifestField[];
};

type Props = {
  widget: WidgetLayoutItem;
  updateConfig: (i: string, key: string, value: unknown) => void;
};

/**
 * Inspector für hochgeladene Custom-Module. Lädt das Manifest aus
 * /api/modules und rendert die im Manifest definierten Felder als
 * Input/Number/Boolean/Color/Textarea — abhängig vom field.type.
 */
export default function CustomModuleInspector({ widget, updateConfig }: Props) {
  const t = useT();
  const [mod, setMod] = useState<ModuleDescriptor | null>(null);
  const [error, setError] = useState<{ type: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/modules", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const found = (d.modules ?? []).find((m: ModuleDescriptor) => m.type === widget.type);
        if (found) {
          setMod(found);
          setError(null);
        } else {
          setError({ type: widget.type, message: t("Modul '{x}' nicht gefunden. Eventuell wurde es gelöscht oder deaktiviert.").replace("{x}", widget.type) });
        }
      })
      .catch((e) => { if (!cancelled) setError({ type: widget.type, message: e.message }); });
    return () => { cancelled = true; };
  }, [widget.type, t]);

  if (error?.type === widget.type) {
    return (
      <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
        {error.message}
      </div>
    );
  }
  if (!mod || mod.type !== widget.type) {
    return <div className="text-sm text-[var(--mf-fg)]/40">{t("Lade…")}</div>;
  }

  // Legacy primitive controls accept the module's historically free-form config.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: Record<string, any> = widget.config ?? {};

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--mf-fg)]/50 bg-[var(--mf-ovl)]/30 light:bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 rounded-lg p-3 flex items-start gap-2">
        <span className="text-base leading-none">{mod.iconEmoji}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[var(--mf-fg)]/80">{mod.label}</div>
          {mod.description && <p className="mt-1 text-[12px]">{mod.description}</p>}
          <code className="block mt-1 text-[10px] font-mono text-[var(--mf-fg)]/40">{mod.type}</code>
        </div>
      </div>

      {mod.fields.length === 0 ? (
        <p className="text-sm text-[var(--mf-fg)]/50">
          {t("Dieses Modul hat keine konfigurierbaren Felder.")}
        </p>
      ) : (
        mod.fields.map((f) => {
          const isHA = f.type === "ha-entity" || f.type === "ha-entities";
          const v = isHA && Object.hasOwn(config, f.key) ? config[f.key]
            : config[f.key] ?? f.default ?? (f.type === "ha-entities" ? [] : "");
          const inputId = `${widget.i}-${f.key}`;
          return (
            <div key={f.key}>
              <label htmlFor={f.type === "ha-entity" ? inputId : undefined} className="text-sm font-medium text-[var(--mf-fg)]/80 block mb-2">
                {f.label}
                {f.required ? "" : <span className="text-[var(--mf-fg)]/40 text-xs"> ({t("optional")})</span>}
              </label>
              {f.type === "ha-entities" ? (
                isEntityList(v) ? <EntityListEditor key={`${widget.i}-${f.key}`} value={v}
                  onChange={next => updateConfig(widget.i, f.key, next)} domains={f.domains}
                  itemFields={f.itemFields} placeholder={f.placeholder} />
                  : <p role="alert" className="text-sm text-red-400">{t("Ungültige Entity-Liste. Gespeicherte Daten bleiben unverändert.")}</p>
              ) : f.type === "ha-entity" ? (
                typeof v === "string" ? <HAEntityInput id={inputId} value={v} domains={f.domains} clearable
                  onChange={next => updateConfig(widget.i, f.key, next)} placeholder={f.placeholder} />
                  : <p role="alert" className="text-sm text-red-400">{t("Ungültige Entity-ID. Gespeicherte Daten bleiben unverändert.")}</p>
              ) : f.type === "textarea" ? (
                <textarea
                  value={v}
                  onChange={(e) => updateConfig(widget.i, f.key, e.target.value)}
                  placeholder={f.placeholder ?? ""}
                  rows={4}
                  className="w-full bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] text-sm rounded-lg p-3 focus:outline-none focus:border-indigo-500 font-mono"
                />
              ) : f.type === "boolean" ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!v}
                    onChange={(e) => updateConfig(widget.i, f.key, e.target.checked)}
                    className="accent-indigo-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-sm text-[var(--mf-fg)]/80">{f.placeholder ?? f.label}</span>
                </label>
              ) : f.type === "number" ? (
                <input
                  type="number"
                  value={v === "" ? "" : Number(v)}
                  onChange={(e) =>
                    updateConfig(widget.i, f.key, e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder={f.placeholder ?? ""}
                  className="w-full bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] text-sm rounded-lg p-3 focus:outline-none focus:border-indigo-500"
                />
              ) : f.type === "color" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={v || "#888888"}
                    onChange={(e) => updateConfig(widget.i, f.key, e.target.value)}
                    className="h-9 w-12 rounded border border-[var(--mf-bdr)]/10 bg-[var(--mf-surface)] cursor-pointer"
                  />
                  <input
                    type="text"
                    value={v}
                    onChange={(e) => updateConfig(widget.i, f.key, e.target.value)}
                    placeholder="#rrggbb"
                    className="flex-1 bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] text-sm rounded-lg p-3 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  {v && (
                    <button
                      onClick={() => updateConfig(widget.i, f.key, "")}
                      className="text-xs text-[var(--mf-fg)]/40 hover:text-[var(--mf-fg)] px-2 h-9"
                    >
                      ×
                    </button>
                  )}
                </div>
              ) : (
                <input
                  type={f.type === "url" ? "url" : "text"}
                  value={v}
                  onChange={(e) => updateConfig(widget.i, f.key, e.target.value)}
                  placeholder={f.placeholder ?? ""}
                  className="w-full bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] text-sm rounded-lg p-3 focus:outline-none focus:border-indigo-500"
                />
              )}
              {f.help && <p className="text-[11px] text-[var(--mf-fg)]/40 mt-1">{f.help}</p>}
            </div>
          );
        })
      )}
    </div>
  );
}

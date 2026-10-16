"use client";

import React from "react";
import type { EntityEntry } from "@/lib/modules/manifest";
import type { WidgetLayoutItem } from "../_types";
import { useT } from "@/lib/i18n/LocaleProvider";
import EntityListEditor from "../_components/EntityListEditor";

type Props = {
  widget: WidgetLayoutItem;
  updateConfig: (i: string, key: string, value: unknown) => void;
};

const INPUT =
  "w-full bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] text-sm rounded-lg px-3 h-10 focus:outline-none focus:border-blue-500";

export function SensorInspector({ widget, updateConfig }: Props) {
  const t = useT();
  // Sensor-specific keys are not represented by WidgetLayoutItem's shared config type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = (widget.config as any) ?? {};
  const design: string = cfg.design === "grid" ? "grid" : "cards";
  const iconFrame: boolean = cfg.iconFrame === true;
  const slots: (EntityEntry & { decimals?: number })[] = Array.isArray(cfg.entities) ? cfg.entities : [];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-[var(--mf-fg)]/80 block mb-2">{t("Darstellung")}</label>
          <select
            value={design}
            onChange={(e) => updateConfig(widget.i, "design", e.target.value)}
            className={INPUT}
          >
            <option value="cards">{t("Cards (Zeilen)")}</option>
            <option value="grid">{t("Kacheln (Grid)")}</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-[var(--mf-fg)]/80 block mb-2">{t("Kachel-Theme")}</label>
          <select
            value={cfg.cardTheme || "auto"}
            onChange={(e) => updateConfig(widget.i, "cardTheme", e.target.value)}
            className={INPUT}
          >
            <option value="auto">{t("Automatisch (folgt View)")}</option>
            <option value="dark">{t("Dunkel (Glas)")}</option>
            <option value="light">{t("Hell (weißes Glas)")}</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--mf-fg)]/50 mb-1.5 flex justify-between">
              <span>{t("Deckkraft")}</span>
              <span className="text-blue-400">{cfg.cardOpacity ?? 40}%</span>
            </label>
            <input
              type="range" min="0" max="100" step="5" value={cfg.cardOpacity ?? 40}
              onChange={(e) => updateConfig(widget.i, "cardOpacity", parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 bg-[var(--mf-elev)]/10"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--mf-fg)]/50 mb-1.5 flex justify-between">
              <span>{t("Unschärfe")}</span>
              <span className="text-blue-400">{cfg.cardBlur ?? 12}px</span>
            </label>
            <input
              type="range" min="0" max="40" step="2" value={cfg.cardBlur ?? 12}
              onChange={(e) => updateConfig(widget.i, "cardBlur", parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 bg-[var(--mf-elev)]/10"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={iconFrame}
              onChange={(e) => updateConfig(widget.i, "iconFrame", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[var(--mf-elev)]/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
          </div>
          <span className="text-sm font-medium text-[var(--mf-fg)]/80 group-hover:text-[var(--mf-fg)] transition-colors">{t("Icon mit Rahmen")}</span>
        </label>

        <div>
          <label className="text-sm font-medium text-[var(--mf-fg)]/80 mb-2 flex justify-between">
            <span>{t("Icon-Größe")}</span>
            <span className="text-blue-400">{Math.round((cfg.iconSize ?? 1) * 100)}%</span>
          </label>
          <input
            type="range" min="0.6" max="2.4" step="0.1" value={cfg.iconSize ?? 1}
            onChange={(e) => updateConfig(widget.i, "iconSize", parseFloat(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 bg-[var(--mf-elev)]/10"
          />
        </div>

        {iconFrame && (
          <div>
            <label className="text-sm font-medium text-[var(--mf-fg)]/80 mb-2 flex justify-between">
              <span>{t("Kasten-Größe")}</span>
              <span className="text-blue-400">{Math.round((cfg.frameScale ?? 1) * 100)}%</span>
            </label>
            <input
              type="range" min="0.6" max="2" step="0.1" value={cfg.frameScale ?? 1}
              onChange={(e) => updateConfig(widget.i, "frameScale", parseFloat(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 bg-[var(--mf-elev)]/10"
            />
          </div>
        )}
      </div>

      <EntityListEditor
        value={slots}
        onChange={(next) => updateConfig(widget.i, "entities", next)}
        legacySensor
      />

      <div className="border-t border-[var(--mf-bdr)]/10 pt-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={cfg.showSparkline === true}
              onChange={(e) => updateConfig(widget.i, "showSparkline", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[var(--mf-elev)]/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
          </div>
          <span className="text-sm font-medium text-[var(--mf-fg)]/80 group-hover:text-[var(--mf-fg)] transition-colors">{t("Verlauf anzeigen (Sparkline)")}</span>
        </label>
        {cfg.showSparkline === true && (
          <div>
            <label className="text-sm font-medium text-[var(--mf-fg)]/80 mb-2 flex justify-between">
              <span>{t("Zeitraum")}</span>
              <span className="text-blue-400">{cfg.sparklineHours ?? 6}h</span>
            </label>
            <input
              type="range" min="1" max="48" step="1" value={cfg.sparklineHours ?? 6}
              onChange={(e) => updateConfig(widget.i, "sparklineHours", parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 bg-[var(--mf-elev)]/10"
            />
            <p className="text-xs text-[var(--mf-fg)]/40 mt-1.5 px-1">
              {t("Nur Zahlen-Entities (Sensoren) haben einen sinnvollen Verlauf. HA-History muss aktiv sein.")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

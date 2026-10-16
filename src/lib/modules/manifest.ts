/** Client-safe custom-module contract. No database or runtime dependencies. */
export const ENTITY_ITEM_FIELDS = ["name", "color", "unit", "icon"] as const;
export type EntityItemField = typeof ENTITY_ITEM_FIELDS[number];
export type EntityEntry = {
  entityId: string;
  label?: string;
  icon?: string;
  color?: string;
  /** Absent = HA unit; empty string = intentionally hidden. */
  unit?: string;
};

type FieldBase = {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
};
export type ModuleManifestField = FieldBase & (
  | { type: "text" | "number" | "boolean" | "color" | "url" | "textarea"; default?: string | number | boolean }
  | { type: "ha-entity"; default?: string; domains?: string[] }
  | { type: "ha-entities"; default?: EntityEntry[]; domains?: string[]; itemFields?: EntityItemField[] }
);
export type ModuleManifest = {
  type: string;
  label: string;
  description?: string;
  iconEmoji?: string;
  version?: string;
  fields?: ModuleManifestField[];
  author?: string;
  homepage?: string;
};

export function isEntityEntry(value: unknown): value is EntityEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.entityId === "string" &&
    ["label", "icon", "color", "unit"].every(key => entry[key] === undefined || typeof entry[key] === "string");
}
export function isEntityList(value: unknown): value is EntityEntry[] {
  return Array.isArray(value) && value.every(isEntityEntry);
}

/** Clone nested defaults: widgets must never share mutable configuration. */
export function moduleFieldDefaults(fields: ModuleManifestField[]): Record<string, unknown> {
  return Object.fromEntries(fields.flatMap(field => {
    const value = field.default !== undefined ? field.default
      : field.type === "ha-entities" ? [] : field.type === "ha-entity" ? "" : undefined;
    return value === undefined ? [] : [[field.key, structuredClone(value)]];
  }));
}

export function parseManifest(raw: unknown): ModuleManifest {
  if (!raw || typeof raw !== "object") throw new Error("Manifest muss ein JSON-Objekt sein.");
  const m = raw as Record<string, unknown>;
  let type = String(m.type ?? "").trim();
  if (!type) throw new Error("Manifest: `type` fehlt.");
  if (!type.startsWith("custom:")) type = `custom:${type}`;
  if (!/^custom:[a-z0-9][a-z0-9_-]{0,63}$/i.test(type)) {
    throw new Error(`Manifest: ungültiger \`type\` "${type}" — nur a-z0-9_-, max 64 Zeichen.`);
  }
  const label = String(m.label ?? "").trim();
  if (!label) throw new Error("Manifest: `label` fehlt.");
  const rawFields = Array.isArray(m.fields) ? m.fields : [];
  const fields: ModuleManifestField[] = rawFields
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && !!(f as Record<string, unknown>).key)
    .map((f): ModuleManifestField => {
      const base = {
        key: String(f.key), label: String(f.label ?? f.key),
        placeholder: f.placeholder ? String(f.placeholder) : undefined,
        help: f.help ? String(f.help) : undefined, required: !!f.required,
      };
      if (f.type === "ha-entity" || f.type === "ha-entities") {
        const fail = (message: string): never => { throw new Error(`Manifest field '${base.key}': ${message}`); };
        if (f.domains !== undefined && (!Array.isArray(f.domains) ||
          !f.domains.every((d: unknown) => typeof d === "string" && d.trim().length > 0))) {
          fail("domains must be an array of nonempty strings.");
        }
        const domains = Array.isArray(f.domains) ? f.domains.map(d => String(d).trim()) : undefined;
        if (f.type === "ha-entity") {
          if (f.default !== undefined && typeof f.default !== "string") fail("default must be an entity ID string.");
          return { ...base, type: f.type, domains, default: f.default as string | undefined };
        }
        if (f.itemFields !== undefined && (!Array.isArray(f.itemFields) ||
          !f.itemFields.every((key: unknown) => ENTITY_ITEM_FIELDS.includes(key as EntityItemField)))) {
          fail("itemFields must contain only name, color, unit, or icon.");
        }
        if (f.default !== undefined && !isEntityList(f.default)) fail("default must be an array of entity entries with string overrides.");
        return { ...base, type: f.type, domains, itemFields: f.itemFields as EntityItemField[] | undefined, default: f.default as EntityEntry[] | undefined };
      }
      return {
        ...base,
        type: f.type === "number" || f.type === "boolean" || f.type === "color" || f.type === "url" || f.type === "textarea" ? f.type : "text",
        // Preserve historical permissive parsing for legacy fields.
        default: f.default as string | number | boolean | undefined,
      };
    });
  return {
    type, label,
    description: m.description ? String(m.description) : "",
    iconEmoji: m.iconEmoji ? String(m.iconEmoji).slice(0, 4) : "🧩",
    version: m.version ? String(m.version) : "1.0.0",
    fields,
    author: m.author ? String(m.author) : undefined,
    homepage: m.homepage ? String(m.homepage) : undefined,
  };
}

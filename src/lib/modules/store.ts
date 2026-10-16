import "server-only";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ModuleManifest } from "./manifest";
export { parseManifest } from "./manifest";
export type { ModuleManifest, ModuleManifestField } from "./manifest";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Manifest-Schema für hochgeladene Custom-Module.
 *
 * Wird beim Upload (POST /api/admin/modules) zusammen mit dem JS-Bundle
 * gespeichert. Felder werden vom Editor-Inspector dynamisch gerendert,
 * sodass jedes Modul seine eigenen Konfig-Felder definieren kann.
 */
export type CustomModuleRow = {
  id: string;
  type: string;
  label: string;
  description: string;
  iconEmoji: string;
  version: string;
  manifest: ModuleManifest;
  bundleSize: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function serialize(row: any): CustomModuleRow {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    description: row.description,
    iconEmoji: row.iconEmoji,
    version: row.version,
    manifest: JSON.parse(row.manifestJson),
    bundleSize: row.bundleJs.length,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listModules(opts?: { enabledOnly?: boolean }): Promise<CustomModuleRow[]> {
  const rows = await prisma.customModule.findMany({
    where: opts?.enabledOnly ? { enabled: true } : undefined,
    orderBy: { label: "asc" },
  });
  return rows.map(serialize);
}

export async function getModule(type: string): Promise<CustomModuleRow | null> {
  const row = await prisma.customModule.findUnique({ where: { type } });
  return row ? serialize(row) : null;
}

export async function getModuleBundle(type: string): Promise<string | null> {
  const row = await prisma.customModule.findUnique({
    where: { type },
    select: { bundleJs: true, enabled: true },
  });
  if (!row || !row.enabled) return null;
  return row.bundleJs;
}

export async function upsertModule(input: {
  manifest: ModuleManifest;
  bundleJs: string;
}): Promise<CustomModuleRow> {
  if (!input.bundleJs || input.bundleJs.length < 20) {
    throw new Error("Bundle leer oder zu kurz.");
  }
  if (input.bundleJs.length > 2 * 1024 * 1024) {
    throw new Error("Bundle > 2 MB — bitte schlanker bauen.");
  }
  if (!input.bundleJs.includes("registerWidget")) {
    throw new Error("Bundle ruft `MagicFrame.registerWidget(...)` nicht auf — falsch gebaut?");
  }
  const m = input.manifest;
  const row = await prisma.customModule.upsert({
    where: { type: m.type },
    create: {
      type: m.type,
      label: m.label,
      description: m.description ?? "",
      iconEmoji: m.iconEmoji ?? "🧩",
      version: m.version ?? "1.0.0",
      manifestJson: JSON.stringify(m),
      bundleJs: input.bundleJs,
      enabled: true,
    },
    update: {
      label: m.label,
      description: m.description ?? "",
      iconEmoji: m.iconEmoji ?? "🧩",
      version: m.version ?? "1.0.0",
      manifestJson: JSON.stringify(m),
      bundleJs: input.bundleJs,
    },
  });
  return serialize(row);
}

export async function setModuleEnabled(id: string, enabled: boolean): Promise<CustomModuleRow> {
  const row = await prisma.customModule.update({
    where: { id },
    data: { enabled },
  });
  return serialize(row);
}

export async function deleteModule(id: string): Promise<void> {
  await prisma.customModule.delete({ where: { id } });
}

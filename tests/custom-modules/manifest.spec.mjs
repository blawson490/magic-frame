import { test, expect } from "@playwright/test";
import { buildSync } from "esbuild";

const bundled = buildSync({ entryPoints: ["src/lib/modules/manifest.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { parseManifest, moduleFieldDefaults, isEntityList } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const parseField = field => parseManifest({ type: "test", label: "Test", fields: [{ key: "entities", ...field }] }).fields[0];

test("HA manifest fields survive JSON round trips with structured defaults", () => {
  const field = parseField({ type: "ha-entities", domains: ["sensor", "binary_sensor"], itemFields: ["name", "color", "unit", "icon"],
    default: [{ entityId: "sensor.test", label: "Room", icon: "mdi:gauge", color: "#123456", unit: "" }] });
  const manifest = parseManifest(JSON.parse(JSON.stringify({ type: "test", label: "Test", fields: [field] })));
  expect(manifest.type).toBe("custom:test");
  expect(manifest.fields[0]).toEqual(field);
  expect(parseField({ type: "ha-entity", default: "sensor.test", domains: [] }).default).toBe("sensor.test");
  expect(parseField({ type: "ha-entities", itemFields: [] }).itemFields).toEqual([]);
});

test("new field validation is specific and does not tighten primitive behavior", () => {
  for (const field of [
    { type: "ha-entities", domains: "sensor" }, { type: "ha-entity", domains: [""] },
    { type: "ha-entities", itemFields: ["unknown"] }, { type: "ha-entities", default: "sensor.test" },
    { type: "ha-entities", default: [{ entityId: "sensor.test", color: 10 }] },
    { type: "ha-entities", default: [{}] }, { type: "ha-entity", default: [] },
  ]) expect(() => parseField(field)).toThrow(/field 'entities'/);
  for (const type of ["text", "textarea", "number", "boolean", "color", "url"]) {
    expect(parseField({ type, default: "unchanged" })).toMatchObject({ type, default: "unchanged" });
  }
  expect(parseField({ type: "typo" }).type).toBe("text");
  expect(isEntityList([{ entityId: "", unit: "" }])).toBe(true);
  expect(isEntityList(null)).toBe(false);
});

test("defaults are independent per widget and explicit empty lists remain empty", () => {
  const fields = [parseField({ type: "ha-entities", default: [{ entityId: "sensor.test" }] })];
  const first = moduleFieldDefaults(fields), second = moduleFieldDefaults(fields);
  first.entities[0].label = "Changed";
  first.entities.push({ entityId: "sensor.other" });
  expect(second.entities).toEqual([{ entityId: "sensor.test" }]);
  expect(fields[0].default).toEqual([{ entityId: "sensor.test" }]);
  expect(moduleFieldDefaults([parseField({ type: "ha-entities", default: [] })]).entities).toEqual([]);
  expect(moduleFieldDefaults([parseField({ type: "ha-entities" })]).entities).toEqual([]);
  expect(moduleFieldDefaults([parseField({ type: "ha-entity" })]).entities).toBe("");
  expect(moduleFieldDefaults([parseField({ type: "text", default: null })]).entities).toBeNull();
});

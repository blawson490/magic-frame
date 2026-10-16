import { test, expect } from "@playwright/test";
import { buildSync } from "esbuild";

const exampleBundle = buildSync({ stdin: {
  contents: 'import render from "./examples/modules/ha-entities/ha-entities.js"; window.MagicFrame.registerWidget({type:"custom:fields",render});',
  resolveDir: process.cwd(),
}, bundle: true, write: false }).outputFiles[0].text;

const fields = [
  { key: "primary", label: "Primary entity", type: "ha-entity", domains: ["light"] },
  { key: "entities", label: "Readings", type: "ha-entities", domains: ["sensor", "binary_sensor"] },
];
async function setup(page, config = {}, declaredFields = fields, bundle) {
  let catalogRequests = 0;
  await page.route("**/api/modules", route => route.fulfill({ json: { modules: [{ type: "custom:fields", label: "Fields", iconEmoji: "🧪", fields: declaredFields }] } }));
  await page.route("**/api/modules/custom%3Afields/bundle.js?*", route => route.fulfill({ contentType: "application/javascript",
    body: bundle || 'window.MagicFrame.registerWidget({type:"custom:fields",render:ctx => { const [n] = ctx.useState(() => (window.fieldMounts = (window.fieldMounts || 0) + 1)); return ctx.createElement("pre",null,JSON.stringify(ctx.config)); }});' }));
  await page.route("**/api/ha/entities", route => { catalogRequests++; return route.fulfill({ json: { entities: [
    { entity_id: "sensor.temperature", friendly_name: "Temperature", domain: "sensor", state: "21" },
    { entity_id: "binary_sensor.door", friendly_name: "Door", domain: "binary_sensor", state: "off" },
    { entity_id: "light.kitchen", friendly_name: "Kitchen", domain: "light", state: "on" },
  ] } }); });
  await page.route("https://api.iconify.design/**", route => route.fulfill({ json: { icons: [] } }));
  await page.goto("/");
  await page.waitForFunction(() => !!window.harness);
  await page.evaluate(config => window.harness.update({ type: "custom:fields", config }), config);
  await expect(page.getByRole("button", { name: "Add sensor" })).toBeVisible();
  return () => catalogRequests;
}
const configOf = page => page.evaluate(() => window.harness.config());

test("single and list pickers filter domains, share catalog, allow typed IDs and clear", async ({ page }) => {
  const count = await setup(page, { unrelated: "keep" });
  await page.getByLabel("Primary entity", { exact: false }).fill("light.");
  await expect(page.getByRole("button", { name: /Kitchen light.kitchen/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Temperature sensor.temperature/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Kitchen light.kitchen/ }).click();
  await page.getByRole("button", { name: "Add sensor" }).click();
  await page.getByLabel("Entity ID", { exact: true }).fill("sensor.");
  await page.getByRole("button", { name: /Temperature sensor.temperature/ }).click();
  await page.getByLabel("Name", { exact: true }).fill("Room");
  await page.getByLabel("Icon color").fill("#123456");
  await page.getByPlaceholder("mdi:gauge").fill("mdi:thermometer");
  await expect(page.getByTestId("preview")).toContainText('"label":"Room"');
  await expect.poll(count).toBe(1);
  await page.getByLabel("Entity ID", { exact: true }).fill("sensor.manual");
  await page.getByLabel("Entity ID", { exact: true }).press("Escape");
  expect(await configOf(page)).toMatchObject({ unrelated: "keep", primary: "light.kitchen",
    entities: [{ entityId: "sensor.manual", label: "Room", color: "#123456", icon: "mdi:thermometer" }] });
  expect(await page.evaluate(() => window.fieldMounts)).toBe(1);
  await page.getByLabel("Clear entry").last().click();
  expect((await configOf(page)).entities[0].entityId).toBe("");
});

test("unit auto/custom distinction, reorder identity, removal, and JSON persistence", async ({ page }) => {
  await setup(page, { entities: [{ entityId: "sensor.a", label: "First" }, { entityId: "sensor.a", label: "Second" }] });
  await page.getByRole("button", { name: "First", exact: true }).click();
  await page.getByRole("combobox", { name: "Unit mode", exact: true }).selectOption("custom");
  expect((await configOf(page)).entities[0].unit).toBe("");
  await page.getByLabel("Custom unit", { exact: true }).fill("°F");
  expect((await configOf(page)).entities[0].unit).toBe("°F");
  await page.getByRole("combobox", { name: "Unit mode", exact: true }).selectOption("auto");
  expect((await configOf(page)).entities[0]).not.toHaveProperty("unit");
  await page.getByTitle("Move down").first().click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("First");
  await expect(page.getByRole("button", { name: "First", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.getByTitle("Delete", { exact: true }).first().click();
  expect((await configOf(page)).entities).toEqual([{ entityId: "sensor.a", label: "First" }]);
  const saved = JSON.parse(JSON.stringify(await configOf(page)));
  await page.reload();
  await page.waitForFunction(() => !!window.harness);
  await page.evaluate(config => window.harness.update({ type: "custom:fields", config }), saved);
  await expect(page.getByTestId("preview")).toContainText('"label":"First"');
  await page.getByTitle("Delete", { exact: true }).click();
  expect((await configOf(page)).entities).toEqual([]);
});

test("manifest-selected controls preserve hidden overrides and empty beats default", async ({ page }) => {
  await setup(page, { entities: [] }, [{ ...fields[1], itemFields: [], default: [{ entityId: "sensor.default" }] }]);
  await expect(page.getByRole("button", { name: "sensor.default", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add sensor" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Unit", { exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder("mdi:gauge")).toHaveCount(0);
  await page.evaluate(() => window.harness.update({ config: { entities: [{ entityId: "sensor.test", label: "Hidden", unit: "", icon: "mdi:gauge", color: "#123456" }] } }));
  await page.getByRole("button", { name: "Hidden", exact: true }).click();
  await page.getByLabel("Entity ID", { exact: true }).fill("sensor.changed");
  expect((await configOf(page)).entities[0]).toEqual({ entityId: "sensor.changed", label: "Hidden", unit: "", icon: "mdi:gauge", color: "#123456" });
});

test("malformed saved data is reported without overwriting it", async ({ page }) => {
  // setup waits for Add sensor, so first load valid values then replace them.
  await setup(page);
  await page.evaluate(() => window.harness.update({ config: { primary: null, entities: "sensor.old,sensor.other" } }));
  await expect(page.getByRole("alert")).toHaveCount(2);
  expect(await configOf(page)).toEqual({ primary: null, entities: "sensor.old,sensor.other" });
});

test("large catalogs keep suggestions bounded and search can find later entities", async ({ page }) => {
  await setup(page);
  const entities = Array.from({ length: 1000 }, (_, i) => ({ entity_id: `sensor.reading_${i}`, friendly_name: `Reading ${i}`, domain: "sensor", state: "1" }));
  await page.route("**/api/ha/entities", route => route.fulfill({ json: { entities } }));
  await page.reload();
  await page.waitForFunction(() => !!window.harness);
  await page.evaluate(() => window.harness.update({ type: "custom:fields", config: {} }));
  await page.getByRole("button", { name: "Add sensor" }).click();
  await page.getByLabel("Entity ID", { exact: true }).focus();
  await expect(page.getByRole("button", { name: /^Reading \d/ })).toHaveCount(200);
  await page.getByLabel("Entity ID", { exact: true }).fill("sensor.reading_999");
  await page.getByRole("button", { name: /Reading 999 sensor.reading_999/ }).click();
  expect((await configOf(page)).entities).toEqual([{ entityId: "sensor.reading_999" }]);
});

test("Sensor inspector retains legacy unit and decimal behavior", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => window.harness.update({ type: "SensorWidget.tsx", config: { design: "grid", entities: [{ entityId: "sensor.test", label: "Legacy", unit: "", decimals: 2 }] } }));
  await page.getByRole("button", { name: "Legacy", exact: true }).click();
  await expect(page.getByLabel("Unit", { exact: true })).toHaveValue("");
  await page.getByLabel("Unit / decimals").selectOption("1");
  expect(await configOf(page)).toMatchObject({ design: "grid", entities: [{ entityId: "sensor.test", unit: "", decimals: 1 }] });
});

test("real example never discovers on empty and deduplicates selected reads", async ({ page }) => {
  const reads = [];
  await page.route("**/api/ha/state?*", route => {
    reads.push(new URL(route.request().url()).searchParams.get("ids"));
    return route.fulfill({ json: { "sensor.temperature": { state: "21", attributes: { friendly_name: "Temperature", unit_of_measurement: "°C" } } } });
  });
  await setup(page, { entities: [] }, fields, exampleBundle);
  const preview = page.getByTestId("preview");
  await expect(preview).toContainText("Select an entity");
  expect(reads).toEqual([]);
  await page.evaluate(() => window.harness.update({ config: { entities: [
    { entityId: "sensor.temperature", label: "Auto unit" },
    { entityId: "sensor.temperature", label: "Hidden unit", unit: "", icon: "mdi:gauge", color: "#123456" },
    { entityId: "" },
  ] } }));
  await expect(preview).toContainText("21 °C");
  await expect(preview).toContainText("Hidden unit");
  await expect(preview).toContainText("mdi:gauge");
  expect(reads).toEqual(["sensor.temperature"]);
  await page.evaluate(() => window.harness.update({ config: { entities: [] } }));
  await expect(preview).toContainText("Select an entity");
  expect(reads).toEqual(["sensor.temperature"]);
  await page.evaluate(() => window.harness.update({ config: { __demo: true, entities: [{ entityId: "sensor.demo", unit: "units" }] } }));
  await expect(preview).toContainText("Sample data");
  await expect(preview).toContainText("21 units");
  expect(reads).toHaveLength(1);
});

test("inspector ignores late responses and errors from a different module", async ({ page }) => {
  await setup(page);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let started;
  const requested = new Promise(resolve => { started = resolve; });
  let calls = 0;
  await page.route("**/api/modules", async route => {
    if (++calls > 1) return route.fulfill({ json: { modules: [{ type: "custom:fields", label: "Fields", iconEmoji: "🧪", fields }] } });
    started();
    await pending;
    await route.fulfill({ json: { modules: [] } });
  });
  await page.evaluate(() => window.harness.update({ type: "custom:slow" }));
  await requested;
  await page.evaluate(() => window.harness.update({ type: "custom:fields" }));
  release();
  await expect(page.getByRole("button", { name: "Add sensor" })).toBeVisible();
  await expect(page.getByText(/Module 'custom:slow' not found/)).toHaveCount(0);
  await expect(page.getByText(/custom:slow.*not found/)).toHaveCount(0);
});

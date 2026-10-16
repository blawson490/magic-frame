import { test, expect } from "@playwright/test";
import { buildSync } from "esbuild";

const runtime = buildSync({ stdin: {
  contents: 'import render from "./examples/modules/ha-fields-qa/ha-fields-qa.js"; window.MagicFrame.registerWidget({type:"custom:ha-fields-qa",render});',
  resolveDir: process.cwd(),
}, bundle: true, write: false }).outputFiles[0].text;
const contract = buildSync({ stdin: {
  contents: 'import {manifest} from "./examples/modules/ha-fields-qa/ha-fields-qa.js"; import {parseManifest,moduleFieldDefaults} from "./src/lib/modules/manifest.ts"; export const descriptor=parseManifest(manifest); export const defaults=moduleFieldDefaults(descriptor.fields);',
  resolveDir: process.cwd(),
}, bundle: true, write: false, format: "esm", platform: "node" }).outputFiles[0].text;
const { descriptor, defaults } = await import(`data:text/javascript;base64,${Buffer.from(contract).toString("base64")}`);

async function openLab(page, overrides = {}, display = false) {
  await page.route("**/api/modules", route => route.fulfill({ json: { modules: [descriptor] } }));
  await page.route("**/api/modules/custom%3Aha-fields-qa/bundle.js?*", route => route.fulfill({ contentType: "application/javascript", body: runtime }));
  await page.route("**/api/ha/entities", route => route.fulfill({ json: { entities: [] } }));
  await page.goto("/");
  await page.waitForFunction(() => !!window.harness);
  await page.evaluate(({ config, display }) => window.harness.update({ type: "custom:ha-fields-qa", config, display }), { config: { ...defaults, ...overrides }, display });
  await expect(page.getByTestId("preview")).toContainText("HA Field Lab");
}

test("uploadable QA lab exercises full/limited fields, glyphs, and empty selections offline", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/ha/state?*", route => { reads++; return route.fulfill({ json: {} }); });
  await openLab(page);
  const preview = page.getByTestId("preview");
  await expect(preview).toContainText("SAMPLE DATA");
  await expect(preview).toContainText("2 rows · 2 unique IDs");
  await expect(preview).toContainText("21.5 °C");
  await expect(preview.locator('svg[aria-label="mdi:thermometer"]')).toHaveCount(1);
  await page.getByRole("button", { name: "sensor.qa_temperature", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Living room");
  await page.getByLabel("Icon color").fill("#ff0000");
  await page.getByPlaceholder("mdi:gauge").fill("mdi:gauge");
  await expect(preview).toContainText("Living room");
  await expect(preview.locator('svg[aria-label="mdi:gauge"]')).toHaveCSS("color", "rgb(255, 0, 0)");
  await page.getByRole("combobox", { name: "Unit mode", exact: true }).selectOption("custom");
  await expect(preview).not.toContainText("21.5 °C");
  await page.getByLabel("Custom unit").fill("widgets");
  await expect(preview).toContainText("21.5 widgets");
  await page.getByRole("checkbox", { name: "Show saved selections", exact: true }).check();
  await expect(preview).toContainText('"unit": "widgets"');

  const compact = page.locator("label").filter({ hasText: "Name and icon only" }).locator("..");
  await compact.getByRole("button", { name: "Add sensor" }).click();
  await compact.getByLabel("Entity ID", { exact: true }).fill("light.qa_lamp");
  await compact.getByLabel("Entity ID", { exact: true }).press("Escape");
  await expect(compact.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(compact.getByPlaceholder("mdi:gauge")).toBeVisible();
  await expect(compact.getByLabel("Icon color")).toHaveCount(0);
  await expect(compact.getByRole("combobox", { name: "Unit mode" })).toHaveCount(0);
  const idsOnly = page.locator("label").filter({ hasText: "Entity IDs only" }).locator("..");
  await idsOnly.getByRole("button", { name: "Add sensor" }).click();
  await idsOnly.getByLabel("Entity ID", { exact: true }).fill("sensor.qa_humidity");
  await expect(idsOnly.getByLabel("Name", { exact: true })).toHaveCount(0);
  await expect(idsOnly.getByPlaceholder("mdi:gauge")).toHaveCount(0);
  await expect(preview).toContainText("48 %");
  await page.evaluate(() => window.harness.update({ display: true }));
  await expect(preview).toContainText("SAMPLE DATA");
  await page.evaluate(() => window.harness.update({ config: { entities: [], compactEntities: [], idsOnly: [], primaryEntity: "" } }));
  await expect(preview).toContainText("No entities selected. Nothing is auto-discovered.");
  expect(reads).toBe(0);
});

test("QA lab reads selected live IDs once and handles missing/unavailable samples", async ({ page }) => {
  const reads = [];
  await page.route("**/api/ha/state?*", route => {
    reads.push(new URL(route.request().url()).searchParams.get("ids"));
    return route.fulfill({ json: { "sensor.real": { state: "27", attributes: { friendly_name: "Real reading", unit_of_measurement: "°C" } } } });
  });
  await openLab(page, { useSampleData: false, primaryEntity: "sensor.real", entities: [{ entityId: "sensor.real" }, { entityId: "sensor.real", unit: "", label: "Duplicate" }] }, true);
  const preview = page.getByTestId("preview");
  await expect(preview).toContainText("LIVE HA");
  await expect(preview).toContainText("27 °C");
  await expect(preview).toContainText("3 rows · 1 unique IDs");
  expect(reads).toEqual(["sensor.real"]);
  await page.evaluate(() => {
    const previous = window.harness.config();
    window.harness.update({ config: { ...previous, entities: [...previous.entities].reverse().map((entry, i) => ({ ...entry, label: `Edited ${i}` })) } });
  });
  await expect(preview).toContainText("Edited 0");
  // Allow passive effects to flush before checking that the host's new bound
  // fetch identity did not restart polling for a display-only config change.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(reads).toEqual(["sensor.real"]);
  await page.evaluate(() => window.harness.update({ config: { useSampleData: true, entities: [{ entityId: "sensor.qa_unavailable" }, { entityId: "sensor.qa_missing" }] } }));
  await expect(preview).toContainText("unavailable");
  await expect(preview).toContainText("Not found");
  expect(reads).toHaveLength(1);
});

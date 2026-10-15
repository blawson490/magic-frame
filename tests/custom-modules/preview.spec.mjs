import { test, expect } from "@playwright/test";

async function open(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.harness);
}
async function update(page, options) {
  await page.evaluate((next) => window.harness.update(next), options);
}
async function moduleRoute(page, type, render) {
  await page.route(`**/api/modules/${encodeURIComponent(type)}/bundle.js?*`, (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.MagicFrame.registerWidget({type:${JSON.stringify(type)},render:${render}});`,
  }));
}

test("example renders; inspector edits and sizing update without saving", async ({ page }) => {
  await open(page);
  const preview = page.getByTestId("preview");
  await expect(preview).toContainText("Hallo, Welt!");
  await page.locator('input[type="text"]').fill("Emma");
  await expect(preview).toContainText("Hallo, Emma!");
  await expect(preview.locator("[inert]")).toHaveCSS("container-type", "size");
  await page.locator('input[type="range"]').first().fill("50");
  await page.locator('input[type="range"]').nth(1).fill("400");
  await expect(preview.locator("[inert]")).toHaveCSS("height", "400px");
  const manual = await preview.locator("[inert]").boundingBox();
  expect(manual.width).toBeLessThan(200);
  await page.getByRole("button", { name: "1920×1080" }).click();
  await expect(preview.locator("[inert]")).toHaveCSS("width", "960px");
  await expect(preview.locator("[inert]")).toHaveCSS("height", "270px");
  const scaled = await preview.locator("[inert]").boundingBox();
  expect(scaled.width).toBeGreaterThan(0);
  expect(scaled.width).toBeLessThanOrEqual(400);
});

test("built-in text preview still renders and updates", async ({ page }) => {
  await open(page);
  await update(page, { type: "TextWidget.tsx", config: { text: "Built-in preview" } });
  await expect(page.getByTestId("preview")).toContainText("Built-in preview");
  await expect(page.getByTestId("preview").locator("[inert]")).toHaveCount(0);
  await update(page, { config: { text: "Updated built-in" } });
  await expect(page.getByTestId("preview")).toContainText("Updated built-in");
});

test("bridge receives config and dashboard, reads HA data and cleans effects", async ({ page }) => {
  await moduleRoute(page, "custom:bridge", `(ctx) => {
    const [state, setState] = ctx.useState("loading");
    ctx.useEffect(() => {
      let cancelled = false;
      const read = () => ctx.fetch("/api/ha/state?ids=" + ctx.config.entity)
        .then(r => r.json()).then(d => { if (!cancelled) setState(d[ctx.config.entity].state); });
      read();
      window.addEventListener("test-ha-state", read);
      window.testMounts = (window.testMounts || 0) + 1;
      return () => { cancelled = true; window.removeEventListener("test-ha-state", read); window.testCleanups = (window.testCleanups || 0) + 1; };
    }, [ctx.config.entity]);
    return ctx.createElement("p", null, JSON.stringify({state, config:ctx.config, dashboardId:ctx.dashboardId, preview:ctx.preview}));
  }`);
  let state = "21";
  await page.route("**/api/ha/state?*", (route) => route.fulfill({ json: { "sensor.temperature": { entity_id: "sensor.temperature", state } } }));
  await open(page);
  await update(page, { type: "custom:bridge", config: { entity: "sensor.temperature", label: "Room" } });
  const preview = page.getByTestId("preview");
  await expect(preview).toContainText('"state":"21"');
  await expect(preview).toContainText('"dashboardId":"test-view"');
  await expect(preview).toContainText('"preview":true');
  await update(page, { config: { entity: "sensor.temperature", label: "New room" } });
  await expect(preview).toContainText('"label":"New room"');
  expect(await page.evaluate(() => window.testMounts)).toBe(1);
  state = "22";
  await page.evaluate(() => window.dispatchEvent(new Event("test-ha-state")));
  await expect(preview).toContainText('"state":"22"');
  await page.evaluate(() => window.harness.unmount());
  expect(await page.evaluate(() => window.testCleanups)).toBe(1);
});

test("preview bridge refuses writes, including Request objects, and tile is inert", async ({ page }) => {
  let actions = 0;
  await page.route("**/api/ha/action", (route) => { actions++; return route.fulfill({ json: {} }); });
  await moduleRoute(page, "custom:actions", `(ctx) => {
    const [result, setResult] = ctx.useState("");
    ctx.useEffect(() => {
      Promise.all([
        ctx.fetch("/api/ha/action", {method:"POST"}),
        ctx.fetch(new Request(location.origin + "/api/ha/action", {method:"DELETE"})),
        ctx.fetch(new Request(location.origin + "/api/ha/action"), {method:"PUT"})
      ].map(p => p.then(() => "sent", e => e.message))).then(messages => setResult(messages.join(" | ")));
    }, []);
    return ctx.createElement("button", {onClick:() => window.testClicked = true}, result);
  }`);
  await open(page);
  await update(page, { type: "custom:actions" });
  const preview = page.getByTestId("preview");
  await expect(preview).toContainText("POST is disabled");
  await expect(preview).toContainText("DELETE is disabled");
  await expect(preview).toContainText("PUT is disabled");
  expect(actions).toBe(0);
  await preview.locator("[inert] button").evaluate((button) => button.focus());
  expect(await preview.locator("[inert] button").evaluate((button) => button === document.activeElement)).toBe(false);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => !!window.testClicked)).toBe(false);
});

test("display context keeps working writes and interactive buttons", async ({ page }) => {
  let actions = 0;
  await page.route("**/api/ha/action", (route) => { actions++; return route.fulfill({ json: {} }); });
  await moduleRoute(page, "custom:display", `(ctx) => ctx.createElement("button", {
    onClick:() => ctx.fetch("/api/ha/action", {method:"POST"})
  }, "preview=" + ctx.preview)`);
  await open(page);
  await update(page, { type: "custom:display", display: true });
  await page.getByRole("button", { name: "preview=false" }).click();
  await expect.poll(() => actions).toBe(1);
});

test("concurrent previews inject one script", async ({ page }) => {
  let count = 0;
  await page.route("**/api/modules/custom%3Aslow/bundle.js?*", async (route) => {
    count++;
    await new Promise(resolve => setTimeout(resolve, 200));
    await route.fulfill({ contentType: "application/javascript", body: 'window.MagicFrame.registerWidget({type:"custom:slow",render:ctx => ctx.createElement("p",null,"slow")});' });
  });
  await open(page);
  await update(page, { type: "custom:slow", duplicate: true });
  await expect(page.getByTestId("preview")).toContainText("Lade custom:slow");
  await expect(page.getByTestId("duplicate").locator("[inert]")).toHaveText("slow");
  expect(count).toBe(1);
  await update(page, { type: "custom:hello", duplicate: false });
  await expect(page.getByTestId("preview")).toContainText("Hallo, Welt!");
  await expect(page.locator('script[src*="custom%3Aslow"]')).toHaveCount(1);
  await update(page, { type: "custom:slow" });
  await expect(page.getByTestId("preview").locator("[inert]")).toHaveText("slow");
  expect(count).toBe(1);
});

test("asynchronous registration clears its callback after successful initialization", async ({ page }) => {
  await page.route("**/api/modules/custom%3Aasync/bundle.js?*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: 'setTimeout(() => window.MagicFrame.registerWidget({type:"custom:async",render:ctx => ctx.createElement("p",null,"initialized asynchronously")}), 50);',
  }));
  await open(page);
  await update(page, { type: "custom:async" });
  await expect(page.getByTestId("preview")).toContainText("initialized asynchronously");
  expect(await page.evaluate(() => window.MagicFrame._loadCallbacks.size)).toBe(0);
});

test("failed download can retry after remount; missing types show a useful error", async ({ page }) => {
  let count = 0;
  await page.route("**/api/modules/custom%3Aretry/bundle.js?*", (route) => {
    count++;
    return count === 1 ? route.fulfill({ status: 404 }) : route.fulfill({ contentType: "application/javascript", body: 'window.MagicFrame.registerWidget({type:"custom:retry",render:ctx => ctx.createElement("p",null,"recovered")});' });
  });
  await open(page);
  await update(page, { type: "custom:retry" });
  await expect(page.getByTestId("preview")).toContainText("Konnte Custom-Modul custom:retry nicht laden");
  await expect(page.locator('script[src*="custom%3Aretry"]')).toHaveCount(0);
  await update(page, { type: "custom:hello" });
  await expect(page.getByTestId("preview")).toContainText("Hallo");
  await update(page, { type: "custom:retry" });
  await expect(page.getByTestId("preview")).toContainText("recovered");
  expect(count).toBe(2);
});

test("initialization timeout cleans callbacks", async ({ page }) => {
  await page.route("**/api/modules/custom%3Abroken/bundle.js?*", (route) => route.fulfill({ contentType: "application/javascript", body: 'throw new Error("initialization failed");' }));
  await open(page);
  await update(page, { type: "custom:broken" });
  await expect(page.getByTestId("preview")).toContainText("hat sich in 5000ms nicht registriert", { timeout: 8000 });
  expect(await page.evaluate(() => window.MagicFrame._loadCallbacks.size)).toBe(0);
  await expect(page.locator('script[src*="custom%3Abroken"]')).toHaveCount(0);
  await page.unroute("**/api/modules/custom%3Abroken/bundle.js?*");
  await moduleRoute(page, "custom:broken", 'ctx => ctx.createElement("p", null, "initialized")');
  await update(page, { type: "custom:hello" });
  await expect(page.getByTestId("preview")).toContainText("Hallo");
  await update(page, { type: "custom:broken" });
  await expect(page.getByTestId("preview")).toContainText("initialized");
});

test("demo flag is opt-in and live mode preserves the current configuration", async ({ page }) => {
  await moduleRoute(page, "custom:demo", 'ctx => ctx.createElement("p", null, ctx.config.label + (ctx.config.__demo ? ":demo" : ":live"))');
  await open(page);
  await update(page, { type: "custom:demo", config: { label: "Room" } });
  const preview = page.getByTestId("preview");
  await expect(preview).toContainText("Room:live");
  await preview.getByRole("button", { name: /Sample data|Beispieldaten/ }).click();
  await expect(preview).toContainText("Room:demo");
  await preview.getByRole("button", { name: "Live", exact: true }).click();
  await expect(preview).toContainText("Room:live");
});

test("switching types discards a late result and gives each module its own hooks", async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route("**/api/modules/custom%3Alate/bundle.js?*", async (route) => {
    await pending;
    await route.fulfill({ contentType: "application/javascript", body: 'window.MagicFrame.registerWidget({type:"custom:late",render:ctx => { const [value] = ctx.useState("late"); return ctx.createElement("p",null,value); }});' });
  });
  await open(page);
  await update(page, { type: "custom:late" });
  await expect(page.getByTestId("preview")).toContainText("Lade custom:late");
  await update(page, { type: "custom:hello" });
  await expect(page.getByTestId("preview")).toContainText("Hallo, Welt!");
  release();
  await expect.poll(() => page.evaluate(() => window.MagicFrame._modules.has("custom:late"))).toBe(true);
  await expect(page.getByTestId("preview")).toContainText("Hallo, Welt!");
  await update(page, { type: "custom:late" });
  await expect(page.getByTestId("preview").locator("[inert]")).toHaveText("late");
  await update(page, { type: "custom:hello" });
  await expect(page.getByTestId("preview")).toContainText("Hallo, Welt!");
});

test("render errors are contained and recover after correcting config", async ({ page }) => {
  await moduleRoute(page, "custom:throws", `(ctx) => {
    if (ctx.config.fail) throw new Error("invalid setting");
    return ctx.createElement("p", null, "valid setting");
  }`);
  await open(page);
  await update(page, { type: "custom:throws", config: { fail: true } });
  await expect(page.getByTestId("preview")).toContainText("Render-Fehler: invalid setting");
  await update(page, { config: { fail: false } });
  await expect(page.getByTestId("preview")).toContainText("valid setting");
});

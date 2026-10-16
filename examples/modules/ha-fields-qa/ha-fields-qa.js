/** Uploadable QA fixture. No host imports, bundled React, or Home Assistant writes. */
export const manifest = {
  type: "ha-fields-qa",
  label: "HA Field Lab",
  description: "QA pills for entity selectors, display overrides, and manifest-selected controls.",
  iconEmoji: "🧪",
  version: "1.0.0",
  fields: [
    { key: "heading", label: "Heading", type: "text", default: "HA Field Lab" },
    { key: "useSampleData", label: "Use sample data", type: "boolean", default: true,
      help: "Leave enabled for offline QA, including the display. Disable for real HA readings; select Live in the inspector too." },
    { key: "showConfig", label: "Show saved selections", type: "boolean", default: false,
      help: "Show the config values delivered to the module. Auto unit omits unit; hidden unit stores an empty string." },
    { key: "primaryEntity", label: "Featured entity", type: "ha-entity", domains: ["sensor", "binary_sensor"], default: "",
      placeholder: "sensor.qa_temperature", help: "Single-entity picker. Empty means no featured pill." },
    { key: "entities", label: "Full-control sensors", type: "ha-entities", domains: ["sensor", "binary_sensor"],
      itemFields: ["name", "color", "unit", "icon"],
      default: [{ entityId: "sensor.qa_temperature" }, { entityId: "binary_sensor.qa_door" }],
      help: "All display overrides. Sample IDs can be typed manually without HA." },
    { key: "compactEntities", label: "Name and icon only", type: "ha-entities", domains: ["light", "switch"],
      itemFields: ["name", "icon"], default: [],
      help: "Manifest exposes only name and icon. No color or unit controls should appear." },
    { key: "idsOnly", label: "Entity IDs only", type: "ha-entities", itemFields: [], default: [],
      help: "Manifest hides every display override. Entity selection and ordering remain available." },
  ],
};

const defaultFor = key => manifest.fields.find(field => field.key === key)?.default;
const list = value => (Array.isArray(value) ? value : [])
  .filter(entry => entry && typeof entry.entityId === "string" && entry.entityId.trim())
  .map(entry => ({ ...entry, entityId: entry.entityId.trim() }));

function sample(entityId) {
  if (entityId.includes("missing")) return undefined;
  const binary = entityId.startsWith("binary_sensor.");
  const control = /^(light|switch)\./.test(entityId);
  const humidity = entityId.includes("humidity");
  return {
    state: entityId.includes("unavailable") ? "unavailable" : binary ? "off" : control ? "on" : humidity ? "48" : "21.5",
    attributes: {
      friendly_name: `Sample ${entityId.split(".").slice(1).join(".").replaceAll("_", " ")}`,
      icon: binary ? "mdi:door-closed" : control ? "mdi:lightbulb" : humidity ? "mdi:water-percent" : "mdi:thermometer",
      ...(!binary && !control ? { unit_of_measurement: humidity ? "%" : "°C" } : {}),
    },
  };
}

/** Original simple glyphs for common QA IDs; other IDs use Iconify's SVG service. */
function iconElement(h, icon, color) {
  const common = {
    "mdi:thermometer": ["M10 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0Z", "M12 7v10"],
    "mdi:door-closed": ["M5 21V3h14v18M3 21h18M15 12h1"],
    "mdi:door-open": ["M5 21V3l10 3v15M5 3h14v18M11 12h1M3 21h18"],
    "mdi:lightbulb": ["M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0l-1 2H9Z"],
    "mdi:water-percent": ["M12 2C9 7 5 10 5 15a7 7 0 0 0 14 0c0-5-4-8-7-13Z", "m9 17 6-6M9 11h.01M15 17h.01"],
    "mdi:gauge": ["M4 19a9 9 0 1 1 16 0M12 14l5-6M6 12H4M18 12h2M12 6V4"],
  };
  if (common[icon]) return h("svg", { viewBox: "0 0 24 24", width: "1.6em", height: "1.6em", role: "img", "aria-label": icon,
    fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
  ...common[icon].map((d, i) => h("path", { d, key: i })));
  const match = /^([a-z0-9-]+):([a-z0-9-]+)$/.exec(icon);
  return match ? h("img", { width: "28", height: "28", alt: icon,
    style: { width: "1.6em", height: "1.6em" },
    src: `https://api.iconify.design/${match[1]}/${match[2]}.svg?color=${encodeURIComponent(color)}` })
    : h("span", { title: icon, style: { fontSize: "1.6em" } }, "◇");
}

export default function render(ctx) {
  const h = ctx.createElement;
  const cfg = ctx.config;
  const featured = typeof cfg.primaryEntity === "string" ? cfg.primaryEntity.trim() : "";
  const groups = [
    { key: "featured", title: "Featured entity", entries: featured ? [{ entityId: featured }] : [] },
    { key: "entities", title: "Full controls", entries: list(cfg.entities ?? defaultFor("entities")) },
    { key: "compactEntities", title: "Name + icon", entries: list(cfg.compactEntities ?? []) },
    { key: "idsOnly", title: "Entity only", entries: list(cfg.idsOnly ?? []) },
  ];
  const rows = groups.flatMap(group => group.entries);
  const selection = JSON.stringify([...new Set(rows.map(row => row.entityId))].sort());
  const ids = JSON.parse(selection);
  const demo = ctx.config.__demo === true || (cfg.useSampleData ?? true) === true;
  // The host may bind a new fetch function on display config edits. Keep the
  // latest bridge without restarting state polling for name/color/order changes.
  const fetchRef = ctx.useRef(ctx.fetch);
  ctx.useEffect(() => { fetchRef.current = ctx.fetch; }, [ctx.fetch]);
  const [result, setResult] = ctx.useState({ key: "", states: {}, error: "" });
  ctx.useEffect(() => {
    const selected = JSON.parse(selection);
    if (demo || selected.length === 0) return;
    const controller = new AbortController();
    let active = true;
    let timer;
    const refresh = async () => {
      try {
        const response = await fetchRef.current(`/api/ha/state?ids=${encodeURIComponent(selected.join(","))}`,
          { method: "GET", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`HA read failed (HTTP ${response.status})`);
        const states = await response.json();
        if (!states || typeof states !== "object" || Array.isArray(states)) throw new Error("Invalid HA state response");
        if (active) setResult({ key: selection, states, error: "" });
      } catch (error) {
        if (active) setResult({ key: selection, states: {}, error: error.message || "HA read failed" });
      } finally {
        if (active) timer = setTimeout(refresh, 30000);
      }
    };
    refresh();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [selection, demo]);

  const states = demo ? Object.fromEntries(ids.map(id => [id, sample(id)])) : result.key === selection ? result.states : {};
  const loading = !demo && result.key !== selection;
  const selections = Object.fromEntries(["primaryEntity", "entities", "compactEntities", "idsOnly"].map(key => [key, cfg[key] ?? defaultFor(key)]));
  const muted = { opacity: 0.65, fontSize: "0.65em" };
  return h("div", { style: { height: "100%", overflow: "auto", padding: "0.65em", display: "flex", flexDirection: "column", gap: "0.65em" } },
    h("div", null,
      h("strong", { style: { fontSize: "1.1em" } }, cfg.heading || "HA Field Lab"),
      h("div", { style: muted }, `${demo ? "SAMPLE DATA · no HA state reads" : "LIVE HA · read-only"} · ${rows.length} rows · ${ids.length} unique IDs`)),
    rows.length === 0 ? h("p", { role: "status" }, "No entities selected. Nothing is auto-discovered.") : null,
    !demo && result.key === selection && result.error ? h("p", { role: "status" }, result.error) : null,
    ...groups.filter(group => group.entries.length > 0).map(group => h("section", { key: group.key },
      h("div", { style: { ...muted, marginBottom: "0.4em" } }, group.title),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.5em" } },
        ...group.entries.map((entry, index) => {
          const state = states[entry.entityId];
          const attributes = state?.attributes || {};
          const color = entry.color || "#38bdf8";
          const icon = entry.icon || attributes.icon || "mdi:gauge";
          const unit = typeof entry.unit === "string" ? entry.unit : attributes.unit_of_measurement || "";
          const unavailable = !state || state.state === "unavailable" || state.state === "unknown";
          return h("div", { key: `${index}:${entry.entityId}`, style: { color, border: "0.08em solid currentColor", borderRadius: "0.9em",
            padding: "0.55em 0.7em", display: "flex", alignItems: "center", gap: "0.55em", opacity: unavailable ? 0.65 : 1 } },
          iconElement(h, icon, color),
          h("div", null,
            h("div", { style: { fontSize: "0.8em", fontWeight: 600 } }, entry.label?.trim() || attributes.friendly_name || entry.entityId),
            h("div", null, `${state ? state.state : loading ? "Loading…" : "Not found"}${!unavailable && unit ? ` ${unit}` : ""}`),
            h("div", { style: { ...muted, fontSize: "0.5em" } }, `${entry.entityId} · ${icon}`)));
        })))),
    cfg.showConfig ? h("pre", { style: { margin: 0, padding: "0.6em", border: "0.05em solid currentColor", borderRadius: "0.5em",
      fontSize: "0.55em", whiteSpace: "pre-wrap", overflowWrap: "anywhere" } }, JSON.stringify(selections, null, 2)) : null);
}

/**
 * Selected HA readings: no discovery, actions or host-component imports.
 * Build: node scripts/build-module.mjs examples/modules/ha-entities/ha-entities.js /tmp/opencode/ha-entities
 * Upload module.json and bundle.js at /editor/modules on a supporting host.
 */
export const manifest = {
  type: "ha-entities-example",
  label: "Selected HA readings",
  description: "A featured entity and an ordered list with display overrides.",
  iconEmoji: "📋",
  version: "1.0.0",
  fields: [
    {
      key: "primaryEntity",
      label: "Featured entity",
      type: "ha-entity",
      default: "",
      placeholder: "sensor.living_room_temperature",
      help: "Optional featured reading. Enter an ID or choose a suggestion.",
    },
    {
      key: "entities",
      label: "Readings",
      type: "ha-entities",
      domains: ["sensor", "binary_sensor"],
      itemFields: ["name", "color", "unit", "icon"],
      default: [],
      help: "Add readings and optional display overrides. No selection means no requests.",
    },
  ],
};

function sampleState(entityId, index) {
  const binary = entityId.startsWith("binary_sensor.");
  return {
    state: binary ? "off" : String(21 + index / 2),
    attributes: {
      friendly_name: `Sample ${entityId.split(".").slice(1).join(".").replaceAll("_", " ")}`,
      icon: binary ? "mdi:door-closed" : "mdi:thermometer",
      ...(binary ? {} : { unit_of_measurement: "°C" }),
    },
  };
}

export default function render(ctx) {
  const h = ctx.createElement;
  const config = ctx.config;
  // Runtime config is passthrough: authors must supply their own defaults.
  // Null/malformed older values are guarded too; explicit [] stays empty.
  const primaryValue = config.primaryEntity ?? manifest.fields[0].default;
  const primary = typeof primaryValue === "string" ? primaryValue.trim() : "";
  const listValue = config.entities ?? manifest.fields[1].default;
  const entries = (Array.isArray(listValue) ? listValue : [])
    .filter((entry) => entry && typeof entry.entityId === "string" && entry.entityId.trim())
    .map((entry) => ({ ...entry, entityId: entry.entityId.trim() }));
  const rows = primary ? [{ entityId: primary, featured: true }, ...entries] : entries;
  // Duplicate rows remain visible, while fetching each ID only once.
  const ids = [...new Set(rows.map((entry) => entry.entityId))].sort();
  const selectionKey = JSON.stringify(ids);
  const demo = config.__demo === true;
  const fetchData = ctx.fetch;
  const [result, setResult] = ctx.useState({ key: "", states: {}, error: "" });

  ctx.useEffect(() => {
    const selectedIds = JSON.parse(selectionKey);
    if (demo || selectedIds.length === 0) return;
    const controller = new AbortController();
    let active = true;
    let timer;
    async function refresh() {
      try {
        const response = await fetchData(
          `/api/ha/state?ids=${encodeURIComponent(selectedIds.join(","))}`,
          { method: "GET", cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(`HA read failed (HTTP ${response.status})`);
        const states = await response.json();
        if (!states || typeof states !== "object" || Array.isArray(states)) {
          throw new Error("Invalid HA state response");
        }
        if (active) setResult({ key: selectionKey, states, error: "" });
      } catch (error) {
        if (active) {
          setResult({ key: selectionKey, states: {}, error: error.message || "HA read failed" });
        }
      } finally {
        // Schedule after completion so slow reads cannot overlap.
        if (active) timer = setTimeout(refresh, 30000);
      }
    }
    refresh();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectionKey, demo, fetchData]);

  const states = demo
    ? Object.fromEntries(ids.map((id, index) => [id, sampleState(id, index)]))
    : result.key === selectionKey ? result.states : {};
  const error = !demo && result.key === selectionKey ? result.error : "";
  const loading = !demo && result.key !== selectionKey;

  return h("div", {
    style: { display: "flex", flexDirection: "column", gap: "0.5em", padding: "0.5em", overflow: "auto", height: "100%" },
  },
  demo ? h("small", { style: { opacity: 0.65 } }, "Sample data") : null,
  rows.length === 0 ? h("div", null, "Select an entity to show a reading.") : null,
  error ? h("div", { role: "status", style: { fontSize: "0.8em" } }, error) : null,
  ...rows.map((entry, index) => {
    const state = states[entry.entityId];
    const attributes = state?.attributes || {};
    const label = entry.label || attributes.friendly_name || entry.entityId;
    const icon = entry.icon || attributes.icon || "mdi:information-outline";
    const color = entry.color || "inherit";
    // Missing unit is Auto; a custom empty string intentionally hides it.
    const unit = typeof entry.unit === "string" ? entry.unit : attributes.unit_of_measurement || "";
    const unavailable = !state || state.state === "unavailable" || state.state === "unknown";
    const value = !state ? (loading ? "Loading…" : "Not found") : state.state;
    return h("div", {
      key: `${index}:${entry.entityId}`,
      style: { color, fontSize: entry.featured ? "1.2em" : "1em", opacity: unavailable ? 0.65 : 1 },
    },
    h("div", { style: { fontWeight: entry.featured ? 700 : 500 } }, label),
    h("div", null, `${value}${!unavailable && unit ? ` ${unit}` : ""}`),
    // Keep icon rendering dependency-free: show the chosen identifier as text.
    // A production module can replace this with its own icon renderer.
    h("small", { style: { fontSize: "0.6em", opacity: 0.65 } }, icon));
  }));
}

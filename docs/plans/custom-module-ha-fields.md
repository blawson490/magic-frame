# Plan: Home Assistant fields for custom modules

Status: implemented on `feature/custom-module-ha-fields`; local Docker QA chosen
while GitHub authentication is unavailable. Publication/merge remains pending.
See [the local QA runbook](custom-module-ha-fields-qa.md).

Suggested implementation branch: `feature/custom-module-ha-fields`.

## Goal

Extend the documented custom-module manifest API so any uploaded module can
offer the same entity selection and per-entity display settings as built-in
widgets. This is a host capability, not a Status Pills-specific integration.

Authors declare fields in their manifests; Magic Frame renders the editor
controls and stores settings; modules read those settings through `ctx.config`
and decide how to display them.

Primary documentation:

- `wiki/custom-modules.md`: canonical manifest reference and installation rules.
- `wiki/module-development.md`: authoring, build workflow, and runtime contract.

## Scope

- Single-entity selection using the existing `HAEntityInput`.
- Multiple entities with add, remove, reorder, and expandable editing.
- Manifest-selectable per-entry controls: name, color, icon, and Auto/custom unit.
- Optional HA domain filtering, without limiting the capability to sensors.
- Structured configuration, live inspector preview, and save/reload persistence.
- Backward compatibility for existing manifests and configuration.
- Documentation, a working example module, and regression coverage.

### Not in scope

- Changing HA entity states, friendly names, or other HA-side metadata.
- Exposing internal React editor components directly to module bundles.
- A general nested-form/repeater framework or custom inspector JavaScript.
- Host-managed state fetching, subscriptions, or automatic discovery.
- Updating the installed Status Pills module or accessing its Docker instance.
- Automatically converting arbitrary modules' comma-separated settings.

## Current implementation

- `src/lib/modules/store.ts` defines and parses six primitive field types;
  unknown types currently normalize to `text`. Defaults are typed as primitive
  values, although parsing currently copies them without validation.
- `src/app/editor/_inspectors/CustomModuleInspector.tsx` duplicates the field
  type and renders primitive controls only.
- `src/app/api/modules/route.ts` returns enabled modules and their parsed fields.
- `src/app/editor/_inspectors/SensorInspector.tsx` already implements entity
  selection, expandable entries, ordering, icons, colors, labels, units, and
  decimals. Its entry keys are `entityId`, `label`, `icon`, `color`, `unit`,
  and `decimals`.
- `src/app/editor/_components/HAEntityInput.tsx` supports domain filtering,
  free-text entry, clearing, shared request caching, and bounded suggestions.
- Custom-module defaults are applied in
  `src/app/editor/(app)/views/[id]/page.tsx` when adding a widget.
- `src/lib/modules/runtime.tsx` passes configuration through to modules. New
  field controls should not require a new runtime bridge.
- `src/lib/widgets/schemas.ts` allows custom-widget configuration to pass through.
- `tests/custom-modules/` contains a Playwright fixture and preview tests.

## Proposed manifest contract

Add two explicit field types. Names below are the proposed public API.

```js
fields: [
  {
    key: "primaryEntity",
    label: "Primary entity",
    type: "ha-entity",
    domains: ["sensor"],
    default: "",
    placeholder: "sensor.living_room_temperature",
    help: "Choose an entity or enter its ID.",
  },
  {
    key: "entities",
    label: "Sensors",
    type: "ha-entities",
    domains: ["sensor", "binary_sensor"],
    itemFields: ["name", "color", "unit", "icon"],
    default: [],
    help: "Add the entities this module should display.",
  },
]
```

Rules:

- Existing `key`, `label`, `placeholder`, `help`, and `required` semantics remain.
  `required` remains informational; this feature does not add global save rules.
- `ha-entity` stores one entity ID string; clearing stores `""`.
- `ha-entities` stores an ordered array of entries; clearing the list stores `[]`.
- `domains` is optional. Omitted or empty means all domains. It filters picker
  suggestions, not HA access permissions or validity of typed IDs.
- Entity selection is always present on list entries.
- `itemFields` selects display-override controls. Omitted means all four;
  an empty array means entity selection only. Control order follows the host's
  consistent layout rather than the order of this array.
- `name` is the author-facing control name; it maps to stored `label` to align
  with the existing Sensor card shape.
- List UI strings come from host translations. Manifest labels/help remain
  author-supplied and untranslated, as today.
- No new discovery option is introduced. Discovery, if a module needs it later,
  must be separately declared and explicitly enabled.

## Configuration contract

Example value delivered to a module:

```js
ctx.config.entities = [
  {
    entityId: "sensor.living_room_temperature",
    label: "Living room",
    icon: "mdi:thermometer",
    color: "#14b8a6",
    unit: "°C",
  },
  { entityId: "binary_sensor.front_door" },
];
```

- `entityId` is a string; a newly added, unfinished entry may contain `""`.
  Modules should skip entries with blank IDs without discovering replacements.
- `label`, `icon`, `color`, and `unit` are optional string overrides.
- Blank name means use the HA friendly name, falling back to entity ID.
- Missing icon/color means use the module's normal defaults, including HA
  metadata where applicable. The host does not resolve these values for bundles.
- Unit editing has an explicit Auto/custom selector: missing `unit` means Auto;
  a string means custom. In custom mode `unit: ""` intentionally hides the unit.
  Returning to Auto removes the override.
- Missing overrides should be omitted, not persisted as `undefined` or `null`.
- Hiding a control through `itemFields` must not silently delete saved values.
- Array order is display order; duplicate entity IDs are allowed, since authors
  may intentionally display an entity with different overrides.
- Missing list configuration is treated as the declared default, or `[]` when
  none is supplied. Authors must implement the same fallback in their bundles:
  the display runtime does not currently hydrate missing manifest defaults.
- Empty lists mean no selected entities. A conforming module displays an empty
  state and does not fetch/render every HA entity.

The picker may still fetch the HA entity catalog to provide suggestions. That
is distinct from a module loading or rendering every entity as widget content.

## Implementation sequence

### 1. Finalize and document the API

- Update the canonical field table in `wiki/custom-modules.md` with both types,
  their options, defaults, stored values, and older-host compatibility warning.
- Replace statements that custom modules cannot use entity/icon pickers with
  the new manifest-driven capabilities and their limits.
- Add an authoring walkthrough in `wiki/module-development.md` that references
  the canonical field definitions and demonstrates consuming structured config.
- Explicitly document that display overrides do not modify Home Assistant.

### 2. Shared types and parsing

- Introduce client-safe shared manifest types under `src/lib/modules/` so the
  inspector does not import `store.ts` (which is `server-only`). Use a
  discriminated field union for old primitives and the two HA field types.
- Move pure manifest parsing into a testable, server-independent helper if
  necessary; keep store exports compatible with existing callers.
- Preserve `domains`, `itemFields`, and structured defaults through upload,
  storage, and the public module descriptor endpoint.
- Validate new field-specific options and defaults with actionable field-keyed
  errors: domains must be arrays of nonempty strings; itemFields must contain
  supported names; defaults must match the new field's value shape.
- Do not tighten legacy primitive-field validation or change unknown-type
  fallback as an incidental part of this feature.
- Clone structured defaults when creating widget instances so two widgets do
  not share array/object references. Audit all custom-widget creation paths.
- Guard malformed saved values in the editor without silently overwriting them;
  offer a clear field-level message rather than passing objects into text inputs.

### 3. Reusable editor controls

- Extract a controlled entity-list editor into
  `src/app/editor/_components/`, using `AccordionCard`, `HAEntityInput`, and
  `IconPicker` rather than cloning the Sensor inspector.
- Share the entry-editing/list mechanics with the Sensor inspector while keeping
  Sensor-only presentation settings in that inspector.
- Preserve existing Sensor behavior, including its decimals control and current
  unit semantics. The custom-module Auto/custom unit UI must not reinterpret
  existing Sensor configurations; expose that behavior as an explicit option.
- Keep drafts stable while reordering/removing entries; focus and expanded state
  should track the entry rather than accidentally move to a different row.
- Support manifest-selected controls and accessible button/input labels.
- Render `ha-entity` with the existing picker and `ha-entities` with the shared
  editor in `CustomModuleInspector.tsx`.
- Preserve unrelated widget configuration on every edit and update live preview
  immediately, following the current editor update path.
- Add host translation keys following the repository's localization patterns.

### 4. Working author example

- Add an original example under `examples/modules/ha-entities/` demonstrating
  both field types and display-override handling.
- Use `ctx` APIs only; do not import host editor code or bundle another React.
- Fetch only selected entities' state data using supported HA read routes after
  verifying their contracts. Deduplicate fetches where IDs repeat.
- Skip unfinished entries, handle missing/unavailable entities, and render an
  empty state without discovery. Clean up requests/timers on config changes.
- Demonstrate sample data via `ctx.config.__demo` and respect read-only preview.
- Build through `scripts/build-module.mjs`; keep generated bundles out of the
  source changes unless repository conventions require them.

### 5. Tests and verification

- Parser tests: new types/options/defaults round-trip; malformed new options fail
  clearly; all six old field types and unknown-type fallback remain unchanged.
- Editor tests: both pickers, domain filtering, manual IDs, clearing, add/remove,
  reorder, selected controls, blank drafts, optional overrides, and Auto/custom
  units (including intentionally blank custom unit).
- Default tests: nested defaults are independent across widget instances;
  explicit `[]` does not fall back to a nonempty default.
- Regression tests: existing Sensor editor behavior and primitive custom fields.
- Preview tests: structured edits reach `ctx.config`, module state is preserved,
  and read-only preview restrictions remain intact.
- Integration/manual check: upload a built example, add two instances, edit,
  save, reload, export/import, and verify values and ordering survive intact.
- Empty-list check: no content-state requests/discovery from the example module;
  catalog requests from the picker are allowed and remain deduplicated.
- Large-catalog check: suggestions remain bounded and only the active entry's
  editor needs to mount; a large HA installation does not render all entities.

Use the existing Playwright harness where practical; add small pure-parser tests
without requiring a database. Run `npm run test:modules`, `npx tsc --noEmit`,
targeted lint, `npm run check:wiki`, and the example module build. Record any
environment blockers or pre-existing failures instead of claiming full success.
After wiki changes, regenerate `llms.txt`/`llms-full.txt` with
`npm run build:llms` according to the repository's documentation workflow.

## Compatibility and rollout

- No database migration is expected: manifests and widget configs already store
  JSON. Verify that round trips preserve the new nested values.
- Existing modules keep their primitive fields and discovery behavior untouched.
  This feature cannot fix an installed module's discovery fallback by itself.
- A module must explicitly adopt the new field types and consume the array
  contract; do not infer behavior from a field named `entities` or `sensors`.
- Older hosts normalize unfamiliar types to text, so authors must document that
  modules using these fields require a supporting Magic Frame release. Do not
  promise graceful editing on older hosts or invent a minimum version yet.
- No runtime version bump is expected unless implementation reveals a genuine
  runtime contract change; the current `ctx.config` bridge is sufficient.
- Later Status Pills adoption is separate: update its source/manifest and decide
  a module-specific legacy-string migration. Never discard saved selections.

## Definition of done

- A module author can implement both selectors using only the documented API.
- A user can manage multiple entities and their display overrides without CSV.
- Empty selections in the example never become implicit discovery.
- New values survive save/reload and reach preview/display unchanged.
- Existing modules and the built-in Sensor card retain their behavior.
- Documentation, example, tests, and generated documentation agree on the API.

## Suggested commit boundaries

1. Shared manifest contract, parsing, and parser tests.
2. Reusable list controls, custom inspector integration, and editor regressions.
3. Example module, public documentation, and end-to-end verification.

Keep the actual documentation edits aligned with the implemented contract; this
planning document does not advertise the proposed field types as available today.

## Implementation record

- Added the shared client-safe manifest contract and parser, HA field rendering,
  reusable entity-list editor, independent defaults, and legacy Sensor integration.
- Published the field/config reference, author walkthrough, and working
  `examples/modules/ha-entities/` source; regenerated `llms-full.txt`.
- Added parser and browser regressions to `npm run test:modules` and CI.
- All 23 automated tests passed, including bounded large-catalog search and
  selected-only fetching by the real example module.
- Independent subagent review identified configuration typing, accessible unit
  names, and stale module error handling; all three were addressed.
- TypeScript, targeted lint, production build, wiki and widget checks passed.
  The existing HAEntityInput dependency-array lint warnings remain unchanged.
- Verified upload of the built example, parsed fields, structured save/load,
  JSON transport round-trip, and explicit empty lists against an isolated local
  app and disposable PostgreSQL database, not the running household instance.
- Revalidated four screenshot fingerprints for nonvisual defaults/type changes;
  recorded the reason in `wiki/screenshots.json`, preserving existing images.

### QA handoff

After the supporting host build is deployed, build and upload the example's
`module.json` and `bundle.js` following its README. Add it to a view and verify
entity selection, name/color/icon overrides, unit Auto/custom/hidden behavior,
reordering, removal, live preview, and persistence after saving/reloading.
Existing Status Pills does not adopt these fields automatically; update its
manifest and rendering code separately using the documented contract.

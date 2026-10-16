# Selected HA readings

An original custom-module example of `ha-entity` and `ha-entities`. Requires a
Magic Frame host supporting these manifest field types; older hosts render them
as text controls and cannot edit the array correctly.

From the repository root with dependencies installed:

```bash
node scripts/build-module.mjs examples/modules/ha-entities/ha-entities.js /tmp/opencode/ha-entities
```

Upload `/tmp/opencode/ha-entities/module.json` and `bundle.js` at
`/editor/modules`, add **Selected HA readings** to a view and select entities.
The featured selector allows any domain; list suggestions filter to sensors and
binary sensors (manually typed IDs remain allowed).

- The runtime passes config through. The module supplies missing defaults and
  skips blank draft IDs. Empty selections show an empty state without requests.
- Selected IDs are deduplicated for GET `/api/ha/state?ids=...`, which returns an
  ID-keyed state object. Display order and duplicate rows are preserved. Reads
  repeat every 30 seconds; effects abort requests and clear timers on changes or
  unmount. No catalog discovery, host imports, React imports or HA actions.
- The `name` control stores `label`. Blank names fall back to HA's friendly name,
  then ID; icon falls back to HA metadata and a module default; color inherits
  the tile. Icon identifiers are displayed as text to keep the example
  dependency-free, not rendered using an internal host icon component.
- Missing unit means Auto; a custom string replaces HA's unit and `""` hides it.
  Overrides only change this display, never HA metadata.
- **Sample data** (`ctx.config.__demo`) creates local states for selected IDs,
  without network reads or invented selections. Normal live mode uses only
  GET, so it also works in read-only inspector preview (`ctx.preview`).
- Missing, unknown and unavailable states remain visible; HTTP errors are
  reported in the tile, including unconfigured HA.

See [Custom modules](../../../wiki/custom-modules.md#home-assistant-field-options-and-values)
for the canonical contract and [Writing a module](../../../wiki/module-development.md#home-assistant-selections)
for the walkthrough. Generated build output is not part of this example's source.

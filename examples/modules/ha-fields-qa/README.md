# HA Field Lab — uploadable QA module

Requires the custom-module HA field feature (`cc07859` or later supporting host).
No host rebuild is needed to add this module to the separate QA instance.

Build from the source checkout:

```sh
node scripts/build-module.mjs examples/modules/ha-fields-qa/ha-fields-qa.js /tmp/opencode/ha-fields-qa-module
```

Upload the generated **module.json** and **bundle.js** at `/editor/modules`.
Do not upload this source `.js` file as a bundle. Add **HA Field Lab** to a view;
make its tile fairly large (roughly half the canvas) or enlarge the inspector's
preview height. It starts with two sample pills and needs no HA connection.

## Download from the SSH server

Run this on the computer with your browser:

```sh
scp -r blake-lawson@LawsonServer:/tmp/opencode/ha-fields-qa-module ./ha-fields-qa-module
```

The supplied QA folder contains the upload pair, this guide (`QA-GUIDE.md`),
`SOURCE-COMMIT.txt`, and `SHA256SUMS`. Running the builder yourself creates only
the two upload files; the extras are added during QA packaging.
Use **http://localhost:3188** through your existing SSH tunnel, not production.

## QA checklist

Record pass/fail, image tag (`magic-frame-fork:qa-cc07859`), browser, and a short
reproduction or screenshot for failures. Keep results on a dedicated QA view.

### 1. Install and baseline

- [ ] Upload both generated files; **HA Field Lab** appears in the widget palette.
- [ ] Add it. The preview shows **SAMPLE DATA**, two rows, and two unique IDs.
- [ ] Sample temperature reads **21.5 °C** and the door reads **off**.
- [ ] Change **Heading**. The preview updates immediately, without saving.

If these field types appear as plain text boxes, you are on an older host/image.

### 2. Full sensor list and live preview

Under **Full-control sensors**, expand the temperature entry:

- [ ] Name it **Living room**; only its displayed name changes.
- [ ] Choose a different color; its pill border/text/icon changes color.
- [ ] Change its icon to **mdi:gauge**; the glyph and small icon ID text change.
- [ ] Clear the name; it falls back to the sample/HA friendly name.
- [ ] Reset the color to Default; it uses the module's blue default again.
- [ ] Clear the icon; it uses the sample/HA icon again.
- [ ] Add `sensor.qa_humidity`; a third pill shows **48 %**.

Common test glyphs (`mdi:thermometer`, `mdi:gauge`, `mdi:door-closed`,
`mdi:door-open`, `mdi:lightbulb`, `mdi:water-percent`) are drawn locally.
Other valid icon IDs use Iconify's SVG service and need browser internet access.
These are original simple QA glyphs, not exact copies of the MDI artwork.
The identifier is always visible, even if a remote icon cannot load.

### 3. Unit semantics — particularly important

- [ ] Temperature **Unit mode → Auto** shows **21.5 °C**.
- [ ] Select **Custom**, type `test-unit`; it shows **21.5 test-unit**.
- [ ] Leave Custom selected but clear its text; it shows **21.5**, with no unit.
- [ ] Return to Auto; **°C** returns.
- [ ] Enable **Show saved selections**. Auto omits the `unit` key; Custom with
  an empty value has `"unit": ""`. The JSON must distinguish those cases.

Unit overrides are labels only: entering °F does **not** convert 21.5 °C to °F.
Nothing here changes Home Assistant's name, state, unit, or metadata.

### 4. Add, reorder, duplicate, remove

- [ ] Add a blank entry. It must not add a pill or discover sensors.
- [ ] Fill it with a sample ID; its pill appears.
- [ ] Use up/down arrows. The corresponding pill moves; the expanded editor
  stays with the same row and its name/color/unit/icon do not change.
- [ ] Add the same entity twice with different names. Both pills remain visible.
- [ ] Delete one duplicate. The other remains intact.
- [ ] Delete an earlier row while another is expanded. You should still be
  editing the same entry, not the row now at its old position.

### 5. Single picker

- [ ] Enter `sensor.qa_temperature` in **Featured entity**. A separate featured
  pill appears, even if the sensor is also in a list.
- [ ] Its duplicate contributes another row, but not another unique ID.
- [ ] Clear it with ×. Only the featured pill disappears.

Without HA, type IDs manually; a missing catalog warning is not a module failure.

### 6. Manifest-selectable controls

- [ ] Add `light.qa_lamp` to **Name and icon only**. Only entity/name/icon are
  editable: no color picker, unit mode, custom unit, or decimals.
- [ ] Rename it and change its icon. Only that pill changes.
- [ ] Add any sample sensor ID to **Entity IDs only**. Only the entity input
  appears inside the entry; none of the override controls should appear.
- [ ] Reorder/delete work in both lists just as in the full list.

This verifies that the manifest controls the host UI, not module-specific code.
The Add button still says **Add sensor** even for the light/switch test list.

### 7. Save/reload, display, and independent instances

- [ ] Save the view and reload the editor. Values and order survive, including
  the distinction between Auto and custom-empty units.
- [ ] Open the normal display view: with **Use sample data** enabled, it shows
  the same pills without needing HA or the inspector's Sample data button.
- [ ] Add a *new* second HA Field Lab widget, not a duplicate of the first.
  Its two defaults should be unchanged; editing either widget must not change
  the other. Save/reload both again.
- [ ] Existing built-in Sensor cards still allow their prior unit/decimal
  controls. Those decimal controls are intentionally not offered by this module.

### 8. Empty and unavailable selections

- [ ] Clear Featured entity and remove **every entry from all three lists**.
  You should see **No entities selected. Nothing is auto-discovered.**
- [ ] Save/reload. The two initial sample entries must **not** reappear.
- [ ] Add `sensor.qa_unavailable`; it stays visible as unavailable.
- [ ] Add `sensor.qa_missing`; it stays visible as Not found, without crashing.

### 9. Optional real Home Assistant QA

Configure HA in **this QA instance**, then choose actual entity IDs, not `qa_*`
examples. Disable the module's **Use sample data**, and choose **Live** in the
inspector. The host's **Sample data** option deliberately overrides live mode.

- [ ] Featured/full-list suggestions show sensors/binary sensors, not lights.
- [ ] Name-and-icon-list suggestions show lights/switches, not sensors.
- [ ] Entity-only-list suggestions allow every domain.
- [ ] Manual IDs remain allowed even outside a suggestion filter. Filters are
  conveniences, not authorization restrictions.
- [ ] Real values, names, icons, and Auto units show. Overrides still work.
- [ ] Change a real HA value normally; the module refreshes within ~30 seconds.
- [ ] A missing entity or disconnected HA produces an empty/unavailable/error
  state, not a frozen editor or a flood of sensors.
- [ ] Remove every entry and featured ID. In DevTools Network, this module must
  stop calling `/api/ha/state`. Adding/removing entries cleans pending requests.
  Picker `/api/ha/entities` requests are expected and separate from state reads.
- [ ] Duplicate IDs appear twice but the state request's `ids` parameter contains
  each selected ID only once. Overrides/reordering should not cause extra reads.

The module never calls HA actions or writes HA data. Do not use sensitive entity
names or HA tokens in screenshots or shared QA reports.

## Report template

```text
Image: magic-frame-fork:qa-cc07859
Module: HA Field Lab 1.0.0
Browser/device:
Sample or Live:
Checklist section / item:
Steps:
Expected:
Actual:
After save/reload:
Screenshot or sanitized error:
```

See `docs/plans/custom-module-ha-fields-qa.md` for the instance/tunnel lifecycle.
Status Pills adoption remains a separate module update; this lab tests the
general host capabilities without modifying your installed Status Pills.

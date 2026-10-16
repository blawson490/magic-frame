# Custom modules

Magic Frame ships with 19 kinds of widget, listed in [Widgets](widgets.md). A
**custom module** is a nineteenth kind that somebody else wrote: a small
JavaScript file you upload, which then appears in the editor alongside the
built-in widgets and draws whatever it likes on your screens.

Nothing has to be rebuilt or restarted. You upload two files and the new widget
is available a second later.

This page is about **installing** a module somebody gave you. If you want to
build one, that is [Writing a module](module-development.md).

## What a module is made of

Every module is exactly two files:

| File | What it is |
| --- | --- |
| `module.json` | The **manifest** — the module's name, its emoji, its version, and the list of settings it offers you |
| `bundle.js` | The code that draws the widget |

Whoever wrote the module produces both with one command. If you were handed a
single `.js` source file instead, it has not been built yet and cannot be
uploaded — send it back, or build it yourself as described in
[Writing a module](module-development.md).

## Installing one

![The Modules page: the two file pickers with module.json and bundle.js chosen, and the purple Upload button below them.](img/custom-modules-upload.png)

1. Open `/editor` on your own computer and sign in.
2. Click **Modules** (`Module`) in the sidebar — it is its own entry, between
   **Integrations** and **Settings**. The address is `/editor/modules`.
3. Scroll past the grid of built-in widget types to the **Custom modules**
   (`Custom-Module`) card.
4. Beside **module.json (Manifest)**, click **Choose file** and pick the
   module's `module.json`. The filename appears next to the button.
5. Beside **bundle.js**, click **Choose file** and pick the module's
   `bundle.js`.
6. Click **Upload** (`Hochladen`).

A green line confirms it: *Module 'X' uploaded (N bytes). Available in the view
editor.* The module then appears as a row underneath, with its emoji, its name,
its type id and its version.

If something is wrong, the line is red and says what: a `module.json` that is
not valid JSON, a missing `type` or `label`, or a bundle that fails one of the
checks below.

### Putting it on a screen

1. Go to **Views** and open the view you want it on.
2. In the **Add widget** palette down the left, scroll to the bottom. Uploaded
   modules sit under a **Custom** heading below the 19 built-in ones, each with
   its emoji.
3. Click it. The widget lands on the grid and its inspector opens.
4. The **Content** (`Inhalt`) tab shows the settings the module's author defined
   — a text box, a switch, a colour picker, whatever the manifest lists — and
   a live preview of the module.
5. Drag it into place, resize it, and click **Save**.

Every display showing that view fetches the module's code and starts drawing it,
within a second and without a reload.

### Live preview in the inspector

The preview uses the same widget renderer and module runtime as the display.
Changes to the settings reach `ctx.config` immediately, before you click
**Save**. The module keeps its React state while settings change; effects that
depend on a setting should include it in their dependency list. Existing modules
need no changes to render in the preview.

The **Live** option reads real data through the usual `ctx.fetch` bridge,
including Home Assistant read endpoints when that integration is configured.
**Sample data** (`Beispieldaten`) sets `ctx.config.__demo` to `true`; a module
only shows sample data if its author handles that flag. It does not invent Home
Assistant states. Width and height controls resize the tile; connected-display
buttons calculate its dimensions from the display and fit it into the inspector.
Inherited fonts, colours and container-relative sizing work as on the display.

The preview is not interactive: pointer and keyboard interaction inside the
tile are disabled. `ctx.preview` is `true`, and `ctx.fetch` only allows `GET`
and `HEAD`; other methods reject with a read-only error, including calls made
from effects. The normal display remains interactive and has no such bridge
restriction. Modules should use `ctx.fetch` for requests and clean up timers,
subscriptions and listeners in their React effect cleanup functions.

These protections are **not a sandbox**. A bundle still runs as trusted page
code; direct `window.fetch`, other browser APIs and bundle-level side effects
are outside the bridge's protection. Only preview modules you trust, and avoid
actions during initialization or rendering.

Bundles are shared by type for the lifetime of the page. After updating or
re-uploading a module, reload the editor and any open displays to use its new
code. There is no bundle hot reload. A failed download or registration can be
retried by selecting another widget type and returning. Loading and render
errors appear inside the preview; correcting a setting retries a render that
failed because of that setting.

## Managing installed modules

Each row on `/editor/modules` has three buttons on the right:

| Button | What it does |
| --- | --- |
| Eye | Turn the module off, or back on. A module that is off disappears from the palette, and any widget already using it stops drawing. |
| Document | Show the raw manifest, so you can read exactly what the module declares. |
| Bin | Delete it. It asks first, because **views using it break**. |

The row also tells you how many settings the module offers, how large its code
is in bytes, and when it was uploaded.

**Uploading a module with a type id that already exists replaces it.** That is
how you update one: build the new version, upload both files again, done. The
settings you had already filled in survive, because they are stored on the
widget, not in the module.

### Uploading without the browser

If you are rebuilding a module often, the same upload goes over HTTP. The route
takes one JSON object with the manifest and the bundle as a string:

```bash
curl -X POST https://dashboard.example.com/api/admin/modules \
  -H "Content-Type: application/json" \
  --cookie "magic_session=PASTE_YOUR_COOKIE" \
  -d @<(jq -n --argjson m "$(cat dist/module.json)" --arg js "$(cat dist/bundle.js)" \
        '{manifest:$m, bundleJs:$js}')
```

`magic_session` is the cookie a signed-in browser holds — copy its value out of
the browser's developer tools. **The companion token does not work here**, as
described above, and there is no other way to authenticate: this route wants a
session and nothing else. The cookie expires, so expect to copy it again.

## The manifest

`module.json` is what the author writes; you only need to read it to know what a
module claims to be. These are the fields it can hold:

| Field | Required | What it is |
| --- | --- | --- |
| `type` | yes | The module's id. `custom:` is put in front of it if it is not there already, so `hello` becomes `custom:hello`. Letters, digits, `_` and `-` only, up to 64 characters. |
| `label` | yes | The name shown in the palette and the module list. |
| `description` | no | One line, shown under the name. |
| `iconEmoji` | no | The emoji in the palette. Defaults to 🧩. Cut off after four characters, which is room for one emoji. |
| `version` | no | Defaults to `1.0.0`. Shown in the list; nothing checks it. |
| `fields` | no | The settings the module offers, listed below. |
| `author`, `homepage` | no | Stored, and visible when you open the raw manifest. Nothing else shows them. |

Each entry in `fields` becomes one control in the widget's inspector:

| `type` | What you get |
| --- | --- |
| `text` | A single-line box |
| `textarea` | A four-line box in a monospaced font |
| `number` | A number box |
| `boolean` | A checkbox |
| `color` | A colour picker with a `#rrggbb` box beside it, and a `×` to clear it |
| `url` | A single-line box the browser checks for a web address |
| `ha-entity` | A Home Assistant entity picker; stores one entity ID string, or `""` when cleared |
| `ha-entities` | An ordered list of Home Assistant entities, with add, remove, reorder and expandable display settings; stores an array, or `[]` when cleared |

Anything else — a misspelled type, a type the author invented — falls back to a
plain text box rather than being refused.

A field can also carry `default` (filled in when you add the widget),
`placeholder`, `help` (a grey line under the control) and `required`.

**`required` is decoration.** It only decides whether the label says
"(optional)" next to it. Nothing stops you saving a widget with the field empty,
and nothing warns you. Whether the module copes is up to its author.

**Field labels are not translated.** The rest of the interface follows your
language setting; a module's labels and help text are printed exactly as its
author wrote them. A module written in German stays German on an English
installation, and the reverse.

### Home Assistant field options and values

These types require a Magic Frame release that supports them. Older hosts turn
unknown types into text boxes; structured lists cannot be edited correctly there.
There is no separate runtime version requirement or automatic conversion of old
comma-separated settings.

```js
fields: [
  { key: "primaryEntity", label: "Primary entity", type: "ha-entity",
    domains: ["sensor"], default: "", placeholder: "sensor.room_temperature" },
  { key: "entities", label: "Entities", type: "ha-entities",
    domains: ["sensor", "binary_sensor"],
    itemFields: ["name", "color", "unit", "icon"], default: [] },
]
```

| Option | Applies to | Meaning |
| --- | --- | --- |
| `domains` | Both types | Optional array of nonempty domain strings. Omitted or `[]` suggests all domains. Filters suggestions, not access permissions or manually typed IDs. |
| `itemFields` | `ha-entities` | Optional array containing `name`, `color`, `unit`, `icon`. Omitted shows all four; `[]` shows entity selection only. The host chooses control order. Hiding controls does not delete saved overrides. |
| `default` | Both types | An entity ID string for `ha-entity`; an array of entries for `ha-entities`. The runtime passes config through without filling missing defaults; module authors must also apply their declared fallback. |

Entity selection is always present in each list entry. Host list controls are
translated; manifest labels/help are not. `required` remains informational.

The module receives values like these, unchanged, in `ctx.config`:

```js
{
  primaryEntity: "sensor.room_temperature",
  entities: [
    { entityId: "sensor.room_temperature", label: "Room", color: "#14b8a6",
      icon: "mdi:thermometer", unit: "°C" },
    { entityId: "binary_sensor.front_door" },
    { entityId: "" }, // unfinished draft: skip it
  ],
}
```

- Every entry requires a string `entityId`; blank drafts are allowed. Skip blank
  IDs rather than discovering replacements. Order is display order; duplicate
  IDs are allowed and may have different overrides.
- `label`, `icon`, `color` and `unit` are optional string overrides. The `name`
  control stores `label`, not `name`. Blank names fall back to HA's friendly
  name, then the entity ID. Missing icon/color uses the module's own defaults,
  optionally including HA metadata; the host does not resolve them.
- Unit has an Auto/custom selector: missing `unit` means Auto (use HA metadata);
  a string is custom, including `unit: ""` to hide the unit. Returning to Auto
  removes the override. Omit absent overrides rather than storing `null` or
  `undefined`.
- A missing list uses the declared default, or `[]` if none exists. An explicit
  `[]` is empty even when the default is nonempty. Empty lists must show an empty
  state, not fetch or render all HA entities.

These are **display overrides only**: they do not change HA names, states or
metadata. Pickers may load the entity catalog for suggestions, but modules must
fetch their own selected state data. There is no host-managed fetching,
subscription or implicit discovery. See the [author walkthrough](module-development.md#home-assistant-selections)
and `examples/modules/ha-entities/` for a working implementation.

## The type id starts with `custom:`

A built-in widget's type id is a filename — `ClockWidget.tsx`. A module's is
`custom:` followed by its name — `custom:hello`. The prefix is forced on upload,
which is what makes a collision with a built-in widget impossible, now or after
any future update.

You will see this id in the module list, in the inspector header, and in a layout
you export from the editor.

## Limits

These are checked when you upload, and the upload is refused if one fails. The
three messages come straight from the server and are **shown in German** even
with the app set to English, because they have no English translation yet.

- **The bundle may not exceed 2 MB** — *Bundle > 2 MB — bitte schlanker bauen*.
- **The bundle must be at least 20 characters** — *Bundle leer oder zu kurz*. An
  empty file is a mistake, not a module.
- **The bundle must contain the text `registerWidget`** — *Bundle ruft
  `MagicFrame.registerWidget(...)` nicht auf — falsch gebaut?* Every properly
  built module calls `window.MagicFrame.registerWidget(...)` to announce itself,
  so a file without it was built wrongly, or is not a module at all.

And these are not checked, and are worth knowing before you install anything:

- **A module is code, and it runs with everything your browser has.** It runs in
  the editor while you configure it, and on every display showing the view. It
  can read the page, and it can call any address the browser can reach —
  including Magic Frame's own routes. Nothing sandboxes it.
- **Only install modules from someone you trust**, and prefer ones whose source
  you can read. There is no signing, no review and no marketplace: what you
  upload is what runs.
- **The code is served without a login.** A display has no login, so
  `/api/modules/[type]/bundle.js` cannot require one. Anyone who can reach your
  server can download an installed module's code.
- **Only an editor user can upload.** Uploading, disabling and deleting go
  through `/api/admin/modules`, which needs a signed-in browser session. The
  companion token from [The companion API](companion-api.md) is *not* accepted
  here.

## What a module can and cannot do

A module is handed a small, fixed set of things by Magic Frame, and has no way to
reach past it.

It **can**:

- draw anything, using React's `createElement` and the hooks `useState`,
  `useEffect`, `useRef`, `useMemo` and `useCallback`;
- read its own settings, as you filled them in;
- know which view it is running on;
- offer Home Assistant entity pickers and per-entry name, colour, unit and icon
  overrides through the manifest;
- fetch data from anywhere the display's browser can reach.

It **cannot**:

- run anything on the server — a module is browser code only;
- add arbitrary editor controls beyond the field types above, such as an album
  chooser, or import the host's internal editor components;
- use anything other than an emoji as its icon;
- change the shared **Layout** and **Text & colour** tabs. Those work on a module
  exactly as on any other widget: font, colour, shadow, background opacity,
  nudging and hiding rules all apply, and are described in
  [Widgets](widgets.md).

It also inherits the tile: the font size, family, colour and shadow you set come
from the wrapper around it, and the dark panel behind it is the widget's
`bgOpacity`. A well-written module sizes everything relative to that inherited
font size, so it scales with the tile like the built-in widgets do.

## When something goes wrong

| What you see | What it means |
| --- | --- |
| *Module 'custom:x' not found. It may have been deleted or disabled.* in the inspector | The widget is still on the view, but the module behind it is gone or switched off. Re-upload it, or switch it back on. |
| *Lade custom:x…* for a moment, then a red ⚠ | The tile shows that while the code downloads. If nothing announces itself within five seconds it gives up with a timeout. Either the module is disabled, or it was built wrongly. |
| A red ⚠ with a message | Either the download failed, or the module's own code threw. The message is whatever was reported. |

The runtime's own messages — the loading line and the timeout — are **in
German** whatever language the app is set to. They do not pass through the
translation layer.

**A disabled or deleted module is not removed from your views.** The tile stays
where it is and shows the error instead, which is why deleting asks first. Remove
the widget from the view as well if you are done with it.

The **Content** tab previews community modules as well as built-in widgets; see
[Live preview in the inspector](#live-preview-in-the-inspector) for its read-only
behaviour and bundle reload limitation.

## Where this lives in the code

| Part | File |
| --- | --- |
| The Modules page | `src/app/editor/(app)/modules/page.tsx` |
| Upload, enable, delete | `src/app/api/admin/modules/`, `src/lib/modules/store.ts` |
| The list the editor and displays read | `src/app/api/modules/route.ts` |
| The code a display downloads | `src/app/api/modules/[type]/bundle.js/route.ts` |
| The browser runtime that runs a module | `src/lib/modules/runtime.tsx` |
| The generated settings form | `src/app/editor/_inspectors/CustomModuleInspector.tsx` |
| A complete example module | `examples/modules/hello/` |

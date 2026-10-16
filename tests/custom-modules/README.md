# Custom-module preview regressions

Run from the repository root:

```sh
npm ci
npx playwright install chromium
npm run test:modules
npx tsc --project tests/custom-modules/tsconfig.json
```

For an existing Chromium installation, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium` instead of downloading a
browser. The harness serves only on loopback and does not need PostgreSQL or
Home Assistant. It builds the actual preview, inspector, shared widget renderer,
runtime and Tailwind styles, with a fixed Next pathname and simulated HTTP
responses. The hello module comes from the existing example source.

The tests cover configuration updates without saving, live data responses,
effect cleanup, read-only bridge calls, keyboard protection, display behaviour,
sizing, script deduplication, failed initialization and render recovery. They do
not establish connectivity to a real Home Assistant installation or validate
database-backed module upload. Run the normal TypeScript/build checks and a
configured application's upload/HA smoke checks separately.

## HA field coverage

`npm run test:modules` includes preview-runtime regressions, pure manifest parsing
and default-cloning checks, and the shared/custom HA entity editor controls.
The HA example is exercised with stubbed selected-state responses (including no
requests for an empty selection); no real Home Assistant or database is needed.
For a locally installed Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

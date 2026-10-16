# Isolated local QA: custom-module Home Assistant fields

## Change record

- Branch: `feature/custom-module-ha-fields`.
- Reviewed implementation: `cc0785917760f1d47e645377551f7a2c97539dfc`.
- QA image tag: `magic-frame-fork:qa-cc07859` (built from that Git commit).
- Built image ID: `sha256:c126e415e19ff1b0cb0699bb33ae8f738463b5c5f8f7a5dca3fdf67b8455b599`.
- Two code-review rounds; findings addressed, no remaining review blockers.
- 23 automated tests, TypeScript, production build, targeted lint, wiki checks,
  and widget checks passed. Existing HAEntityInput hook-dependency lint warnings
  were not changed.
- Actual module upload and structured save/load checks passed against an isolated
  app/database during implementation, including JSON round trips and empty lists.
- GitHub push/PR/merge have not happened: remote authentication is unavailable.
- User chose a **separate test instance**, not replacing the running app.
- Started project `magic-frame-ha-fields-qa`; app/database health checks passed.
  `/api/auth/me` reported `needsSetup: true`, ready for a new QA account.
- A real-browser smoke check verified that the built image serves the account
  setup form. A subagent reviewed isolation, credentials permissions, provenance,
  and lifecycle instructions with no blocking findings.
- Production remained on image
  `sha256:f78db7d25faa6367c4b94c1c51877c7a188039879a80af30f386e6f4d3453a03`
  with its original container start time (`2026-10-15T20:31:58Z`).

The image is built from a Git archive, excluding untracked files, node_modules,
generated Next output, and local env files. Building it does not overwrite the
stable `magic-frame-fork:local` image. No database schema changes were introduced.

```sh
git archive cc0785917760f1d47e645377551f7a2c97539dfc | docker build \
  --label org.opencontainers.image.revision=cc07859 \
  --label org.opencontainers.image.source=https://github.com/blawson490/magic-frame \
  --tag magic-frame-fork:qa-cc07859 -
```

Inspect the exact local image before testing; record its ID with your QA notes:

```sh
docker image inspect magic-frame-fork:qa-cc07859 --format '{{.Id}} {{json .Config.Labels}}'
```

## Start/restart the separate QA instance

Run from `/home/blake-lawson/Documents/projects/magic-frame`. The agent creates
`$HOME/.local/share/magic-frame-qa/ha-fields.env` with random QA-only session/database credentials
and restrictive permissions. It is not a source file and must not be committed.
Retain it while using the QA database; regenerating its password with an existing
database volume would break access. It contains no production credentials.

```sh
docker compose -p magic-frame-ha-fields-qa \
  --env-file "$HOME/.local/share/magic-frame-qa/ha-fields.env" \
  -f deploy/qa.compose.yml up -d --no-build --pull never --wait --wait-timeout 120
docker compose -p magic-frame-ha-fields-qa \
  --env-file "$HOME/.local/share/magic-frame-qa/ha-fields.env" \
  -f deploy/qa.compose.yml ps
```

This project has its own database, network, configs and wallpaper volumes. The
database has no published port. The app listens only on `127.0.0.1:3188`.
The existing `magic-frame-selfhost` project is not modified or connected to it.

## Access from your normal computer

Run this on the computer with your browser, leaving the tunnel open:

```sh
ssh -N -L 3188:127.0.0.1:3188 blake-lawson@LawsonServer
```

Open **http://localhost:3188**. Create a fresh QA account using the first-run
setup; production accounts and integrations are intentionally absent. Configure
Home Assistant separately if you want live readings. Do not expose this
temporary first-run instance publicly or reuse a production password.

## Test the feature

1. In the server's source checkout, build the original example:

   ```sh
   PATH="$HOME/.local/node-v24.15.0/bin:$PATH" node scripts/build-module.mjs \
     examples/modules/ha-entities/ha-entities.js /tmp/opencode/ha-entities
   ```

2. Copy its files to the computer with your browser (run there):

   ```sh
   scp blake-lawson@LawsonServer:/tmp/opencode/ha-entities/module.json .
   scp blake-lawson@LawsonServer:/tmp/opencode/ha-entities/bundle.js .
   ```

3. Upload both files at `/editor/modules`; add **Selected HA readings** to a QA
   view. Start with **Sample data** in the inspector if HA is not configured.
4. Test single entity selection, multiple entries, domain suggestions, manual
   IDs, name/color/icon overrides, reorder, and delete. Without HA configured,
   type IDs manually and use sample data; suggestions need a live integration.
5. Verify Unit mode: Auto uses HA metadata, Custom accepts a unit, and an empty
   Custom unit hides it. Returning to Auto removes the override.
6. Save and reload; confirm settings/order survive. Add a second instance and
   confirm editing one does not change the other.
7. Delete all entries and clear the featured entity. Confirm an empty state
   appears instead of discovering/rendering every sensor.
8. Add a built-in Sensor card and check its legacy unit/decimal controls.
9. If HA is configured, test live readings and a display view as well.

The example displays icon identifiers as text to avoid a rendering dependency;
it demonstrates the saved icon override, not a complete production icon renderer.
Status Pills is not automatically converted: its source and manifest must adopt
the documented host API separately.

## Stop without losing QA data

```sh
docker compose -p magic-frame-ha-fields-qa \
  --env-file "$HOME/.local/share/magic-frame-qa/ha-fields.env" \
  -f deploy/qa.compose.yml down
```

Do not add `--volumes` unless you deliberately want to erase the QA database and
files. No rollback of the production app is needed: it was never replaced.

## After QA

Record the image ID, results, and fixes here or in the eventual PR. Keep fixes in
new commits. Once accepted, use the normal PR/merge process when GitHub access
is available. A local image build is not a remote merge, and the branch stays
separate until QA is accepted.

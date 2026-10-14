# Release runbook: first L3 run

Blocked until `expo.dev` and `api.expo.dev` are allowlisted. Run from the repo root, in order.

The Android package ID `com.ghostdetector.app` is a placeholder until Gate 1 (name and icon). When it changes, update `app.json` and `appId` in `e2e/maestro/boot.yml` together.

1. Log in and create the Expo project (writes `extra.eas.projectId` into app config):
   ```
   pnpm dlx eas-cli@latest login
   pnpm dlx eas-cli@latest init
   ```
2. Create a robot token at expo.dev (Account settings, Access tokens) and export it:
   ```
   export EXPO_TOKEN=<token>
   ```
   For CI also add it as a repository secret named `EXPO_TOKEN`.
3. Link the GitHub repo in the Expo dashboard (Project, GitHub) so the `push` trigger fires.
4. Validate the workflow file:
   ```
   pnpm dlx eas-cli@latest workflow:validate .eas/workflows/e2e-android.yml
   ```
5. Run it and wait (exit 0 = pass, 11 = fail):
   ```
   pnpm dlx eas-cli@latest workflow:run .eas/workflows/e2e-android.yml --wait
   ```
6. Fetch artifact URLs (look for "Maestro Test Results") and download the screenshot:
   ```
   pnpm dlx eas-cli@latest workflow:view <workflow-run-id> --json > /tmp/run.json
   mkdir -p e2e/evidence/l3
   curl -L -o e2e/evidence/l3/maestro-results.zip "<downloadUrl from run.json>"
   unzip -o e2e/evidence/l3/maestro-results.zip -d e2e/evidence/l3/
   ```
   Keep `boot.png` and the screen recording; record the paths in `features.json` evidence.

Play submission later: put the service account key at `./play-service-account.json` (git-ignored), then
`eas build -p android --profile production` and `eas submit -p android --profile production`.

## Production gate against test ad IDs (P5-01)

`scripts/check-ad-ids.mjs` fails when Google's sample publisher ID `3940256099942544` appears in `app.json`, `eas.json` or `src/` and release mode is on (`EXPO_PUBLIC_RELEASE=1` or `--release`). Outside release mode it only reports, so `pnpm smoke` stays green on test IDs.

Wiring:
- `eas.json` `build.production.env` sets `EXPO_PUBLIC_RELEASE=1`. The `development`, `preview` and `e2e-test` profiles do not set it and keep test IDs.
- `package.json` has an `eas-build-pre-install` script (`node scripts/check-ad-ids.mjs`). EAS Build runs it on the build worker before dependencies install, with the profile env, so a production build with the sample ID fails before compiling.
- Local check: `EXPO_PUBLIC_RELEASE=1 node scripts/check-ad-ids.mjs` (exit 1 while the sample ID is in `app.json`).

Limit: the gate matches the literal ID only. The three unit IDs in `src/ads/backend.ts` come from `TestIds` and contain no literal, so replacing them is a manual launch step (below).

### Owner launch steps (before the first production build)
1. `app.json`: replace `androidAppId` (`ca-app-pub-3940256099942544~3347511713`) with the real AdMob app ID.
2. `src/ads/backend.ts`: replace the three `TestIds` unit IDs (`BANNER`, `INTERSTITIAL`, `REWARDED`) with the real ad unit IDs.
3. Analytics: add `google-services.json` and install the Firebase packages, following the comment block at the top of `src/analytics/backend.ts` (steps 1 to 7).
4. Register test devices in the AdMob console (Settings, Test devices) so internal testers never see live ads.
5. Run `EXPO_PUBLIC_RELEASE=1 node scripts/check-ad-ids.mjs`; it must exit 0. Then `eas build -p android --profile production`.

# Release runbook: first L3 run

Blocked until `expo.dev` and `api.expo.dev` are allowlisted. Run from the repo root, in order.

The Android package ID `com.ghostdetector.app` is a placeholder until Gate 1 (name and icon). When it changes, update `app.json` and `appId` in every flow under `e2e/maestro/` (including `lib/`) together.

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
   Keep the screenshots (`<profile>-boot.png` and the rest) and the screen recording; record the paths in `features.json` evidence. With three profiles this applies per job (below).

Play submission later: put the service account key at `./play-service-account.json` (git-ignored), then
`eas build -p android --profile production` and `eas submit -p android --profile production`.

## Production gate against test ad IDs (P5-01)

`scripts/check-ad-ids.mjs` fails in release mode (`EXPO_PUBLIC_RELEASE=1` or `--release`) for two reasons: Google's sample publisher ID `3940256099942544` appears in `app.json`, `eas.json` or `src/`, or a `REPLACE_WITH_LIVE_*` placeholder from `src/ads/adUnits.ts` remains in any of them. In release mode `unitId()` returns the constants in `src/ads/adUnits.ts` and never the SDK `TestIds`; outside it, `TestIds` are used. Outside release mode the script only reports, so `pnpm smoke` stays green on test IDs.

Wiring:
- `eas.json` `build.production.env` sets `EXPO_PUBLIC_RELEASE=1`. The `development`, `preview` and `e2e-test` profiles do not set it and keep test IDs.
- `package.json` has an `eas-build-pre-install` script (`node scripts/check-ad-ids.mjs`). EAS Build runs it on the build worker before dependencies install, with the profile env, so a production build with the sample ID fails before compiling.
- Local check: `EXPO_PUBLIC_RELEASE=1 node scripts/check-ad-ids.mjs` (exit 1 while the sample ID is in `app.json`).

Replacing the three placeholders in `src/ads/adUnits.ts` and the app ID in `app.json` is a manual launch step (below); the gate refuses a production build until both are done.

### Owner launch steps (before the first production build)
1. `app.json`: replace `androidAppId` (`ca-app-pub-3940256099942544~3347511713`) with the real AdMob app ID.
2. `src/ads/backend.ts`: replace the three `TestIds` unit IDs (`BANNER`, `INTERSTITIAL`, `REWARDED`) with the real ad unit IDs.
3. Analytics: add `google-services.json` and install the Firebase packages, following the comment block at the top of `src/analytics/backend.ts` (steps 1 to 7).
4. Register test devices in the AdMob console (Settings, Test devices) so internal testers never see live ads.
5. Run `EXPO_PUBLIC_RELEASE=1 node scripts/check-ad-ids.mjs`; it must exit 0. Then `eas build -p android --profile production`.

## Firebase and FCM

`expo-notifications` links `com.google.firebase:firebase-messaging` and registers `ExpoFirebaseMessagingService`. The app uses local notifications only, and plan section 7 says Firebase starts only after UMP consent. Once `google-services.json` exists, FCM would otherwise auto-initialise at app start and create an installation ID and token before consent.

- Plugin: `plugins/withFcmAutoInitOff.js`, registered last in `app.json` `plugins`. It adds `<meta-data android:name="firebase_messaging_auto_init_enabled" android:value="false"/>` to the main `<application>` (idempotent; an existing `true` is forced to `false`). Unit test: `plugins/__tests__/withFcmAutoInitOff.test.ts`.
- Not added: `firebase_data_collection_default_enabled=false` (not confirmed that it leaves the later consent-gated Analytics enable working) and removal of `ExpoFirebaseMessagingService` (it comes from the library manifest, so only the Gradle manifest merger can confirm `tools:node="remove"`; the service stays). Analytics flags stay in `firebase.json`.
- Config check (offline): `npx expo config --type introspect` lists `firebase_messaging_auto_init_enabled` with value `false` under the Android manifest `application` meta-data.
- Device check on the built APK:
  ```
  aapt dump xmltree app-release.apk AndroidManifest.xml | grep -A2 firebase_messaging_auto_init_enabled
  ```
  The value must read `0x0` (false). With `adb shell` network capture or a proxy, confirm no request to `fcm.googleapis.com` or `firebaseinstallations.googleapis.com` before the consent dialog is answered.

## Web preview on GitHub Pages

URL: `https://davidjaehrling.github.io/ghost-detector/`. The workflow `.github/workflows/pages.yml` runs on every push to `main` and on manual dispatch. It runs `EXPO_PUBLIC_BASE_URL=/ghost-detector pnpm web:export`, copies `dist/index.html` to `dist/404.html` (so a direct link such as `/ghost-detector/viewfinder` loads), and deploys `dist` with `actions/deploy-pages@v4`.

Owner step, once: repository Settings, Pages, Source: GitHub Actions. Then run the `pages` workflow from the Actions tab, or merge to `main`.

`app.config.js` loads `app.json` and sets `expo.experiments.baseUrl` only when `EXPO_PUBLIC_BASE_URL` is set. Without it, the Playwright harness, CI and local dev stay at the root path.

- Works on web: glass (instrument), scan, composite, log, settings.
- Stubs on web: ads, haptics, audio, notifications, share sheet.
- The preview shows the same notice as the app: readings are generated in software and the unit detects nothing.

Blocker (needs a `src/fx/` change by the FX Engineer): `src/fx/loadSkia.web.ts` line 9 passes `locateFile: (file: string) => '/' + file` to CanvasKit, an absolute path. Under `/ghost-detector/` the wasm request goes to `/canvaskit.wasm` and returns 404, CanvasKit never loads and the boot screen stays blank. Verified locally: with the template string changed to `${process.env.EXPO_BASE_URL ?? ''}/${file}` the wasm loads from `/ghost-detector/canvaskit.wasm` and the boot screen renders. Until that lands, the deployed page is blank.

Local check of the subpath build: export with the env var, serve `dist` under `/ghost-detector/`, open it in Playwright, and watch for 404s on `canvaskit.wasm` and the font files.

## Three device profiles (P8-06)

`.eas/workflows/e2e-android.yml` builds the `e2e-test` APK once, then runs three Maestro jobs (`maestro_small`, `maestro_medium`, `maestro_large`) that each run all five flows in order: `boot`, `scan-flow`, `settings`, `share`, `relay`. Every job sets `record_screen: true` (one video per job) and `MAESTRO_PROFILE=<small|medium|large>`; each flow names its screenshots `${MAESTRO_PROFILE}-<flow>-<nn>-<moment>`. `EXPO_PUBLIC_RELEASE` stays unset, so the ad-ID gate stays in test mode.

| Profile | dp | Density | Emulator `device_identifier` | `wm size` | `wm density` |
| --- | --- | --- | --- | --- | --- |
| small | 360x800 | mdpi (160) | `pixel_6` | 360x800 | 160 |
| medium | 390x844 | xhdpi (320) | `pixel_6` | 780x1688 | 320 |
| large | 428x926 | xxhdpi (480) | `pixel_6` | 1284x2778 | 480 |

Source: the `maestro` job params (`device_identifier`, `record_screen`, `retries`, `flow_path` as a list, hooks `before_maestro_tests`) are from the EAS pre-packaged jobs documentation (`docs/pages/eas/workflows/pre-packaged-jobs.mdx`, Maestro section). `device_identifier` takes an AVD hardware profile name, not a pixel size, and EAS documents no 360x800 or 428x926 phone profile. The three sizes are therefore set in the `before_maestro_tests` hook with `adb shell wm size` and `wm density` on the one stock device. Unverified until the first live run [U]: that the emulator is booted and visible to `adb` when that hook runs, that `pixel_6` exists on the runner image, and that `wm size` above the panel size (large) is accepted. The hook prints `wm size` and `wm density` into the job log; check them first. If the hook cannot reach a device (Maestro flows have no shell step to move the `wm` lines into), drop the hook and pick the nearest stock AVDs for `device_identifier`; the large profile can then be a tablet profile.

Flows (testIDs they depend on):
- `boot.yml`: `key-acknowledge`, `key-calib-yes`, text `SELFTEST OK`.
- `scan-flow.yml`: `screen-viewfinder`, `key-capture`, `screen-scan`, `scan-bar`, `screen-result`, `key-back`.
- `settings.yml`: `key-log`, `screen-history`, `key-forward`, `screen-settings`, `setting-sound`, `setting-sound-state`, `setting-haptics`, `setting-haptics-state`, `setting-language`, `setting-language-state`, `setting-intensity`, `setting-legal`, `screen-legal`.
- `share.yml`: `key-share`, `share-916`, `screen-result`, text `Send field card.*` (the Android chooser title, `share.title`).
- `relay.yml`: three scans, `stopApp`, `launchApp` without clearing state (session index 1), one more scan, `key-back`, then `relay-module`, `relay-fit`, the Android 13 `Allow` dialog (optional), `relay-result`.
- `lib/start.yml` (fresh state to viewfinder) and `lib/capture.yml` (viewfinder to result) are shared steps, not listed in `flow_path`.

Flows launch with the camera permission denied: the viewfinder then shows VF STORED, CAPTURE still works with the stored frame, and the interstitial gate stays closed, so no flow is interrupted by an ad. The UMP consent form cannot appear on a build with test ad IDs and no `google-services.json`; with a real consent setup it would show between launch and the `key-acknowledge` tap in `lib/start.yml` and `boot.yml`, and those steps would need a consent tap added.

Local checks without a device (Maestro 2.x):
```
cd e2e/maestro && for f in boot scan-flow settings share relay lib/start lib/capture; do maestro check-syntax $f.yml; done
```
On a connected emulator: `MAESTRO_PROFILE=local maestro test e2e/maestro/scan-flow.yml` (set `adb shell wm size` and `wm density` by hand to try a profile).

### Owner steps for the first live run

1. Create the Expo project and robot token as in steps 1 and 2 above. Put the token in the EAS environment secrets of the Expo project (Project settings, Secrets, name `EXPO_TOKEN`) and, for CI, in the repository secrets. Do not paste it into chat or a file in the repo.
2. Allowlist `expo.dev`, `api.expo.dev` and `*.expo.dev` in the environment's network policy.
3. `pnpm dlx eas-cli@latest workflow:validate .eas/workflows/e2e-android.yml`, then `workflow:run ... --wait`.
4. `workflow:view <id> --json` lists one "Maestro Test Results" artifact per job. Download all three; each holds that profile's screenshots and video. Add the paths to the P8-06 evidence in `features.json`.

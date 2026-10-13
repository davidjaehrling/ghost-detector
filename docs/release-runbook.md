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

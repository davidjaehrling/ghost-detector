# e2e

## L2: web screenshots (Playwright)
- Run: `pnpm e2e:web` (exports the web build into `dist/`, serves it on port 4173, runs three projects at 360x800, 390x844, 428x926).
- Specs live in `e2e/web/`. Current screenshots go to `e2e/screenshots/current/<project>/` (gitignored).
- Goldens live in `e2e/screenshots/golden/<project>/`, no platform suffix.
- Update goldens only for an intended visual change: `pnpm e2e:web:update`, then review the PNG diff and commit.
- Locally the preinstalled Chromium is used (Playwright 1.56.1, pinned). In CI: `pnpm exec playwright install --with-deps chromium`.

## Evidence
Command output and screenshots that back a `features.json` entry go in `e2e/evidence/`.

## L3: Maestro on Android
Lives in `e2e/maestro/`. The Release Manager owns it; do not edit from here.

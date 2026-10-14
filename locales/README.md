# Locale files

`en.json` is the source of truth. `de.json`, `es.json` and `pt.json` (P7-03) carry the same keys.
`locales/engine/<lang>.json` holds the engine copy (profile bank, notification templates); the loader
merges it into the same namespace under the `engine.` prefix (a key written without the prefix gets it
added). Do not put `engine.` keys in `<lang>.json`.

## Shape

One flat object, dotted keys, string values only:

```json
{ "settings.sound": "SOUND", "relay.body": "Fit the relay? ..." }
```

## Key names

`area.part.name`, camelCase segments, at most four levels. The first segment is the area:

| Area | Where it shows |
| --- | --- |
| `boot`, `onboarding`, `sticker`, `hud` | boot self-test, calibration card, sticker, shared HUD labels |
| `viewfinder`, `lore`, `tag` | viewfinder HUD, location notes, location tags (`tag.short.*` is the narrow-window form) |
| `scan` | scan theatre status lines (`scan.phase.0` to `scan.phase.4`), live row labels, fault line |
| `result`, `deep`, `share` | result card, tier names (`result.tier.*`), result lines, Deep Scan, share flow |
| `history`, `log` | investigation log |
| `settings`, `legal`, `about`, `intensity` | Settings and Legal |
| `relay` | FIELD LOG RELAY opt-in and the notification channel name (`relay.channelName`) |
| `a11y` | spoken value texts |

A name ending `Label` is a screen-reader label for the control next to it. It may be longer than the
legend; the legend (the key cap text) has to fit a 72 px cap.

## Placeholders

`{name}` is replaced by the value the code passes. Keep every placeholder the English text has, and
keep the name unchanged. A missing placeholder fails the tests. Numbers are formatted by the code
(decimal comma in `de`, `es`, `pt`); do not format them in the text. Units (`mG`, `°C`, `dBFS`, `Hz`)
stay as they are.

## Plurals

A plural is a pair of keys, `name_one` and `name_other`, read in code as `t('name', { n })`. A language
that needs more forms adds `_zero`, `_two`, `_few` or `_many`; `_other` is always required. English
today: `log.cases_one`, `log.cases_other`.

## Closed sets

Some keys are read by index or by name from a closed set; a language keeps the same set:

- `deep.evp.0` to `deep.evp.11`: exactly twelve EVP fragments.
- `tag.*`, `tag.short.*`: the five location tags.
- `settings.language.*`: language names stay `SYSTEM`, `EN`, `DE`, `ES`, `PT`.
- `scan.phase.0` to `scan.phase.4`, `result.tier.*`, `result.line.*`, `intensity.*`.

## Line breaks

`onboarding.questionHead` carries one `\n`; the card sets that line and `onboarding.questionTail` on
two rows. `scan.fault` is two sentences; a narrow glass sets one per row, split at the first `. `.

## Disclosure keys

`src/i18n/disclosures.ts` lists the keys that never fall back to English: `sticker.head1`,
`sticker.body`, `about.line`, `result.strip.mark`, `deep.sub`, `relay.body`, `relay.channelName`. The
test checks each one exists in every language file present, differs from `en`, and carries the marker
words (simulated, "detects nothing", video and an advertising word).

## Not here yet

`src/fx/share/text.ts` (the share card) is the FX Engineer's file and still carries English strings.
Left in code on purpose: the brand plate `VELDEN  FS-4/87-P`, the sticker stamps `CAL` and `PRÜF`, the
unit strings, serial numbers and the dev-only probe pages (`app/*-probe.tsx`).

## Per-language notes (P7-03)

Register (D-038): instrument surfaces are impersonal in every language; `Sie` (DE), `usted` (ES) and the polite third person with `o utilizador` (PT) appear only on consequence surfaces (Deep Scan, permission rationale, relay opt-in, consent, Settings help, legal) and never share a screen with the other register. A consequence line that needs no pronoun stays impersonal.

Kept English everywhere: tier names, `CASE`, `DEEP SCAN`, fault codes, serials, `SPI`, `IDX`, `CH`, `EVP`, `GEO`, units, the brand plate, the `profile.prefix.*` three-letter codes (they are serial codes, so they no longer match the localised class word) and the language names.

Number and plural handling: no digit is typed in a string except the fixed instrument constants the English file already hard-codes (`2048`, `100%`, `12%`, `8%`, `650 mG`, `30 cm`, `03:00`). Everything else goes through placeholders. `log.cases_*` and `history.*` count nouns use the local word (`FALL`/`FÄLLE`, `CASO(S)`); the code word `CASE` stays English next to a number.

Open question for Builder A: engine notifications take `{tag}` from the stored tag id (`cellar`, `attic`). If the id is printed as is, a German notification reads `... · CELLAR`. The templates are ready for a localised tag, but the code has to pass the localised word (`tag.<id>`). `notify.lore.<id>` keys are looked up by the same id, so they stay English-keyed.

### DE

- Variant: standard German. Instrument voice is the infinitive or noun style of a technical manual. `Sie` on the camera rationale (`Ihr Gerät`) and the relay opt-in; the `du` of the old voice guide is gone.
- Rewritten, not translated: location tags and lore (`Dachstuhl`, `First`, `Zugluft`, `Türzargen`, `Kachelofen`, `Dachschräge`), the 24 class names (`NACHBILD`, `IRRLICHT`, `RAUNEN`, `HÜTER`, `SIEDLER` ...), attachments in German housing (Altbau, Kachelofen, Treppenhaus), the EVP fragments, `QUIT` for `ACK` (the German word for acknowledging on a control panel), `FELD` for `FLUX` (the HUD already says field), `KÄLTEPUNKT`, `FELDKARTE`, `FELDPROTOKOLL`.
- No word from the claim list is used for a class: `PRESENCE` became `GEGENWART` because `Präsenz*` is listed.
- Abbreviation table (legend or short form; English length in brackets, budget = English + 2):

| Key | EN | DE |
| --- | --- | --- |
| `boot.key` | ACK (3) | QUIT (4) |
| `history.next` | SETUP (5) | SETUP (5) |
| `settings.next`, `legal.next` | BACK (4) | ZURÜCK (6) |
| `scan.cancel`, `share.cancel` | CANCEL (6) | ABBRUCH (7) |
| `viewfinder.hud.allow` | ALLOW (5) | ZUGANG (6) |
| `viewfinder.hud.log` | LOG (3) | LOG (3) |
| `viewfinder.hud.capture` | CAPTURE (7) | AUFNAHME (8) |
| `result.photoKey` | PHOTO (5) | FOTO (4) |
| `result.back` | NEW SCAN (8) | NEUER SCAN (10, two lines) |
| `share.key` | SHARE (5) | TEILEN (6) |
| `onboarding.unsure` | NOT SURE (8) | UNSICHER (8) |
| `onboarding.skip` | SKIP (4) | WEITER (6) |
| `relay.fit` | FIT RELAY (9) | EINBAUEN (8) |
| `relay.notNow` | NOT NOW (7) | SPÄTER (6) |
| `history.emptyLegend` | VIEW FINDER (11) | SUCHER (6) |
| `settings.open`, `legal.open` | OPEN (4) | ÖFFNEN (6) |
| `tag.short.*` | CELLAR ATTIC BEDROOM HALL OUTSIDE | KELLER DACH SCHLAFZ. FLUR AUSSEN |

- Longer than the +35% allowance and worth a layout look: `settings.legal` is `RECHT` (5) to stay short; `viewfinder.hud.stored` is `SU · GESP.`; `history.relayOn` is `FELDPROTOKOLL: EIN` (18 against 19, no stretch).
- `result.eraLabel` is `ÄRA`, a short label that also reads as German.

### ES

- Variant: neutral Spanish. Instrument surfaces use infinitives and impersonal forms (`Barrer despacio.`, `Pulsar CAPTURAR`). `usted` on the camera rationale (`su dispositivo`) and the relay opt-in (`Usted recibe`). No `tú`, no `vosotros`. Device words are neutral: `dispositivo`, never `móvil` or `celular`.
- Rewritten, not translated: location tags and lore (`desván`, `caballete`, `rasante`, `marcos de puerta`), the 24 class names (`IMPRONTA`, `POSIMAGEN`, `OQUEDAD`, `MURMULLO`, `GUARDIÁN` ...), attachments (`alacena`, `fogón`, `estancia`), the EVP fragments, `FICHA DE CAMPO` for the field card, `PUNTO FRÍO`, `CONDUCTA`.
- `PRESENCE` became `APARICIÓN` because `presencia*` is on the claim list.
- `ON` and `OFF` stay as printed on Spanish devices.
- Abbreviation table (English length in brackets, budget = English + 2):

| Key | EN | ES |
| --- | --- | --- |
| `boot.key` | ACK (3) | OK (2) |
| `history.next` | SETUP (5) | AJUSTES (7) |
| `settings.next`, `legal.next` | BACK (4) | ATRÁS (5) |
| `scan.cancel`, `share.cancel` | CANCEL (6) | CANCELAR (8) |
| `viewfinder.hud.allow` | ALLOW (5) | ACCESO (6) |
| `viewfinder.hud.log` | LOG (3) | REG (3) |
| `viewfinder.hud.capture` | CAPTURE (7) | CAPTURAR (8) |
| `result.photoKey` | PHOTO (5) | FOTO (4) |
| `result.back` | NEW SCAN (8) | NUEVO SCAN (10, two lines) |
| `share.key` | SHARE (5) | ENVIAR (6) |
| `onboarding.unsure` | NOT SURE (8) | NO SÉ (5) |
| `onboarding.skip` | SKIP (4) | OMITIR (6) |
| `relay.fit` | FIT RELAY (9) | INSTALAR (8) |
| `relay.notNow` | NOT NOW (7) | AHORA NO (8) |
| `history.emptyLegend` | VIEW FINDER (11) | VISOR (5) |
| `settings.open`, `legal.open` | OPEN (4) | ABRIR (5) |
| `tag.short.*` | CELLAR ATTIC BEDROOM HALL OUTSIDE | SÓTANO DESVÁN DORM. PASIL. FUERA |

- Over budget on purpose, rewritten shorter instead of shrunk: `history.unlogged` is `SIN REG.`; `viewfinder.hud.stored` is `VS · GUARD.`; `tag.short.hallway` is `PASIL.` (6 against `HALL` 4, +2).
- `legal.impressum` stays `IMPRESSUM`: it opens the German document.

### PT

- Variant: European Portuguese (pt-PT, store locale pt-PT): `utilizador`, `registo`, `deteta`, `ecrã`, `descodificar`, `partilhar`, `a` plus infinitive (`A IMPRIMIR`, `A RECALIBRAR`), `leem`, `casas de banho`. The agreed 1990 spelling is used (`atividade`, `noturnos`, `atualizada`), as in the Compliance tables. Instrument surfaces use impersonal forms and infinitives (`Varrer devagar.`, `Premir CAPTURAR`). The polite third person with `o utilizador` appears on the camera rationale and the relay opt-in. No `você`, no `tu` in labels. Brazilian users are served this text; a `pt-BR` pass is a P10 decision (D-038).
- Rewritten, not translated: location tags and lore (`caves`, `sótão`, `cumeeira`, `ombreiras`, `águas-furtadas`, `lareira`), the 24 class names (`PÓS-IMAGEM`, `VESTÍGIO`, `MURMÚRIO`, `RETARDATÁRIO`, `GUARDIÃO` ...), attachments, the EVP fragments (`não estamos sós`, `ouvi-te`), `FICHA DE CAMPO`, `PONTO FRIO`, `CONDUTA`.
- `PRESENCE` became `APARIÇÃO` because `presença*` is on the claim list.
- The `ecrã` word appears in `scan.glass` (spoken label); no visible key needs it.
- Abbreviation table (English length in brackets, budget = English + 2):

| Key | EN | PT |
| --- | --- | --- |
| `boot.key` | ACK (3) | OK (2) |
| `history.next` | SETUP (5) | SETUP (5) |
| `settings.next`, `legal.next` | BACK (4) | VOLTAR (6) |
| `scan.cancel`, `share.cancel` | CANCEL (6) | CANCELAR (8) |
| `viewfinder.hud.allow` | ALLOW (5) | ACESSO (6) |
| `viewfinder.hud.log` | LOG (3) | REG (3) |
| `viewfinder.hud.capture` | CAPTURE (7) | CAPTURAR (8) |
| `result.photoKey` | PHOTO (5) | FOTO (4) |
| `result.back` | NEW SCAN (8) | NOVO SCAN (9, two lines) |
| `share.key` | SHARE (5) | ENVIAR (6) |
| `onboarding.unsure` | NOT SURE (8) | NÃO SEI (7) |
| `onboarding.skip` | SKIP (4) | SALTAR (6) |
| `relay.fit` | FIT RELAY (9) | INSTALAR (8) |
| `relay.notNow` | NOT NOW (7) | AGORA NÃO (9) |
| `history.emptyLegend` | VIEW FINDER (11) | VISOR (5) |
| `settings.open`, `legal.open` | OPEN (4) | ABRIR (5) |
| `tag.short.*` | CELLAR ATTIC BEDROOM HALL OUTSIDE | CAVE SÓTÃO QUARTO CORRED. FORA |

- Over budget on purpose, rewritten shorter instead of shrunk: `history.unlogged` is `SEM REG.`; `viewfinder.hud.stored` is `VS · GUARD.`; `tag.short.hallway` is `CORRED.` (7 against `HALL` 4, +3).
- `result.profile` is `FICHA DA ENTIDADE` (17 against 14, +21%).

### Open questions (all languages)

1. Notification `{tag}` is the stored tag id (see above); a localised word is needed in the code.
2. `src/i18n/__tests__/i18n.test.ts` still asserts that `t('settings.sound')` is `SOUND` under `setLanguage('de')`. That held while no `de.json` existed; Builder A updates it.
3. `onboarding.skip` is a key-row legend in all four languages; the DE `WEITER` reads as "next", which matches what the key does (skip to the next screen).
4. The share-card keys `share.card.*` were added to `en.json` by the FX Engineer while this work ran; all three languages carry them with the disclosure wording from `docs/localisation-rules.md` section 1. `share.card.mark` and `share.card.footer` are not in `DISCLOSURE_KEYS` yet; Compliance should add them to the contract test.
5. A second-model review (P7-04) should look at: `INSTALAR` for `FIT` (relay), `STORY`/`HISTORIA`, `IRRLICHT` as a class name, `QUIT`, `CONDUTA`.

## Checks

`pnpm test` fails when code uses a key that `en.json` lacks, when an `en.json` key is not referenced,
or when a dynamic key uses a prefix outside the allowlist. `pnpm lint:copy` scans every file here.

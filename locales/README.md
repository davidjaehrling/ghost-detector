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
`sticker.head2`, `sticker.body`, `about.line`, `result.strip.mark`, `deep.arm` (was `deep.sub`; the
armed sentence above key 4), `deep.offline`, `relay.body`, `relay.channelName`, `share.card.mark`,
`share.card.footer`, `engine.notify.prefix`. The test checks each one exists in every language file
present, differs from `en`, and carries the marker words (simulated, "detects nothing", video and an
advertising word).

`deep.arm` is a sentence, so it stays in sentence case (`DEEP SCAN` is the only capitalised run). It must
keep the D-038 sublabel words verbatim: EN `Sponsored video plays first`, DE `Werbevideo läuft zuerst`,
ES `Video publicitario primero`, PT `Vídeo publicitário primeiro`. It sets on two lines at 360; the
most it may hold is about 80 characters (EN 78, DE 80, ES 75, PT 76).

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
| `onboarding.skip` | SKIP (4) | SKIP (4) |
| `relay.fit` | FIT RELAY (9) | EINBAUEN (8) |
| `relay.notNow` | NOT NOW (7) | SPÄTER (6) |
| `history.emptyLegend` | VIEW FINDER (11) | SUCHER (6) |
| `settings.open`, `legal.open` | OPEN (4) | ÖFFNEN (6) |
| `tag.short.*` | CELLAR ATTIC BEDROOM HALL OUTSIDE | KELLER DACH SCHLAFZ. FLUR AUSSEN |

- Longer than the +35% allowance and worth a layout look: `settings.legal` is `RECHT` (5) to stay short; `viewfinder.hud.stored` is `SU · GESP.`; `history.relayOn` is `FELDPROTOKOLL: EIN` (18 against 19, no stretch).
- `result.eraLabel` is `ÄRA`, a short label that also reads as German.

### ES

- Variant: neutral Spanish. Instrument surfaces use infinitives and impersonal forms (`Barrer despacio.`, `Pulsar CAPTURAR`). `usted` on the camera rationale (`su dispositivo`) and the relay opt-in (no pronoun after review round 1). No `tú`, no `vosotros`. Device words are neutral: `dispositivo`, never `móvil` or `celular`.
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
| `result.back` | NEW SCAN (8) | ESCANEAR (8) |
| `share.key` | SHARE (5) | ENVIAR (6) |
| `onboarding.unsure` | NOT SURE (8) | NO SÉ (5) |
| `onboarding.skip` | SKIP (4) | OMITIR (6) |
| `relay.fit` | FIT RELAY (9) | INSTALAR (8) |
| `relay.notNow` | NOT NOW (7) | AHORA NO (8) |
| `history.emptyLegend` | VIEW FINDER (11) | VISOR (5) |
| `settings.open`, `legal.open` | OPEN (4) | ABRIR (5) |
| `tag.short.*` | CELLAR ATTIC BEDROOM HALL OUTSIDE | SÓTANO DESVÁN DORM. PASIL. EXTERIOR |

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

## P8 wave 2 review (D-045)

Builders A and B added keys with their own de, es and pt drafts. Copy reviewed every one against D-038
(register), the +2 width budget, the disclosure words, the claim lists and the banned list. New keys:

| Keys | Where |
| --- | --- |
| `fault.unit.code`, `fault.unit.cause`, `fault.optics.code`, `fault.optics.cause`, `fault.next`, `fault.reset`, `fault.resetLabel` | in-fiction FAULT screen (impersonal; codes `E-60`, `E-52` fixed) |
| `viewfinder.window.open`, `viewfinder.window.inHours`, `viewfinder.window.inMinutes` | 03:00 countdown in the top strip, no seconds |
| `scan.hold` | HOLD tag on the held thermal row |
| `result.dtAvg`, `result.coldSpotMin`, `result.strip.a`, `result.strip.min`, `result.strip.avg` | named temperatures: row `ΔT AVG`, cold spot and strip `ΔT MIN` |
| `deep.arm`, `deep.keyWarming`, `deep.keyOffline` | two-step arm line and key 4 states (replace `deep.sub`) |
| `engine.notify.t4.body`, `engine.notify.t4.body.untagged` | template 4 with the case clock time and tag |
| `relay.settingsHelp` (changed) | Settings help names the CALM effect (A-71) |

Dropped: `result.coldSpot`, `deep.sub`.

Choices:

- `HOLD` stays English in all four languages. It is the printed legend on hold-function instruments in every market, and `SPI`, `IDX`, `EVP` are kept the same way.
- DE `ΔT MW` (Mittelwert) for the average. The builder's `ΔT MITT` is not a word or an abbreviation. `ΔT MITTEL` is 9 and the label column holds 8. `Ø` was not used: the glyph is not in the cmap check.
- DE `deep.arm` opens with `Dekodiert`, the verb the app already uses for the signature (`SIGNATUR 58% DEKODIERT`). `Löst ... auf` also reads as "dissolves". `erneut` replaces the colloquial `nochmal`. `Ermittelt` was not used: `ermittelt*` is a claim word.
- ES and PT `deep.arm` end `iniciar` (verb), not `inicio` (noun), so the last clause is an instruction like `Pulsar CAPTURAR`.
- DE `ANZEIGEMODUL` and `ANZEIGEPROZESS` replace `ANZEIGEKERN` and `BILDSCHIRMPROZESS`: one word for the display, and `-kern` read as "nucleus".
- PT `deep.keyWarming` is `ESPERA`, the same noun as ES and as `viewfinder.hud.wait`. `AGUARDE` was an imperative. DE `WARTEN` already matches `SU · WARTEN`.
- ES `viewfinder.window.open` is `03:00 ABIERTA` (13 against 10, +3). It is shorter than the longest state, `03:00 EN 12 H 59 MIN`, so the strip width does not move. PT `ABERTA` likewise.
- ES `share.storySub` is `STORY` (was `HISTORIA`, 8 against 5, +3, and one letter from the HISTORIAL screen). DE and PT already print `STORY`.
- DE `onboarding.skip` is `SKIP` (A-14). `WEITER` means continue and `NOT SURE` already covers that. DE has no skip word inside the 6 character budget (`ÜBERSPRINGEN` 12, `ÜBERSPR.` 8); `SKIP` is the legend on German players and streaming apps. ES `OMITIR` and PT `SALTAR` already mean skip.
- `legal.code` drops the mode number in all four languages (`LEGAL`, `RECHTLICHES`), as A-72 did for History and Settings. `MODE 5` was then printed on Legal beside a Settings screen that no longer carried it.
- A-25: the short tag set is the one set at every width: EN `CELLAR ATTIC BEDROOM HALL OUTSIDE`, DE `KELLER DACH SCHLAFZ. FLUR AUSSEN`, ES `SÓTANO DESVÁN DORM. PASIL. EXTERIOR`, PT `CAVE SÓTÃO QUARTO CORR. FORA`. The long set cannot fit five chips at 360 in EN (239.8 px against 232 for 12 px gaps). `tag.*` (long) stays for notifications and sentences, where `Dorm.` would read badly.
- A-71: `relay.settingsHelp` ends `CALM sends fewer.` / `RUHIG sendet weniger.` / `CALMA envía menos.` / `CALMA envia menos.` The words are the `intensity.calm` values. Builder B's `notify.test.ts` proves it: Calm sends templates 2 and 5 only, cap 1 a week against 2 and 3.
- A-82: `relay.body` carries the catalogue in all four languages (Builder A's text kept, no change). Compliance re-reads.
- A-84: template 4 DE opens `Protokolliert` (was drafted `Erfasst`, which says captured). `{tag}` stays lowercase as the engine passes it. German nouns need a capital, so DE needs `{Tag}`; see the open item in the commit report.
- Register: fault, window, temperature, strip and key keys are impersonal; the deep arm line and relay copy need no pronoun, so none was added.

- Settings legends (QA golden review): `settings.on` and `settings.off` are printed switch legends, so each market keeps the legend its hardware prints: EN `ON` / `OFF`, DE `EIN` / `AUS` (German switch plates and `FELDPROTOKOLL: EIN`), ES and PT `ON` / `OFF` (as on Spanish and Portuguese devices; `SÍ/NO` reads as a quiz answer, `ACT./DESACT.` is 5 and 8 against 2 and 3). De differs on purpose and stays internally consistent with `history.relayOn`. `settings.language.system` (the language row's device-default value) is a word, not a legend: EN and DE `SYSTEM` (a German word), ES and PT `SISTEMA` (7 against 6, +1). The EN, DE, ES, PT codes in the language row stay as codes.
- Fault cause (Compliance diff review): `fault.unit.cause` drops "process", which sounds like an OS dialog. EN `SCREEN STOPPED.` (was `SCREEN PROCESS STOPPED.`), DE `ANZEIGE GESTOPPT.` (was `ANZEIGEPROZESS GESTOPPT.`), ES `PANTALLA DETENIDA.` (was `PROCESO DE PANTALLA DETENIDO.`), PT `ECRÃ PARADO.` (was `PROCESSO DO ECRÃ PARADO.`). All shorter than before.
- `boot.transient` is parameterised: `{count}` replaces the literal `1` in all four languages (`TRANSIENT {count} · LOGGED`, `TRANSIENTE {count} · PROTOKOLLIERT`, `TRANSITORIO {count} · REGISTRADO`, `TRANSITÓRIO {count} · REGISTADO`). Call `t('boot.transient', { count })`.

Width: DE `deep.arm` (80 characters) and all others fit two lines at an estimated 43 characters a line at 360 (VT323 16 px, 6.4 px advance); the bounding-box test decides.

## Checks

`pnpm test` fails when code uses a key that `en.json` lacks, when an `en.json` key is not referenced,
or when a dynamic key uses a prefix outside the allowlist. `pnpm lint:copy` scans every file here.

## Review round 1

P7-04: three native reviewers (DE technical-manual editor, ES editor from Spain, pt-PT editor) went through the files. Verdicts were block with 2, 2 and 1 block findings and the rest polish (DE 37 findings, ES 46, PT 35). All five block fixes are applied verbatim. Polish fixes are applied unless listed under "Kept or changed" below. Key parity, placeholders and the disclosure keys are unchanged in meaning; lint and the i18n tests pass.

### Applied

- Block, DE: `result.line.strong` is `Stark. Signatur wird schärfer.` (`löst sich auf` meant the opposite); `viewfinder.hud.wait` is `SU · WARTEN`.
- Block, ES: `viewfinder.permission.camera` states the purpose again (`Cámara necesaria para capturar. ...`); `relay.header` is `RELÉ DE REGISTRO`.
- Block, PT: `relay.header` is `RELÉ DO REGISTO DE CAMPO`.
- Polish, keys changed (DE 42, ES 41, PT 45, engine keys carry the `engine.` prefix):
  - DE: `legal.privacy`, `settings.scares`, `settings.legal`, `viewfinder.permission.camera`, `viewfinder.permission.denied.cause`, `viewfinder.permission.denied.next`, `viewfinder.hud.wait`, `result.line.trace`, `result.line.strong`, `deep.warming`, `share.printing`, `history.logged`, `history.nightsLine`, `history.moonsLine`, `scan.phase.2`, `lore.cellar.1`, `lore.bedroom.0`, `lore.hallway.1`, `lore.outdoors.0`, `lore.outdoors.1`, `relay.body`, `relay.settingsLabel`, `settings.calm`, `boot.key`, `onboarding.intensitySet`, `onboarding.skipLabel`, `engine.profile.class.00`, `engine.profile.class.10`, `engine.profile.temperament.07`, `engine.profile.attachment.07`, `engine.profile.attachment.16`, `engine.profile.attachment.23`, `engine.profile.behaviour.01`, `engine.profile.behaviour.02`, `engine.profile.behaviour.03`, `engine.profile.behaviour.06`, `engine.profile.behaviour.13`, `engine.profile.timing.07`, `engine.profile.timing.13`, `engine.profile.era`, `engine.notify.lore.hall`, `engine.notify.lore.kitchen`
  - ES: `settings.haptics`, `viewfinder.permission.camera`, `viewfinder.permission.denied.head`, `viewfinder.permission.denied.cause`, `result.missingTitle`, `result.missingLine`, `result.thermal`, `result.back`, `result.line.trace`, `result.line.strong`, `deep.offline`, `deep.done`, `deep.evp.0`, `history.relayLabelOn`, `history.relayLabelOff`, `history.relayOn`, `history.relayOff`, `scan.phase.4`, `tag.short.outdoors`, `lore.cellar.1`, `lore.attic.1`, `lore.hallway.1`, `lore.outdoors.0`, `boot.selftest.therm`, `relay.header`, `relay.body`, `relay.fitted`, `relay.notFitted`, `relay.settingsLabel`, `onboarding.intensitySet`, `onboarding.skipLabel`, `engine.profile.class.00`, `engine.profile.temperament.21`, `engine.profile.temperament.22`, `engine.profile.attachment.09`, `engine.profile.attachment.17`, `engine.profile.behaviour.20`, `engine.profile.timing.07`, `engine.profile.era`, `engine.notify.t3.body`, `engine.notify.lore.kitchen`
  - PT: `legal.nextLabel`, `settings.haptics`, `history.next`, `history.nextLabel`, `scan.glass`, `viewfinder.permission.camera`, `viewfinder.permission.denied.cause`, `viewfinder.permission.denied.next`, `viewfinder.hud.live`, `result.missingLine`, `result.line.trace`, `result.line.strong`, `result.hidden.behaviour`, `log.recordLine`, `history.peak`, `scan.phase.0`, `scan.phase.4`, `tag.short.hallway`, `lore.hallway.1`, `lore.outdoors.0`, `lore.outdoors.1`, `relay.header`, `relay.fitted`, `relay.notFitted`, `boot.keyLabel`, `onboarding.intensitySet`, `onboarding.skipLabel`, `engine.profile.class.08`, `engine.profile.class.10`, `engine.profile.class.18`, `engine.profile.temperament.04`, `engine.profile.temperament.06`, `engine.profile.temperament.08`, `engine.profile.temperament.09`, `engine.profile.temperament.13`, `engine.profile.temperament.16`, `engine.profile.temperament.22`, `engine.profile.behaviour.01`, `engine.profile.behaviour.02`, `engine.profile.behaviour.03`, `engine.profile.behaviour.04`, `engine.profile.behaviour.05`, `engine.profile.behaviour.15`, `engine.profile.behaviour.17`, `engine.profile.detail.04`
- ES relay naming: the toggle, history lines and spoken labels now say `RELÉ DE REGISTRO`, so the name no longer matches the notification prefix `REGISTRO DE CAMPO`.
- PT: the app screen `Definições` is capitalised wherever a row names the app screen; `definições do dispositivo` stays lowercase.
- DE finding 36 (`engine.notify.t3.*` printing the English tag id) is a code-side item; no string change. Builder A already passes `tag.<id>` (commit 5a73973).

### Kept or changed from the proposal

| Language and key | Reviewer proposal | What the file has | Reason |
| --- | --- | --- | --- |
| DE `relay.body` | `... Index, Mond oder ein offener Fall. Zwischen 18:00 und 22:00. ...` | `Höchstens ein Eintrag pro Nacht: Index und Mond oder ein offener Fall. Zwischen 18:00 und 22:00.` | `Sie erhalten` dropped and `Zwischen` added as proposed. Index and moon stay a pair plus one alternative, because a bare three-item list breaks the voice guide ban on always-three lists. |
| DE `relay.blocked` | `RELAIS VOM SYSTEM GESPERRT. ...` | `RELAIS GESPERRT. GERÄTEEINSTELLUNGEN ÖFFNEN.` | Relay copy must not pose as an OS message (D-039); ES and PT drop the cause the same way. The second sentence already sends the user to the device settings. |
| ES `onboarding.question`, `onboarding.questionHead` | `¿Ha vivido alguna vez algo que no pudo explicar?` | `¿Alguna vez hubo algo que no se pudo explicar?` | The `usted`-implied verb moves the onboarding question onto the consequence register. D-038 keeps the question impersonal. |
| PT `onboarding.question`, `onboarding.questionHead` | `Já lhe aconteceu algo que não conseguiu explicar?` | `Alguma vez houve algo que não se conseguiu explicar?` | `lhe` is the polite third person, which D-038 restricts to consequence surfaces. Same reason as ES. |
| ES `tag.short.hallway` | `PASILLO` | `PASIL.` | 7 against `HALL` 4 is +3, over the key-cap budget of +2. A layout check can lift this; `PASILLO` fits if the window already holds `BEDROOM`. |
| ES `viewfinder.hud.live` | `VS · DIRECTO` | `VS · VIVO` | 12 against 9 is +3, over the HUD budget. PT takes `VS · DIRETO` (11, +2). |
| ES `profile.class.10` | `HUÉSPED` | `APARICIÓN` | The reviewer calls `APARICIÓN` acceptable. `HUÉSPED` reads as guest or host organism first. |

### Layout watch

Over the +25% allowance for status lines after review: ES `scan.phase.4` and PT `scan.phase.4` (26 characters against 18). Both were already over (24); the gerund and `A` plus infinitive carry the register the reviewers asked for. DE `legal.privacy` is `DATENSCHUTZERKLÄRUNG` (21 against 14) on a Legal row, not a key cap. Check all three in the L2 screenshots.

## Review round 2

Errors only. DE `engine.profile.behaviour.14`, `deep.evp.10` (`mach es aus`) and `engine.profile.attachment.00` corrected; ES `lore.outdoors.1` now reads `por encima de`; PT `history.relayLabelOn` and `history.relayLabelOff` end `Abrir Definições`. The ES table row for `result.back` now lists `ESCANEAR` (8), as in the file.

### Review round 2 addendum

PT `result.hidden.behaviour` is `COMPORT.` (8 against `BEHAVIOUR` 9). The round 1 value `COMPORTAMENTO` (13) broke mid-word in the entity-card label column at 390 px. `CONDUTA` was not used: it means moral conduct or a duct, which the reviewer flagged. `COMPORT.` keeps the reviewer's term. The siblings pass the same budget: `result.hidden.designation` DE 11, ES 11, PT 10 against EN 11; `result.hidden.behaviour` DE `VERHALTEN` 9, ES `CONDUCTA` 8.

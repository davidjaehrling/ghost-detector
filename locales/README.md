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

## Checks

`pnpm test` fails when code uses a key that `en.json` lacks, when an `en.json` key is not referenced,
or when a dynamic key uses a prefix outside the allowlist. `pnpm lint:copy` scans every file here.

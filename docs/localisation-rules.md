# Localisation rules (Compliance)

Owner: Compliance. Binding for P7 and P9. Source: the P7-07 pre-build ruling, adopted as D-038 in `docs/decisions.md`. Sources behind it: plan §7 and §8, digest §4, D-026, D-028, D-032, D-035. Machine-readable lists: `scripts/claim-words.json` (same entries as sections 3 and 4; keep both in step).

Register ruling (D-038): impersonal instrument voice everywhere. Sie, usted and polite third person only on consequence surfaces (Deep Scan cost and video, permission rationale, relay opt-in, consent, Settings help). PT is European Portuguese, store locale `pt-PT`.

## 1. The SIMULATED mark

An English-only mark in a non-EN locale is a VETO. The mark is uppercase with no diacritics. It is always the last item of the strip. A card renders in the language active in the app at share time; English is not added as a second mark.

| Lang | Mark | Letters | Footer sentence | Lint stem |
|---|---|---|---|---|
| EN | SIMULATED | 9 | READINGS ARE SIMULATED | `SIMULAT` |
| DE | SIMULIERT | 9 | WERTE SIND SIMULIERT | `SIMULIER` |
| ES | SIMULADO | 8 | LECTURAS SIMULADAS | `SIMULAD` |
| PT | SIMULADO | 8 | LEITURAS SIMULADAS | `SIMULAD` |

The footer reads `[STORE NAME] · <footer sentence>`. Code points to change: `src/fx/share/constants.ts` (mark const and `footerText`), `src/fx/share/render.ts` (the `lastIndexOf` of the mark when it measures the footer mark), `src/ui/result/stamp.ts` (`screenStampText`). Each locale needs a pixel-measured cap height and contrast test (`MARK_CAP_FRAC` unchanged).

## 2. Disclosures

Keys that must not fall back to `en`: `sticker.*`, `about`, `card.footer`, `card.mark`, the strip suffix, `deepscan.sub`, `deepscan.offline`, `relay.body`. A missing or EN-identical value in de, es or pt is a VETO. A disclosure-contract test asserts presence in all four locales, difference from `en`, and the marker regexes below.

Do not use "Messwert", "Messung", "medición" or "medição" in a disclosure. Do not use "Streich", "broma" or "brincadeira" anywhere in a disclosure or listing.

### 2a. Sticker (under 25 words)

| Lang | Head | Body | Marker regexes |
|---|---|---|---|
| EN | SIMULATION UNIT · ENTERTAINMENT USE ONLY. | All readings are generated in software. This unit detects nothing. | `SIMULAT`, `detects nothing` |
| DE | SIMULATIONSGERÄT · NUR ZUR UNTERHALTUNG. | Alle Werte werden von der Software erzeugt. Dieses Gerät erkennt nichts. | `SIMULATION`, `erzeugt`, `erkennt nichts` |
| ES | UNIDAD DE SIMULACIÓN · SOLO PARA ENTRETENIMIENTO. | Todas las lecturas las genera el software. Esta unidad no detecta nada. | `SIMULACI`, `genera`, `no detecta nada` |
| PT | UNIDADE DE SIMULAÇÃO · APENAS PARA ENTRETENIMENTO. | Todas as leituras são geradas por software. Esta unidade não deteta nada. | `SIMULA`, `geradas`, `não dete[c]?ta nada` |

The negation "detects nothing" must survive in every language.

### 2b. ABOUT line (Settings and Legal)

| Lang | Text | Marker |
|---|---|---|
| EN | READINGS ARE SIMULATED. FIELD INSTRUMENT FICTION. | `SIMULAT`, `FICTION` |
| DE | WERTE SIND SIMULIERT. FELDGERÄT ALS FIKTION. | `SIMULIER`, `FIKTION` |
| ES | LAS LECTURAS SON SIMULADAS. INSTRUMENTO DE CAMPO FICTICIO. | `SIMULAD`, `FICTICIO` |
| PT | AS LEITURAS SÃO SIMULADAS. INSTRUMENTO DE CAMPO FICTÍCIO. | `SIMULAD`, `FICT[IÍ]CIO` |

### 2c. DEEP SCAN sublabel

Must name a video and carry an advertising word (UWG §5a(4), Medienstaatsvertrag labelling convention in DE). "Gesponsert" alone is not accepted in DE. The advertising word may not be dropped to save width; the key may break to two lines.

| Lang | Sublabel | Must contain |
|---|---|---|
| EN | SPONSORED VIDEO PLAYS FIRST | `VIDEO`, `SPONSORED` |
| DE | WERBEVIDEO LÄUFT ZUERST (alternative: WERBUNG: VIDEO ZUERST) | `WERBE` or `WERBUNG`, `VIDEO` |
| ES | VIDEO PUBLICITARIO PRIMERO | `PUBLICITARIO` or `PUBLICIDAD`, `VIDEO` or `VÍDEO` |
| PT | VÍDEO PUBLICITÁRIO PRIMEIRO | `PUBLICIT`, `V[IÍ]DEO` |

The longer offer line (`Run DEEP SCAN ... Short video plays.`) names the video and carries the advertising word on first mention in every language. The offline text `DEEP SCAN OFFLINE. NO SIGNAL.` is localised and never claims a truer reading.

### 2d. Relay opt-in sentence

Kept in the opt-in body in every language. It is not added to each notification.

| Lang | Sentence |
|---|---|
| EN | Lines are simulated. |
| DE | Die Einträge sind simuliert. |
| ES | Los registros son simulados. |
| PT | Os registos são simulados. |

Avoid "Meldungen", "avisos", "alertas" as the noun for the lines.

### 2e. Fixed in English in all locales

Codes and serials (`E-07`, `CASE 0041`, `FW 3.1.7`), units (mG, ΔT °C, Hz, dBFS) and tier names QUIET, TRACE, ACTIVE, STRONG, CRITICAL.

### 2f. Store metadata (P9)

Each localised listing (title, short description, first sentence of the full description, feature graphic, first screenshot) says plainly that readings are simulated, in that language. Titles never include echt, real, verdadero, auténtico, wirklich or "detector real". A literal translation of the app name is acceptable only with the simulated statement directly under it.

## 3. Claim words per language

`scripts/lint-copy.mjs` must stop using `\b`: JavaScript treats ó, ñ, ü, ã, é and ç as non-word characters. Use the Unicode form `(?<![\p{L}])(?:ENTRIES)(?![\p{L}])` with flags `iu`. An entry ending in `*` is a stem: `(?<![\p{L}])stem\p{L}*`. An entry with a space is a phrase. Case-insensitive. A single lowercase identifier-like literal is skipped as today. The lint scans `locales/*.json` and `locales/engine/*.json`. An empty list for a locale fails the lint.

Known false-positive risks for review, not for removal: `genau*` matches "genauso", `real*` matches "Realität", `echt*` matches "Echtzeit". Fix the copy, not the list.

Manual review item (P7-04): a non-negated present-tense `detecta`, `deteta` or `erkennt` is a claim. The lists omit it so the sticker negation passes.

#### EN: claim (5 entries)

```
verified*
confirmed*
accurate*
real
detected*
```

#### DE: claim (40 entries)

```
verifiziert*
bestätigt*
bestätig*
nachgewiesen*
Nachweis*
belegt*
gesichert*
bewiesen*
Beweis*
genau*
exakt*
präzise*
zuverlässig*
korrekt*
echt*
real*
wirklich*
tatsächlich*
authentisch*
wahr
wahrhaft*
reell*
entdeckt*
erkannt*
aufgespürt*
aufgedeckt*
geortet*
gefunden*
festgestellt*
detektiert*
ermittelt*
jetzt aktiv
gerade aktiv
aktuell aktiv
derzeit aktiv
Aktivität im Haus
Aktivität in Ihrem Haus
Aktivität in deinem Haus
Präsenz*
spürt*
```

#### ES: claim (38 entries)

```
verificad*
confirmad*
comprobad*
comprobación
certificad*
demostrad*
probad*
acreditad*
evidencia*
preciso*
precisa*
exacto*
exacta*
fiable*
fidedign*
riguroso*
real
reales
auténtic*
genuin*
verdader*
de verdad
realmente
detectad*
hallad*
encontrad*
localizad*
identificad*
descubiert*
captad*
activo ahora
activa ahora
ahora mismo
en este momento
actividad en su casa
actividad en tu casa
actividad en el hogar
presencia*
```

#### PT: claim (38 entries)

```
verificad*
confirmad*
comprovad*
certificad*
demonstrad*
provad*
evidência*
preciso*
precisa*
exato*
exacto*
exata*
exacta*
fiável
confiável
rigoroso*
real
reais
autêntic*
genuín*
verdadeir*
de verdade
realmente
detetad*
detectad*
encontrad*
localizad*
identificad*
descoberto*
captad*
ativo agora
ativa agora
activo agora
agora mesmo
neste momento
atividade em casa
actividade em casa
presença*
```

## 4. Banned framing and notification vocabulary

Applies to notification titles and openers, the relay copy, channel names and prompts, not to all copy. The words may appear elsewhere. Same stem syntax as section 3.

#### EN: framing (8 entries)

```
Warning*
Alert*
Alarm*
Detected*
System alert*
Danger*
Urgent*
Emergency*
```

#### DE: framing (19 entries)

```
Warnung*
Alarm*
Alarmmeldung*
Achtung
Gefahr*
Notfall*
Dringend*
Sicherheitswarnung*
Systemmeldung*
Systemhinweis*
Hinweis des Systems
Akku
Speicher
Virus
Update verfügbar
Entdeckt*
Erkannt*
Neue Aktivität
Aktivität in Ihrem Haus
```

#### ES: framing (17 entries)

```
Alerta*
Advertencia*
Aviso*
Aviso del sistema
Alarma*
Atención
Peligro*
Emergencia*
Urgente*
Seguridad
Sistema
Batería
Almacenamiento
Virus
Detectado*
Nueva actividad
Actividad en su casa
```

#### PT: framing (17 entries)

```
Alerta*
Aviso*
Aviso do sistema
Alarme*
Atenção
Perigo*
Emergência*
Urgente*
Segurança
Sistema
Bateria
Armazenamento
Vírus
Detetado*
Detectado*
Nova atividade
Atividade em casa
```

Positive form for notification titles:

| Lang | Prefix | Example | Channel name |
|---|---|---|---|
| EN | FIELD LOG | FIELD LOG · MOON 96% | Field log |
| DE | FELDPROTOKOLL | FELDPROTOKOLL · MOND 96% | Feldprotokoll |
| ES | REGISTRO DE CAMPO | REGISTRO DE CAMPO · LUNA 96% | Registro de campo |
| PT | REGISTO DE CAMPO | REGISTO DE CAMPO · LUA 96% | Registo de campo |

No exclamation marks, no "new" openers, no "while you were away" framing, no sound. The channel keeps low importance. The channel name never reads Alerts, Warnungen, Alertas or similar. Two framing bans (no title that opens with a warning or alert word, no line claiming activity was found while the app was closed) are enforced by the reviewer as well as by the list.

Exempt literals (not claims; also used for the exemption check). Entries starting `re:` are regular expressions:

```
ACTIVE
STRONG
QUIET
TRACE
CRITICAL
ΔT
mG
Hz
dBFS
re:^E-\d{2}$
re:^CASE \d{4}$
re:^FW \d+\.\d+\.\d+$
detects nothing
erkennt nichts
no detecta nada
não deteta nada
não detecta nada
```

## 5. Register per language (D-038)

| Lang | Instrument surfaces | Consequence surfaces | Notes |
|---|---|---|---|
| DE | Impersonal infinitive or noun style (`Langsam schwenken.`) | `Sie` | Mixed du and Sie inside one screen is a defect. Legal documents use `Sie`. |
| ES | Infinitives and impersonal forms (`Barrer despacio.`) | `usted` | No `vosotros`. Legal documents use `usted` or impersonal forms. |
| PT | Impersonal forms (`Varrer devagar.`) | Polite third person (`o utilizador`, `pode`) | European Portuguese: `utilizador`, `registo`, `deteta`, `ecrã`. Store locale `pt-PT`; Brazilian users are served pt-PT text. A `pt-BR` release needs its own pass and Play locale. |

Consequence surfaces: Deep Scan cost and video, permission rationale, relay opt-in, consent, Settings help.

## 6. Legal documents for P9

Facts marked [U] need a lawyer or the data protection authority; they are not agent decisions.

| Document | DE | EN | ES | PT | Status |
|---|---|---|---|---|---|
| Impressum (§5 DDG) | Required, in German | Recommended | Not required [U] | Not required [U] | One document; the LEGAL screen opens DE for DE, EN otherwise. |
| Privacy policy | Required before the DE locale ships (GDPR Art. 12) [U] | Required (default and Play listing) | Required before the ES locale ships [U] | Required before the PT locale ships, in the variant shipped [U] | All versions carry the same processor list and data categories. |
| Data safety form | Not translated | The only version | n/a | n/a | One form, English. It matches the SDKs shipped. Add any i18n package to the SDK table in `docs/data-safety.md` (expected: no data collected). |
| UMP consent form | Google localises it | same | same | same | Do not override the UMP locale in code; verify German on a DE device. |
| Permission rationale screens | Required in DE | yes | yes | yes | Same rule as the privacy policy. |

P9 rules:
1. Parity gate: the four privacy policies list the same processors and data categories. A script comparing the SDK table rows is the minimum.
2. The LEGAL screen opens the URL for the active app language with an EN fallback. The Play listing's privacy URL is set per localised listing. All URLs are live and public before submission (D-026).
3. The DE policy keeps the German clauses: TDDDG §25 basis, the supervisory authority for the controller's federal state, the TCF and UMP description. The generic consent description is mirrored in ES and PT.
4. The age line stays 16+ in every version.
5. If ES and PT policies are not ready by Gate 2, those store locales and in-app languages ship later. Strings can be built and reviewed now. Releasing those languages without a policy in them is a VETO.

Open [U]: whether an ES or PT privacy policy is strictly required for a German operator offering in those locales (ruled yes as the safe reading); whether an EN Impressum is needed beyond the DE one.

# Play Data safety map

Maps every shipped SDK to the answers in Play Console, Data safety form. Status: draft for P5. Re-check against the lockfile before each release. Items marked [U] come from Google's SDK disclosure pages and must be re-read at submission:

- Mobile Ads SDK: https://developers.google.com/admob/android/privacy/play-data-disclosure
- Firebase: https://firebase.google.com/docs/android/play-data-disclosure

## Top-level answers

| Question | Answer |
|---|---|
| Does the app collect or share required user data types? | Yes (ads SDK, and analytics when shipped) |
| Is all collected data encrypted in transit? | Yes (both SDKs use HTTPS) |
| Can users request data deletion? | Yes, by email (see privacy policy section 8). On-device data is deleted by removing the app. |
| Privacy policy URL | <POLICY URL> (must be live and public before submission) |
| Contains ads | Yes |
| Advertising ID declaration | Yes, used for advertising (the ads SDK declares `com.google.android.gms.permission.AD_ID`) |
| Target audience | 16+ (working default, D-026; owner confirms at Gate 2). Play age bands 16-17 and 18+ only. Not a Families app. |

## SDK by SDK

"Optional" means the user can decline without losing core app function. "Ephemeral" means processed in memory only and not stored beyond the request.

| SDK or package | Data type (Play category) | Collected or shared | Purpose | Optional | Ephemeral |
|---|---|---|---|---|---|
| `expo-camera` (camera frames, photos) | Photos and videos | Not collected. Processed on device only, never transmitted. | n/a | n/a | Yes, frames are processed in memory; no upload |
| `expo-image-manipulator`, `jpeg-js`, `@shopify/react-native-skia` | Photos and videos | Not collected. On-device image processing only. | n/a | n/a | Yes |
| `expo-sensors` (magnetometer, motion) | Sensor data is not a Play category for this use | Not collected, never transmitted | n/a | n/a | Yes |
| `expo-haptics` | none | Not collected | n/a | n/a | n/a |
| `react-native-audio-api` (playback only, no microphone) | Audio files, Voice or sound recordings | Not collected. No microphone permission. | n/a | n/a | n/a |
| Local scan history (app storage) | none transmitted | Not collected. Stays on device. | n/a | n/a | n/a |
| Investigation log: location tags and case notes (app storage) | Free text typed by the user on the device. Not a Play Location type (no coordinates, no address lookup). | Not collected. Stays on device, never transmitted, never in an analytics event, never on a share card. | n/a | n/a | n/a |
| `expo-notifications` (local scheduled notifications only, channel `Field log`; ships with P6) | none. The library links the Firebase Cloud Messaging (FCM) client and declares its service, but `plugins/withFcmAutoInitOff.js` sets `firebase_messaging_auto_init_enabled=false` in the merged manifest, so no installation ID or push token is created and none is requested. No Expo push service is used, no server sends anything. | Not collected. Schedules are computed on device from moon phase, clock and the local log. The channel's lock-screen visibility is PRIVATE, so no line content (including a tag) shows on the lock screen. | Yes, opt-in, off until the user taps FIT RELAY and grants the system permission | n/a |
| `expo-file-system` (cache write of the rendered field card, `src/fx/share/save.ts`) | none transmitted | Not collected. The PNG is written to the app cache on the device and handed to the share sheet by the user. | n/a | n/a |
| `POST_NOTIFICATIONS` permission (Android 13+ runtime permission, declared by `expo-notifications`) | Permission only. Play Data safety has no row for it; it needs the Permissions declaration in the manifest and the privacy policy. | Not collected | Yes | n/a |
| `expo-sharing` (the field card leaves through the user's own share sheet; ships with P6) | Photos and videos (the card is a rendered PNG that includes a processed camera frame) | Not collected or shared by us. The user picks the target app and sends the file; no code path of ours uploads it. Same footing as a screenshot the user sends. | n/a (user action) | n/a |
| `react-native-google-mobile-ads` 17.2.0 (Google Mobile Ads SDK) [U] | Device or other IDs (advertising ID, app set ID) | Collected and shared | Advertising or marketing; Analytics; Fraud prevention, security and compliance | No for the SDK; consent controls personalisation (UMP) | No |
| same | App activity: App interactions (ad impressions, clicks) | Collected and shared | Advertising or marketing; Analytics | No | No |
| same | App info and performance: Diagnostics (crash logs, performance) | Collected and shared | Analytics; Fraud prevention, security and compliance | No | No |
| same | Location: Approximate location (derived from IP) [U] | Collected and shared | Advertising or marketing | No | Yes (not stored in app) |
| `@react-native-firebase/app` + `@react-native-firebase/analytics` 26.x (only when `google-services.json` is present and consent is given) [U] | Device or other IDs (app instance ID; advertising ID not used, `google_analytics_adid_collection_enabled` false) | Collected | Analytics | Yes, off until consent | No |
| same | App activity: App interactions (the six allowlisted events) | Collected | Analytics | Yes, off until consent | No |
| same | App info and performance: Diagnostics [U] | Collected | Analytics | Yes | No |
| same | Location: Approximate location (country from IP) [U] | Collected | Analytics | Yes | No |
| `expo-router`, `expo-linking`, `expo-constants`, `expo-font`, `expo-asset`, reanimated, screens and other UI packages | none | No data leaves the device | n/a | n/a | n/a |

Not collected by any shipped SDK: name, email, address, phone, precise location, contacts, files, health, financial info, messages, microphone audio, photos and videos.

## Rules for keeping this table true

1. Adding any package that opens a network connection or reads a new permission requires a row here and a Compliance PASS before merge.
2. If the Firebase backend is not shipped in a release (no `google-services.json`), delete the Firebase rows from the Play form for that release.
3. Photos count as "not collected" only while no code path uploads an image or derived pixels. Keep it so; the share card is created on device and shared by the user through the system share sheet (`expo-sharing`), which is a user action and not collection by us. The card carries no EXIF or GPS (it is re-encoded from pixels) and no user-typed tag or note.
4. The form must match the privacy policy sections 2, 3, 5 and 6.
5. Notifications stay local. A push token, FCM registration, Expo push service or any server-side send is a new SDK row, a privacy policy change and a Compliance PASS before merge.
6. Analytics events and parameters stay on the allowlist in `src/analytics/index.ts`. `share_card` carries no parameters today; if `format` is added (P6-02), the allowlist, the policy table in section 5 and this form change together.

## Before launch

1. Host the privacy policy and the Impressum at live public URLs, then replace the placeholders in `src/ui/legal.ts` and the policy URL above.
2. Release switch for ad unit IDs: `src/ads/backend.ts` uses `TestIds` unless `EXPO_PUBLIC_RELEASE === '1'`, and returns real unit IDs only in the release branch, so a dev or preview build can never carry a live ID.
3. Extend `scripts/check-ad-ids.mjs` so release mode also fails on the placeholder live IDs. Register test devices in AdMob.
4. Banner height at phone check 3: record the SDK `onSizeChange` height at 360, 390 and 428 dp and confirm the slot height is at least that (`src/ads/Banner.tsx` clips with `overflow: hidden`).
5. Firebase install: after prebuild, run `aapt dump xmltree` on the built APK and confirm the merged manifest shows `google_analytics_default_allow_analytics_storage`, `_ad_storage`, `_ad_user_data` and `_ad_personalization_signals` all `false`. The `firebase.json` keys that drive them are `analytics_default_allow_*`.
6. P6 manifest check: after prebuild, `aapt dump permissions` on the built APK lists `POST_NOTIFICATIONS` and must not list `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM`. The merged manifest must show `firebase_messaging_auto_init_enabled=false`; the FCM service may be present but inert; logcat or a proxy log shows no fcm or firebaseinstallations call before UMP consent.
7. Phone check 3 (P6, device):
   - `dumpsys notification` for the `field-log` channel: no sound, no vibration, no badge, PRIVATE lock screen; no fallback channel with sound carries our lines.
   - A DATE line on Android 12 or later under Doze with the screen off posts inside 18:00 to 22:00, including one near the latest scheduled minute. Compliance recommends capping the scheduled minute near 21:30.
   - Android 13 and later: the system dialog appears only after FIT RELAY; after one denial neither FIT RELAY nor the Settings row shows a second dialog (Settings opens system settings). Android 12 and earlier: the module is the only consent.
   - A notification tap from the shade, the lock screen and a cold start opens only the case or the viewfinder, and a later launcher cold start does not replay it.
   - Share: print time against the 800 ms brief figure; the shared PNG keeps both SIMULATED marks after the target app recompresses it and after a crop to the story safe zone; the share sheet shows the card file name.
   - Viewfinder key swap: FIT RELAY lands on the LOG slot and NOT NOW on the CAPTURE slot; a habitual tap cannot start a system dialog without a second deliberate tap.
   - Replace `[STORE NAME]` on the card and footer at Gate 1.
8. Re-read the Data safety form against the lockfile and Google's SDK disclosure pages (items marked [U]).

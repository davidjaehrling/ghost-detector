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
| Target audience | 13+ (recommend 16+; see report). Not a Families app. |

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
3. Photos count as "not collected" only while no code path uploads an image or derived pixels. Keep it so; the share card is created on device and shared by the user through the system share sheet, which is a user action and not collection by us.
4. The form must match the privacy policy sections 3, 5 and 6.

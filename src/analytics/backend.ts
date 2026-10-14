// Analytics backend. Today: a no-op, because the Firebase packages are not installed and the
// native module cannot be verified without a device and google-services.json (owner item).
//
// To wire Firebase (P5-07), once the owner supplies google-services.json:
//   1. Put google-services.json at the repo root and set android.googleServicesFile in app.json
//      to "./google-services.json". Keep it out of git if the owner prefers; use an EAS file secret.
//   2. pnpm add @react-native-firebase/app@26 @react-native-firebase/analytics@26 (match the 26.x
//      pair; pin both to the same version).
//   3. Add "@react-native-firebase/app" to the app.json plugins. Do not add the analytics plugin
//      options that enable collection.
//   4. firebase.json at the repo root already sets every automatic collection flag to false
//      (analytics_auto_collection_enabled, google_analytics_default_allow_analytics_storage,
//      _ad_storage, _ad_user_data, _ad_personalization, google_analytics_adid_collection_enabled,
//      google_analytics_ssaid_collection_enabled, google_analytics_automatic_screen_reporting_enabled).
//      Do not change them; collection is switched on only by setEnabled(true) below.
//   5. Replace `backend` with a Firebase implementation, loaded the same way as src/ads/backend.ts
//      (require on first use, never at import):
//        setEnabled(on)       -> analytics().setAnalyticsCollectionEnabled(on)
//                                and, when on, analytics().setConsent({ analytics_storage: 'granted' })
//                                (ad_storage, ad_user_data and ad_personalization stay 'denied')
//        logEvent(name, p)    -> analytics().logEvent(name, p)
//   6. Select it only when the file is present (an app.config or env flag such as
//      EXPO_PUBLIC_FIREBASE=1 set by the EAS profile that has the file); otherwise keep this no-op.
//   7. Run the device check from P5-10: no analytics traffic before consent resolves.

export type EventParams = Record<string, string | number>;

export interface Backend {
  /** Called by the facade only once analytics is allowed (and with false if that stops being true). */
  setEnabled(on: boolean): void;
  /** Called by the facade only with an allowlisted event and sanitised params. */
  logEvent(name: string, params: EventParams): void;
}

export const backend: Backend = {
  setEnabled() {},
  logEvent() {},
};

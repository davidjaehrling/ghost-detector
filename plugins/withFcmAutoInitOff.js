// Keeps Firebase Cloud Messaging from creating an installation ID and token at
// app start. The app only uses local notifications, and plan section 7 says
// Firebase starts only after UMP consent. Analytics flags live in firebase.json.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const META_NAME = 'firebase_messaging_auto_init_enabled';

function setFcmAutoInitOff(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const items = (app['meta-data'] = app['meta-data'] ?? []);
  const existing = items.find((m) => m.$['android:name'] === META_NAME);
  if (existing) {
    existing.$['android:value'] = 'false';
  } else {
    items.push({ $: { 'android:name': META_NAME, 'android:value': 'false' } });
  }
  return manifest;
}

const withFcmAutoInitOff = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults = setFcmAutoInitOff(c.modResults);
    return c;
  });

module.exports = withFcmAutoInitOff;
module.exports.setFcmAutoInitOff = setFcmAutoInitOff;
module.exports.META_NAME = META_NAME;

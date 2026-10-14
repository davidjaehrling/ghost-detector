// Loads app.json unchanged. EXPO_PUBLIC_BASE_URL (for example /ghost-detector) is set only by the
// GitHub Pages workflow so the web export is served under a subpath; unset keeps the root layout
// that the Playwright harness, CI and local dev use.
const appJson = require('./app.json');

module.exports = () => {
  const baseUrl = process.env.EXPO_PUBLIC_BASE_URL;
  const expo = { ...appJson.expo };
  if (baseUrl) {
    expo.experiments = { ...expo.experiments, baseUrl };
  }
  return { expo };
};

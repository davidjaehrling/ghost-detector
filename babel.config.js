// babel-preset-expo adds react-native-worklets/plugin by itself when the package is installed
// (reanimated 4 moved its plugin there). Listing it again here would run it twice.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};

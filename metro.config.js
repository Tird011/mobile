// Bundle the Blender .glb models as assets.
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb');
// the Java module lives in ./modules (file: dependency)
config.watchFolders = [__dirname];
module.exports = config;

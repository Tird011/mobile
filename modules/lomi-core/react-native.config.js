module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.lomiking.rn.LomiCorePackage;',
        packageInstance: 'new LomiCorePackage()',
      },
      ios: null,
    },
  },
};

module.exports = {
  appId: 'local.mimo.bot.workbench',
  productName: 'MiMo Dots',
  directories: { output: 'release/dots-0.4.0' },
  extraResources: [{ from: 'native/bin/MiMoSessionBridge.exe', to: 'native/MiMoSessionBridge.exe' }],
  files: ['src/**/*', 'package.json', 'LICENSE', 'NOTICE', '使用说明.txt'],
  asar: true,
  electronDist: 'node_modules/electron/dist',
  compression: 'normal',
  win: { target: ['portable'], signAndEditExecutable: false },
  portable: { artifactName: 'MiMo-Dots-${version}.exe', useZip: true }
}

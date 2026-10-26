const {version}=require('./package.json')
module.exports = {
  appId: 'local.mimo.bot.workbench',
  productName: 'MiMo Dots',
  directories: { output: process.env.MIMO_BUILD_OUTPUT || `release/dots-${version}` },
  win: { icon: 'build/icon.ico', target: ['nsis'], signExecutable: false, extraResources:[{from:'native/bin/MiMoSessionBridge.exe',to:'native/MiMoSessionBridge.exe'}] },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
  mac: {
    icon: 'build/icon.icns', target: [{target:'dmg',arch:['arm64']}],
    category: 'public.app-category.productivity', minimumSystemVersion:'12.0',
    identity: '-', timestamp:null, hardenedRuntime:false,
    extraResources: [{from:'native/bin/MiMoSessionBridge',to:'native/MiMoSessionBridge'}],
    extendInfo: {NSAccessibilityUsageDescription:'创建 MiMo 专用会话、选择模型和读取账号显示需要操作本机 Xiaomi MiMo 窗口。'}
  },
  dmg: {artifactName:'MiMo-Dots-${version}-${arch}.dmg'},
  files: ['src/**/*', 'package.json', 'LICENSE', 'NOTICE', '使用说明.txt', 'docs/MACOS.md'],
  afterPack: './scripts/after-pack.cjs',
  asar: true,
  compression: 'normal',
  portable: { artifactName: 'MiMo-Dots-${version}.exe', useZip: true }
}

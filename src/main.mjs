import { app, BrowserWindow, ipcMain, dialog, shell, screen, nativeImage, nativeTheme } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, stat, realpath, writeFile } from 'node:fs/promises'
import { Store } from './store.mjs'
import { DesktopClient } from './desktop-client.mjs'
import { Workbench } from './core.mjs'
import { Appearance } from './appearance.mjs'
import { SessionSetup } from './session-setup.mjs'
import { AccountStatus } from './account-status.mjs'

const here = dirname(fileURLToPath(import.meta.url))
// Keep the original Chromium profile/instance-lock location across the rename.
app.setPath('userData',join(app.getPath('appData'),'MiMo Bot 工作台'))
app.setName('MiMo Dots')
app.setAppUserModelId('local.mimo.bot.workbench')
if (!app.requestSingleInstanceLock()) app.quit()
else {
  let win, core, setup, account, accountTimer, stopping = false, commands = Promise.resolve()
  const serialize = fn => {
    const job=commands.then(()=>core.withCommand(fn));commands=job.catch(()=>{});return job
  }
  const selectedFiles = new Set()
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus() } })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', e => {
    if (core && !stopping) {
      e.preventDefault(); stopping = true
      clearInterval(accountTimer);account?.close()
      Promise.resolve(setup?.close()).then(()=>core.close()).finally(() => app.quit())
    }
  })
  app.whenReady().then(async () => {
  const dataDir = process.env.MIMO_WORKBENCH_DATA || join(app.getPath('appData'), 'MiMoBotWorkbench')
  const store = new Store(dataDir)
  core = new Workbench(store, new DesktopClient(), s => { if (win && !win.isDestroyed()) win.webContents.send('state-changed', s) })
  try { await core.start() }
  catch (e) { dialog.showErrorBox('工作台暂时无法启动', e.message); stopping = true; app.quit(); throw e }
  setup=new SessionSetup(core,app.isPackaged?join(process.resourcesPath,'native','MiMoSessionBridge.exe'):join(here,'..','native','bin','MiMoSessionBridge.exe'),serialize)
  account=new AccountStatus(setup.executable,s=>{core.account=s;core.onChange(core.snapshot())})
  core.account=account.status
  await setup.init()
  const appearance = new Appearance(dataDir)
  await appearance.load()
  nativeTheme.themeSource = 'light'
  const area = screen.getPrimaryDisplay().workAreaSize
  win = new BrowserWindow({
    width: Math.min(1440, area.width), height: Math.min(960, area.height), minWidth: Math.min(900, area.width), minHeight: Math.min(640, area.height), title: 'MiMo Dots', backgroundColor: '#ffffff', show: false,
    titleBarStyle:'hidden',titleBarOverlay:{color:'#ffffff00',symbolColor:'#777784',height:36},
    webPreferences: { preload: join(here, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, devTools: !app.isPackaged },
  })
  win.setMenuBarVisibility(false)
  setup.onFinished=()=>{if(win&&!win.isDestroyed()){win.show();win.focus()}}
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => { if (url !== pathToFileURL(join(here, 'view', 'index.html')).href) e.preventDefault() })
  const handlers = {
    accountRefresh: async () => {
      if(setup.active)throw new Error('请等会话创建结束后再同步账号。')
      try{return await account.refresh(true)}finally{if(!win.isDestroyed()){win.show();win.focus()}}
    },
    setupModels: async () => {try{return await setup.models()}finally{if(!win.isDestroyed()){win.show();win.focus()}}},
    setupStart: input => setup.start(input),
    setupRecover: id => setup.recover(id),
    setupDismiss: id => setup.dismiss(id),
    setupCancel: () => setup.cancel(),
    appearance: () => appearance.snapshot(),
    selectAvatar: ({ botId, presetId }) => { core.bot(botId); return appearance.setPreset(botId, presetId) },
    chooseAvatar: async id => {
      core.bot(id)
      const result = await dialog.showOpenDialog(win, { title: '选择机器人头像', filters: [{ name: '头像图片', extensions: ['png','jpg','jpeg','webp'] }], properties: ['openFile'] })
      if (result.canceled) return appearance.snapshot()
      const path = await realpath(result.filePaths[0]), info = await stat(path)
      if (!info.isFile() || info.size > 8 * 1024 * 1024) throw new Error('请选择 8 MB 以内的 PNG、JPG 或 WebP 图片。')
      const image = nativeImage.createFromPath(path)
      if (image.isEmpty()) throw new Error('无法读取这张图片，请选择 PNG、JPG 或 WebP 图片。')
      const { width, height } = image.getSize()
      if (Math.max(width,height) > 8192) throw new Error('图片尺寸过大，请选择边长不超过 8192 像素的头像。')
      const edge = Math.min(width,height)
      const square = image.crop({ x: Math.floor((width-edge)/2), y: Math.floor((height-edge)/2), width: edge, height: edge }).resize({ width: 256, height: 256, quality: 'best' })
      return appearance.set(id, 'data:image/png;base64,' + square.toPNG().toString('base64'))
    },
    resetAvatar: id => { core.bot(id); return appearance.set(id, null) },
    state: () => core.snapshot(),
    refresh: () => core.refresh(),
    sessions: () => core.sessions(),
    bind: input => core.bind(input),
    bot: input => core.updateBot(input),
    group: input => core.createGroup(input),
    memory: input => core.saveMemory(input),
    pause: input => core.pause(input),
    endRun: id => core.endRun(id),
    accept: async id => {
      const t = core.s.tasks.find(t => t.id === id)
      if (!t || t.status !== 'completed') throw new Error('请等回合结束后再确认成果。')
      t.accepted = Date.now(); await core.persist()
    },
    release: async id => {
      const t = core.s.tasks.find(t => t.id === id)
      if (!t) throw new Error('任务不存在。')
      if (t.held) {
        const result = await dialog.showMessageBox(win, { type: 'warning', title: '先在 MiMo 核对', message: '已在 MiMo 确认这个任务不再运行？', detail: '解除占用不会停止 MiMo。若它仍在运行，再派任务会冲突。请先到 MiMo 停止或等待结束。', buttons: ['返回核对', '已确认，解除占用'], defaultId: 0, cancelId: 0 })
        if (result.response !== 1) return
      }
      return core.release(id)
    },
    send: async input => {
      if (!Array.isArray(input.files) || input.files.some(f => !selectedFiles.has(f))) throw new Error('请通过“添加资料”选择文件。')
      const { botId, groupId, instruction, files, requestId } = input
      return core.enqueue({ botId, groupId, instruction, files, requestId })
    },
    collaborate: async input => {
      if (!Array.isArray(input.files) || input.files.some(f => !selectedFiles.has(f))) throw new Error('请通过“添加资料”选择文件。')
      return core.collaborate({ groupId: input.groupId, instruction: input.instruction, files: input.files, requestId: input.requestId })
    },
    chooseWorkspace: async () => {
      const r = await dialog.showOpenDialog(win, { title: '选择允许 Bot 写成果的文件夹', properties: ['openDirectory', 'createDirectory'] })
      if (!r.canceled) await core.setWorkspace(await realpath(r.filePaths[0]))
      return core.s.workspace
    },
    chooseFiles: async () => {
      const r = await dialog.showOpenDialog(win, { title: '选择交给 Bot 的资料', properties: ['openFile', 'multiSelections'] })
      const paths = []
      if (!r.canceled) for (const path of r.filePaths.slice(0, 15)) { const canonical = await realpath(path); if ((await stat(canonical)).isFile()) { selectedFiles.add(canonical); paths.push(canonical) } }
      return paths
    },
    showArtifact: async ({ taskId, path }) => {
      const t = core.s.tasks.find(t => t.id === taskId)
      if (!t?.artifacts.some(a => a.path === path)) throw new Error('成果没有登记。')
      const canonical = await realpath(path)
      if (canonical !== path) throw new Error('成果位置已变化，请在成果文件夹检查。')
      shell.showItemInFolder(canonical)
    },
    showWorkspace: async () => { if (core.s.workspace) { const err = await shell.openPath(core.s.workspace); if (err) throw new Error('文件夹无法打开，请重新选择。') } },
    showData: () => shell.openPath(dataDir),
    openMiMo: async () => {
      const exe = join(process.env.LOCALAPPDATA, 'Programs', 'Xiaomi MiMo', 'Xiaomi MiMo.exe')
      const err = await shell.openPath(exe); if (err) throw new Error('没有在常用安装位置找到 MiMo，请手动打开。')
    },
    exportHistory: async () => {
      const r = await dialog.showSaveDialog(win, { title: '导出工作台记录（不含认证凭据）', defaultPath: '工作台记录.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
      if (!r.canceled) await writeFile(r.filePath, JSON.stringify(core.s, null, 2), 'utf8')
    },
  }
  ipcMain.handle('workbench', (event, command, input) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('无效来源。')
    if (!Object.hasOwn(handlers, command)) return { ok: false, error: '不支持的操作。' }
    if(command==='setupCancel')return {ok:true,value:setup.cancel()}
    return serialize(async()=>{
      if(setup.active&&['bind','bot','group','send','collaborate'].includes(command))throw new Error('正在创建 MiMo 会话，请等结束或先取消。')
      return handlers[command](input)
    }).then(value=>({ok:true,value}),e=>({ok:false,error:e.message||'操作未完成，请稍候再试。'}))
  })
  await win.loadFile(join(here, 'view', 'index.html'))
  win.show()
  account.refresh(false)
  accountTimer=setInterval(()=>{if(!setup.active&&!stopping&&!account.reading)account.refresh(false)},60000)
  app.on('activate', () => { win.show(); win.focus() })
  }).catch(e => { dialog.showErrorBox('工作台启动失败', e.message); stopping = true; app.quit() })
}

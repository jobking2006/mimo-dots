import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import { access } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

export function descriptorPath({platform=process.platform,home=homedir(),env=process.env}={}) {
  if(platform==='darwin')return posix.join(home,'Library','Application Support','Xiaomi MiMo','desktop-api.json')
  if(platform==='win32') {
    if(!env.APPDATA)throw new Error('Windows APPDATA 未设置，无法定位 MiMo 接口。')
    return win32.join(env.APPDATA,'Xiaomi MiMo','desktop-api.json')
  }
  throw new Error('暂不支持这个操作系统。')
}
export function helperName(platform=process.platform) {
  if(platform==='darwin')return 'MiMoSessionBridge'
  if(platform==='win32')return 'MiMoSessionBridge.exe'
  throw new Error('暂不支持这个操作系统的窗口助手。')
}
export function applicationCandidates({platform=process.platform,home=homedir(),env=process.env}={}) {
  if(platform==='darwin')return ['/Applications/Xiaomi MiMo.app',posix.join(home,'Applications','Xiaomi MiMo.app')]
  if(platform==='win32'&&env.LOCALAPPDATA)return [win32.join(env.LOCALAPPDATA,'Programs','Xiaomi MiMo','Xiaomi MiMo.exe')]
  throw new Error('暂不支持或无法定位 MiMo 安装目录。')
}
export async function launchMiMo({platform=process.platform,home=homedir(),env=process.env,exists=async p=>access(p).then(()=>true,()=>false),exec=promisify(execFile),spawnImpl=spawn}={}) {
  for(const path of applicationCandidates({platform,home,env}))if(await exists(path)) {
    if(platform==='darwin')await exec('/usr/bin/open',[path])
    else await new Promise((resolve,reject)=>{
      const child=spawnImpl(path,[],{detached:true,stdio:'ignore',windowsHide:false})
      child.once('error',reject)
      child.once('spawn',()=>{child.unref();resolve()})
    })
    return
  }
  throw new Error('没有找到 Xiaomi MiMo Desktop，请安装到应用程序文件夹后重试。')
}

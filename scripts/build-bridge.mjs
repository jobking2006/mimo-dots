import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
if(process.platform==='darwin') {
  mkdirSync('native/bin', {recursive:true})
  const arch=process.env.MIMO_TARGET_ARCH || process.arch
  if(!['arm64','x64'].includes(arch))throw new Error('Unsupported macOS architecture')
  const target=arch==='arm64'?'arm64-apple-macos12.0':'x86_64-apple-macos12.0'
  const result=spawnSync('/usr/bin/xcrun',['swiftc','-O','-target',target,'native/MiMoSessionBridge.swift','-o','native/bin/MiMoSessionBridge'],{stdio:'inherit'})
  if(result.error)throw result.error
  process.exit(result.status??1)
}
if(process.platform!=='win32')throw new Error('Unsupported native build platform')
const framework = join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319')
mkdirSync('native/bin', { recursive: true })
const args = ['/nologo','/target:exe','/platform:x64',`/out:${resolve('native/bin/MiMoSessionBridge.exe')}`, '/reference:System.Web.Extensions.dll', ...['UIAutomationClient','UIAutomationTypes','WindowsBase'].map(n=>`/reference:${join(framework,'WPF',n+'.dll')}`), resolve('native/MiMoSessionBridge.cs')]
const result=spawnSync(join(framework,'csc.exe'),args,{stdio:'inherit',windowsHide:true})
if(result.error) throw result.error
if(result.status!==0) process.exit(result.status||1)

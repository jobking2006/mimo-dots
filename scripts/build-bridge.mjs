import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
const framework = join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319')
mkdirSync('native/bin', { recursive: true })
const args = ['/nologo','/target:exe','/platform:x64',`/out:${resolve('native/bin/MiMoSessionBridge.exe')}`, '/reference:System.Web.Extensions.dll', ...['UIAutomationClient','UIAutomationTypes','WindowsBase'].map(n=>`/reference:${join(framework,'WPF',n+'.dll')}`), resolve('native/MiMoSessionBridge.cs')]
const result=spawnSync(join(framework,'csc.exe'),args,{stdio:'inherit',windowsHide:true})
if(result.error) throw result.error
if(result.status!==0) process.exit(result.status||1)

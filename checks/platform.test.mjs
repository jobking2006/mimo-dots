import test from 'node:test'
import assert from 'node:assert/strict'
import { descriptorPath, helperName, applicationCandidates, launchMiMo } from '../src/platform.mjs'

test('Mac descriptor uses verified Application Support path regardless of APPDATA',()=>{
 assert.equal(descriptorPath({platform:'darwin',home:'/Users/test',env:{APPDATA:'wrong'}}),'/Users/test/Library/Application Support/Xiaomi MiMo/desktop-api.json')
})
test('Windows descriptor retains roaming app data and rejects missing APPDATA',()=>{
 assert.equal(descriptorPath({platform:'win32',env:{APPDATA:'C:/Roaming'}}),String.raw`C:\Roaming\Xiaomi MiMo\desktop-api.json`)
 assert.throws(()=>descriptorPath({platform:'win32',env:{}}),/APPDATA/)
 assert.throws(()=>descriptorPath({platform:'linux'}),/不支持/)
})
test('native helpers remain separate and Mac discovery checks both install locations',()=>{
 assert.equal(helperName('darwin'),'MiMoSessionBridge'); assert.equal(helperName('win32'),'MiMoSessionBridge.exe')
 assert.deepEqual(applicationCandidates({platform:'darwin',home:'/Users/test'}),['/Applications/Xiaomi MiMo.app','/Users/test/Applications/Xiaomi MiMo.app'])
})
test('Mac launches via open with distinct arguments, discovers user install, and never invokes a shell',async()=>{
 const calls=[]
 await launchMiMo({platform:'darwin',home:'/Users/test',exists:async p=>p.startsWith('/Users/'),exec:async(...args)=>calls.push(args)})
 assert.deepEqual(calls,[['/usr/bin/open',['/Users/test/Applications/Xiaomi MiMo.app']]])
 await assert.rejects(launchMiMo({platform:'darwin',exists:async()=>false}),/没有找到/)
})

test('Windows launch resolves on process spawn rather than process exit',async()=>{
  const {EventEmitter}=await import('node:events')
  let detached=false
  const child=new EventEmitter();child.unref=()=>{detached=true}
  const launched=launchMiMo({platform:'win32',env:{LOCALAPPDATA:'C:/Local'},exists:async()=>true,spawnImpl:()=>{queueMicrotask(()=>child.emit('spawn'));return child},exec:()=>new Promise(()=>{})})
  await Promise.race([launched,new Promise((_,reject)=>setTimeout(()=>reject(Error('launch waited for exit')),100))])
  assert.equal(detached,true)
})

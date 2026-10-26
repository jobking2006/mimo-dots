import test from 'node:test'
import assert from 'node:assert/strict'
import {accountView} from '../src/account-status.mjs'

test('sidebar display and engine readiness never establish account authentication',()=>{
  const a=accountView({name:'demo',login:'visible',ok:true,engine:'ready',token:'not-persisted',quota:'0',source:'MiMo 侧边栏'})
  assert.equal(a.login,'visible');assert.equal(a.quota,'unavailable');assert.equal(a.verifiedAt,null);assert(!Object.hasOwn(a,'token'));assert(!Object.hasOwn(a,'engine'))
})
test('verified login expires and never transfers to another displayed account',()=>{
  const verified=accountView({name:'A',login:'signedIn',source:'MiMo 账号菜单'})
  assert.equal(accountView({name:'A',login:'visible'},verified).login,'signedIn')
  assert.equal(accountView({name:'B',login:'visible'},verified).login,'visible')
  assert.equal(accountView({name:'A',login:'visible'},{...verified,verifiedAt:Date.now()-301000}).login,'visible')
})
test('signed out observations clear the earlier verified login',()=>{
  const a=accountView({name:'',login:'signedOut'},accountView({name:'A',login:'signedIn'}))
  assert.equal(a.login,'signedOut');assert.equal(a.name,'');assert.equal(a.verifiedAt,null)
})
test('unrecognized account displays are refused instead of guessed',()=>{
  for(const result of [null,{login:'ready',name:'demo'},{login:'signedIn',name:'x'.repeat(81)},{login:'visible',name:'a\nb'}])assert.throws(()=>accountView(result))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.mjs'
import { Workbench } from '../src/core.mjs'
import { SessionSetup } from '../src/session-setup.mjs'

async function fixture(t) {
  const sessions=[{sessionId:'old-personal',title:'untouched',dir:'C:/test'}],messages=new Map(),calls=[]
  const client={health:async()=>({ok:true,engine:'ready'}),sessions:async()=>sessions,messages:async s=>messages.get(s.sessionId)||[],watch:async()=>{},send:async()=>{throw Error('No API POST allowed in setup')}}
  const core=new Workbench(new Store(await mkdtemp(join(tmpdir(),'mimo-setup-'))),client);await core.start()
  let queue=Promise.resolve();const mutate=fn=>{const job=queue.then(()=>core.withCommand(fn));queue=job.catch(()=>{});return job}
  const setup=new SessionSetup(core,'not-run-in-unit-checks',mutate,{platform:'win32'});await setup.init()
  setup.helper=async input=>{
    calls.push(input);assert.equal(core.s.sessionSetups.at(-1).items.find(i=>input.message.startsWith(i.marker)).status,'creating')
    const id='new-'+calls.length; sessions.push({sessionId:id,title:'test',dir:'C:/test'});messages.set(id,[{info:{id:'u-'+id,role:'user',model:{providerID:'test',modelID:'mock'}},parts:[{type:'text',text:input.message}]},{info:{id:'a-'+id,parentID:'u-'+id,role:'assistant',finish:'stop',time:{completed:1}},parts:[{type:'text',text:'WORKBENCH_SESSION_READY'}]}]);return {submitted:true}
  }
  t.after(async()=>{await setup.close();await core.close()});return{core,setup,sessions,messages,calls}
}
async function finish(setup){for(let i=0;i<100&&setup.active;i++)await new Promise(r=>setTimeout(r,10));assert.equal(setup.active,false)}

test('group setup creates independent member sessions, preserving existing private binding',async t=>{
  const{core,setup,calls}=await fixture(t)
  core.s.bots[0].binding={sessionId:'old-personal',dir:'C:/test',model:'p/m'}
  await setup.start({groupId:'design',all:true});await finish(setup)
  const ids=Object.values(core.group('design').bindings).map(b=>b.sessionId)
  assert.equal(new Set(ids).size,3);assert(!ids.includes('old-personal'));assert.equal(core.bot('chief').binding.sessionId,'old-personal');assert.equal(calls.length,3)
  assert.deepEqual(calls.map(c=>c.activate),['true','false','false']);assert.equal(setup.jobs[0].status,'completed')
})
test('active tasks and unresolved setup prevent another window operation',async t=>{
  const{core,setup}=await fixture(t);core.s.tasks.push({status:'queued'})
  await assert.rejects(setup.start({botId:'chief'}),/任务/);core.s.tasks=[]
  setup.jobs.push({id:'prior',status:'needsReview',items:[]})
  await assert.rejects(setup.start({botId:'chief'}),/尚未核对/)
})
test('recovery finds the exact new marker and never sends again after ambiguous UI exit',async t=>{
  const{core,setup,calls}=await fixture(t),helper=setup.helper
  setup.helper=async input=>{await helper(input);throw Error('unknown UI exit')}
  await setup.start({botId:'chief'});await finish(setup)
  assert.equal(core.bot('chief').binding,null);assert.equal(setup.jobs[0].status,'needsReview')
  await setup.recover(setup.jobs[0].id);await finish(setup)
  assert.equal(calls.length,1);assert.equal(setup.jobs[0].status,'completed');assert.equal(core.bot('chief').binding.sessionId,'new-1')
})
test('foreign input in a candidate session stops binding',async t=>{
  const{core,setup,messages}=await fixture(t),helper=setup.helper
  setup.helper=async input=>{await helper(input);messages.get('new-1').push({info:{id:'foreign',role:'user'},parts:[{type:'text',text:'unrelated'}]})}
  await setup.start({botId:'chief'});await finish(setup)
  assert.equal(core.bot('chief').binding,null);assert.equal(setup.jobs[0].status,'needsReview');assert.match(setup.jobs[0].detail,/其他输入/)
})
test('cancel stops the current helper and leaves later group members uncreated',async t=>{
  const{setup,calls}=await fixture(t)
  setup.helper=async(input,signal)=>{calls.push(input);return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))}
  await setup.start({groupId:'design',all:true})
  while(!calls.length)await new Promise(r=>setTimeout(r,5))
  setup.cancel();await finish(setup)
  assert.equal(calls.length,1);assert.equal(setup.jobs[0].status,'needsReview');assert.deepEqual(setup.jobs[0].items.map(i=>i.status),['needsReview','pending','pending'])
})
test('startup converts unfinished operations to review without executing helper',async t=>{
  const{setup}=await fixture(t);setup.jobs.push({id:'interrupted',status:'running',items:[{status:'creating'}]});await setup.init()
  assert.equal(setup.jobs[0].status,'needsReview');assert.equal(setup.jobs[0].items[0].status,'needsReview')
})
test('identity lookup ignores old sessions and does not bind before turn completion',async t=>{
  const{setup,sessions,messages}=await fixture(t),marker='[工作台建会话 exact]'
  const user={info:{id:'u',role:'user',model:{providerID:'p',modelID:'m'}},parts:[{type:'text',text:marker+' init'}]}
  messages.set('old-personal',[user]);assert.equal(await setup.find({before:['old-personal'],marker}),null)
  sessions.push({sessionId:'new-candidate',dir:'C:/test'});messages.set('new-candidate',[user,{info:{id:'a',role:'assistant',parentID:'u'},parts:[]}])
  assert.equal(await setup.find({before:['old-personal'],marker}),null)
  messages.get('new-candidate')[1].info={id:'a',role:'assistant',parentID:'u',finish:'stop',time:{completed:1}}
  assert.equal((await setup.find({before:['old-personal'],marker})).sessionId,'new-candidate')
})
test('recovery accepts its exact binding after interruption between binding and journal save',async t=>{
  const{core,setup,calls}=await fixture(t),bind=core.bind.bind(core)
  core.bind=async input=>{await bind(input);throw Error('interrupted after binding persisted')}
  await setup.start({botId:'chief'});await finish(setup)
  assert.equal(core.bot('chief').binding.sessionId,'new-1');assert.equal(setup.jobs[0].status,'needsReview')
  core.bind=bind;await setup.recover(setup.jobs[0].id);await finish(setup)
  assert.equal(setup.jobs[0].status,'completed');assert.equal(calls.length,1)
})

test('a second group never reuses private or first-group sessions',async t=>{
  const{core,setup}=await fixture(t)
  await setup.start({botId:'chief'});await finish(setup)
  await setup.start({groupId:'design',all:true});await finish(setup)
  const groupId=await core.createGroup({name:'second test group',members:['chief','planner','reviewer']})
  await setup.start({groupId,all:true});await finish(setup)
  const ids=[core.binding('chief').sessionId,...Object.values(core.group('design').bindings).map(b=>b.sessionId),...Object.values(core.group(groupId).bindings).map(b=>b.sessionId)]
  assert.equal(new Set(ids).size,7)
})

test('a UI-selected model must match the model verified in Desktop messages',async t=>{
  const{core,setup}=await fixture(t),helper=setup.helper
  setup.helper=async input=>({...await helper(input),modelID:'different-model'})
  await setup.start({botId:'chief'});await finish(setup)
  assert.equal(core.bot('chief').binding,null)
  assert.equal(setup.jobs[0].status,'needsReview')
  assert.match(setup.jobs[0].detail,/模型.*不一致/)
})

test('Mac model checkpoint persists before native submission and survives helper failure',async t=>{
  const{core,setup,calls}=await fixture(t),helper=setup.helper
  setup.platform='darwin'
  setup.helper=async(input,signal,progress,checkpoint)=>{
    await checkpoint('different-model')
    assert.equal(setup.jobs[0].items[0].expectedModelID,'different-model')
    await helper(input);throw Error('focus changed after submit')
  }
  await setup.start({botId:'chief'});await finish(setup)
  await setup.recover(setup.jobs[0].id);await finish(setup)
  assert.equal(calls.length,1);assert.equal(core.bot('chief').binding,null)
  assert.match(setup.jobs[0].detail,/模型.*不一致/)
})

test('Mac refuses result-only model evidence without the durable pre-submit checkpoint',async t=>{
  const{core,setup}=await fixture(t),helper=setup.helper;setup.platform='darwin'
  setup.helper=async input=>({...await helper(input),modelID:'mock'})
  await setup.start({botId:'chief'});await finish(setup)
  assert.equal(core.bot('chief').binding,null);assert.equal(setup.jobs[0].status,'needsReview')
})

test('MiMo canonical UI casing resolves to the verified Desktop model ID without accepting other aliases',async t=>{
  const{setup,sessions,messages}=await fixture(t),marker='[工作台建会话 casing]'
  sessions.push({sessionId:'canonical',dir:'/test'})
  messages.set('canonical',[{info:{id:'u',role:'user',model:{providerID:'desktop',modelID:'mimo-v2.6-flash'}},parts:[{type:'text',text:marker+' init'}]},{info:{id:'a',parentID:'u',role:'assistant',finish:'stop',time:{completed:1}},parts:[]}])
  const item={before:['old-personal'],marker,expectedModelID:'MiMo-V2.6-Flash'}
  assert.equal((await setup.find(item)).model,'desktop/mimo-v2.6-flash')
  item.expectedModelID='mimo-v2.6-pro';await assert.rejects(setup.find(item),/模型.*不一致/)
})

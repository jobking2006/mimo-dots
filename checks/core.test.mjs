import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.mjs'
import { Workbench, parsePlan } from '../src/core.mjs'
import { turnState, DesktopClient, DesktopError } from '../src/desktop-client.mjs'

const binding = { sessionId: 'session-chief', dir: 'C:\\dedicated', model: 'provider/model' }
const modelMsg = { info: { id: 'old', role: 'user', model: { providerID: 'p', modelID: 'm' } }, parts: [] }
function mock() {
  return { sends: [], messagesById: {}, health: async () => ({ ok: true, app: 'test', engine: 'ready' }), sessions: async () => [{ ...binding, title: 'DS Bot 接入测试' }], messages: async function(b) { return this.messagesById[b.sessionId] ?? [modelMsg] }, send: async function(b, message) { this.sends.push({ b, message }); return { ok: true } }, watch: async (_b, _fn, signal) => new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })) }
}
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'mimo-workbench-check-')), client = mock(), core = new Workbench(new Store(dir), client)
  await core.start(); core.s.bots[0].binding = binding; await core.persist()
  t.after(() => core.close()); return { core, client, dir }
}
function reply(task, text = '结果', finish = 'stop') {
  return [modelMsg, { info: { id: 'u', role: 'user' }, parts: [{ type: 'text', text: task.marker }] }, { info: { id: 'a', role: 'assistant', parentID: 'u', agentID: 'main', time: { completed: Date.now() }, finish }, parts: [{ type: 'text', text }] }]
}
test('202 is acceptance only; exact parent and marker determine completion', () => {
  const task = { marker: '[task-X]', baseline: ['old'] }
  assert.equal(turnState([modelMsg], task).status, 'awaiting')
  assert.equal(turnState(reply(task), task).status, 'completed')
  assert.equal(turnState(reply(task, 'tool result', 'tool-calls'), task).status, 'running')
  const unrelated = reply(task); unrelated[2].info.parentID = 'someone-else'
  assert.equal(turnState(unrelated, task).status, 'running')
  unrelated.push({ info: { id: 'foreign', role: 'user' }, parts: [] })
  assert.equal(turnState(unrelated, task).status, 'conflict')
})
test('task UUID deduplicates and a busy session serializes queued tasks', async t => {
  const { core, client } = await fixture(t)
  const id = await core.enqueue({ botId: 'chief', instruction: 'first', requestId: 'same' })
  assert.equal(await core.enqueue({ botId: 'chief', instruction: 'first', requestId: 'same' }), id)
  await core.enqueue({ botId: 'chief', instruction: 'second' })
  await core.tick(); await core.tick()
  assert.equal(client.sends.length, 1)
  assert.equal(core.s.tasks[1].status, 'queued')
})
test('uncertain POST reserves session; restart only reads and never resubmits', async t => {
  const { core, client, dir } = await fixture(t)
  client.send = async () => { client.sends.push(1); throw new DesktopError('network timeout') }
  await core.enqueue({ botId: 'chief', instruction: 'do once' }); await core.tick()
  assert.equal(core.s.tasks[0].status, 'awaiting'); assert.equal(core.s.tasks[0].held, true)
  await core.close()
  const recovered = new Workbench(new Store(dir), client); t.after(() => recovered.close()); await recovered.start(); await recovered.tick()
  assert.equal(client.sends.length, 1); assert.equal(recovered.s.tasks[0].held, true)
})
test('persist submitting BEFORE POST and recover a crash at that boundary', async t => {
  const { core, client, dir } = await fixture(t)
  client.send = async () => {
    const disk = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'))
    assert.equal(disk.tasks[0].status, 'submitting'); assert.equal(disk.tasks[0].held, true)
    throw new DesktopError('timeout')
  }
  await core.enqueue({ botId: 'chief', instruction: 'once' }); await core.tick()
  core.s.tasks[0].status = 'submitting'; await core.persist(); await core.close()
  const nextClient = mock(), recovered = new Workbench(new Store(dir), nextClient); t.after(() => recovered.close())
  await recovered.start(); assert.equal(recovered.s.tasks[0].status, 'awaiting'); assert.equal(nextClient.sends.length, 0)
})
test('explicit 409 releases this rejected task without pretending success', async t => {
  const { core, client } = await fixture(t)
  client.send = async () => { throw new DesktopError('busy', 409) }
  await core.enqueue({ botId: 'chief', instruction: 'task' }); await core.tick()
  assert.equal(core.s.tasks[0].status, 'failed'); assert.equal(core.s.tasks[0].held, false)
})
test('private and group bindings cannot share a session', async t => {
  const { core } = await fixture(t)
  await assert.rejects(core.bind({ botId: 'chief', groupId: 'design', sessionId: binding.sessionId }), /其他私聊或群聊/)
})
test('memory scope, edit, delete and persistence', async t => {
  const { core, dir } = await fixture(t)
  await core.saveMemory({ scope: 'bot', id: 'chief', text: 'PRIVATE_ONLY' })
  await core.saveMemory({ scope: 'group', id: 'design', text: 'GROUP_ONLY' })
  const base = { marker: 'x', botId: 'chief', instruction: 'task', workspace: '' }
  assert.match(core.compose(base), /PRIVATE_ONLY/); assert.doesNotMatch(core.compose(base), /GROUP_ONLY/)
  assert.match(core.compose({ ...base, groupId: 'design' }), /GROUP_ONLY/); assert.doesNotMatch(core.compose({ ...base, groupId: 'design' }), /PRIVATE_ONLY/)
  const id = core.s.bots[0].memories[0].id
  await core.saveMemory({ scope: 'bot', id: 'chief', memoryId: id, text: 'EDITED' })
  assert.match(core.compose(base), /EDITED/)
  await core.saveMemory({ scope: 'bot', id: 'chief', memoryId: id, text: '' })
  assert.doesNotMatch(core.compose(base), /PRIVATE_ONLY|EDITED/)
  await core.close()
  const store = new Store(dir); await store.load(); t.after(() => store.release()); assert.equal(store.state.bots[0].memories.length, 0); assert.equal(store.state.groups[0].memories[0].text, 'GROUP_ONLY')
})
test('bounded plan parser rejects unknown members and excessive relays', () => {
  assert.equal(parsePlan('```json\n{"steps":[{"botId":"planner","instruction":"write"}]}\n```', ['planner']).length, 1)
  assert.throws(() => parsePlan('{"steps":[{"botId":"rogue","instruction":"x"}]}', ['planner']))
  assert.throws(() => parsePlan(JSON.stringify({ steps: Array(5).fill({ botId: 'planner', instruction: 'x' }) }), ['planner']))
  assert.throws(() => parsePlan('{"steps":[]}', ['planner']))
})
test('group pause prevents queued dispatch; ending relays does not cancel running MiMo', async t => {
  const { core, client } = await fixture(t)
  core.s.groups[0].bindings.planner = { ...binding, sessionId: 'group-planner' }
  await core.pause({ groupId: 'design', paused: true })
  const id = await core.enqueue({ botId: 'planner', groupId: 'design', instruction: 'test' }); await core.tick(); assert.equal(client.sends.length, 0)
  await core.pause({ groupId: 'design', paused: false }); await core.tick(); assert.equal(client.sends.length, 1)
  core.s.runs.push({ id: 'r', groupId: 'design', status: 'running' }); core.s.tasks.find(t => t.id === id).runId = 'r'
  await core.endRun('r'); assert.equal(core.s.tasks.find(t => t.id === id).held, true)
})
test('full model-planned group relay and final summary with distinct sessions', async t => {
  const { core, client } = await fixture(t)
  for (const id of ['chief', 'planner', 'reviewer']) core.s.groups[0].bindings[id] = { ...binding, sessionId: `group-${id}` }
  const runId = await core.collaborate({ groupId: 'design', instruction: 'write and review', requestId: 'relay' })
  assert.equal(await core.collaborate({ groupId: 'design', instruction: 'same', requestId: 'relay' }), runId)
  await core.tick()
  let task = core.s.tasks.at(-1)
  client.messagesById[task.binding.sessionId] = reply(task, '{"steps":[{"botId":"planner","instruction":"write"},{"botId":"reviewer","instruction":"review"}]}')
  await core.tick(); task = core.s.tasks.at(-1); assert.equal(task.botId, 'planner')
  client.messagesById[task.binding.sessionId] = reply(task, 'plan-result'); await core.tick(); task = core.s.tasks.at(-1); assert.equal(task.botId, 'reviewer'); assert.match(task.instruction, /plan-result/)
  client.messagesById[task.binding.sessionId] = reply(task, 'review-result'); await core.tick(); task = core.s.tasks.at(-1); assert.equal(task.phase, 'summary'); assert.match(task.instruction, /review-result/)
  // mock histories must retain the previous main turn, as real MiMo does.
  const summary = reply(task, 'final-result'); summary[1].info.id = 'u-final'; summary[2].info.id = 'a-final'; summary[2].info.parentID = 'u-final'
  client.messagesById[task.binding.sessionId] = [...client.messagesById[task.binding.sessionId], ...summary.slice(1)]
  await core.tick(); assert.equal(core.s.runs[0].status, 'completed'); assert.equal(client.sends.length, 4)
})
test('state corruption retains the original and refuses silent reset', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mimo-workbench-corrupt-'))
  await writeFile(join(dir, 'state.json'), '{broken')
  await assert.rejects(new Store(dir).load(), /原文件已保留/)
  assert.equal(await readFile(join(dir, 'state.json'), 'utf8'), '{broken')
})
test('a second controller cannot write the same task store', async t => {
  const { dir } = await fixture(t)
  await assert.rejects(new Store(dir).load(), /已有工作台在运行/)
})
test('client permits only loopback, reloads descriptor, denies redirects, redacts secrets', async () => {
  let reads = 0, calls = []
  const c = new DesktopClient({ readDescriptor: async () => ({ api: 1, port: 1111 + reads++, token: 'TEST_SECRET' }), fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ ok: true }) } } })
  await c.health(); await c.health()
  assert.match(calls[0].url, /^http:\/\/127\.0\.0\.1:1111/); assert.match(calls[1].url, /:1112/); assert.equal(calls[0].options.redirect, 'error')
  await assert.rejects(c.request('https://evil.example'), /无效接口/)
  c.fetch = async () => { throw new Error('TEST_SECRET') }
  await assert.rejects(c.health(), e => !e.message.includes('TEST_SECRET'))
})

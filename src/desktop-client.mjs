import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export class DesktopError extends Error {
  constructor(message, code = 0) { super(message); this.code = code }
}

export class DesktopClient {
  constructor({ readDescriptor, fetchImpl = fetch } = {}) {
    this.readDescriptor = readDescriptor ?? (async () => JSON.parse(await readFile(join(process.env.APPDATA, 'Xiaomi MiMo', 'desktop-api.json'), 'utf8')))
    this.fetch = fetchImpl
  }
  async request(route, { body, signal, stream = false } = {}) {
    let d
    try { d = await this.readDescriptor() } catch { throw new DesktopError('请先打开 MiMo Desktop，并完成登录。') }
    if (d?.api !== 1 || !Number.isInteger(d.port) || d.port < 1 || d.port > 65535 || typeof d.token !== 'string' || !d.token) throw new DesktopError('MiMo 接口版本不兼容，请保留数据并联系适配。')
    if (!route.startsWith('/v1/')) throw new DesktopError('无效接口路径。')
    let response
    try {
      response = await this.fetch(`http://127.0.0.1:${d.port}${route}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        signal: stream ? signal : signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${d.token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch { throw new DesktopError('暂时联系不上 MiMo。已提交任务可能仍在执行，工作台会核对，不会自动重发。') }
    if (!response.ok) {
      const tips = { 401: 'MiMo 认证已变化，请刷新连接。', 403: 'MiMo 拒绝连接。', 404: 'MiMo 会话或接口不存在，请检查绑定。', 409: '该 MiMo 会话正在忙，请在 MiMo 查看。', 400: 'MiMo 拒绝了任务参数，请检查模型与会话绑定。', 503: 'MiMo 尚未就绪，请完成登录并稍候。' }
      throw new DesktopError(tips[response.status] ?? `MiMo 接口返回 ${response.status}。`, response.status)
    }
    if (stream) return response
    try { return await response.json() } catch { throw new DesktopError('MiMo 返回的数据无法识别。') }
  }
  health() { return this.request('/v1/health') }
  async sessions({signal} = {}) {
    const raw = await this.request('/v1/sessions?limit=2000', {signal})
    return (Array.isArray(raw) ? raw : raw.sessions ?? []).map(s => ({ sessionId: s.id, title: s.title || '未命名会话', dir: s.directory }))
  }
  async messages(b, {signal} = {}) {
    const raw = await this.request(`/v1/sessions/${encodeURIComponent(b.sessionId)}/messages?dir=${encodeURIComponent(b.dir)}`, {signal})
    return Array.isArray(raw) ? raw : raw.messages ?? []
  }
  send(b, message, files = []) {
    return this.request(`/v1/sessions/${encodeURIComponent(b.sessionId)}/turns`, { body: { message, model: b.model, dir: b.dir, origin: b.sessionId, ...(files.length ? { files } : {}) } })
  }
  async watch(b, onEvent, signal) {
    const response = await this.request(`/v1/sessions/${encodeURIComponent(b.sessionId)}/events?dir=${encodeURIComponent(b.dir)}`, { stream: true, signal })
    const reader = response.body.getReader(), decoder = new TextDecoder()
    let buffer = ''
    try {
      while (!signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '')
        if (buffer.length > 2_000_000) throw new DesktopError('MiMo 事件过大，已转为消息核对。')
        let end
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const part = buffer.slice(0, end); buffer = buffer.slice(end + 2)
          const type = /^event: ?(.+)$/m.exec(part)?.[1]
          const data = part.split('\n').filter(x => x.startsWith('data:')).map(x => x.slice(5).trimStart()).join('\n')
          if (type && data) { try { onEvent(type, JSON.parse(data)) } catch {} }
        }
      }
    } finally { await reader.cancel().catch(() => {}) }
  }
}

export function selectedModel(messages) {
  for (const m of [...messages].reverse()) {
    const i = m.info ?? m
    const model = i.model
    if (model?.providerID && model?.modelID) return `${model.providerID}/${model.modelID}`
    if (i.providerID && i.modelID) return `${i.providerID}/${i.modelID}`
  }
  return null
}

export function turnState(messages, task) {
  const fresh = messages.filter(m => !task.baseline.includes(m.info?.id))
  const own = fresh.find(m => m.info?.role === 'user' && m.parts?.some(p => p.type === 'text' && p.text?.includes(task.marker)))
  if (!own) return { status: 'awaiting', detail: '正在核对 MiMo 是否接受了这条任务；不会重复提交。' }
  const another = fresh.some(m => m.info?.role === 'user' && m.info.id !== own.info.id)
  if (another) return { status: 'conflict', detail: '专用会话出现其他输入，请到 MiMo 核对后解除占用。' }
  const replies = fresh.filter(m => m.info?.role === 'assistant' && m.info.parentID === own.info.id && (!m.info.agentID || m.info.agentID === 'main'))
  const last = replies.at(-1), info = last?.info
  const text = replies.flatMap(m => m.parts ?? []).filter(p => p.type === 'text' && !p.synthetic).map(p => p.text ?? '').join('\n')
  const tools = replies.flatMap(m => m.parts ?? []).filter(p => p.type === 'tool').map(p => ({ name: p.tool ?? '工具', status: p.state?.status ?? 'unknown' })).slice(-8)
  if (info?.error) return { status: 'failed', text, tools, detail: 'MiMo 报告回合错误，请在 MiMo 查看详情。' }
  const done = info?.time?.completed && info.finish && !['tool-calls', 'unknown'].includes(info.finish)
  return { status: done ? 'completed' : 'running', text, tools, userMessageId: own.info.id, detail: done ? 'MiMo 回合已结束，成果内容仍需你判断。' : 'MiMo 正在执行，或等待其窗口中的权限确认。' }
}

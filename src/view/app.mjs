import { icon, avatar, groupAvatar, avatarCatalog, defaultPreset, findPreset, presetUrl } from './visuals.mjs'
const $ = id => document.getElementById(id)
const api = (command, input) => window.workbench.call(command, input)
let state, current = { type: 'bot', id: 'chief' }, files = [], sending = false, chatSignature = '', filter = '', navSignature = '', routeSignature = ''
let appearance = { avatars: {} }, appearanceRevision = 0, navFilter = ''
const drafts = new Map()
const draftKey = target => `${target.type}:${target.id}`
const labels = { queued: '排队', submitting: '正在提交', awaiting: '核对提交', running: '执行 / 待确认', conflict: '会话冲突', completed: '回合结束', failed: '未完成', cancelled: '已撤回', released: '手动解除', blocked: '需要核对', ended: '已结束接力' }
const time = n => new Date(n).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
function el(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n }
function button(text, fn, cls = 'quiet') { const b = el('button', cls, text); b.type = 'button'; b.onclick = () => run(fn); return b }
let toastTimer
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500) }
async function run(fn) { try { return await fn() } catch (e) { toast(e.message) } }
function chosen() { return current.type === 'group' ? state.groups.find(g => g.id === current.id) : state.bots.find(b => b.id === current.id) }
function isCurrent(t) { return current.type === 'group' ? t.groupId === current.id : !t.groupId && t.botId === current.id }
function bot(id) { return state.bots.find(b => b.id === id) }
function switchConversation(type, id) {
  if (type === current.type && id === current.id) return
  drafts.set(draftKey(current), { text: $('prompt').value, files: [...files], route: $('route').value })
  current = { type, id }; const draft = drafts.get(draftKey(current))
  files = draft?.files ?? []; $('prompt').value = draft?.text ?? ''; chatSignature = ''; render()
  if (draft?.route && [...$('route').options].some(o => o.value === draft.route)) $('route').value = draft.route
}
function nav() {
  if (!state) return
  const signature = JSON.stringify([current, navFilter, appearanceRevision, state.tasks.map(t => [t.id,t.status,t.text?.slice(0,100)]), state.bots.map(b => [b.id, b.name, b.role, !!b.binding]), state.groups.map(g => [g.id, g.name, g.members, g.paused])])
  if (signature === navSignature) return
  navSignature = signature
  for (const [key, type] of [['bots', 'bot'], ['groups', 'group']]) {
    $(key).replaceChildren(...state[key].filter(item => `${item.name} ${item.role ?? ''}`.toLowerCase().includes(navFilter.toLowerCase())).map(item => {
      const selected = current.type === type && current.id === item.id
      const n = button('', () => switchConversation(type,item.id), selected ? 'selected' : '')
      if (selected) n.setAttribute('aria-current','true')
      n.append(type === 'group' ? groupAvatar(item,state.bots,appearance) : avatar(item,appearance))
      const text = el('span', 'nav-copy'); text.append(el('strong','',item.name))
      const latest = [...state.tasks].reverse().find(t => type === 'group' ? t.groupId === item.id : !t.groupId && t.botId === item.id)
      const summary = (latest?.text?.replace(/[#*`\n]/g,' ').trim() || (type === 'group' ? `${item.members.length} 位成员 · ${item.paused ? '派活已暂停' : '接力协作'}` : item.binding ? item.role : '需要绑定专用会话')).slice(0,100)
      text.append(el('small', '', summary)); n.title = `${item.name}\n${summary}`
      n.append(text); return n
    }))
  }
  $('bot-count').textContent = state.bots.length
  $('nav-empty').hidden = $('bots').childElementCount + $('groups').childElementCount > 0
}
function renderText(text) {
  const node = el('div', 'message-text'), lines = String(text ?? '').split('\n'); let inCode = false, code = '', paragraph
  const inline = (parent,value) => { for (const chunk of value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) parent.append(chunk.startsWith('**') ? el('strong','',chunk.slice(2,-2)) : chunk.startsWith('`') ? el('code','',chunk.slice(1,-1)) : document.createTextNode(chunk)) }
  const cells = line => line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim())
  for (let i=0;i<lines.length;i++) {
    const line=lines[i]
    if (line.trimStart().startsWith('```')) { paragraph=null; if (inCode) { node.append(el('pre','',code)); code='' }; inCode=!inCode; continue }
    if (inCode) { code += line+'\n'; continue }
    if (!line.trim()) { paragraph=null; continue }
    if (line.includes('|') && i+1<lines.length && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])) {
      paragraph=null; const wrap=el('div','table-wrap'),table=el('table'),head=el('thead'),row=el('tr'); for(const cell of cells(line)){const th=el('th');th.scope='col';inline(th,cell);row.append(th)} head.append(row);table.append(head); i++
      const body=el('tbody'); while(i+1<lines.length&&lines[i+1].includes('|')&&lines[i+1].trim()){const r=el('tr');for(const cell of cells(lines[++i])){const td=el('td');inline(td,cell);r.append(td)}body.append(r)}table.append(body);wrap.append(table);node.append(wrap);continue
    }
    if (/^#{1,6} /.test(line)) { paragraph=null; const h=el('h3');inline(h,line.replace(/^#{1,6} /,''));node.append(h);continue }
    if (/^\s*(?:[-*] |\d+[.)、] )/.test(line)) { paragraph=null;const p=el('p','list-line');inline(p,line);node.append(p);continue }
    if (!paragraph) { paragraph=el('p');node.append(paragraph) } else paragraph.append(el('br'))
    inline(paragraph,line)
  }
  if (code) node.append(el('pre','',code))
  return node
}
function renderChat() {
  const tasks = state.tasks.filter(isCurrent)
  const signature = JSON.stringify([current, appearanceRevision, state.bots.map(b=>[b.id,b.name]), tasks.map(t => [t.id, t.status, t.text, t.detail, t.artifacts, t.accepted]), state.runs.filter(r => current.type === 'group' && r.groupId === current.id).map(r => [r.id, r.status])])
  if (signature === chatSignature) return
  chatSignature = signature
  const nearBottom = $('chat').scrollHeight - $('chat').scrollTop - $('chat').clientHeight < 110
  const oldScroll = $('chat').scrollTop
  const nodes = []
  if (!tasks.length) {
    const welcome = el('div', 'welcome'); welcome.append(current.type === 'group' ? groupAvatar(chosen(),state.bots,appearance) : avatar(chosen(),appearance))
    welcome.append(el('h2', '', current.type === 'group' ? `和${chosen().name}一起讨论` : `和${chosen().name}聊聊`))
    welcome.append(el('p', '', current.type === 'group' ? 'PM 拆分需求，Coder 与 QA 按步骤协作，最后由 PM 汇总。\n每一步使用独立的 MiMo 会话。' : '写下需求、补充资料，实际工作交给本机 MiMo。\n任务和结果会留在这里，随时可以继续。'))
    welcome.append(el('p', 'welcome-hint', '直接写下你想完成的事；需要资料时，可在输入框添加文件。'))
    nodes.push(welcome)
  }
  const seenRuns = new Set()
  for (const t of tasks) {
    if (!t.runId || !seenRuns.has(t.runId)) {
      const r = t.runId && state.runs.find(r => r.id === t.runId)
      const user = el('article', 'message user'); user.append(renderText(r?.instruction ?? t.instruction)); user.append(el('div', 'message-note', `${time(r?.created ?? t.created)}${t.files.length ? ` · ${t.files.length} 份资料` : ''}`)); nodes.push(user)
      if (r) { seenRuns.add(t.runId); nodes.push(el('div', 'run-label', '协作流程 · PM 分工 → 成员依次接力 → PM 汇总')) }
    }
    const article = el('article', 'message bot'), b = bot(t.botId)
    article.append(avatar(b,appearance))
    const body = el('div','message-content'), head = el('div', 'message-head', b.name)
    head.append(el('small', '', `${t.label ?? '私聊任务'} · ${labels[t.status]}`)); body.append(head)
    if (t.phase === 'plan' && t.status === 'completed') {
      const r = state.runs.find(r => r.id === t.runId)
      body.append(renderText(r?.steps?.length ? r.steps.map((step, i) => `${i + 1}. ${bot(step.botId).name}：${step.instruction}`).join('\n') : t.text))
    } else body.append(renderText(t.text || (t.status === 'queued' ? '任务已保存，等待派活。' : '等待 MiMo 返回内容…')))
    body.append(el('div', 'message-note', t.detail))
    if (t.tools?.length && t.held) body.append(el('div', 'message-note', t.tools.map(tool => `${tool.name} · ${tool.status}`).join(' / ')))
    for (const a of t.artifacts ?? []) body.append(button(`▱ ${a.name}  ·  在文件夹中查看`, () => api('showArtifact', { taskId: t.id, path: a.path }), 'artifact'))
    if (t.artifacts?.length) body.append(el('div', 'message-note', '文件按该回合期间的修改时间列出，需核对内容归属。'))
    if (t.status === 'completed') body.append(button(t.accepted ? '✓ 我已确认成果' : '确认成果可用', () => api('accept', t.id), 'tiny'))
    if (t.text) { const copy=button('',async()=>{await navigator.clipboard.writeText(t.text);toast('回复已复制')},'copy-reply icon-button');copy.append(icon('copy'));copy.setAttribute('aria-label','复制回复');body.append(copy) }
    article.append(body); nodes.push(article)
  }
  $('chat').replaceChildren(...nodes)
  if (nearBottom || oldScroll === 0) $('chat').scrollTop = $('chat').scrollHeight
  else $('chat').scrollTop = oldScroll
}
function renderTasks() {
  const tasks = state.tasks.filter(isCurrent).filter(t => `${t.instruction} ${t.text} ${t.label ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
  $('task-count').textContent = String(tasks.length)
  const runs = state.runs.filter(r => current.type === 'group' && r.groupId === current.id && ['running', 'blocked'].includes(r.status))
  $('runs').replaceChildren(...runs.map(r => {
    const card = el('div', 'run-card'); card.append(el('strong', '', r.status === 'blocked' ? '协作需要核对' : chosen().paused ? '后续派活已暂停' : '协作进行中'))
    card.append(el('p', '', r.detail ?? (r.stage === 'plan' ? 'PM 正在制定分工' : r.stage === 'step' ? `成员接力 ${r.index + 1}/${r.steps.length}` : 'PM 正在汇总')))
    card.append(button('结束后续接力', () => api('endRun', r.id), 'tiny')); return card
  }))
  $('tasks').replaceChildren(...(tasks.length ? [...tasks].reverse().slice(0, 150).map(t => {
    const card = el('div', 'task-card'), top = el('div', 'task-top')
    top.append(el('b', '', t.label ?? bot(t.botId).name), el('span', `status ${t.status}`, labels[t.status])); card.append(top)
    card.append(el('p', 'task-excerpt', (t.label ? bot(t.botId).name : t.instruction).slice(0, 85)))
    card.append(el('div', 'task-detail', `${time(t.created)} · ${t.id.slice(0, 8)}`), el('div', 'task-detail', t.detail))
    if (t.held || t.status === 'queued') {
      card.append(button('去 MiMo 查看', () => api('openMiMo'), 'tiny'))
      card.append(button(t.status === 'queued' ? '撤回排队' : '核对后解除占用', () => api('release', t.id), 'tiny'))
    }
    return card
  }) : [el('div', 'empty-tasks', filter ? '没有匹配的任务' : '任务开始后，\n你可以在这里看到每一步的进度。')]))
}
function render() {
  renderSetupNotice()
  if (!state) return
  renderAccount()
  nav()
  const item = chosen(), group = current.type === 'group'
  $('title').textContent = item.name; $('header-avatar').replaceChildren(group ? groupAvatar(item,state.bots,appearance) : avatar(item,appearance))
  $('subtitle').textContent = group ? `${item.members.map(id=>bot(id).name).join('、')} · ${item.members.length} 位成员` : item.role
  $('subtitle').title = $('subtitle').textContent
  $('memory-count').textContent = item.memories.length; $('pause').hidden = !group; $('pause').textContent = item.paused ? '恢复派活' : '暂停派活'
  $('connection').classList.toggle('online', state.connection.ok); $('connection').querySelector('span').textContent = state.connection.ok ? 'MiMo 已连接' : 'MiMo 未连接'
  const bound = group ? item.members.every(id => item.bindings[id]) : !!item.binding
  const banner = !state.connection.ok ? state.connection.detail : !bound ? '请打开“连接与角色”，绑定专用 MiMo 会话后开始。' : group && item.paused ? '后续派活已暂停。已经发给 MiMo 的任务仍可能在执行；需要停止时请到 MiMo 操作。' : ''
  $('banner').hidden = !banner; $('banner').textContent = banner
  $('route-label').hidden = !group; $('scope-hint').hidden = group; $('scope-hint').textContent = '私聊 · 独立会话'
  const routeKey = JSON.stringify([current, group ? item.members.map(id => [id, bot(id).name]) : []])
  if (routeKey !== routeSignature) {
    routeSignature = routeKey
    $('route').replaceChildren(el('option', '', '小组协作')); $('route').firstChild.value = 'auto'
    if (group) for (const id of item.members) { const o = el('option', '', `@ ${bot(id).name}`); o.value = id; $('route').append(o) }
  }
  $('workspace-label').textContent = state.workspace || '未选择成果文件夹 · 当前只回复内容'; $('workspace-label').title = state.workspace
  $('files').replaceChildren(...files.map(path => button(`▱ ${path.split(/[\\/]/).at(-1)} ×`, () => { files = files.filter(f => f !== path); render() }, 'chip')))
  renderChat(); renderTasks()
}
function panel(title) { $('panel-title').textContent = title; $('panel-body').replaceChildren(); delete $('panel-body').dataset.setupSignature; if (!$('panel').open) $('panel').showModal(); return $('panel-body') }
function field(label, value, multiline = false) { const l = el('label', 'field', label), input = el(multiline ? 'textarea' : 'input'); input.value = value; l.append(input); return { label: l, input } }
const loginLabel=a=>({signedIn:'已登录',signedOut:'未登录',visible:'窗口账号 · 点击核对',unknown:'账号状态待核对'})[a.login]||'正在读取账号…'
function accountPanel(){panel('MiMo 账号');renderAccountPanel()}
function renderAccount(){
  const a=state.account||{};$('account-name').textContent=a.name||'MiMo 账号';$('account-status').textContent=loginLabel(a);$('account-avatar').textContent=a.name?Array.from(a.name)[0].toUpperCase():'M';$('account-summary').classList.toggle('verified',a.login==='signedIn');renderAccountPanel()
}
function renderAccountPanel(){
  if(!$('panel').open||$('panel-title').textContent!=='MiMo 账号')return
  const a=state.account||{},body=$('panel-body'),signature=JSON.stringify([a,state.connection]);if(body.dataset.accountSignature===signature&&body.childElementCount)return;body.dataset.accountSignature=signature;body.replaceChildren()
  const heading=el('div','account-heading'),badge=el('span','account-avatar',a.name?Array.from(a.name)[0].toUpperCase():'M'),copy=el('div');copy.append(el('strong','',a.name||'MiMo 账号'),el('p','',loginLabel(a)));heading.append(badge,copy);body.append(heading)
  const rows=el('dl','account-facts');for(const [label,value] of [['登录状态',a.login==='visible'?'侧边栏已显示账号，点击刷新确认登录':loginLabel(a)],['MiMo 引擎',state.connection.detail],['剩余用量','暂不可读取，请在 MiMo 查看'],['读取时间',a.observedAt?new Date(a.observedAt).toLocaleTimeString('zh-CN'):'尚未读取']])rows.append(el('dt','',label),el('dd','',value));body.append(rows)
  if(a.detail)body.append(el('p','setup-feedback',a.detail))
  body.append(el('p','intro','账号来自本机 MiMo 窗口。刷新会短暂打开其账号菜单；登录、切换账号和订购仍在 MiMo 完成。账号信息只在内存显示，不写入聊天记录。'))
  const feedback=el('p','setup-feedback');feedback.setAttribute('role','status');const refresh=button('刷新账号状态',async()=>{refresh.disabled=true;feedback.textContent='正在读取 MiMo 账号菜单…';try{const result=await api('accountRefresh');state.account=result;renderAccount()}catch(e){feedback.textContent=e.message}finally{refresh.disabled=false}},'primary');body.append(refresh,button('打开 MiMo',()=>api('openMiMo')),feedback)
}
function avatarPanel() {
  if (!state) return toast('正在读取工作台，请稍候。')
  const body = panel('头像与外观')
  body.append(el('p','intro','内置 9 款日式角色头像，包含不同发色和发型。选择后，列表、聊天和小组头像同步更新。也可以上传自己的图片。'))
  for (const b of state.bots) {
    const row=el('div','avatar-setting-row'),copy=el('span','avatar-setting-copy')
    const preset=findPreset(appearance.presets?.[b.id])||defaultPreset(b.id)
    copy.append(el('strong','',b.name),el('small','',appearance.avatars[b.id]?'本地上传':preset?`${preset.familyName} · ${preset.name}`:'尚未选择头像'))
    row.append(avatar(b,appearance),copy)
    row.append(button('选择内置',()=>avatarLibrary(b),'avatar-change'))
    row.append(button('本地上传',async()=>{const next=await api('chooseAvatar',b.id);appearance=next;appearanceRevision++;render();if($('panel').open&&$('panel-title').textContent==='头像与外观')avatarPanel()},'avatar-upload'))
    const reset=button('重置',async()=>{appearance=await api('resetAvatar',b.id);appearanceRevision++;render();avatarPanel();toast('已恢复默认头像')},'avatar-reset');reset.disabled=!appearance.avatars[b.id]&&!appearance.presets?.[b.id];row.append(reset);body.append(row)
  }
  body.append(el('p','intro avatar-note','支持 PNG、JPG、WebP，最大 8 MB。图片居中裁成正方形并缩为 256 像素，仅保存到本机工作台数据目录，不上传。当前不支持手动调整裁剪位置。'))
  const actions=el('div','panel-actions');actions.append(button('连接与角色',settings),button('完成',()=>$('panel').close(),'primary'));body.append(actions)
}
function avatarLibrary(b, family=defaultPreset(b.id)?.family||'all') {
  const body=panel(`${b.name} · 内置头像`),currentPreset=appearance.avatars[b.id]?null:(appearance.presets?.[b.id]||defaultPreset(b.id)?.id)
  body.append(el('p','intro','同一角色的脸型与画风保持一致，切换发色和发型。也可选择其他角色的款式。点击图片即可应用。'))
  const tabs=el('div','avatar-family-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','按角色筛选头像')
  for(const [id,name]of [['all','全部 9 款'],['chief','皮波'],['planner','米粒'],['reviewer','阿橘']]){const tab=button(name,()=>avatarLibrary(b,id),id===family?'selected':'');tab.setAttribute('aria-pressed',String(id===family));tabs.append(tab)}body.append(tabs)
  const grid=el('div','avatar-library-grid')
  for(const preset of avatarCatalog.filter(p=>family==='all'||p.family===family)){
    const tile=button('',async()=>{const scroll=body.scrollTop;appearance=await api('selectAvatar',{botId:b.id,presetId:preset.id});appearanceRevision++;render();avatarLibrary(b,family);$('panel-body').scrollTop=scroll;const selected=$('panel-body').querySelector('[aria-pressed="true"].avatar-preset');selected?.focus({preventScroll:true});toast(`已应用：${preset.name}`)},'avatar-preset')
    tile.setAttribute('aria-pressed',String(preset.id===currentPreset));tile.setAttribute('aria-label',`${preset.familyName} · ${preset.name}`)
    const image=el('img');image.src=presetUrl(preset.id);image.alt='';image.draggable=false;tile.append(image,el('strong','',preset.name),el('small','',preset.familyName));if(preset.id===currentPreset)tile.append(el('span','preset-check','✓'));grid.append(tile)
  }
  body.append(grid)
  const footer=el('div','panel-actions');footer.append(button('返回头像设置',avatarPanel),button('完成',()=>$('panel').close(),'primary'));body.append(footer)
}
async function settings() {
  const body = panel('连接与角色')
  body.append(el('p', 'intro', '每个私聊和每位群成员各用一个独立 MiMo 会话。点击“自动创建”即可由工作台操作 MiMo 完成初始化和绑定；也可手动选择专用会话。'))
  const actions = el('div', 'panel-actions')
  actions.append(button('会话创建进度',setupProgress), button('打开 MiMo', () => api('openMiMo')), button('刷新列表', () => settings()),button('头像与外观',avatarPanel))
  body.append(actions, el('p', 'intro', `状态：${state.connection.detail}${state.connection.version ? ` · MiMo ${state.connection.version}` : ''}`))
  const sessions = await api('sessions')
  if (!$('panel').open || $('panel-title').textContent !== '连接与角色') return
  async function bindingRow(b, groupId) {
    const binding = groupId ? state.groups.find(g => g.id === groupId).bindings[b.id] : b.binding
    const row = el('div', 'settings-row'), title = el('div'); title.append(el('strong', '', b.name), el('small', '', binding ? `模型：${binding.model}` : '未绑定'))
    const controls = el('div'), select = el('select'); select.setAttribute('aria-label', `${groupId ? '群聊' : '私聊'} ${b.name}会话`)
    const empty = el('option', '', '请选择专用 MiMo 会话'); empty.value = ''; select.append(empty)
    for (const s of sessions) { const o = el('option', '', `${s.title} · ${s.sessionId.slice(-6)}`); o.value = s.sessionId; select.append(o) }
    select.value = binding?.sessionId ?? ''
    select.onchange = () => run(async () => { if (!select.value) return; select.disabled = true; try { await api('bind', { botId: b.id, groupId, sessionId: select.value }); toast('绑定已保存'); await settings() } finally { select.disabled = false } })
    controls.append(select); if(!binding)controls.append(button('自动创建',()=>setupWizard({botId:b.id,groupId}), 'tiny')); if (!groupId) controls.append(button('修改名字与职责', () => editBot(b), 'tiny'))
    row.append(title, controls); body.append(row)
  }
  body.append(el('h3', 'settings-scope', '私聊会话'))
  for (const b of state.bots) await bindingRow(b, null)
  for (const g of state.groups) { body.append(el('h3', 'settings-scope', `工作组：${g.name}（群聊专用）`)); if(g.members.some(id=>!g.bindings[id]))body.append(button('为本组创建缺少的会话',()=>setupWizard({groupId:g.id,all:true}))); for (const id of g.members) await bindingRow(bot(id), g.id) }
  const footer = el('div', 'panel-actions'); footer.append(button('导出任务与记忆', () => api('exportHistory')), button('打开工作台数据目录', () => api('showData'))); body.append(footer)
}
function editBot(b) {
  const body = panel(b ? '编辑 Bot' : '新建 Bot'), name = field('名字', b?.name ?? ''), role = field('职责 / 工作方式', b?.role ?? '', true)
  body.append(name.label, role.label, el('p', 'intro', '更改职责会作用于后续任务。新 Bot 可以在保存后自动创建独立 MiMo 会话。'))
  const auto=el('input');auto.type='checkbox';auto.checked=true
  if(!b){const label=el('label','checkbox');label.append(auto,document.createTextNode('保存后创建专用 MiMo 会话'));body.append(label)}
  const save=button('保存',async()=>{save.disabled=true;try{const id=await api('bot',{id:b?.id,name:name.input.value,role:role.input.value});state=await api('state');render();if(!b&&auto.checked)setupWizard({botId:id});else{$('panel').close();toast('Bot 已保存')}}finally{save.disabled=false}},'primary');body.append(save)
}
function createGroup() {
  const body = panel('新建工作组'), name = field('工作组名字', ''), members = new Set(['chief'])
  body.append(name.label, el('p', 'intro', 'PM 负责分工。请选择参与接力的成员；每位成员都需要新的群聊专用会话。'))
  for (const b of state.bots) {
    const label = el('label', 'checkbox'), input = el('input'); input.type = 'checkbox'; input.checked = b.id === 'chief'; input.disabled = b.id === 'chief'; input.onchange = () => input.checked ? members.add(b.id) : members.delete(b.id); label.append(input, document.createTextNode(b.name)); body.append(label)
  }
  const save=button('创建工作组',async()=>{save.disabled=true;try{const id=await api('group',{name:name.input.value,members:[...members]});state=await api('state');render();setupWizard({groupId:id,all:true})}finally{save.disabled=false}},'primary');body.append(save)
}
function setupWizard(target) {
  const body=panel('自动创建 MiMo 会话'), group=target.groupId?state.groups.find(g=>g.id===target.groupId):null
  const names=target.all?group.members.filter(id=>!group.bindings[id]).map(id=>bot(id).name):[bot(target.botId).name]
  body.append(el('p','intro',`${group?group.name+' · ':''}${names.join('、')}。每位成员会使用全新的独立会话，已有绑定保持不变。`))
  const label=el('label','field','初始化模型'),select=el('select'),option=el('option','','沿用 MiMo 当前模型');option.value='';select.append(option);label.append(select);body.append(label)
  const feedback=el('p','setup-feedback');feedback.setAttribute('role','status')
  const read=button('读取 MiMo 可选模型',async()=>{read.disabled=true;start.disabled=true;feedback.textContent='正在读取 MiMo 模型…';try{const data=await api('setupModels');select.replaceChildren(option);for(const name of [...new Set(data.models)]){const o=el('option','',name);o.value=name;select.append(o)}feedback.textContent=`当前模型：${data.current}`}catch(e){feedback.textContent=e.message}finally{read.disabled=false;start.disabled=false}});body.append(read,feedback)
  body.append(el('p','intro','先保存 MiMo 中未发送的草稿，并等现有任务结束。开始后工作台会使用 MiMo 窗口，请暂时不要操作它；按 Esc 或回到工作台点“取消”可停止。初始化只发送一句连接消息，不读写项目文件。'))
  const start=button('开始创建并绑定',async()=>{start.disabled=true;try{await api('setupStart',{...target,modelLabel:select.value});state=await api('state');setupProgress();render()}catch(e){feedback.textContent=e.message}finally{start.disabled=false}},'primary')
  body.append(start,button('稍后再做',()=>settings()))
}
function setupProgress(){panel('会话创建进度');renderSetupProgress()}
function renderSetupProgress(){
  if(!$('panel').open||$('panel-title').textContent!=='会话创建进度')return
  const body=$('panel-body'),jobs=[...(state.sessionSetups??[])].reverse().slice(0,8),signature=JSON.stringify([jobs,state.sessionSetupActive]);if(body.dataset.setupSignature===signature)return;body.dataset.setupSignature=signature;body.replaceChildren()
  if(!jobs.length)body.append(el('p','intro','还没有自动创建记录。新建 Bot 或在连接与角色中点击“自动创建”。'))
  const status={pending:'尚未开始',creating:'创建中',verifying:'核对中',bound:'已绑定',needsReview:'待核对'}
  for(const job of jobs){const block=el('section','setup-record');block.append(el('strong','',({running:'正在创建',completed:'创建完成',needsReview:'需要核对',closed:'记录已结束'})[job.status]||job.status),el('p','intro',job.detail));for(const i of job.items)block.append(el('p','setup-item',`${i.name} · ${status[i.status]||i.status}${i.model?' · '+i.model:''}`));
    const actions=el('div','panel-actions')
    if(job.status==='running')actions.append(button('取消本次创建',async()=>{await api('setupCancel');toast('已请求停止；已提交的初始化不会被重发。')}))
    if(job.status==='needsReview')actions.append(button('核对已有会话',async()=>{await api('setupRecover',job.id);state=await api('state');renderSetupProgress()},'primary'),button('我已核对，结束本次记录',async()=>{await api('setupDismiss',job.id);state=await api('state');renderSetupProgress()}))
    block.append(actions);body.append(block)
  }
  body.append(button('返回连接与角色',settings))
}
function renderSetupNotice(){
  if(!state)return
  let notice=$('session-setup-notice');if(!notice){notice=button('',setupProgress,'setup-notice');notice.id='session-setup-notice';$('connection').after(notice)}
  const job=[...(state.sessionSetups??[])].reverse().find(j=>['running','needsReview'].includes(j.status));notice.hidden=!job;notice.textContent=job?(job.status==='running'?'正在创建 MiMo 会话…':'会话创建需要核对')+' · 查看进度':''
  renderSetupProgress()
}
function memories() {
  const item = chosen(), scope = current.type, scopeId = current.id, body = panel(`${item.name} · 记忆`)
  body.append(el('p', 'intro', scope === 'group' ? '这里的约定只注入本群后续任务，不注入成员私聊。删除会停止后续注入；MiMo 已有的历史消息不会被擦除。' : '这里的约定只注入这个 Bot 的私聊，不带入群聊。删除会停止后续注入；MiMo 已有的历史消息不会被擦除。'))
  for (const m of item.memories) {
    const card = el('div', 'memory-card', m.text)
    card.append(document.createElement('br'), button('修改', () => editMemory(m, scope, scopeId), ''), button('删除', async () => { await api('memory', { scope, id: scopeId, memoryId: m.id, text: '' }); memories() }, ''))
    body.append(card)
  }
  const text = field('添加一条明确约定', '', true); body.append(text.label, button('保存记忆', async () => { await api('memory', { scope, id: scopeId, text: text.input.value }); memories() }, 'primary'))
}
function editMemory(m, scope, id) {
  const body = panel('修改记忆'), text = field('约定内容', m.text, true); body.append(text.label, button('保存修改', async () => { await api('memory', { scope, id, memoryId: m.id, text: text.input.value }); memories() }, 'primary'))
}
function help() {
  const body = panel('开始使用'), content = el('div', 'help')
  const rows = [
    ['1. 保持 MiMo 打开', '本工作台负责聊天、派活和保存记录。实际推理、工具执行与权限确认都在你本机的 MiMo Desktop。'],
    ['2. 选择一个 Bot 或工作组', '左侧 Bot 是私聊；工作组使用另一套会话。群里可交给 PM 自动分工，也可在输入区下方选择一位成员。自动接力最多 4 个成员步骤，再由 PM 汇总。'],
    ['3. 要生成文件，先选成果文件夹', '建议从新的空文件夹开始。点击“添加资料”选文件。工作台会把指定文件夹传给 MiMo，并列出期间修改的文件；文件内容仍需你确认。首版文件夹范围属于任务约定，不是 MiMo 工具的强制沙箱。'],
    ['4. 任务状态怎么看', '“核对提交”表示接口接受不等于已经执行；“执行 / 待确认”时，MiMo 可能需要你同意工具权限；“回合结束”表示模型结束回答，不等于成果验收。确认内容后可点击“确认成果可用”。'],
    ['5. 暂停与停止', '群里的“暂停派活”会阻止后续提交；当前已提交任务仍在 MiMo 执行。需要真正停止时去 MiMo。核对已结束后才能解除会话占用。关闭工作台也不会停止 MiMo。'],
    ['6. 记忆与历史', '每个 Bot 和群有自己的可编辑约定。删除后不再注入后续任务，但 MiMo 历史仍保留先前消息；需要彻底清空上下文时在 MiMo 新建会话并重新绑定。点右上“资料与进度”可搜索当前聊天的历史任务。'],
    ['7. 头像与草稿', '左下设置可为每个机器人选择本地头像，默认三位角色使用日式插画。头像只保存在本机。切换聊天会保留各自未发送的文字和附件；草稿暂不跨应用重启保存。'],
    ['8. 自动创建会话', '新建 Bot 后点击“开始创建并绑定”；新工作组会为每位成员分别创建群聊会话。保持 MiMo 登录，先保存草稿，等现有任务结束。创建期间请勿操作 MiMo；按 Esc 可停止窗口操作。取消或中断后从“会话创建进度”核对，初始化不会自动重发。'],
    ['连接异常时', '先打开 MiMo，完成登录并检查模型。回到工作台点击左上连接状态刷新。不确定的任务不会自动重发；可在 MiMo 核对。窗口布局变化导致自动创建停止时，仍可手动新建、选模型并发“你好”，然后绑定。'],
    ['数据与范围', '任务、绑定和记忆保存在本机工作台数据目录，不保存 MiMo 认证 token。工作台只连接 MiMo 的本机接口，不直接连接模型服务。MiMo 的模型与工具行为由其已有配置和权限管理。'],
  ]
  for (const [title, text] of rows) content.append(el('h3', '', title), el('p', '', text))
  body.append(content, button('打开成果文件夹', () => api('showWorkspace')), button('打开数据目录', () => api('showData')))
}
$('panel-close').onclick = () => $('panel').close()
$('panel').addEventListener('click', e => { if (e.target === $('panel')) { const r = $('panel').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('panel').close() } })
$('settings').onclick = avatarPanel; $('help').onclick = help; $('memory').onclick = memories; $('add-bot').onclick = () => editBot(); $('add-group').onclick = createGroup
$('account-summary').onclick=accountPanel
$('connection').onclick = () => run(async () => { await api('refresh'); toast('连接已刷新') })
$('pause').onclick = () => run(() => api('pause', { groupId: current.id, paused: !chosen().paused }))
$('workspace').onclick = () => run(() => api('chooseWorkspace'))
$('workspace-label').onclick = () => run(() => api('showWorkspace'))
$('attach').onclick = () => run(async () => { files = [...new Set([...files, ...await api('chooseFiles')])].slice(0, 15); render() })
$('prompt').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('composer').requestSubmit() } }
$('composer').onsubmit = e => {
  e.preventDefault(); if (sending || !$('prompt').value.trim()) return
  run(async () => {
    sending = true; $('send').disabled = true
    const target={...current},text=$('prompt').value,attached=[...files],route=$('route').value
    const input = { instruction: text.trim(), files: attached, requestId: crypto.randomUUID() }
    try {
      if (target.type === 'group') {
        input.groupId = target.id
        if (route === 'auto') await api('collaborate', input)
        else await api('send', { ...input, botId: route })
      } else await api('send', { ...input, botId: target.id })
      if (draftKey(current)===draftKey(target)&&$('prompt').value===text&&JSON.stringify(files)===JSON.stringify(attached)) { $('prompt').value='';files=[];drafts.delete(draftKey(target)) }
      else if (draftKey(current)!==draftKey(target)) { const saved=drafts.get(draftKey(target));if(saved?.text===text&&JSON.stringify(saved.files)===JSON.stringify(attached))drafts.delete(draftKey(target)) }
      render()
    } finally { sending = false; $('send').disabled = false }
  })
}
const search = el('input'); search.id = 'search'; search.placeholder = '查找本聊天的任务 / 结果'; search.setAttribute('aria-label', '查找任务'); search.oninput = () => { filter = search.value; renderTasks() }; $('tasks').before(search)
for (const [id,name] of Object.entries({'add-bot':'plus','add-group':'plus','toggle-nav-search':'search','more':'more','attach':'plus','workspace':'folder','send':'arrow','details-icon':'sidebar','close-activity':'close','help':'help','settings-icon':'settings'})) $(id).append(icon(name))
function toggleActivity(open=!document.body.classList.contains('details-open')) { document.body.classList.toggle('details-open',open);document.querySelector('.activity').hidden=!open;$('toggle-activity').setAttribute('aria-expanded',String(open));if(!open)$('toggle-activity').focus() }
$('toggle-activity').onclick=()=>toggleActivity();$('close-activity').onclick=()=>toggleActivity(false)
$('toggle-nav-search').onclick=()=>{const wrap=$('nav-search-wrap');wrap.hidden=!wrap.hidden;if(!wrap.hidden)$('nav-search').focus();else{navFilter='';$('nav-search').value='';nav()}}
$('nav-search').oninput=()=>{navFilter=$('nav-search').value;nav()}
function closeMenu(restore=false){$('more-menu').hidden=true;$('more').setAttribute('aria-expanded','false');if(restore)$('more').focus()}
$('more').onclick=()=>{const open=$('more-menu').hidden;$('more-menu').hidden=!open;$('more').setAttribute('aria-expanded',String(open));if(open)$('more-menu').querySelector('button').focus()}
for(const [id,action] of Object.entries({'menu-avatars':avatarPanel,'menu-connection':settings,'menu-export':()=>api('exportHistory'),'menu-help':help})) $(id).onclick=()=>{closeMenu();run(action)}
document.addEventListener('click',e=>{if(!e.target.closest('.menu-anchor'))closeMenu()})
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('nav-search-wrap').hidden=false;$('nav-search').focus()}
  if(e.key==='Escape'){if(!$('more-menu').hidden)closeMenu(true);else if(!$('panel').open&&document.body.classList.contains('details-open'))toggleActivity(false)}
  if(!$('more-menu').hidden&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...$('more-menu').querySelectorAll('button')],i=buttons.indexOf(document.activeElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus()}
  if(e.key==='Tab'&&!$('more-menu').hidden)closeMenu()
})
window.addEventListener('unhandledrejection', e => { e.preventDefault(); toast(e.reason?.message ?? '操作未完成') })
try {
  ;[state,appearance]=await Promise.all([api('state'),api('appearance')]);render();if(appearance.warning)toast(appearance.warning)
  window.workbench.subscribe(s => { state = s; render() })
} catch(e) { $('banner').hidden=false;$('banner').textContent='工作台数据暂时未能读取，请重新打开应用。';toast(e.message) }

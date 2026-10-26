import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { turnState, selectedModel } from './desktop-client.mjs'

const pending = new Set(['running', 'needsReview'])
const sleep = ms => new Promise(r => setTimeout(r, ms))

// UI only creates the session; identity, model and turn completion come from the local API.
export class SessionSetup {
  constructor(core, executable, mutate) { this.core=core; this.executable=executable; this.mutate=mutate; this.active=false }
  get jobs() { return this.core.s.sessionSetups ??= [] }
  async init() {
    for (const job of this.jobs) if (job.status==='running') {
      job.status='needsReview'; job.detail='上次创建被中断。请先核对已有会话，不会自动重发初始化。'
      for(const item of job.items) if(['creating','verifying'].includes(item.status))item.status='needsReview'
    }
    await this.core.persist()
  }
  guard() {
    if(this.active)throw new Error('正在操作 MiMo 窗口，请等创建结束或先取消。')
    if(this.core.s.tasks.some(t=>t.held||t.status==='queued') || this.core.s.runs.some(r=>['running','paused','blocked'].includes(r.status)))throw new Error('工作台还有任务或接力流程，请完成或结束后再创建会话。')
  }
  async models() {
    this.guard();this.active=true;this.core.sessionSetup=true;this.controller=new AbortController()
    try { return await this.helper({operation:'models'},this.controller.signal) }
    finally {this.active=false;this.core.sessionSetup=false;this.controller=null}
  }
  async start({botId,groupId,all=false,modelLabel=''}) {
    this.guard()
    if(this.jobs.some(j=>pending.has(j.status)))throw new Error('有一次创建尚未核对，请在“会话创建进度”先处理。')
    if(typeof modelLabel!=='string'||modelLabel.length>150)throw new Error('无效模型。')
    const group=groupId?this.core.group(groupId):null
    const ids=all&&group?group.members:[botId]
    const items=ids.map(id=>{
      const bot=this.core.bot(id)
      if(group&&!group.members.includes(id))throw new Error('这个 Bot 不在工作组内。')
      return {botId:id,groupId:groupId||null,name:group?`${group.name} · ${bot.name}`:bot.name,status:'pending',marker:`[工作台建会话 ${randomUUID()}]`}
    }).filter(i=>!this.core.binding(i.botId,i.groupId))
    if(!items.length)throw new Error('所选角色已经绑定会话。已有绑定保持不变。')
    const health=await this.core.client.health();if(health.engine!=='ready')throw new Error('请先打开 MiMo 并完成登录。')
    const job={id:randomUUID(),created:Date.now(),status:'running',modelLabel,items,detail:'准备操作 MiMo 窗口；期间请勿操作 MiMo，按 Esc 可停止窗口操作。'}
    this.jobs.push(job);this.active=true;this.core.sessionSetup=true;this.controller=new AbortController()
    await this.core.persist()
    setImmediate(()=>this.execute(job,false).catch(()=>{}))
    return job.id
  }
  helper(input,signal,onProgress=()=>{}) {
    return new Promise((resolve,reject)=>{
      const child=spawn(this.executable,[],{stdio:['pipe','pipe','pipe'],windowsHide:true})
      this.child=child;let result,error,settled=false
      const abort=()=>{child.kill();error=new Error('已停止窗口操作。可能已创建的会话需要核对；不会重发。')}
      signal?.addEventListener('abort',abort,{once:true})
      if(signal?.aborted)abort()
      const timer=setTimeout(()=>{error=new Error('窗口操作超时，已停止；请核对是否已创建会话。');child.kill()},30000)
      const lines=createInterface({input:child.stdout})
      lines.on('line',line=>{try{const e=JSON.parse(line);if(e.type==='result')result=e;else if(e.type==='error')error=new Error(e.message);else if(e.type==='progress')onProgress(e.detail)}catch{error=new Error('窗口助手返回异常。')}})
      child.stderr.resume() // Never forward desktop content or OS internals into the renderer/log.
      const finish=e=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);lines.close();if(this.child===child)this.child=null;e?reject(e):resolve(result)}
      child.on('error',()=>finish(new Error('内置窗口助手无法启动，请重新打开工作台。')))
      child.on('close',code=>finish(error||(!result||code!==0?new Error('窗口操作未完成，请核对 MiMo。'):null)))
      child.stdin.on('error',()=>{})
      child.stdin.end(JSON.stringify(input)+'\n','utf8')
    })
  }
  async change(job,detail,fn=()=>{}) { return this.mutate(async()=>{fn();if(detail)job.detail=detail;await this.core.persist()}) }
  async execute(job,recovery) {
    const signal=this.controller.signal
    let created=0
    try {
      for(const item of job.items) {
        if(item.status==='bound')continue
        if(signal.aborted)throw new Error('创建已取消；请核对可能已经创建的会话。')
        if(recovery && !item.before)continue // Recovery must never create a new session or send again.
        if(!recovery) {
          const before=(await this.core.client.sessions({signal})).map(s=>s.sessionId)
          await this.change(job,`正在为「${item.name}」创建独立会话`,()=>{item.before=before;item.status='creating'})
          const message=`${item.marker} 工作台专用会话：${item.name}。这是连接初始化，不是工作任务。不要调用工具、读写文件或修改配置；只回复 WORKBENCH_SESSION_READY。`
          await this.helper({operation:'create',model:job.modelLabel,message,activate:created++===0?'true':'false'},signal,detail=>{this.change(job,`${item.name}：${detail}`).catch(()=>{})})
          await this.change(job,'初始化已提交，正在核对会话身份和回合结束',()=>{item.status='verifying'})
        }
        const deadline=Date.now()+(recovery?30000:120000)
        let binding
        do {
          if(signal.aborted)throw new Error('已停止核对；MiMo 已提交的初始化可能仍在执行。')
          binding=await this.find(item,signal)
          if(binding)break
          await sleep(1500)
        }while(Date.now()<deadline)
        if(!binding)throw new Error('尚未找到唯一且已结束初始化的新会话。请稍候点击“核对已有会话”，不要重复创建。')
        await this.mutate(async()=>{
          if(signal.aborted)throw new Error('绑定前已取消，保留会话待核对。')
          const existing=this.core.binding(item.botId,item.groupId)
          if(existing&&existing.sessionId!==binding.sessionId)throw new Error('这个角色的绑定已变化，已停止自动覆盖。')
          await this.core.bind({...item,sessionId:binding.sessionId})
          item.sessionId=binding.sessionId;item.model=binding.model;item.status='bound';job.detail=`「${item.name}」已创建并绑定`;await this.core.persist()
        })
      }
      const done=job.items.every(i=>i.status==='bound')
      await this.change(job,done?'已完成，会话已独立绑定，可以回到聊天派任务。':'已核对已提交的会话。尚未开始的成员可在结束本次记录后继续创建。',()=>{job.status=done?'completed':'needsReview'})
    } catch(e) {
      await this.change(job,e.message,()=>{job.status='needsReview';for(const i of job.items)if(['creating','verifying'].includes(i.status))i.status='needsReview'})
    } finally {this.active=false;this.core.sessionSetup=false;this.controller=null;this.core.onChange(this.core.snapshot());this.onFinished?.()}
  }
  async find(item,signal) {
    const candidates=(await this.core.client.sessions({signal})).filter(s=>!item.before.includes(s.sessionId))
    if(candidates.length>30)throw new Error('新会话数量过多，无法安全辨认，请手动核对绑定。')
    const matches=[]
    for(const s of candidates) {
      const messages=await this.core.client.messages(s,{signal})
      const own=messages.filter(m=>m.info?.role==='user'&&m.parts?.some(p=>p.type==='text'&&p.text?.startsWith(item.marker+' ')))
      if(!own.length)continue
      if(own.length!==1 || messages.filter(m=>m.info?.role==='user').length!==1)throw new Error('初始化会话出现其他输入，已停止绑定，请手动核对。')
      const turn=turnState(messages,{baseline:[],marker:item.marker})
      if(turn.status==='failed')throw new Error('MiMo 初始化返回错误，请在 MiMo 检查模型后核对。')
      matches.push({s,model:selectedModel(messages),done:turn.status==='completed',tools:turn.tools})
    }
    if(matches.length>1)throw new Error('找到多个相同标识，已停止自动绑定。')
    const m=matches[0]
    if(m?.tools?.length)throw new Error('初始化意外调用了工具，请先在 MiMo 核对。')
    return m?.done&&m.model?{...m.s,model:m.model}:null
  }
  async recover(id) {
    this.guard();const job=this.jobs.find(j=>j.id===id)
    if(job?.status!=='needsReview')throw new Error('这次创建不需要恢复。')
    this.active=true;this.core.sessionSetup=true;this.controller=new AbortController();job.status='running';job.detail='只核对已有初始化，不新建、不重发。';await this.core.persist()
    setImmediate(()=>this.execute(job,true).catch(()=>{}));return id
  }
  cancel() {this.controller?.abort();return true}
  async dismiss(id) {
    if(this.active)throw new Error('请先取消正在执行的创建。')
    const job=this.jobs.find(j=>j.id===id);if(job?.status!=='needsReview')throw new Error('没有待核对记录。')
    job.status='closed';job.detail='用户核对后结束记录。MiMo 中的会话和草稿已保留，未删除。';await this.core.persist()
  }
  async close() {this.cancel();this.child?.kill();while(this.active)await sleep(50)}
}

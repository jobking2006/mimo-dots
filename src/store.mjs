import { mkdir, readFile, writeFile, rename, copyFile, open, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export function initialState() {
  return {
    version: 1, workspace: '', bots: [
      { id: 'chief', name: '主理 Bot', role: '理解用户需求，拆分工作，汇总交付。', color: '#307469', binding: null, memories: [] },
      { id: 'planner', name: '策划 Bot', role: '将玩法想法写成规则清晰、边界明确、可落地的策划说明。', color: '#b77b40', binding: null, memories: [] },
      { id: 'reviewer', name: '审查 Bot', role: '检查策划方案的歧义、遗漏、数值边界和验收条件，区分阻塞与建议。', color: '#7466a2', binding: null, memories: [] },
    ],
    groups: [{ id: 'design', name: '策划工作组', members: ['chief', 'planner', 'reviewer'], bindings: {}, memories: [], paused: false }],
    tasks: [], runs: [],
  }
}

export class Store {
  constructor(dir) { this.dir = dir; this.file = join(dir, 'state.json'); this.chain = Promise.resolve() }
  async load() {
    await mkdir(this.dir, { recursive: true })
    this.lockFile = join(this.dir, 'controller.lock')
    this.lockId = randomUUID()
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(this.lockFile, 'wx')
        await handle.writeFile(JSON.stringify({ pid: process.pid, id: this.lockId })); await handle.close(); this.ownsLock = true; break
      } catch (e) {
        if (e.code !== 'EEXIST') throw e
        let owner
        try { owner = JSON.parse(await readFile(this.lockFile, 'utf8')) } catch { throw new Error('数据目录有未完成的控制器锁，请联系修复。') }
        let alive = true
        try { process.kill(owner.pid, 0) } catch (err) { if (err.code === 'ESRCH') alive = false }
        if (alive) throw new Error('这个数据目录已有工作台在运行，请使用已打开的窗口。')
        await unlink(this.lockFile)
      }
    }
    if (!this.ownsLock) throw new Error('无法取得工作台数据锁。')
    try { this.state = JSON.parse(await readFile(this.file, 'utf8')) }
    catch (e) {
      if (e.code !== 'ENOENT') {
        // Keep the damaged original. Never silently overwrite a user's history.
        await this.release()
        throw new Error('工作台数据无法读取。原文件已保留，请联系修复；不要删除数据目录。')
      }
      this.state = initialState(); await this.save()
    }
    if (this.state.version !== 1 || !Array.isArray(this.state.tasks)) { await this.release(); throw new Error('工作台数据版本不兼容。') }
    return this.state
  }
  save() {
    const snapshot = JSON.stringify(this.state, null, 2)
    this.chain = this.chain.then(async () => {
      const tmp = `${this.file}.tmp`
      await writeFile(tmp, snapshot, 'utf8')
      try { await copyFile(this.file, `${this.file}.bak`) } catch (e) { if (e.code !== 'ENOENT') throw e }
      await rename(tmp, this.file)
    })
    return this.chain
  }
  async release() {
    if (!this.ownsLock) return
    const owner = JSON.parse(await readFile(this.lockFile, 'utf8'))
    if (owner.id === this.lockId) await unlink(this.lockFile)
    this.ownsLock = false
  }
}

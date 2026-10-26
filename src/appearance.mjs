import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { findPreset } from './avatar-catalog.mjs'

// Presentation preferences never change task history, bindings or injected memory.
export class Appearance {
  constructor(dir) { this.file = join(dir, 'appearance.json'); this.avatars = {}; this.presets = {} }
  async load() {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'))
      for (const [id, uri] of Object.entries(data.avatars ?? {})) {
        if (typeof uri === 'string' && uri.length <= 800000 && /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(uri)) this.avatars[id] = uri
      }
      for (const [id, preset] of Object.entries(data.presets ?? {})) if (findPreset(preset) && !this.avatars[id]) this.presets[id] = preset
    } catch (e) { if (e.code !== 'ENOENT') this.warning = '头像设置未能读取，已显示默认头像；原设置文件保留。' }
    return this.snapshot()
  }
  snapshot() { return { avatars: { ...this.avatars }, presets: { ...this.presets }, warning: this.warning ?? '' } }
  async set(id, uri, preset = null) {
    if (preset && !findPreset(preset)) throw new Error('这个内置头像不存在，请重新选择。')
    const next = { ...this.avatars }, nextPresets = { ...this.presets }
    if (uri) next[id] = uri; else delete next[id]
    if (preset) nextPresets[id] = preset; else delete nextPresets[id]
    await writeFile(this.file + '.tmp', JSON.stringify({ version: 2, avatars: next, presets: nextPresets }), 'utf8')
    await rename(this.file + '.tmp', this.file)
    this.avatars = next; this.presets = nextPresets; this.warning = ''; return this.snapshot()
  }
  setPreset(id, preset) { if (!findPreset(preset)) throw new Error('请选择有效的内置头像。'); return this.set(id, null, preset) }
}

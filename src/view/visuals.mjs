import { avatarCatalog, defaultPreset, findPreset } from '../avatar-catalog.mjs'
export { avatarCatalog, defaultPreset, findPreset }
const paths = {
  plus:'M12 5v14M5 12h14', search:'m20 20-4-4M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14',
  arrow:'M12 19V5m-6 6 6-6 6 6', down:'m6 9 6 6 6-6', sidebar:'M3 4h18v16H3ZM9 4v16M5.5 8h1M5.5 11h1',
  folder:'M3 7h7l2 2h9v11H3ZM3 7V4h7l2 3', check:'m5 12 4 4L19 6',
  copy:'M8 8h12v12H8ZM4 15H3V3h12v1', more:'M5 12h.01M12 12h.01M19 12h.01',
  close:'m6 6 12 12M6 18 18 6', settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  clock:'M12 7v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
  note:'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h6',
  help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0',
  refresh:'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3',
  team:'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 21v-4a4 4 0 0 0-3-4M17 2a4 4 0 0 1 0 8',
  image:'M3 3h18v18H3Zm0 14 6-6 5 5 3-3 4 4M16 7h.01',
}
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg')
  for (const [k,v] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) svg.setAttribute(k,v)
  svg.classList.add('icon'); const p = document.createElementNS(svg.namespaceURI,'path'); p.setAttribute('d', paths[name] ?? paths.note); svg.append(p); return svg
}
export const presetUrl = id => { const preset=findPreset(id);return preset ? new URL(`assets/avatars/${preset.file}`,import.meta.url).href : null }
export function avatar(bot, appearance = {}) {
  const span = document.createElement('span'); span.className = 'avatar'
  const src = appearance.avatars?.[bot?.id] || presetUrl(appearance.presets?.[bot?.id]) || presetUrl(defaultPreset(bot?.id)?.id)
  if (src) { const img = document.createElement('img'); img.src = src; img.alt = ''; img.draggable = false; span.append(img) }
  else { span.classList.add('initial-avatar'); span.textContent = Array.from(bot?.name || '?')[0] }
  return span
}
export function groupAvatar(group, bots, appearance) {
  const span = document.createElement('span'); span.className = 'avatar group-avatar'; span.setAttribute('aria-hidden','true')
  for (const id of group.members.slice(0,3)) span.append(avatar(bots.find(b=>b.id===id),appearance))
  return span
}

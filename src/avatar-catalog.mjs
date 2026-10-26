// Shared allowlist. IDs, rather than arbitrary file paths, cross the IPC boundary.
export const avatarCatalog = [
  { id:'chief-classic', family:'chief', familyName:'皮波', name:'夜蓝长发', file:'chief-anime-v1.png' },
  { id:'chief-silver', family:'chief', familyName:'皮波', name:'银月低马尾', file:'chief-silver-v1.png' },
  { id:'chief-plum', family:'chief', familyName:'皮波', name:'紫藤短发', file:'chief-plum-v1.png' },
  { id:'planner-classic', family:'planner', familyName:'米粒', name:'银灰短发', file:'planner-anime-v1.png' },
  { id:'planner-honey', family:'planner', familyName:'米粒', name:'蜜糖高马尾', file:'planner-honey-v1.png' },
  { id:'planner-rose', family:'planner', familyName:'米粒', name:'樱粉微卷', file:'planner-rose-v1.png' },
  { id:'reviewer-classic', family:'reviewer', familyName:'阿橘', name:'栗色低马尾', file:'reviewer-anime-v1.png' },
  { id:'reviewer-midnight', family:'reviewer', familyName:'阿橘', name:'墨蓝高束发', file:'reviewer-midnight-v1.png' },
  { id:'reviewer-lilac', family:'reviewer', familyName:'阿橘', name:'浅紫长直发', file:'reviewer-lilac-v1.png' },
]
export const defaultPreset = botId => avatarCatalog.find(p=>p.id===`${botId}-classic`)
export const findPreset = id => avatarCatalog.find(p=>p.id===id)

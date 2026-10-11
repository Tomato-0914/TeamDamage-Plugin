/**
 * 结果图的派生数据：输出占比、最高一击、每秒伤害分布、两栏伤害表等
 * 不依赖 Yunzai / miao，角色名识别由调用方传入，方便单独测试
 */

/** 中文元素 → miao 元素 key，模板按它切换配色 */
const ELEM_KEY = { 火: 'pyro', 水: 'hydro', 冰: 'cryo', 雷: 'electro', 风: 'anemo', 岩: 'geo', 草: 'dendro' }

/** 反应伤害、武器特效等不属于任何角色的伤害用的颜色 */
const OTHER_COLOR = '#9aa3b2'

const toNum = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0

/**
 * @param {Object} data simpleTeamDamageRes 的返回值
 * @param {(name: string) => string|null} resolveName 角色名/别名 → 标准名
 * @param {string} miaoRes miao-plugin 资源目录（以 / 结尾）
 * @param {(path: string) => boolean} exists 文件是否存在
 */
export default function buildScreenView (data, resolveName, miaoRes, exists) {
  const teamNames = Object.keys(data.avatars)

  // 输出占比：小助手的饼图数据，可能含有绽放等非角色来源
  const pie = data.pie_data2 || []
  const pieTotal = pie.reduce((p, c) => p + c.damage, 0) || 1
  const colors = {}
  pie.forEach((d, i) => { colors[d.char] = data.pie_color2[i] })
  const share = pie.map((d, i) => ({ ...d, pct: Math.round(d.damage / pieTotal * 1000) / 10, color: data.pie_color2[i] }))

  // 伤害记录里的动作名带角色简称（雷神E协同、万叶Q后续），取能识别为队员的最长前缀
  const ownerCache = {}
  const ownerOf = (action) => {
    if (action in ownerCache) return ownerCache[action]
    let owner = ''
    for (let i = Math.min(action.length - 1, 6); i >= 1; i--) {
      const name = resolveName(action.slice(0, i))
      if (name && teamNames.includes(name)) {
        owner = name
        break
      }
    }
    ownerCache[action] = owner
    return owner
  }
  const colorOf = (action) => colors[ownerOf(action)] || OTHER_COLOR

  const damages = data.damages || []
  const rowColor = Object.fromEntries(damages.map(d => [d[1], colorOf(d[1])]))

  // 最高一击：暴击伤害最大的一条
  let maxHit = null
  for (const d of damages) {
    if (toNum(d[2]) > toNum(maxHit?.crit)) maxHit = { time: d[0], action: d[1], crit: d[2], exp: d[4] }
  }

  // 每秒期望伤害，按角色堆叠
  let timeline = []
  let hasOther = false
  if (damages.length) {
    const secs = Math.max(1, Math.ceil(Math.max(...damages.map(d => toNum(d[0])))))
    const bins = Array.from({ length: secs }, () => ({}))
    for (const d of damages) {
      const i = Math.min(secs - 1, Math.floor(toNum(d[0])))
      const owner = ownerOf(d[1]) || ''
      bins[i][owner] = (bins[i][owner] || 0) + toNum(d[4])
    }
    const binMax = Math.max(...bins.map(b => Object.values(b).reduce((p, c) => p + c, 0))) || 1
    hasOther = bins.some(b => b[''])
    timeline = bins.map((b, t) => ({
      t,
      segs: Object.entries(b).map(([n, v]) => ({ h: Math.round(v / binMax * 100), color: colors[n] || OTHER_COLOR }))
    }))
  }

  // 伤害过程分两栏，长手法时图片高度减半
  const half = Math.ceil(damages.length / 2)
  const dmgCols = half ? [damages.slice(0, half), damages.slice(half)] : []

  const avatarList = Object.values(data.avatars).map(a => ({
    ...a,
    color: colors[a.name] || OTHER_COLOR,
    share: share.find(s => s.char === a.name)?.pct ?? 0
  }))

  // 主 C：输出占比最高的队员，用它的立绘做背景
  const mainChar = share.find(s => teamNames.includes(s.char))?.char || teamNames[0] || ''
  const imgs = `${miaoRes}meta-gs/character/${mainChar}/imgs/`
  const splash = ['splash.webp', 'gacha.webp', 'face.webp'].map(f => imgs + f).find(exists) || ''

  return {
    elemKey: ELEM_KEY[data.elem] || ELEM_KEY[data.avatars[mainChar]?.elem] || 'pyro',
    splash,
    share,
    avatarList,
    maxHit,
    timeline,
    hasOther,
    dmgCols,
    rowColor
  }
}

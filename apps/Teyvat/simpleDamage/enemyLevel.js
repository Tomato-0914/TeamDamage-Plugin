/**
 * 怪物等级换算：小助手固定按 90 级怪物计算，这里按原神的防御公式把结果换算到其他等级
 *
 * 防御区 = (角色等级 + 100) / (角色等级 + 100 + 怪物等级 + 100)，与 miao-plugin DmgCalc 相同（不考虑减防）
 * - 角色造成的伤害按「新等级防御区 / 90 级防御区」缩放，角色等级取各自面板
 * - 绽放、超载等剧变反应和月反应不吃防御，伤害记录里没有角色前缀的项保持不变
 * - 减防、无视防御（雷神 2 命、纳西妲 2 命等）的效果小助手已算进结果但这里拿不到，换算会有少量误差，结果图标注为估算
 * 不依赖 Yunzai / miao，方便单独测试
 */

/** 小助手计算用的怪物等级 */
export const BASE_ENEMY_LEVEL = 90

const toNum = (v) => Number(String(v ?? '').replace(/,/g, ''))

/** 防御区系数 */
const defMult = (charLv, enemyLv) => (charLv + 100) / (charLv + 100 + enemyLv + 100)

/** 「130W」「325.7W」按比例缩放，保持小助手的写法 */
function scaleTotal (total, ratio) {
  const m = String(total ?? '').match(/^([\d.]+)(.*)$/)
  if (!m) return total
  const v = Number(m[1]) * ratio
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}${m[2]}`
}

/**
 * 把 simpleTeamDamageRes 的结果换算到指定怪物等级（原地修改）
 * @param {Object} data simpleTeamDamageRes 的返回值
 * @param {number} enemyLv 目标怪物等级
 * @param {(action: string) => string} ownerOf 伤害记录动作名 → 角色名（无归属返回空字符串）
 * @returns {Object} data
 */
export function scaleEnemyLevel (data, enemyLv, ownerOf) {
  if (!enemyLv || enemyLv === BASE_ENEMY_LEVEL) return data
  const levels = Object.fromEntries(Object.values(data.avatars || {}).map(a => [a.name, toNum(a.level) || 90]))
  const ratioOf = (name) => (name in levels ? defMult(levels[name], enemyLv) / defMult(levels[name], BASE_ENEMY_LEVEL) : 1)
  const scale = (v, r) => (Number.isFinite(toNum(v)) && String(v).trim() !== '' ? String(Math.round(toNum(v) * r)) : v)

  // 逐条换算伤害记录，同时统计换算前后的期望伤害，用来换算总伤和输出占比
  let before = 0
  let after = 0
  const byChar = {}
  data.damages = (data.damages || []).map(d => {
    const owner = ownerOf(d[1])
    const r = owner ? ratioOf(owner) : 1
    const exp = toNum(d[4]) || 0
    before += exp
    after += exp * r
    if (owner) {
      byChar[owner] ||= { before: 0, after: 0 }
      byChar[owner].before += exp
      byChar[owner].after += exp * r
    }
    return r === 1 ? d : [d[0], d[1], scale(d[2], r), scale(d[3], r), scale(d[4], r)]
  })

  const ratio = before ? after / before : 1
  data.total = scaleTotal(data.total, ratio)
  data.dps = Math.round(toNum(data.dps) * ratio)

  // 输出占比：角色按各自伤害记录的换算比例，反应等不变；换算后重新排序，颜色跟着走
  const pie = (data.pie_data2 || []).map((p, i) => {
    const c = byChar[p.char]
    const r = c?.before ? c.after / c.before : ratioOf(p.char)
    return { item: { ...p, damage: Math.round(p.damage * r * 100) / 100 }, color: data.pie_color2?.[i] }
  }).sort((a, b) => b.item.damage - a.item.damage)
  data.pie_data2 = pie.map(p => p.item)
  data.pie_color2 = pie.map(p => p.color)
  data.enemyLevel = enemyLv
  return data
}

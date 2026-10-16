/**
 * 循环充能估算：小助手固定满能量开局，这里估算「零能量开局」时每人一轮能不能攒够大招
 *
 * 一轮攒到的能量取两者较大值：
 * - 微粒估算：(同色球 × 3 + 异色球 × 1 + 无色球 × 2) × 充能效率 × 场上系数
 *   小助手给的球数是全队产出的微粒数，后台角色只吃 60%；场上系数按该角色在手法里的动作占比估算
 * - 实测下限：放了大招的角色，小助手报的一轮结束时能量就是放大招后实际攒到的，包含雷神 Q 等直接回能
 * - 手法里没放大招的角色只显示攒到的能量，不判断够不够
 * 只是估算，不会改变伤害结果（第一轮仍按满能量计算）
 * 不依赖 Yunzai / miao，方便单独测试
 */

const PARTICLE = { same: 3, diff: 1, none: 2 }
const OFF_FIELD = 0.6

/** 手法动作名是不是大招（「夜兰Q」「Q」「大招」） */
const isBurst = (label, owner) => /^(?:Q|大招|爆发)/i.test(label.slice(owner.length))

/**
 * 给每个角色加上 cycle：{ gain, cost, ok, text }
 * @param {Object} data simpleTeamDamageRes 的返回值（avatars[].recharge 带 same / diff / none / energy）
 * @param {Object} costs 角色名 → 大招耗能，没有元素能量的角色（玛薇卡、丝柯克）不写
 * @param {Object} ers 角色名 → 充能效率（百分数，如 140）
 * @param {(action: string) => string} ownerOf 手法动作名 → 角色名（省略角色名的动作返回空字符串）
 * @returns {Object} data
 */
export function energyCycle (data, costs, ers, ownerOf) {
  const names = Object.keys(data.avatars || {})
  // 手法里每人的动作数（场上时间的近似）和是否放了大招；省略角色名的动作沿用上一个角色
  const acts = {}
  const bursts = {}
  let cur = ''
  for (const label of data.actions || []) {
    const owner = ownerOf(label)
    if (owner) cur = owner
    if (!cur) continue
    acts[cur] = (acts[cur] || 0) + 1
    if (isBurst(label, owner)) bursts[cur] = true
  }
  const totalActs = Object.values(acts).reduce((p, c) => p + c, 0) || 1

  for (const name of names) {
    const a = data.avatars[name]
    const cost = Number(costs[name]) || 0
    const r = a.recharge || {}
    if (!cost || !Number.isFinite(Number(r.same))) {
      a.cycle = { text: '—', cls: '' }
      continue
    }
    const share = (acts[name] || 0) / totalActs
    const fieldMult = share + OFF_FIELD * (1 - share)
    const raw = PARTICLE.same * (Number(r.same) || 0) + PARTICLE.diff * (Number(r.diff) || 0) + PARTICLE.none * (Number(r.none) || 0)
    const particleGain = raw * fieldMult * (Number(ers[name]) || 100) / 100
    // 放过大招时，一轮结束的能量是放大招后真实攒到的（没放大招时是开局的满能量，不能用）
    const measured = bursts[name] ? Number(r.energy) || 0 : 0
    const gain = Math.max(particleGain, measured)
    const ok = gain >= cost - 0.5
    a.cycle = {
      gain: Math.round(gain),
      cost,
      ok,
      cls: !bursts[name] ? 'na' : ok ? 'ok' : 'bad',
      text: `${Math.round(gain)}/${cost}`
    }
  }
  return data
}

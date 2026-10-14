/**
 * GCSim 本地计算引擎（测试版）
 *
 * 流程：队员数据 → GCSim 配置脚本 → 调用 gcsim 可执行文件生成单次模拟的 sample 日志 → 换算成和小助手结果相同的结构出图
 * - gcsim 没有默认手法，必须写手法（或用带手法的队伍预设）
 * - 只跑一次模拟（-sample），伤害按每一击的期望值（暴击率 × 暴伤）累加，和小助手的口径一致；
 *   暴击率超过 100% 时 gcsim 日志里的期望值会偏高，这里按封顶 100% 重新算
 * - 开局满能量，大招不检查能量（ignore_burst_energy），避免手法因能量不足卡住；结束时的剩余能量照常统计
 * 本文件不依赖 Yunzai / miao，队员数据由 member.js 从面板换算
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
/** 中文名 → gcsim key，由 gcsim 的 names.dm.json 生成 */
export const NAMES = JSON.parse(fs.readFileSync(path.join(DIR, 'names.json'), 'utf8'))

/** 名字里的「」、空格等写法差异不影响匹配 */
const norm = (name) => String(name || '').replace(/[「」『』\s·・]/g, '')
const NORM = Object.fromEntries(Object.entries(NAMES).map(([kind, map]) => [kind, Object.fromEntries(Object.entries(map).map(([cn, key]) => [norm(cn), key]))]))

/**
 * 中文名 → gcsim key，找不到返回空字符串
 * @param {'char'|'weapon'|'set'} kind
 */
export function gcsimKey (kind, name) {
  return NAMES[kind][name] || NORM[kind][norm(name)] || ''
}

/** 怪物等级、抗性，与设置图里的固定参数保持一致 */
export const TARGET_LEVEL = 90
export const TARGET_RESIST = 0.1
/** 换人间隔（帧） */
const SWAP_DELAY = 12
/** 手法结束后继续统计的帧数，让最后一个动作的伤害落地 */
const TAIL_FRAMES = 90
const MAX_DURATION = 120

/** gcsim 可执行文件：设置里的 gcsimPath，否则为插件目录下的 bin/gcsim */
export function gcsimBin (custom = '') {
  if (custom) return custom
  return path.resolve(DIR, '../../bin', process.platform === 'win32' ? 'gcsim.exe' : 'gcsim')
}

/**
 * 手法码 → gcsim 动作
 * zj 对弓箭角色是瞄准射击（aim），下落攻击只能在空中使用（跳跃后、魈 Q 等）
 */
function toAction (code, weaponType) {
  if (Array.isArray(code)) {
    if (code[0] === '==') return { wait: Math.max(1, Math.round(code[1] * 60)) }
    return { act: code[0] === 'k' ? 'jump' : 'dash' }
  }
  if (/^a\d$/.test(code)) return { act: 'attack' }
  return {
    act: {
      e: 'skill',
      e1: 'skill',
      e2: 'skill[hold=1]',
      q: 'burst',
      zj: weaponType === 'bow' ? 'aim' : 'charge',
      xl1: 'high_plunge'
    }[code]
  }
}

/**
 * 生成 gcsim 配置
 * @param {Object[]} members 队员，顺序即手法里的角色序号：
 *   { key, level, maxLevel, cons, talents: [a, e, q], weapon: {key, refine, level, maxLevel, type}, sets: {key: count}, stats: {gcsim 属性: 值} }
 * @param {Array} combo parseCombo 得到的扁平手法数组
 * @returns {string}
 */
export function buildConfig (members, combo) {
  let waitFrames = 0
  let actions = 0
  const script = []
  let cur = null
  for (const code of combo) {
    if (typeof code === 'number') {
      cur = members[code - 1]
      continue
    }
    const a = toAction(code, cur.weapon.type)
    if (a.wait) {
      script.push(`sleep(${a.wait});`)
      waitFrames += a.wait
    } else if (a.act) {
      script.push(`${cur.key} ${a.act};`)
      actions++
    }
  }
  // 以这个等待结束作为手法结束的标记
  script.push(`sleep(${TAIL_FRAMES});`)
  // 模拟时长只需盖住手法，动作按每个 2 秒估算
  const duration = Math.min(MAX_DURATION, Math.ceil(10 + actions * 2 + waitFrames / 60))
  const first = members[combo[0] - 1] || members[0]

  const lines = [
    `options iteration=1 duration=${duration} swap_delay=${SWAP_DELAY} ignore_burst_energy=true;`,
    `target lvl=${TARGET_LEVEL} resist=${TARGET_RESIST};`
  ]
  for (const m of members) {
    lines.push(`${m.key} char lvl=${m.level}/${m.maxLevel} cons=${m.cons} talent=${m.talents.join(',')};`)
    lines.push(`${m.key} add weapon="${m.weapon.key}" refine=${m.weapon.refine} lvl=${m.weapon.level}/${m.weapon.maxLevel};`)
    for (const [set, count] of Object.entries(m.sets)) lines.push(`${m.key} add set="${set}" count=${count};`)
    const stats = Object.entries(m.stats).filter(([, v]) => v).map(([k, v]) => `${k}=${Math.round(v * 10000) / 10000}`)
    if (stats.length) lines.push(`${m.key} add stats ${stats.join(' ')};`)
  }
  lines.push(`active ${first.key};`, ...script)
  return lines.join('\n') + '\n'
}

const ACTION_CN = { skill: 'E', burst: 'Q', attack: '普攻', charge: '重击', aim: '重击', high_plunge: '下落攻击', low_plunge: '下落攻击', jump: '跳跃', dash: '闪避' }

/**
 * gcsim 报错 → 中文提示
 * @param {Object} names gcsim key → 角色名
 */
function explainError (text, names = {}) {
  const msg = String(text || '').trim().split('\n').filter(Boolean).pop() || ''
  let m = msg.match(/error encountered on (\w+) executing (\w+): (.*)$/)
  if (m) {
    const reason = /airborne/.test(m[3]) ? '只能在空中使用（GCSim 里仅魈 Q、闲云 Q 等状态下可用）' : m[3]
    return `手法里${names[m[1]] || m[1]}的${ACTION_CN[m[2]] || m[2]}无法执行：${reason}`
  }
  m = msg.match(/(\w+): need to use attack right before charge/)
  if (m) return `手法里${names[m[1]] || m[1]}的重击不合法：单手剑、长柄武器角色重击前要先普攻，且普攻最后一段后不能直接重击（如 a*4 z）`
  m = msg.match(/invalid (character|weapon|set)[^"]*"?([\w]+)?/i)
  if (m) return `GCSim 不认识的${{ character: '角色', weapon: '武器', set: '圣遗物' }[m[1].toLowerCase()]}：${m[2] || ''}`
  return msg.slice(0, 200) || 'GCSim 运行失败'
}

/**
 * 运行 gcsim，返回 sample 日志
 * @param {Object} names gcsim key → 角色名，用于报错提示
 * @returns {Promise<{ok: true, sample: Object} | {ok: false, msg: string, missing?: boolean}>}
 */
export async function runGcsim (configText, bin, names = {}) {
  if (!fs.existsSync(bin)) return { ok: false, missing: true, msg: `没有找到 GCSim：${bin}` }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'teamdamage-gcsim-'))
  const cfgFile = path.join(tmp, 'config.txt')
  const sampleFile = path.join(tmp, 'sample.json')
  fs.writeFileSync(cfgFile, configText, 'utf8')
  try {
    const out = await new Promise((resolve) => {
      execFile(bin, ['-c', cfgFile, '-sample', sampleFile, '-nb', '-nr'], { timeout: 30000, maxBuffer: 4 << 20 },
        (err, stdout, stderr) => resolve({ err, text: `${stdout}\n${stderr}` }))
    })
    if (out.err || !fs.existsSync(sampleFile)) {
      return { ok: false, msg: out.err?.killed ? 'GCSim 运行超时' : explainError(out.text || out.err?.message, names) }
    }
    return { ok: true, sample: JSON.parse(fs.readFileSync(sampleFile, 'utf8')) }
  } catch (err) {
    return { ok: false, msg: `GCSim 运行失败：${err.message}` }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** gcsim AttackTag 序号 → 中文动作名（attacks/attack.go 的枚举顺序） */
const TAG_LABEL = {
  1: '普攻', 2: '重击', 3: '下落攻击', 4: 'E', 5: 'E', 6: 'Q', 7: '圣遗物', 8: '武器', 9: '泡影破裂', 10: '夜魂', 11: 'E', 12: 'E',
  29: '月感电', 30: '月绽放', 31: '月结晶', 33: '星导', 34: '星扩散'
}
/** 剧变反应等不属于角色的伤害，归到「反应 / 其他」 */
const REACTION_LABEL = {
  14: '超载', 15: '超导', 16: '感电', 17: '碎冰', 18: '扩散', 19: '扩散', 20: '扩散', 21: '扩散', 22: '燃烧',
  23: '绽放', 24: '绽放', 25: '烈绽放', 26: '超绽放', 27: '月感电', 28: '月结晶', 32: '星扩散'
}
const AMP_LABEL = { vaporize: '蒸发', melt: '融化' }
const CATA_LABEL = { aggravate: '超激化', spread: '蔓激化' }

/** 角色在输出占比里的颜色，同元素的第二个人用浅色 */
const ELEM_COLORS = {
  pyro: ['#ef6c3a', '#f7a25c'], hydro: ['#3d8ee6', '#74c4f2'], cryo: ['#5fbfdc', '#9fdcec'], electro: ['#9b6fe0', '#c6a0f2'],
  anemo: ['#2fb894', '#7fdcc0'], geo: ['#e0a93a', '#f0cd78'], dendro: ['#72b83c', '#a6d877']
}
/** 反应伤害用不同深浅的灰色，第一个与结果图「反应 / 其他」的图例一致 */
const REACTION_COLORS = ['#9aa3b2', '#c0c6d1', '#767f8f', '#d6dae2']

const fmtW = (v) => {
  const w = v / 10000
  return `${w >= 100 ? Math.round(w) : Math.round(w * 10) / 10}W`
}

/**
 * 把 sample 日志换算成结果图需要的数据（simpleTeamDamageRes 的结构）
 * @param {Object} sample gcsim sample
 * @param {Object[]} members { name（结果里的角色名，如 旅行者草）, elem（miao 元素 key）, critFull }
 * @returns {{tm, total, dps, pie_data2, pie_color2, damages, energy, keyStat}}
 */
export function parseSample (sample, members) {
  const logs = sample.logs || []
  // 手法结束：最后一个等待（即脚本末尾追加的那个）结束的帧
  let end = 0
  for (const l of logs) {
    if (l.event === 'action' && l.logs?.action === undefined && l.logs?.f) end = l.frame + l.logs.f
  }
  if (!end) end = Math.max(0, ...logs.map(l => l.frame))

  // 每一击的 calc 事件（暴击 / 不暴击 / 期望伤害）和 damage 事件同帧同名，但中间可能隔着很多 buff 事件，按出现顺序配对
  const calcs = {}
  for (const l of logs) {
    if (l.event === 'calc') (calcs[`${l.frame}|${l.msg}`] ||= []).push(l.logs)
  }

  const hits = []
  const energy = members.map(() => null)
  const scale = members.map(() => ({}))
  for (const l of logs) {
    if (l.frame > end) break
    if (l.event === 'energy') {
      const v = l.logs.post_drain ?? l.logs.post_recovery
      if (v !== undefined && l.logs.max_energy) energy[l.char_index] = v / l.logs.max_energy
      continue
    }
    if (l.event !== 'damage') continue
    const d = l.logs
    // 行秋雨帘剑等护盾类的 0 伤害判定不计
    if (!d.damage) continue
    const calc = calcs[`${l.frame}|${l.msg}`]?.shift()
    const tag = d['attack-tag']
    const member = members[l.char_index]
    let crit, base, exp
    if (calc && calc.pre_crit_dmg !== undefined) {
      const amp = calc.amp_mult_total || 1
      base = calc.pre_crit_dmg * amp
      crit = calc.dmg_if_crit * amp
      const cr = member?.critFull ? 1 : Math.min(1, Math.max(0, calc.cr || 0))
      exp = base + cr * (crit - base)
      const s = scale[l.char_index]
      const k = calc.use_hp ? 'hp' : calc.use_def ? 'def' : calc.use_em ? 'em' : 'atk'
      if (s) s[k] = (s[k] || 0) + exp
    } else {
      crit = base = exp = d.damage
    }
    let label
    const reaction = REACTION_LABEL[tag]
    if (reaction) {
      label = reaction
    } else {
      // 没有归类的伤害（如阿蕾奇诺 2 命的额外伤害）：命座效果写作「N命额外伤害」，其余为「额外伤害」
      const cons = String(d.abil).match(/\(C(\d)\)/)
      const kind = TAG_LABEL[tag] || (cons ? `${cons[1]}命额外伤害` : '额外伤害')
      label = `${member?.name || ''}${kind}${AMP_LABEL[d.amp] || ''}${CATA_LABEL[d.cata] || ''}`
    }
    hits.push({ frame: l.frame, label, crit, base, exp, owner: reaction ? reaction : member?.name || '' })
  }

  const total = hits.reduce((p, h) => p + h.exp, 0)
  const lastHit = hits.length ? hits[hits.length - 1].frame : end
  const tm = Math.max(0.1, Math.round(Math.max(lastHit, 60) / 6) / 10)

  // 输出占比：角色在前，反应合并成一项
  const byOwner = {}
  for (const h of hits) byOwner[h.owner] = (byOwner[h.owner] || 0) + h.exp
  const pie = Object.entries(byOwner).map(([char, dmg]) => ({ char, damage: Math.round(dmg / 100) / 100 }))
    .sort((a, b) => b.damage - a.damage)
  // 角色颜色按队伍顺序分配，同一个人的颜色不随排名变化；同元素的第二个人用浅色
  const colors = {}
  const used = {}
  for (const m of members) {
    const list = ELEM_COLORS[m.elem] || REACTION_COLORS
    const n = used[m.elem] = (used[m.elem] ?? -1) + 1
    colors[m.name] = list[Math.min(n, list.length - 1)]
  }
  pie.filter(p => !colors[p.char]).forEach((p, i) => { colors[p.char] = REACTION_COLORS[i % REACTION_COLORS.length] })

  return {
    tm,
    total: fmtW(total),
    dps: Math.round(total / tm),
    pie_data2: pie,
    pie_color2: pie.map(p => colors[p.char]),
    damages: hits.map(h => [(h.frame / 60).toFixed(1), h.label, String(Math.round(h.crit)), String(Math.round(h.base)), String(Math.round(h.exp))]),
    // 结束时剩余能量；手法里没有任何能量变化的角色视为满能量
    energy: energy.map(v => `${Math.round((v ?? 1) * 100)}%`),
    // 主要的伤害倍率属性（期望伤害最多的那类）
    keyStat: scale.map(s => Object.entries(s).sort((a, b) => b[1] - a[1])[0]?.[0] || 'atk')
  }
}

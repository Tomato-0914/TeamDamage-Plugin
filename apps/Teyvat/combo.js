/**
 * 自定义手法解析
 *
 * 小助手 getTeamResult.php 通过顶层字段 custom_combo 接收自定义手法，格式为扁平数组：
 *   [角色序号, 技能码, 技能码, 角色序号, 技能码, ...]
 * - 角色序号为 role_data 中的位置（从 1 开始），之后的技能码都归属该角色，直到出现下一个序号
 * - 技能码：e / e1(短按) / e2(长按) / q / zj(重击) / a1~a9(普攻第 N 段)
 * - 等待为嵌套数组 ['==', 秒数]，秒数必须是 number
 * - 服务端遇到不认识的技能码会返回空 body 或「暂不支持该队伍」，所以这里先在本地规范化
 * - 只有 1 个动作时服务端会忽略自定义手法，这里要求至少 2 个技能动作
 */

const WAIT_MIN = 0.1
const WAIT_MAX = 20
const MAX_REPEAT = 20
const MAX_ACTIONS = 60

/** 动作写法，长写法在前；每项返回技能码数组 */
const ACTION_PATTERNS = [
  [/^等待?(\d+(?:\.\d+)?)(?:s|秒)?/i, (m) => {
    const sec = Math.round(Number(m[1]) * 100) / 100
    return sec >= WAIT_MIN && sec <= WAIT_MAX ? [['==', sec]] : null
  }],
  [/^(?:长按?e|e2)/i, () => ['e2']],
  [/^(?:短按?e|点按?e|e1)/i, () => ['e1']],
  [/^(?:重击|zj)/i, () => ['zj']],
  // 不带段数的普攻先记为 'a'，在 parseCombo 里按上一个动作接续段数
  [/^(?:普攻|平a|a)([1-9])?/i, (m) => [m[1] ? `a${m[1]}` : 'a']],
  [/^(?:战技|e)/i, () => ['e']],
  [/^(?:大招|爆发|q)/i, () => ['q']]
]

/** 重复次数后缀：*3 / x3 / ×3 / 3次 */
const REPEAT_SUFFIX = /^(?:[*x×](\d{1,2})|(\d{1,2})次)$/i

export function isWait (code) {
  return Array.isArray(code) && code[0] === '=='
}

function codeLabel (code) {
  if (isWait(code)) return `等${code[1]}s`
  return { e: 'E', e1: '短E', e2: '长E', q: 'Q', zj: '重击' }[code] || code.toUpperCase()
}

/**
 * 把一段纯动作文本（不含角色名）解析为技能码数组，支持结尾的重复次数
 * 次数后缀有歧义时（a13次）优先取更长的动作部分（a1 × 3）
 * @returns {Array|null} 无法完整解析时返回 null
 */
export function parseActions (text) {
  const str = String(text || '').trim()
  for (let i = str.length - 1; i >= 1; i--) {
    const rep = str.slice(i).match(REPEAT_SUFFIX)
    if (!rep) continue
    const times = Number(rep[1] || rep[2])
    const codes = parseSequence(str.slice(0, i))
    if (codes && times >= 1 && times <= MAX_REPEAT) return Array.from({ length: times }, () => codes).flat()
  }
  return parseSequence(str)
}

/** 解析不带重复次数的连写动作 */
function parseSequence (text) {
  let rest = text
  if (!rest) return null
  const codes = []
  while (rest) {
    let hit = null
    for (const [re, toCodes] of ACTION_PATTERNS) {
      const m = rest.match(re)
      if (m) {
        hit = { len: m[0].length, codes: toCodes(m) }
        break
      }
    }
    if (!hit || !hit.codes) return null
    codes.push(...hit.codes)
    rest = rest.slice(hit.len)
  }
  return codes
}

/**
 * 把 token 拆成 [角色名, 技能码数组]；纯动作时角色名为空
 * 角色名取最长的、能被 resolveName 识别的前缀
 * @param {string} token
 * @param {(name: string) => string|null} resolveName 角色名/别名 → 标准名
 * @returns {{name: string, codes: Array}|null}
 */
function splitToken (token, resolveName) {
  const codes = parseActions(token)
  if (codes) return { name: '', codes }
  for (let i = token.length - 1; i >= 1; i--) {
    const name = resolveName(token.slice(0, i))
    if (!name) continue
    const rest = parseActions(token.slice(i))
    if (rest) return { name, codes: rest }
  }
  return null
}

/**
 * 把指令里的 token 分成「队伍」和「手法」两段：从第一个能识别为动作的 token 起都算手法
 * @param {string[]} tokens
 * @param {(name: string) => string|null} resolveName
 */
export function splitTeamAndCombo (tokens, resolveName) {
  const idx = tokens.findIndex((t) => splitToken(t, resolveName))
  if (idx === -1) return { teamTokens: tokens, comboTokens: [] }
  return { teamTokens: tokens.slice(0, idx), comboTokens: tokens.slice(idx) }
}

/**
 * 没写队伍、直接写手法时，按角色在手法中首次出现的顺序推出队伍
 * @returns {string[]} 第一个手法没写角色名时无法推断，返回空数组
 */
export function inferTeam (comboTokens, resolveName) {
  const names = []
  for (const token of comboTokens) {
    const part = splitToken(token, resolveName)
    if (!part) continue
    if (!part.name && !names.length) return []
    if (part.name && !names.includes(part.name)) names.push(part.name)
  }
  return names
}

/**
 * 解析手法 token 为 custom_combo
 * 省略角色名时沿用上一个角色；第一个动作没写角色名时默认队伍第一位
 * 不带段数的普攻紧跟在同一角色的普攻后时接续下一段（aaa = a1,a2,a3），否则为第 1 段
 * @param {string[]} tokens
 * @param {string[]} teamNames 与 role_data 顺序一致的角色标准名
 * @param {(name: string) => string|null} resolveName
 * @returns {{combo: Array, labels: string[]} | {error: string}}
 */
export function parseCombo (tokens, teamNames, resolveName) {
  const combo = []
  const labels = []
  let cur = 0
  let skillCount = 0

  for (const token of tokens) {
    const part = splitToken(token, resolveName)
    if (!part) {
      if (/^等待?\d/.test(token)) return { error: `等待时间需在 ${WAIT_MIN}~${WAIT_MAX} 秒之间，例如：等0.5` }
      return { error: `手法中的「${token}」无法识别` }
    }
    if (part.name) {
      const no = teamNames.indexOf(part.name) + 1
      if (!no) return { error: `手法中的「${part.name}」不在队伍里` }
      if (no !== cur) {
        combo.push(no)
        cur = no
      }
    } else if (!cur) {
      cur = 1
      combo.push(1)
    }
    for (let code of part.codes) {
      if (code === 'a') {
        // 角色切换时 combo 末尾是角色序号，不会被当成普攻接续
        const prev = combo[combo.length - 1]
        const seg = typeof prev === 'string' && /^a\d$/.test(prev) ? Number(prev[1]) + 1 : 1
        if (seg > 9) return { error: `「${token}」的普攻段数超出了` }
        code = `a${seg}`
      }
      combo.push(code)
      if (isWait(code)) {
        labels.push(codeLabel(code))
      } else {
        labels.push(`${teamNames[cur - 1]}${codeLabel(code)}`)
        skillCount++
      }
    }
  }

  if (labels.length > MAX_ACTIONS) return { error: `手法过长，最多 ${MAX_ACTIONS} 个动作` }
  if (skillCount < 2) return { error: '自定义手法至少需要 2 个技能动作' }
  return { combo, labels }
}

export const COMBO_USAGE = [
  '手法写在队伍后面：#队伍伤害 钟离,班尼特,香菱,行秋 钟离长e,班尼特eq,香菱q,e',
  '也可只写手法，队伍按出场顺序自动识别：#队伍伤害 钟离长e,班尼特eq,香菱q,行秋qe',
  '动作：e / 短e / 长e / q / 重击(zj) / a(普攻，连写aaa=1~3段) / a1~a9(指定段数)',
  '省略角色名则沿用上一个角色；可连写(班尼特eq)、重复(a1*3、重击3次)、等待(等0.5)'
].join('\n')

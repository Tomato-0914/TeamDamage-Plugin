/**
 * 换装模拟：队员写成「香菱换六命换精5换天赋101313」，按换装改写发给小助手的 role_data
 *
 * 思路参考 xhh-TL（https://github.com/cchanlan/xhh-TL，MIT）的 utils/teyvatDamage.js，
 * 以下接口行为均已对小助手实测：
 * - 武器只按名字查被动，白值和副词条服务端不算，所以换武器要在本地改 base_attack 与对应面板值
 * - 服务端只认 base_attack + 圣遗物词条算攻击，attack 字段被忽略，攻击% 副词条只能折算进 base_attack
 * - hp / defend / element / crit / crit_dmg / recharge 是最终值，直接采用
 * - weapon_class「精炼N阶」、role_class、level、ability1~3、artifacts 套装名均生效
 * - ability1~3 是最终天赋等级，服务端不会按命座自动 +3，所以换命座跨过 3/5 命时要本地补上
 */
import lodash from 'lodash'
import { ArtifactSet, Character, Weapon } from '../../miao-plugin/models/index.js'

const CN_NUM = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

/**
 * 超过 6 命的写法按突破等级折算：95 级要 1 个无主的命星，100 级再要 2 个，共 3 个
 * 所以 7 命 = 6 命 + 95 级，9 命 = 6 命 + 100 级，没有 8 命
 */
const EXTRA_CONS_LEVEL = { 7: 95, 9: 100 }

/** 单个数字（阿拉伯或中文）转数值，「满」取 max */
const toNum = (v, max) => (v === '满' ? max : v in CN_NUM ? CN_NUM[v] : Number(v))

const WEAPON_TYPE_CN = { sword: '单手剑', claymore: '双手剑', polearm: '长柄武器', bow: '弓', catalyst: '法器' }

/** 元素：中文 ↔ miao key ↔ 小助手的元素伤害字段 */
const ELEM_KEY = { 风: 'anemo', 岩: 'geo', 雷: 'electro', 草: 'dendro', 水: 'hydro', 火: 'pyro', 冰: 'cryo' }
const ELEM_CN = lodash.invert(ELEM_KEY)
const ELEM_DMG = { pyro: 'fire_dmg', hydro: 'water_dmg', cryo: 'ice_dmg', electro: 'thunder_dmg', anemo: 'wind_dmg', geo: 'rock_dmg', dendro: 'grass_dmg' }
/** 旅行者 3/5 命加天赋的顺序随元素变化（与 miao Character.talentCons 一致） */
const travelerTalentCons = (elem) => (['dendro', 'hydro', 'pyro'].includes(elem) ? { e: 3, q: 5 } : { e: 5, q: 3 })

export const LOADOUT_USAGE = '支持：换满命 / 换六命 / 换精五 / 换满精 / 换天赋101313 / 换90级 / 换武器名（护摩、讨龙、专武）/ 换4千岩 / 换2追忆2如雷 / 旅行者换雷'

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const pct = (v) => `${Math.round(num(v) * 10) / 10}%`
const unpct = (v) => num(String(v ?? '').replace('%', ''))
const clampTalent = (v) => Math.min(15, Math.max(1, v))

/**
 * 天赋写法 → [a, e, q]；只认无歧义的写法，其余返回 null
 * 999 / 101313 / 10-13-13 / 10/13/13
 */
function parseTalent (text) {
  const parts = String(text).split(/[-/,，.]+/).filter(Boolean)
  if (parts.length === 3 && parts.every(p => /^\d{1,2}$/.test(p))) return parts.map(v => clampTalent(Number(v)))
  if (parts.length !== 1) return null
  const digits = parts[0]
  if (/^\d{3}$/.test(digits)) return digits.split('').map(v => clampTalent(Number(v)))
  if (/^\d{6}$/.test(digits)) return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].map(v => clampTalent(Number(v)))
  // 4、5 位（如 91010）分不清哪一项是一位数，交给调用方报错
  return null
}

/** '4千岩' / '千岩4' / '2追忆2如雷' / '绝缘'（不写件数按 4 件）→ [{ name, num }] */
function parseArtisSets (text) {
  const s = String(text).trim()
  if (!/\d/.test(s)) {
    const only = ArtifactSet.get(s)
    return only?.name ? [{ name: only.name, num: 4 }] : null
  }
  const chunks = s.match(/\d+[^\d]+|[^\d]+\d+/g)
  if (!chunks || chunks.join('') !== s) return null
  const sets = []
  for (const chunk of chunks) {
    const m = chunk.match(/^(\d+)(.+)$/) || chunk.match(/^(.+?)(\d+)$/)
    const [count, name] = /^\d+$/.test(m[1]) ? [Number(m[1]), m[2]] : [Number(m[2]), m[1]]
    const set = ArtifactSet.get(name.trim())
    if (!set?.name || ![2, 4, 5].includes(count)) return null
    sets.push({ name: set.name, num: count === 5 ? 4 : count })
  }
  return lodash.sumBy(sets, 'num') <= 5 ? sets : null
}

/**
 * 解析「换」后面的各段
 * @param {string[]} list
 * @param {string[]} charNames 角色标准名及用户写的名字，用于查「X专武」
 * @returns {{mods: object, unknown: string[]}}
 */
function parseLoadoutMods (list, charNames) {
  const mods = {}
  const unknown = []
  for (const item of list) {
    // 命座：六命 / 6命 / 满命 / 命座6 / 命座六 / c6；7 命、9 命见 EXTRA_CONS_LEVEL
    let m = item.match(/^([0-9零〇一二三四五六七八九满])命座?$/) || item.match(/^命座([0-9零〇一二三四五六七八九满])$/) || item.match(/^c([0-9])$/i)
    if (m) {
      const cons = toNum(m[1], 6)
      if (cons <= 6) {
        mods.cons = cons
        delete mods.consAlias
      } else if (EXTRA_CONS_LEVEL[cons]) {
        mods.cons = 6
        mods.consAlias = cons
      } else {
        unknown.push(`${item}（没有${cons}命：7 命 = 95 级，9 命 = 100 级）`)
      }
      continue
    }
    // 精炼：精5 / 精五 / 精炼5 / 满精 / 5精 / 五精 / r5
    m = item.match(/^(?:精炼?|r)([1-5一二两三四五满])阶?$/i) || item.match(/^([1-5一二两三四五满])精炼?$/)
    if (m) {
      mods.affix = toNum(m[1], 5)
      continue
    }
    m = item.match(/^(?:天赋|技能)(.+)$/)
    if (m) {
      const talent = parseTalent(m[1])
      if (talent) mods.talent = talent
      else unknown.push(`${item}（天赋请写 3 位如 999、6 位如 101313，或 10-13-13）`)
      continue
    }
    // 等级：小助手接受到 100 级（实测更高也收但不校验），本地限制在 1~100
    m = item.match(/^(?:等级)?(\d{1,3})级$/)
    if (m) {
      mods.level = Math.min(100, Math.max(1, Number(m[1])))
      continue
    }
    if (/^(?:专武|专属武器|专属)$/.test(item)) {
      // miao 的武器别名里有「神里绫人专武」「万叶专武」这类写法，标准名和用户写的名字都试一下
      const own = charNames.map(n => Weapon.get(`${n}专武`)).find(w => w?.name)
      if (own) mods.weapon = own.name
      else unknown.push(`${item}（没查到专武，请直接写武器名）`)
      continue
    }
    // 旅行者换元素：换雷 / 换雷元素 / 换雷主
    m = item.match(/^([风岩雷草水火冰])(?:元素|主|系)?$/)
    if (m) {
      mods.elem = ELEM_KEY[m[1]]
      continue
    }
    // 武器放在套装前：武器名更具体，「绝缘」这类只有套装叫得出的词会落到下面
    const weapon = Weapon.get(item)
    if (weapon?.name) {
      mods.weapon = weapon.name
      continue
    }
    const sets = parseArtisSets(item)
    if (sets) {
      mods.artis = sets
      continue
    }
    unknown.push(item)
  }
  // 7/9 命折算的等级，单独写了等级时以等级为准
  if (mods.consAlias && mods.level === undefined) mods.level = EXTRA_CONS_LEVEL[mods.consAlias]
  return { mods, unknown }
}

/**
 * 队员 token → { name, mods, unknown }
 * @param {string} token 形如「丝柯克换六命换精5」，不带换装时 mods 为空
 */
export function parseMember (token) {
  const [name = '', ...rest] = String(token).split('换').map(s => s.trim())
  const stdName = Character.get(name)?.name || name
  const { mods, unknown } = parseLoadoutMods(rest.filter(Boolean), lodash.uniq([stdName, name]))
  return { name, mods, unknown }
}

/** 武器副词条加到 role_data 上，sign 为 -1 时撤掉 */
function applyWeaponBonus (roleData, key, value, sign) {
  const v = num(value) * sign
  if (!v) return
  switch (key) {
    case 'atkPct':
      // 服务端只认 base_attack，攻击% 折算成白值（近似，和圣遗物攻击% 的叠乘有少量误差）
      roleData.base_attack = Math.round(num(roleData.base_attack) * (1 + v / 100))
      break
    case 'hpPct':
      roleData.hp = Math.round(num(roleData.hp) + num(roleData.base_hp) * v / 100)
      break
    case 'defPct':
      roleData.defend = Math.round(num(roleData.defend) + num(roleData.base_defend) * v / 100)
      break
    case 'cpct':
      roleData.crit = pct(unpct(roleData.crit) + v)
      break
    case 'cdmg':
      roleData.crit_dmg = pct(unpct(roleData.crit_dmg) + v)
      break
    case 'mastery':
      roleData.element = Math.round(num(roleData.element) + v)
      break
    case 'recharge':
      roleData.recharge = pct(unpct(roleData.recharge) + v)
      break
    case 'phy':
      roleData.physical_dmg = pct(unpct(roleData.physical_dmg) + v)
      break
  }
}

/**
 * 把换装应用到 role_data（发给小助手）和 panel（出图用，covProfileroleData 的结构）
 * @returns {{labels: string[], warns: string[], elem?: string}} labels 用于提示消息；elem 为旅行者换后的元素
 */
export function applyLoadout (roleData, panel, mods, profile) {
  const labels = []
  const warns = []
  if (!mods || lodash.isEmpty(mods)) return { labels, warns }
  let elem
  // 旅行者换了元素时，天赋由下面的换元素逻辑按新元素统一重算
  const switchElem = !!mods.elem && !!profile.char?.isTraveler && mods.elem !== profile.elem

  if (mods.cons !== undefined) {
    const oldCons = num(roleData.role_class)
    roleData.role_class = mods.cons
    panel.cons = mods.cons
    labels.push(`${mods.consAlias ?? mods.cons}命`)
    // 3/5 命的天赋 +3：服务端不会自己加，没指定天赋时按命座变化补上或撤掉
    // 加哪项取 miao 的 talentCons，阿蕾奇诺、那维莱特等 3 命加的是普攻
    if (!mods.talent && !switchElem) {
      let changed = false
      const talentCons = profile.char?.talentCons || {}
      for (const [key, field] of [['a', 'ability1'], ['e', 'ability2'], ['q', 'ability3']]) {
        const need = talentCons[key]
        if (!need) continue
        const delta = (mods.cons >= need ? 3 : 0) - (oldCons >= need ? 3 : 0)
        if (!delta) continue
        roleData[field] = clampTalent(num(roleData[field]) + delta)
        changed = true
      }
      if (changed) labels.push(`天赋${roleData.ability1}/${roleData.ability2}/${roleData.ability3}`)
    }
  }

  // 旅行者换元素：元素伤害加成挪到新元素（视为换了对应元素杯，小助手直接用传入的加成值）
  if (mods.elem) {
    if (!profile.char?.isTraveler) {
      warns.push(`只有旅行者能换元素，「换${ELEM_CN[mods.elem]}」已跳过`)
    } else if (switchElem) {
      elem = mods.elem
      const oldField = ELEM_DMG[profile.elem]
      const newField = ELEM_DMG[elem]
      if (oldField && newField) {
        roleData[newField] = roleData[oldField]
        roleData[oldField] = pct(0)
      }
      panel.element = ELEM_CN[elem]
      labels.push(`${ELEM_CN[elem]}元素`)
      // 3/5 命加 E 还是 Q 随元素变化，没指定天赋时按原始等级重新算
      if (!mods.talent) {
        const cons = num(roleData.role_class)
        const tc = travelerTalentCons(elem)
        roleData.ability2 = clampTalent(num(profile.talent?.e?.original || roleData.ability2) + (cons >= tc.e ? 3 : 0))
        roleData.ability3 = clampTalent(num(profile.talent?.q?.original || roleData.ability3) + (cons >= tc.q ? 3 : 0))
        if (roleData.ability2 !== num(profile.talent?.e?.level) || roleData.ability3 !== num(profile.talent?.q?.level)) {
          labels.push(`天赋${roleData.ability1}/${roleData.ability2}/${roleData.ability3}`)
        }
      }
    }
  }

  if (mods.level !== undefined) {
    roleData.level = mods.level
    panel.level = mods.level
    labels.push(`${mods.level}级`)
  }

  if (mods.talent) {
    const [a, e, q] = mods.talent
    roleData.ability1 = a
    roleData.ability2 = e
    roleData.ability3 = q
    labels.push(`天赋${a}/${e}/${q}`)
  }
  // 天赋等级高于原始等级时高亮，和面板图一致
  for (const [key, field] of [['a', 'ability1'], ['e', 'ability2'], ['q', 'ability3']]) {
    const skill = panel.skills[key]
    skill.level = roleData[field]
    skill.style = skill.level > skill.originLvl ? 'extra' : ''
  }

  if (mods.weapon) {
    const newW = Weapon.get(mods.weapon)
    const oldW = Weapon.get(profile.weapon?.name)
    // 角色元数据里的 weapon 就是武器类型（polearm 等）
    const charType = profile.char?.weapon || profile.weapon?.type
    if (charType && newW.type !== charType) {
      warns.push(`「${newW.name}」是${WEAPON_TYPE_CN[newW.type] || newW.type}，${roleData.role}用不了，已跳过`)
    } else {
      const oldLevel = num(profile.weapon?.level) || 90
      const newLevel = Math.min(oldLevel, newW.maxLv)
      const oldAttr = oldW?.calcAttr?.(oldLevel, profile.weapon?.promote ?? -1)
      const newAttr = newW.calcAttr?.(newLevel)
      if (oldAttr?.atkBase && newAttr?.atkBase) {
        roleData.base_attack = Math.round(num(roleData.base_attack) - oldAttr.atkBase + newAttr.atkBase)
      }
      if (oldAttr?.attr?.key) applyWeaponBonus(roleData, oldAttr.attr.key, oldAttr.attr.value, -1)
      if (newAttr?.attr?.key) applyWeaponBonus(roleData, newAttr.attr.key, newAttr.attr.value, 1)
      roleData.weapon = newW.name
      roleData.weapon_level = newLevel
      Object.assign(panel.weapon, { name: newW.name, rarity: newW.star, level: newLevel, weaponPath: `${newW.type}/${newW.name}` })
      labels.push(newW.name)
    }
  }

  if (mods.affix !== undefined) {
    roleData.weapon_class = `精炼${mods.affix}阶`
    panel.weapon.affix = mods.affix
    labels.push(`精${mods.affix}`)
  }

  if (mods.artis) {
    roleData.artifacts = mods.artis.map(s => `${s.name}${s.num}`).join('+')
    panel.relicSet = Object.fromEntries(mods.artis.map(s => [s.name, s.num]))
    labels.push(mods.artis.map(s => `${s.num}${s.name}`).join('+'))
  }

  return { labels, warns, elem }
}

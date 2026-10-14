/**
 * miao 面板 → GCSim 队员数据
 * 换装后的武器、命座、天赋、等级、套装取自 applyLoadout 改写过的 role_data / panel，圣遗物词条取自面板
 */
import { ArtifactSet, Weapon } from '../../../miao-plugin/models/index.js'
import { travelerTalentCons } from '../loadout.js'
import { gcsimKey } from './index.js'

/** miao 圣遗物词条 key → [gcsim 属性, 除数]；miao 的百分比词条按百分数存储（46.6），gcsim 要小数（0.466） */
const STAT_KEY = {
  atk: ['atk%', 100], atkPlus: ['atk', 1], hp: ['hp%', 100], hpPlus: ['hp', 1], def: ['def%', 100], defPlus: ['def', 1],
  mastery: ['em', 1], recharge: ['er', 100], cpct: ['cr', 100], cdmg: ['cd', 100], heal: ['heal', 100], phy: ['phys%', 100]
}
const ELEMS = ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro']

const num = (v) => Number(v) || 0
/** 等级 → 突破上限（gcsim 写作 lvl=80/90） */
const levelCap = (lv) => (lv > 90 ? 100 : [20, 40, 50, 60, 70, 80, 90].find(c => lv <= c))

/** 面板上的最终天赋等级 → gcsim 需要的基础等级（gcsim 会按命座自己 +3） */
function baseTalent (final, key, cons, profile, elem) {
  const t = profile.talent?.[key]
  if (t && num(final) === num(t.level)) return num(t.original) || num(final)
  const need = profile.char?.isTraveler ? travelerTalentCons(elem)[key] : profile.char?.talentCons?.[key]
  return need && cons >= need ? num(final) - 3 : num(final)
}

/**
 * @param {Object} profile miao 面板
 * @param {Object} roleData 换装后的小助手 role_data
 * @param {Object} panel 换装后的出图数据（covProfileroleData）
 * @param {string} elem 角色当前元素（旅行者可能换过）
 * @returns {{member?: Object, error?: string}}
 */
export function toGcsimMember (profile, roleData, panel, elem) {
  const char = profile.char
  const name = char.isTraveler ? `${char.name === '荧' ? 'lumine' : 'aether'}${elem}` : char.name
  const key = char.isTraveler ? name : gcsimKey('char', char.name)
  if (!key) return { error: `GCSim 暂不支持${char.name}` }

  const w = Weapon.get(panel.weapon.name)
  const weaponKey = gcsimKey('weapon', w?.name || panel.weapon.name)
  if (!weaponKey) return { error: `GCSim 暂不支持武器「${panel.weapon.name}」` }
  const wLevel = num(panel.weapon.level) || 90

  const sets = {}
  for (const [setName, count] of Object.entries(panel.relicSet || {})) {
    if (count < 2) continue
    const setKey = gcsimKey('set', ArtifactSet.get(setName)?.name || setName)
    // 不支持的套装只是少了套装效果，词条照算
    if (setKey) sets[setKey] = count >= 4 ? 4 : 2
  }

  const stats = {}
  const add = (k, v) => {
    let [gKey, div] = STAT_KEY[k] || []
    if (!gKey) {
      // 元素伤害杯：dmg 为角色自身元素；旅行者换元素后杯子的加成跟着换
      const e = k === 'dmg' || (char.isTraveler && ELEMS.includes(k)) ? elem : k
      if (!ELEMS.includes(e)) return
      gKey = `${e}%`
      div = 100
    }
    stats[gKey] = (stats[gKey] || 0) + num(v) / div
  }
  for (const arti of Object.values(profile.artis?.artis || {})) {
    if (!arti?.main) continue
    add(arti.main.key, arti.main.value)
    for (const a of arti.attrs || []) add(a.key, a.value)
  }

  const cons = Math.min(6, num(roleData.role_class))
  const level = num(roleData.level) || 90
  return {
    member: {
      key,
      level,
      maxLevel: levelCap(level),
      cons,
      talents: [['a', 'ability1'], ['e', 'ability2'], ['q', 'ability3']]
        .map(([k, f]) => Math.min(10, Math.max(1, baseTalent(roleData[f], k, cons, profile, elem)))),
      weapon: { key: weaponKey, refine: num(panel.weapon.affix) || 1, level: wLevel, maxLevel: Math.min(levelCap(wLevel), w?.maxLv || 90), type: w?.type || profile.weapon?.type },
      sets,
      stats
    }
  }
}

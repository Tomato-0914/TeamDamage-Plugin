import _ from 'lodash'
import { getFace } from './simpleTeamDamageRes.js'

/** 期望伤害最多的倍率属性 → 结果图里显示的面板属性 */
const KEY_STAT = {
  hp: ['生命', '生命值'],
  def: ['防御', '防御力'],
  em: ['精通', '元素精通'],
  atk: ['攻击', '攻击力']
}

/**
 * GCSim 的计算结果 → 与 simpleTeamDamageRes 相同的结构，复用同一张结果图
 * @param {Object} parsed model/gcsim parseSample 的返回值
 * @param {Object} rolesData 角色名 → covProfileroleData 的出图数据
 * @param {string[]} names 队伍顺序的角色名（与 gcsim 的角色序号一致）
 * @param {string} uid
 * @param {string[]} actions 手法的动作名
 */
export default function gcsimTeamDamageRes (parsed, rolesData, names, uid, actions) {
  const avatars = {}
  names.forEach((name, i) => {
    const panel = rolesData[name]
    const [keyProp, field] = KEY_STAT[parsed.keyStat[i]] || KEY_STAT.atk
    const imgName = panel.imgName || name
    avatars[name] = {
      name,
      imgName,
      face: getFace(imgName),
      elem: panel.element,
      cons: panel.cons,
      level: panel.level,
      weapon: {
        icon: panel.weapon.icon,
        level: panel.weapon.level,
        rarity: panel.weapon.rarity,
        affix: panel.weapon.affix,
        imgPath: panel.weapon.weaponPath
      },
      relicSet: _.pickBy(panel.relicSet, n => n >= 2),
      cp: _.round(panel.fightProp['暴击率'], 1),
      cd: _.round(panel.fightProp['暴击伤害'], 1),
      key_prop: keyProp,
      key_value: Math.round(panel.fightProp[field] || 0),
      skills: _.map(panel.skills, s => ({ style: s.style, level: s.level })),
      recharge: { pct: parsed.energy[i], same: '-', diff: '-' }
    }
  })
  const main = parsed.pie_data2.find(p => avatars[p.char])?.char || names[0]
  return {
    uid,
    elem: avatars[main]?.elem,
    // GCSim 没有全服排名，不显示评级
    rank: '',
    rankTip: '',
    dps: parsed.dps,
    tm: parsed.tm,
    total: parsed.total,
    pie_data2: parsed.pie_data2,
    pie_color2: parsed.pie_color2,
    avatars,
    actions,
    damages: parsed.damages,
    buffs: [],
    source: 'GCSim',
    dmgNote: '以 90 级怪物、10% 抗性为基准，GCSim 单次模拟，总伤与 DPS 为 1.25 倍期望伤害'
  }
}

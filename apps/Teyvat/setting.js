/**
 * #队伍伤害设置：查看 / 修改插件设置，与锅巴「基础设置」读写同一份 config.yaml
 */
import fs from 'node:fs'
import puppeteer from '../../../../lib/puppeteer/puppeteer.js'
import { getConfig, setConfig } from '../../model/config.js'
import { pluginName, pluginRoot } from '../../model/path.js'

/** 可修改的设置项，key 对应 config.yaml */
export const SETTING_ITEMS = [
  { key: 'showDamages', name: '伤害过程', desc: '结果图是否展示伤害过程表', type: 'bool' },
  { key: 'showAvatars', name: '队伍面板', desc: '结果图是否展示队伍与输出占比', type: 'bool' },
  { key: 'mainCritFull', name: '主C满暴', desc: '输出占比最高的角色按 100% 暴击计算', type: 'bool' },
  { key: 'teamCritFull', name: '全队满暴', desc: '全队按 100% 暴击计算', type: 'bool' },
  { key: 'sendTips', name: '提示信息', desc: '计算前发送 UID、队伍、手法等提示', type: 'bool' },
  { key: 'tipsRecall', name: '提示撤回', desc: '提示信息自动撤回的秒数，0 为不撤回', type: 'int', min: 0, max: 120, unit: '秒' }
]

/** 提瓦特小助手接口固定、无法修改的计算参数，只做展示 */
export const FIXED_ITEMS = [
  { name: '开局满能量', desc: '小助手接口不支持设置', value: '—' },
  { name: '怪物等级', desc: '小助手以 90 级怪物为基准', value: '90' },
  { name: '怪物抗性', desc: '小助手固定的基础元素抗性', value: '10%' },
  { name: '目标类型', desc: '仅对单体', value: '单体' }
]

const ON = /^(开启|打开|开|启用|on|true|1)$/i
const OFF = /^(关闭|关|停用|off|false|0)$/i

/** 指令里的设置名 → 设置项（主C 不区分大小写） */
function findItem (name) {
  const n = String(name || '').replace(/c/g, 'C')
  return SETTING_ITEMS.find(i => i.name === n)
}

function getVersion () {
  try {
    return JSON.parse(fs.readFileSync(`${pluginRoot}/package.json`, 'utf8')).version
  } catch {
    return ''
  }
}

/** 渲染设置图，notice 为顶部的修改结果提示 */
export async function showSettings (e, notice = '') {
  const cfg = getConfig()
  const rows = SETTING_ITEMS.map(item => {
    const v = cfg[item.key]
    const row = { ...item, cmd: `#队伍伤害设置${item.name} ${item.type === 'bool' ? '开启/关闭' : `${item.min}~${item.max}`}` }
    if (item.type === 'bool') return { ...row, value: v !== false ? '开启' : '关闭', state: v !== false ? 'on' : 'off' }
    return { ...row, value: `${Number(v) || 0}${item.unit || ''}`, state: 'num' }
  })
  // 全队满暴开启时主 C 满暴不再单独生效
  if (cfg.teamCritFull && cfg.mainCritFull) rows.find(r => r.key === 'mainCritFull').desc += '（已被全队满暴覆盖）'
  const img = await puppeteer.screenshot('TeamDamageSetting', {
    rows,
    fixed: FIXED_ITEMS,
    total: rows.length + FIXED_ITEMS.length,
    notice,
    pluginName,
    version: getVersion(),
    tplFile: `${pluginRoot}/resources/Teyvat/setting.html`,
    pluResPath: `${pluginRoot}/resources/Teyvat/`,
    saveId: 'setting'
  })
  await e.reply(img)
  return true
}

/** 修改一项设置，成功后返回新的设置图 */
export async function changeSetting (e, name, rawValue) {
  if (!e.isMaster) {
    await e.reply('只有主人才能修改队伍伤害的设置~', true)
    return true
  }
  const item = findItem(name)
  const value = String(rawValue || '').trim()
  if (!item) return false
  const cfg = getConfig()
  let next
  if (item.type === 'bool') {
    if (ON.test(value)) next = true
    else if (OFF.test(value)) next = false
    else {
      await e.reply(`写法：#队伍伤害设置${item.name} 开启 / 关闭`, true)
      return true
    }
  } else {
    next = Number(value)
    if (!/^\d+$/.test(value) || next < item.min || next > item.max) {
      await e.reply(`${item.name}需为 ${item.min}~${item.max} 的整数，例如：#队伍伤害设置${item.name} 5`, true)
      return true
    }
  }
  setConfig({ ...cfg, [item.key]: next })
  const shown = item.type === 'bool' ? (next ? '开启' : '关闭') : `${next}${item.unit || ''}`
  return showSettings(e, `已将「${item.name}」设为 ${shown}`)
}

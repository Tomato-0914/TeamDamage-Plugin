import fs from 'node:fs'
import YAML from 'yaml'
import { pluginRoot } from './path.js'

/** 插件自带的默认预设，不要改动 */
export const defaultPresetPath = `${pluginRoot}/config/default_SimpleTeamArr.yaml`
/** 用户预设，存在时完全取代默认预设（锅巴保存的也是这个文件） */
export const userPresetPath = `${pluginRoot}/config/SimpleTeamArr.yaml`

const HEADER = '# 队伍简写预设，可直接编辑或在锅巴中修改。删除本文件即恢复默认预设\n'

/** 把名字列表统一成去空、去重的字符串数组；字符串按常见分隔符拆分 */
export function toNameList (value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,，、|\s]+/)
  return [...new Set(list.map(v => String(v ?? '').trim()).filter(Boolean))]
}

/**
 * 读取当前生效的队伍预设
 * YAML 中每项可写成 `简写: [角色...]` 或 `简写: { alias: [别名...], chars: [角色...] }`
 * @returns {{name: string, alias: string[], chars: string[]}[]}
 */
export function loadPresets () {
  const file = fs.existsSync(userPresetPath) ? userPresetPath : defaultPresetPath
  const raw = YAML.parse(fs.readFileSync(file, 'utf8')) || {}
  return Object.entries(raw).map(([name, v]) => ({
    name: String(name),
    alias: toNameList(Array.isArray(v) ? [] : v?.alias),
    chars: toNameList(Array.isArray(v) ? v : v?.chars)
  }))
}

/** 把队伍预设写入用户预设文件，没有别名的写成简写形式 */
export function savePresets (presets) {
  const obj = {}
  for (const { name, alias, chars } of presets) {
    obj[name] = alias.length ? { alias, chars } : chars
  }
  // 每个队伍写成一行，和默认预设的风格一致
  const doc = new YAML.Document(obj)
  for (const pair of doc.contents.items) pair.value.flow = true
  fs.writeFileSync(userPresetPath, HEADER + doc.toString({ lineWidth: 0 }), 'utf8')
}

/** 按简写或别名查找队伍，找不到返回空数组 */
export function findPreset (teamName) {
  if (typeof teamName !== 'string') return []
  const presets = loadPresets()
  const hit = presets.find(p => p.name === teamName) || presets.find(p => p.alias.includes(teamName))
  return hit ? hit.chars : []
}

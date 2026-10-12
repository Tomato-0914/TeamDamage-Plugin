import fs from 'node:fs'
import YAML from 'yaml'
import { pluginRoot } from './path.js'

/** 插件自带的默认预设，随插件更新，不要改动 */
export const defaultPresetPath = `${pluginRoot}/config/default_SimpleTeamArr.yaml`
/** 用户自定义预设，只存放新增或要覆盖的队伍（锅巴保存的也是这个文件），与默认预设同名时以它为准 */
export const userPresetPath = `${pluginRoot}/config/SimpleTeamArr.yaml`

const HEADER = '# 自定义队伍简写预设，可直接编辑或在锅巴中修改，即时生效\n' +
  '# 只需写新增或要覆盖的队伍：与默认预设（default_SimpleTeamArr.yaml）同名时以这里为准，其余默认预设照常可用\n'

/** 把名字列表统一成去空、去重的字符串数组；字符串按常见分隔符拆分 */
export function toNameList (value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,，、|\s]+/)
  return [...new Set(list.map(v => String(v ?? '').trim()).filter(Boolean))]
}

/**
 * 读取一个预设文件，不存在时返回空列表
 * YAML 中每项可写成 `简写: [角色...]` 或 `简写: { alias: [别名...], chars: [角色...], combo: 手法 }`
 * combo 为自定义手法文本（写法同指令），留空则走小助手默认手法
 * @returns {{name: string, alias: string[], chars: string[], combo: string}[]}
 */
function readPresetFile (file) {
  if (!fs.existsSync(file)) return []
  const raw = YAML.parse(fs.readFileSync(file, 'utf8')) || {}
  return Object.entries(raw).map(([name, v]) => ({
    name: String(name),
    alias: toNameList(Array.isArray(v) ? [] : v?.alias),
    chars: toNameList(Array.isArray(v) ? v : v?.chars),
    combo: Array.isArray(v) ? '' : String(v?.combo ?? '').trim()
  }))
}

/** 默认预设 */
export function loadDefaultPresets () {
  return readPresetFile(defaultPresetPath)
}

/** 用户自定义预设 */
export function loadUserPresets () {
  return readPresetFile(userPresetPath)
}

/** 当前生效的全部预设：自定义预设在前，默认预设中与之同名的被覆盖 */
export function loadPresets () {
  const user = loadUserPresets()
  const names = new Set(user.map(p => p.name))
  return [...user, ...loadDefaultPresets().filter(p => !names.has(p.name))]
}

/** 两个预设内容是否完全相同 */
export function samePreset (a, b) {
  return a.name === b.name && a.combo === b.combo &&
    a.chars.join('|') === b.chars.join('|') && a.alias.join('|') === b.alias.join('|')
}

/** 把自定义预设写入用户预设文件，没有别名和手法的写成简写形式 */
export function savePresets (presets) {
  const obj = {}
  for (const { name, alias, chars, combo } of presets) {
    if (!alias.length && !combo) {
      obj[name] = chars
      continue
    }
    obj[name] = { alias, chars }
    if (combo) obj[name].combo = combo
  }
  // 每个队伍写成一行，和默认预设的风格一致
  const doc = new YAML.Document(obj)
  for (const pair of doc.contents.items || []) pair.value.flow = true
  fs.writeFileSync(userPresetPath, HEADER + (presets.length ? doc.toString({ lineWidth: 0 }) : '{}\n'), 'utf8')
}

/** 按简写或别名查找队伍预设（自定义优先），找不到或没有角色时返回 null */
export function findPreset (teamName) {
  if (typeof teamName !== 'string') return null
  const presets = loadPresets()
  const hit = presets.find(p => p.name === teamName) || presets.find(p => p.alias.includes(teamName))
  return hit?.chars.length ? hit : null
}

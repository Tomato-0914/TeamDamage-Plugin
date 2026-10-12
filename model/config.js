import fs from 'node:fs'
import YAML from 'yaml'
import { pluginRoot } from './path.js'

/** 插件自带的默认设置，随插件更新，不要改动 */
export const defaultConfigPath = `${pluginRoot}/config/default_config.yaml`
/** 用户设置，只存放修改过的项（锅巴保存的也是这个文件） */
export const userConfigPath = `${pluginRoot}/config/config.yaml`

const HEADER = '# 插件设置，可直接编辑或在锅巴中修改，即时生效；未写的项使用 default_config.yaml 中的默认值\n'

const readYaml = (file) => fs.existsSync(file) ? (YAML.parse(fs.readFileSync(file, 'utf8')) || {}) : {}

/** 当前生效的设置：用户设置覆盖默认设置，每次调用都重新读取，修改后无需重启 */
export function getConfig () {
  let user = {}
  try {
    user = readYaml(userConfigPath)
  } catch (err) {
    logger.error('[队伍伤害] config.yaml 格式错误，使用默认设置：', err.message)
  }
  return { ...readYaml(defaultConfigPath), ...user }
}

/** 保存用户设置：只写入与默认值不同的项 */
export function setConfig (cfg) {
  const def = readYaml(defaultConfigPath)
  const diff = Object.fromEntries(Object.entries(cfg).filter(([k, v]) => v !== def[k]))
  fs.writeFileSync(userConfigPath, HEADER + (Object.keys(diff).length ? YAML.stringify(diff) : '{}\n'), 'utf8')
}

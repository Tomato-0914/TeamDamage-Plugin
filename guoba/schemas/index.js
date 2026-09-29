// ==========================
//  锅巴配置中心
// ==========================
import teamPreset, * as teamPresetData from './teamPreset.js'

/** 各配置模块：表单字段写成「模块名.字段名」，读写时按模块名分发 */
const modules = {
  teamPreset: teamPresetData
}

/* -------------- 动态表单模式 -------------- */
export const schemas = [
  ...teamPreset
]

/* -------------- 读取配置 -------------- */
export function getConfigData () {
  const data = {}
  for (const name in modules) data[name] = modules[name].getData()
  return data
}

/* -------------- 写入配置 -------------- */
export async function setConfigData (data, { Result }) {
  try {
    const dataMap = convertToNestedObject(data)
    for (const name in dataMap) {
      if (modules[name]) await modules[name].setData(dataMap[name])
    }
    return Result.ok({}, '保存成功~')
  } catch (e) {
    logger.error('[队伍伤害] 锅巴保存失败：', e)
    return Result.error({}, `保存失败：${e.message}`)
  }
}

/* ==========================================================
 * 工具函数
 * ========================================================== */

/** 扁平 key 转嵌套对象：{ 'teamPreset.teams': [] } → { teamPreset: { teams: [] } } */
function convertToNestedObject (data) {
  const result = {}
  for (const key in data) {
    if (!Object.hasOwn(data, key)) continue
    const keys = key.split('.')
    let obj = result
    keys.forEach((k, index) => {
      if (index === keys.length - 1) {
        obj[k] = data[key]
      } else {
        obj[k] = obj[k] || {}
        obj = obj[k]
      }
    })
  }
  return result
}

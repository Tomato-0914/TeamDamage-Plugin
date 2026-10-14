import { getConfig, setConfig } from '../../model/config.js'

/** 基础设置：对应 config/config.yaml，默认值在 default_config.yaml */
export default [
  {
    component: 'Divider',
    label: '基础设置'
  },
  {
    field: 'settings.sendTips',
    label: '发送提示信息',
    helpMessage: '计算前先发一条 UID、队伍、手法、换装的提示',
    bottomHelpMessage: '关闭后只在有换装警告时发送',
    component: 'Switch'
  },
  {
    field: 'settings.tipsRecall',
    label: '提示撤回时间',
    helpMessage: '提示信息发送后自动撤回',
    bottomHelpMessage: '单位：秒，0 为不撤回，最长 120 秒',
    component: 'InputNumber',
    componentProps: { min: 0, max: 120, addonAfter: '秒' }
  },
  {
    field: 'settings.showDamages',
    label: '显示伤害过程',
    helpMessage: '结果图是否展示伤害过程表',
    component: 'Switch'
  },
  {
    field: 'settings.showAvatars',
    label: '显示队伍面板',
    helpMessage: '结果图是否展示队伍与输出占比',
    component: 'Switch'
  },
  {
    field: 'settings.mainCritFull',
    label: '主C满暴',
    helpMessage: '输出占比最高的角色按 100% 暴击计算',
    bottomHelpMessage: '开启后每次计算会多请求一次小助手',
    component: 'Switch'
  },
  {
    field: 'settings.teamCritFull',
    label: '全队满暴',
    helpMessage: '全队按 100% 暴击计算',
    bottomHelpMessage: '开启时主C满暴不再单独生效',
    component: 'Switch'
  }
]

/** 开关类设置项 */
const SWITCHES = ['sendTips', 'showDamages', 'showAvatars', 'mainCritFull', 'teamCritFull']

/** 读取 */
export function getData () {
  const cfg = getConfig()
  const data = { tipsRecall: Number(cfg.tipsRecall) || 0 }
  // 默认开启的项缺省视为开启，默认关闭的项缺省视为关闭
  for (const k of SWITCHES) data[k] = ['mainCritFull', 'teamCritFull'].includes(k) ? cfg[k] === true : cfg[k] !== false
  return data
}

/** 写入 */
export function setData (data) {
  const cur = getConfig()
  const recall = Math.round(Number(data?.tipsRecall ?? cur.tipsRecall))
  if (!Number.isFinite(recall) || recall < 0 || recall > 120) throw new Error('提示撤回时间需在 0~120 秒之间')
  const next = { ...cur, tipsRecall: recall }
  for (const k of SWITCHES) next[k] = data?.[k] ?? cur[k]
  setConfig(next)
}

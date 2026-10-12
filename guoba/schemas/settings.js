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
  }
]

/** 读取 */
export function getData () {
  const { sendTips, tipsRecall } = getConfig()
  return { sendTips: sendTips !== false, tipsRecall: Number(tipsRecall) || 0 }
}

/** 写入 */
export function setData (data) {
  const cur = getConfig()
  const recall = Math.round(Number(data?.tipsRecall ?? cur.tipsRecall))
  if (!Number.isFinite(recall) || recall < 0 || recall > 120) throw new Error('提示撤回时间需在 0~120 秒之间')
  setConfig({ ...cur, sendTips: data?.sendTips ?? cur.sendTips, tipsRecall: recall })
}

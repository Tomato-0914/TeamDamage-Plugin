import { loadPresets, savePresets, toNameList } from '../../model/teamPreset.js'
import { parseCombo, splitTokens } from '../../apps/Teyvat/combo.js'

/** 队伍预设：对应 config/SimpleTeamArr.yaml */
export default [
  {
    component: 'SOFT_GROUP_BEGIN',
    label: '队伍预设'
  },
  {
    field: 'teamPreset.teams',
    label: '队伍简写',
    helpMessage: '使用：#队伍伤害雷九',
    bottomHelpMessage: '保存后写入 config/SimpleTeamArr.yaml 并立即生效，删除该文件即恢复默认预设',
    component: 'GSubForm',
    componentProps: {
      multiple: true,
      schemas: [
        {
          field: 'name',
          label: '简写',
          helpMessage: '指令中使用的队伍名',
          component: 'Input',
          required: true,
          componentProps: { placeholder: '例如：雷九' }
        },
        {
          field: 'chars',
          label: '角色',
          helpMessage: '按出场顺序填写 1~4 个角色',
          bottomHelpMessage: '用逗号或空格分隔，支持别名',
          component: 'Input',
          required: true,
          componentProps: { placeholder: '例如：雷电将军，九条裟罗，枫原万叶，班尼特' }
        },
        {
          field: 'combo',
          label: '手法',
          helpMessage: '留空走小助手默认手法',
          bottomHelpMessage: '可选，写法同指令；指令里另写了手法时以指令为准',
          component: 'Input',
          componentProps: { placeholder: '例如：雷神e，九条裟罗e，万叶e，班尼特q，雷神q' }
        },
        {
          field: 'alias',
          label: '别名',
          helpMessage: '这些名字也能调出该队伍',
          bottomHelpMessage: '可选',
          component: 'GTags',
          componentProps: {
            allowAdd: true,
            allowDel: true,
            showPrompt: true,
            promptProps: {
              content: '请输入别名',
              placeholder: '例如：雷九万班',
              okText: '添加',
              rules: [{ required: true, message: '别名不能为空' }]
            }
          }
        }
      ]
    }
  }
]

/** 读取：转成表单需要的格式 */
export function getData () {
  return {
    teams: loadPresets().map(p => ({ name: p.name, chars: p.chars.join('，'), combo: p.combo, alias: p.alias }))
  }
}

/** 角色名/别名 → 标准名的函数；miao-plugin 不可用时返回 null，跳过角色和手法校验 */
async function getResolver () {
  try {
    const { Character } = await import('../../../miao-plugin/models/index.js')
    return (name) => Character.get(name)?.name || null
  } catch {
    return null
  }
}

/** 写入：校验后保存，出错时抛出带提示的异常 */
export async function setData (data) {
  const resolve = await getResolver()
  const presets = []
  const names = new Set()
  for (const [i, item] of (Array.isArray(data?.teams) ? data.teams : []).entries()) {
    const name = String(item?.name ?? '').trim()
    const chars = toNameList(item?.chars)
    const alias = toNameList(item?.alias).filter(a => a !== name)
    const combo = String(item?.combo ?? '').trim()
    const row = `第 ${i + 1} 项${name ? `「${name}」` : ''}`
    if (!name) throw new Error(`${row}缺少简写`)
    if (names.has(name)) throw new Error(`简写「${name}」重复了`)
    if (!chars.length || chars.length > 4) throw new Error(`${row}需要填写 1~4 个角色`)
    if (resolve) {
      const unknown = chars.filter(c => !resolve(c))
      if (unknown.length) throw new Error(`${row}中无法识别的角色：${unknown.join('、')}`)
      if (combo) {
        const res = parseCombo(splitTokens(combo), chars.map(resolve), resolve)
        if (res.error) throw new Error(`${row}的手法有误：${res.error}`)
      }
    }
    names.add(name)
    presets.push({ name, alias, chars, combo })
  }
  savePresets(presets)
}

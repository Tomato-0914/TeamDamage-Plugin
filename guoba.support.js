import { pluginName } from './model/path.js'
import { loadPresets, savePresets, toNameList } from './model/teamPreset.js'

/** 角色名/别名 → 标准名；miao-plugin 不可用时原样返回，不做校验 */
async function getResolver () {
  try {
    const { Character } = await import('../miao-plugin/models/index.js')
    return (name) => Character.get(name)?.name || null
  } catch {
    return (name) => name
  }
}

/** 锅巴插件支持：在锅巴后台编辑队伍简写预设 */
export function supportGuoba () {
  return {
    pluginInfo: {
      name: pluginName,
      title: '队伍伤害',
      author: '@Tomato-0914',
      authorLink: 'https://github.com/Tomato-0914',
      link: 'https://github.com/Tomato-0914/TeamDamage-Plugin',
      isV3: true,
      isV2: false,
      description: '原神队伍伤害计算，支持自定义手法与队伍简写预设',
      icon: 'mdi:sword-cross',
      iconColor: '#d19f56'
    },
    configInfo: {
      schemas: [
        {
          component: 'Divider',
          label: '队伍预设'
        },
        {
          field: 'teams',
          label: '队伍简写',
          bottomHelpMessage: '使用：#队伍伤害雷九。保存后写入 config/SimpleTeamArr.yaml 并立即生效，删除该文件即恢复默认预设',
          component: 'GSubForm',
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: 'name',
                label: '简写',
                component: 'Input',
                required: true,
                componentProps: { placeholder: '例如：雷九' }
              },
              {
                field: 'chars',
                label: '角色',
                component: 'Input',
                required: true,
                bottomHelpMessage: '按出场顺序填写 1~4 个角色，用逗号或空格分隔，支持别名',
                componentProps: { placeholder: '例如：雷电将军，九条裟罗，枫原万叶，班尼特' }
              },
              {
                field: 'alias',
                label: '别名',
                component: 'GTags',
                bottomHelpMessage: '可选，这些名字也能调出该队伍',
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
      ],

      getConfigData () {
        return {
          teams: loadPresets().map(p => ({ name: p.name, chars: p.chars.join('，'), alias: p.alias }))
        }
      },

      async setConfigData (data, { Result }) {
        const fail = (msg) => (typeof Result.error === 'function' ? Result.error(msg) : Result.ok({}, msg))
        const resolve = await getResolver()
        const presets = []
        const names = new Set()
        for (const [i, item] of (Array.isArray(data.teams) ? data.teams : []).entries()) {
          const name = String(item?.name ?? '').trim()
          const chars = toNameList(item?.chars)
          const alias = toNameList(item?.alias).filter(a => a !== name)
          const row = `第 ${i + 1} 项${name ? `「${name}」` : ''}`
          if (!name) return fail(`${row}缺少简写`)
          if (names.has(name)) return fail(`简写「${name}」重复了`)
          if (!chars.length || chars.length > 4) return fail(`${row}需要填写 1~4 个角色`)
          const unknown = chars.filter(c => !resolve(c))
          if (unknown.length) return fail(`${row}中无法识别的角色：${unknown.join('、')}`)
          names.add(name)
          presets.push({ name, alias, chars })
        }
        savePresets(presets)
        return Result.ok({}, '保存成功~')
      }
    }
  }
}

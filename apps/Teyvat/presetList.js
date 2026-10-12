import fs from 'node:fs'
import common from '../../../../lib/common/common.js'
import puppeteer from '../../../../lib/puppeteer/puppeteer.js'
import { Character } from '../../../miao-plugin/models/index.js'
import { loadDefaultPresets, loadUserPresets } from '../../model/teamPreset.js'
import { teamVersion, versionGroups } from '../../model/charVersion.js'
import { pluginRoot, pluginName } from '../../model/path.js'

const miaoRes = `${process.cwd().replace(/\\/g, '/')}/plugins/miao-plugin/resources/`

/** 队员头像和显示名，识别不了的角色只显示名字 */
function memberView (name) {
  const char = Character.get(name)
  if (!char) return { name, face: '', star: 4 }
  const dir = `${miaoRes}meta-gs/character/${char.name}/imgs/`
  const face = ['face.webp', 'face-q.webp'].map(f => dir + f).find(f => fs.existsSync(f)) || ''
  return { name: char.name, face, star: char.star || 4 }
}

/** 一个队伍卡片需要的数据 */
function presetView (p, overridden) {
  return {
    name: p.name,
    members: p.chars.map(memberView),
    combo: p.combo,
    alias: p.alias.length ? p.alias.join(' / ') : '无',
    overridden
  }
}

/** 按队伍成型的大版本分组，新版本在前，空组不返回 */
export function groupPresets (presets, overriddenNames = new Set()) {
  const buckets = new Map(versionGroups.map(g => [g.key, { ...g, list: [] }]))
  for (const p of presets) buckets.get(teamVersion(p.chars).key).list.push(presetView(p, overriddenNames.has(p.name)))
  return [...buckets.values()].filter(g => g.list.length)
}

/** 每张图最多放的队伍数，超出的分页，避免图片过长 */
const PAGE_SIZE = 12

/** 每个大版本渲染一张图，队伍多时分页 */
async function renderGroups (presets, source, overriddenNames) {
  const imgs = []
  for (const group of groupPresets(presets, overriddenNames)) {
    const pages = Math.ceil(group.list.length / PAGE_SIZE)
    for (let i = 0; i < pages; i++) {
      imgs.push(await puppeteer.screenshot('TeamDamagePreset', {
        tplFile: `${pluginRoot}/resources/Teyvat/preset.html`,
        pluResPath: `${pluginRoot}/resources/Teyvat/`,
        saveId: `preset-${source.key}-${group.key}-${i}`,
        source,
        group,
        list: group.list.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE),
        page: pages > 1 ? `${i + 1}/${pages}` : '',
        pluginName
      }))
    }
  }
  return imgs
}

/**
 * #队伍预设：合并转发全部队伍预设，默认预设和自定义预设分开展示
 * @param {'默认'|'自定义'|''} only 只看其中一种
 */
export async function presetList (e, only = '') {
  const defaults = loadDefaultPresets()
  const users = loadUserPresets()
  const userNames = new Set(users.map(p => p.name))
  const msgs = []

  if (only !== '自定义') {
    msgs.push(`【默认预设】共 ${defaults.length} 队，按队伍成型的大版本分类\n插件自带，随插件更新；与自定义预设同名时以自定义为准`)
    msgs.push(...await renderGroups(defaults, { key: 'default', title: '默认预设' }, userNames))
  }
  if (only !== '默认') {
    if (users.length) {
      msgs.push(`【自定义预设】共 ${users.length} 队\n可在锅巴中编辑，或修改 config/SimpleTeamArr.yaml`)
      msgs.push(...await renderGroups(users, { key: 'user', title: '自定义预设' }))
    } else {
      msgs.push('【自定义预设】暂无\n可在锅巴中添加，或新建 config/SimpleTeamArr.yaml')
    }
  }
  msgs.push('使用预设：#队伍伤害+预设名或别名，如 #队伍伤害雷九\n预设名后面还可以接手法，覆盖预设里的手法')

  await e.reply(await common.makeForwardMsg(e, msgs.filter(Boolean), '队伍预设列表'))
  return true
}

import fs from 'node:fs'
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

/** 转成 OneBot 协议的消息段：文字转 text，图片 Buffer 转 base64 */
function toOneBotSeg (m) {
  if (typeof m === 'string') return { type: 'text', data: { text: m } }
  if (m?.type === 'image') {
    let file = m.data?.file ?? m.file
    // 本地路径协议端不一定读得到，统一转成 base64
    if (typeof file === 'string' && !/^\w+:\/\//.test(file) && fs.existsSync(file)) file = fs.readFileSync(file)
    return { type: 'image', data: { file: Buffer.isBuffer(file) ? `base64://${file.toString('base64')}` : file } }
  }
  return m
}

/** 和 common.makeForwardMsg 相同，但每个节点可以带发送者昵称（不带时显示为「匿名消息」） */
function makeForward (e, nodes) {
  if (e?.group?.makeForwardMsg) return e.group.makeForwardMsg(nodes)
  if (e?.friend?.makeForwardMsg) return e.friend.makeForwardMsg(nodes)
  return Bot.makeForwardMsg(nodes)
}

/**
 * 发送一个合并转发，里面每一节是一个子合并转发，外层节点以 name 作为发送者昵称
 * TRSS 的 OneBotv11 适配器会把节点里的合并转发展开到同一层，嵌套不起来。
 * 所以 OneBot 下直接拼好协议格式的嵌套节点（节点 content 里放节点，NapCat / LLOneBot 均支持），
 * 用 raw 段原样交给协议端；其他适配器（如 ICQQ）按常规方式嵌套
 * @param {{name: string, title: string, msgs: any[]}[]} sections
 */
async function sendNestedForward (e, sections) {
  const user_id = e.self_id || e.bot?.uin || 80000000
  const nickname = e.bot?.nickname || 'Bot'
  let outer
  if (e.bot?.adapter?.name === 'OneBotv11') {
    const node = content => ({ type: 'node', data: { name: nickname, uin: String(user_id), content } })
    outer = sections.map(s => ({
      nickname: s.name,
      user_id,
      message: [s.title, ...s.msgs].map(m => ({ type: 'raw', data: node([toOneBotSeg(m)]) }))
    }))
  } else {
    outer = []
    for (const s of sections) {
      const inner = [s.title, ...s.msgs].map(message => ({ nickname, user_id, message }))
      outer.push({ nickname: s.name, user_id, message: await makeForward(e, inner) })
    }
  }
  return e.reply(await makeForward(e, outer))
}

/** #队伍伤害预设列表：一个合并转发里包含自定义预设、默认预设两个合并转发，自定义在前 */
export async function presetList (e) {
  const defaults = loadDefaultPresets()
  const users = loadUserPresets()
  const userNames = new Set(users.map(p => p.name))
  const usage = '使用预设：#队伍伤害+预设名或别名，如 #队伍伤害雷九\n预设名后面还可以接手法，覆盖预设里的手法'

  const userSection = users.length
    ? {
        title: `【自定义预设】共 ${users.length} 队\n可在锅巴中编辑，或修改 config/SimpleTeamArr.yaml；与默认预设同名时以自定义为准`,
        msgs: [...await renderGroups(users, { key: 'user', title: '自定义预设' }), usage]
      }
    : { title: '【自定义预设】暂无\n可在锅巴中添加，或新建 config/SimpleTeamArr.yaml', msgs: [] }

  await sendNestedForward(e, [
    { name: '自定义预设', ...userSection },
    {
      name: '默认预设',
      title: `【默认预设】共 ${defaults.length} 队，按队伍成型的大版本分类\n插件自带，随插件更新`,
      msgs: [...await renderGroups(defaults, { key: 'default', title: '默认预设' }, userNames), usage]
    }
  ].map(s => ({ ...s, msgs: s.msgs.filter(Boolean) })))
  return true
}

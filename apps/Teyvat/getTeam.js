import fs from 'node:fs'
import fetch from 'node-fetch'
import _ from 'lodash'
import {Format} from '../../../miao-plugin/components/index.js'
import {Character, Player} from '../../../miao-plugin/models/index.js'
import getServer from './GetData/getServer.js'
import simpleTeamDamageRes from './simpleDamage/simpleTeamDamageRes.js'
import gcsimTeamDamageRes from './simpleDamage/gcsimTeamDamageRes.js'
import buildScreenView from './simpleDamage/screenView.js'
import puppeteer from '../../../../lib/puppeteer/puppeteer.js'
import {findPreset} from "../../model/teamPreset.js"
import {getConfig} from "../../model/config.js"
import {pluginRoot, pluginName} from "../../model/path.js"
import {COMBO_USAGE, inferTeam, parseCombo, splitTeamAndCombo, splitTokens} from "./combo.js"
import {LOADOUT_USAGE, applyLoadout, parseMember} from "../../model/loadout.js"
import {buildConfig, gcsimBin, parseSample, runGcsim} from "../../model/gcsim/index.js"
import {toGcsimMember} from "../../model/gcsim/member.js"

let cwd = process.cwd().replace(/\\/g, '/')
/** 小助手请求头 */
const headers = {
    referer: 'https://servicewechat.com/wx2ac9dce11213c3a8/192/page-frame.html',
    'user-agent':
        'Mozilla/5.0 (Linux; Android 12; SM-G977N Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/86.0.4240.99 XWEB/4375 MMWEBSDK/20221011 Mobile Safari/537.36 MMWEBID/4357 MicroMessenger/8.0.30.2244(0x28001E44) WeChat/arm64 Weixin GPVersion/1 NetType/WIFI Language/zh_CN ABI/arm64 MiniProgramEnv/android'
}
let attrsKeys =
    {
        "def": "防御力",
        "defPlus": "防御力",
        "hpPlus": "生命值",
        "hp": "生命值",
        "atkPlus": "攻击力",
        "atk": "攻击力",
        "recharge": "元素充能效率",
        "mastery": "元素精通",
        "cpct": "暴击率",
        "cdmg": "暴击伤害",
        "heal": "治疗加成",
        "pyro": "火",
        "hydro": "水",
        "cryo": "冰",
        "electro": "雷",
        "anemo": "风",
        "geo": "岩",
        "phy": "物理",
        "dendro": "草",
    }
let dmgKeys =
    {
        "fire_dmg": "pyro",
        "water_dmg": "hydro",
        "ice_dmg": "cryo",
        "thunder_dmg": "electro",
        "wind_dmg": "anemo",
        "rock_dmg": "geo",
        "physical_dmg": "phy",
        "grass_dmg": "dendro",
    }

/** 旅行者在 miao 里有「旅行者 / 空 / 荧」等多种写法，队伍和手法里统一记为「旅行者」 */
const TRAVELER = '旅行者'
const TRAVELER_WORDS = /旅行者|主角?|空|荧|爷/g

/** 角色 → 队伍里使用的标准名 */
const stdName = (char) => (char.isTraveler ? TRAVELER : char.name)

/** 角色名/别名 → 标准名，无法识别返回 null */
function resolveName(name) {
  const char = Character.get(name)
  return char ? stdName(char) : null
}

/**
 * 把「角色换xx」接到队伍里对应队员的后面（按标准名匹配，支持别名）
 * @param {string[]} members 队员列表，会被直接修改
 * @param {string[]} tokens 换装 token
 * @returns {string} 找不到对应队员时返回「角色名」，否则返回空字符串
 */
function attachLoadouts(members, tokens) {
  for (const t of tokens) {
    const std = resolveName(parseMember(t).name)
    const idx = members.findIndex(c => resolveName(parseMember(c).name) === std)
    if (idx === -1) return `「${std}」`
    members[idx] += t.slice(t.indexOf('换'))
  }
  return ''
}

/** 旅行者写法里明确带了元素（草主、旅行者雷），返回 miao 元素 key */
function travelerElem(name, char) {
  return /[风岩雷草水火冰]/.test(name.replace(TRAVELER_WORDS, '')) ? char.elem : ''
}

/**
 * 计算队伍伤害
 * @param e 消息事件
 * @param {string[]} tokens 队伍成员（或队伍简写），后面可接自定义手法
 * @param uid 查询 uid
 * @param {'teyvat'|'gcsim'} engine 计算引擎：提瓦特小助手 / 本地 GCSim（测试版）
 */
export async function team(e, tokens, uid, engine = 'teyvat') {
  const gcsim = engine === 'gcsim'
  let {teamTokens: teamlist, comboTokens, loadoutTokens} = splitTeamAndCombo(tokens, resolveName)
  let inferred = false
  // 使用了带手法的队伍预设、且指令里没写手法时，记下预设名用于报错提示
  let presetCombo = ''
  if (!teamlist.length && comboTokens.length) {
    teamlist = inferTeam(comboTokens, resolveName)
    inferred = teamlist.length > 0
  }
  // 队伍简写，后面可跟临时换装：#队伍伤害雷九 雷神换六命 班尼特换精5
  // 带换装的队员（香菱换六命）本身不是简写；跟了换装时开头若是角色名，按普通队伍处理
  const isLoadoutMember = t => t.includes('换') && !!resolveName(parseMember(t).name)
  const [head = '', ...overrides] = teamlist
  const presetCandidate = !inferred && head && !isLoadoutMember(head) && overrides.every(isLoadoutMember) &&
    (!overrides.length || !resolveName(head))
  const preset = presetCandidate ? findPreset(head) : null
  if (preset) {
    const chars = [...preset.chars]
    // 接在预设自带的换装后面，同一项以指令里写的为准
    const err = attachLoadouts(chars, overrides)
    if (err) {
      await e.reply(`${err}不在队伍预设「${preset.name}」里（${chars.map(c => parseMember(c).name).join('、')}）`, true)
      return true
    }
    // 指令里写了手法优先用指令的，否则用预设手法，预设也没写则走小助手默认手法
    if (!comboTokens.length && preset.combo) {
      comboTokens = splitTokens(preset.combo)
      presetCombo = preset.name
    }
    teamlist = chars
  } else if (presetCandidate && !overrides.length) {
    await e.reply(`暂未发现[${head}]简写\n尝试识别为单人~`, true)
  } else if (teamlist.length === 0) {
    await e.reply(`请指定您要计算的队伍喵~\n\n${COMBO_USAGE}`, true)
    return true
  } else if (teamlist.length > 4) {
    if (inferred) {
      await e.reply(`手法里出现了超过 4 个角色：${teamlist.join('、')}`, true)
      return true
    }
    teamlist = teamlist.slice(0, 4)
  }

  // 写在手法里的换装（只写手法时只能写在这里）接到对应队员上
  if (loadoutTokens.length) {
    const err = attachLoadouts(teamlist, loadoutTokens)
    if (err) {
      await e.reply(`换装里的${err}不在队伍里（${teamlist.map(c => parseMember(c).name).join('、')}）`, true)
      return true
    }
  }

  // 队员可带换装：香菱换六命换精5
  let teamarId = []
  let loadouts = {}
  let wantTravelerElem = ''
  for (const v of teamlist) {
    const {name, mods, unknown} = parseMember(v.split('(')[0].trim())
    const char = Character.get(name)
    if (!char) {
      await e.reply(`队伍中存在未能识别的角色：${name}`)
      return true
    }
    const std = stdName(char)
    if (unknown.length) {
      await e.reply(`${std}的「换${unknown.join('换')}」看不懂\n${LOADOUT_USAGE}\n完整写法见 #队伍伤害帮助`, true)
      return true
    }
    if (teamarId.some(c => stdName(c) === std)) {
      await e.reply(`队伍里重复出现了「${std}」`, true)
      return true
    }
    if (char.isTraveler) wantTravelerElem = travelerElem(name, char)
    teamarId.push(char)
    if (!_.isEmpty(mods)) loadouts[std] = mods
  }

  // 手法在请求前解析，写错了不必等面板和接口
  let custom = null
  if (comboTokens.length) {
    custom = parseCombo(comboTokens, teamarId.map(stdName), resolveName)
    if (custom.error) {
      const where = presetCombo ? `队伍预设「${presetCombo}」的手法有误：` : ''
      await e.reply(`${where}${custom.error}\n\n${COMBO_USAGE}`, true)
      return true
    }
  }
  // GCSim 没有默认手法
  if (gcsim && !custom) {
    await e.reply(`#队伍模拟 需要写手法（或使用带手法的队伍预设），例如：\n#队伍模拟钟离，夜兰，行秋，胡桃 钟离长e，夜兰qe，行秋qe，胡桃e azk*3 q`, true)
    return true
  }

  let rolesData = {}
  let role_data = []
  let NoDataName = []
  let loadoutTips = []
  let loadoutWarns = []
  // GCSim 的队员数据，顺序与 role_data 一致
  let gcsimMembers = []
  let player = Player.create(uid)
  // role_data 的顺序即手法里的角色序号，必须按队伍顺序依次处理
  for (const v of teamarId) {
    let char = stdName(v)
    let profile = player.getProfile(v.id)
    if (!profile || !profile.hasData) {
      NoDataName.push(char)
      continue
    }
    const panel = await covProfileroleData(profile)
    const teyvatData = await covProfileTeyvatData(profile, uid)
    let loadoutElem
    if (loadouts[char]) {
      const {labels, warns, elem} = applyLoadout(teyvatData, panel, loadouts[char], profile)
      if (labels.length) loadoutTips.push(`${char}：${labels.join(' / ')}`)
      loadoutWarns.push(...warns)
      loadoutElem = elem
    }
    // 小助手的旅行者写作「旅行者 + 元素」；元素取换装指定的，否则取面板里当前的（面板只存最后一次更新时的元素）
    let teyvatName = char
    if (v.isTraveler) {
      const elem = loadoutElem || profile.elem
      if (!loadoutElem && wantTravelerElem && wantTravelerElem !== profile.elem) {
        const want = attrsKeys[wantTravelerElem]
        await e.reply(`面板里的旅行者是${attrsKeys[profile.elem]}元素，想算${want}主的话，请在游戏里切换到${want}元素后 #更新面板\n也可以写「旅行者换${want}」，用当前面板估算`, true)
        return true
      }
      if (elem === 'cryo' && !gcsim) {
        await e.reply('提瓦特小助手暂不支持冰主的伤害计算', true)
        return true
      }
      teyvatName = TRAVELER + attrsKeys[elem]
    }
    teyvatData.role = teyvatName
    rolesData[teyvatName] = panel
    role_data.push(teyvatData)
    if (gcsim) {
      const {member, error} = toGcsimMember(profile, teyvatData, panel, loadoutElem || profile.elem)
      if (error) {
        await e.reply(error, true)
        return true
      }
      gcsimMembers.push({...member, name: teyvatName, elem: loadoutElem || profile.elem})
    }
  }

  if (NoDataName.length > 0) {
    await e.reply(`UID${uid}：缺少${NoDataName.join('|')}\n请先通过【#更新面板】拿到对应角色数据。`, true)
    return true
  }
  let isData = role_data.map(v => v.role).join('|')
  const cfg = getConfig()
  // 满暴设置：小助手直接采用传入的暴击率
  const calcNotes = []
  const setCritFull = (item) => {
    item.crit = '100.0%'
    if (rolesData[item.role]) rolesData[item.role].fightProp['暴击率'] = 100
  }
  if (cfg.teamCritFull) {
    role_data.forEach(setCritFull)
    calcNotes.push('全队满暴')
  }
  // 具体手法会画在结果图里，这里只标注用的是自定义还是默认手法
  const tips = [`UID${uid}：${isData}`, `手法：[${custom ? '自定义' : '默认'}]`]
  if (gcsim) tips.push('计算：GCSim 本地模拟（测试版）')
  if (cfg.teamCritFull) tips.push('计算：全队满暴')
  else if (cfg.mainCritFull) tips.push('计算：主C满暴')
  if (loadoutTips.length) tips.push(`换装：${loadoutTips.join('；')}`)
  if (loadoutWarns.length) tips.push(`注意：${loadoutWarns.join('；')}`)
  // 提示信息按设置自动撤回，避免刷屏；关闭提示时仍发送换装警告
  if (cfg.sendTips !== false || loadoutWarns.length) {
    await e.reply(tips.join('\n'), false, { recallMsg: Math.min(120, Math.max(0, Number(cfg.tipsRecall) || 0)) })
  }
  if (gcsim) return gcsimTeam(e, {uid, cfg, custom, rolesData, gcsimMembers, calcNotes, preset})

  logger.info(logger.cyan(`[${pluginName}]队伍伤害[请求UID:${uid}]>>>${isData}${custom ? ` 手法:${JSON.stringify(custom.combo)}` : ''}${loadoutTips.length ? ` 换装:${loadoutTips.join('；')}` : ''}`))

  let TiwateBody = {uid, role_data, server: getServer(uid, true)}
  if (custom) TiwateBody.custom_combo = custom.combo

  let res = await getTeyvatData(TiwateBody)
  // 主 C 满暴：主 C 要算过一次才知道（输出占比最高的队员），把他改成满暴后再算一次
  if (res.ok && cfg.mainCritFull && !cfg.teamCritFull) {
    const main = mainCarry(res.result, role_data.map(v => v.role))
    const item = role_data.find(v => v.role === main)
    if (item) {
      const backup = { crit: item.crit, cp: rolesData[main]?.fightProp['暴击率'] }
      setCritFull(item)
      const res2 = await getTeyvatData(TiwateBody)
      if (res2.ok) {
        res = res2
        calcNotes.push(`主C满暴·${main}`)
      } else {
        // 第二次失败时退回原面板的结果
        item.crit = backup.crit
        if (rolesData[main]) rolesData[main].fightProp['暴击率'] = backup.cp
        logger.warn(`[${pluginName}] 主C满暴重算失败，使用原面板结果：${res2.msg}`)
      }
    }
  }
  if (!res.ok) {
    logger.error(`>>>[错误信息] ${res.msg}`)
    let msg = res.msg
    if (custom && res.empty) msg = '小助手拒绝了这套手法，可能是某个动作该角色无法使用（如普攻段数超出）'
    else if (custom && res.rejected) msg += '\n也可能是手法里有该角色无法使用的动作（如普攻段数超出），可去掉手法用默认轴试试'
    await e.reply(msg, true)
    return true
  }
  let data = await simpleTeamDamageRes(res.result, rolesData)
  data.custom = !!custom
  data.calcNotes = calcNotes
  // 用队伍简写计算时，标题显示简写名
  data.presetName = preset?.name || ''
  let ScreenData = screenData(e, data, cfg)
  let img = await puppeteer.screenshot('TeamDamage', ScreenData)
  await e.reply(img)
  return true
}

/** 用本地 GCSim 计算并出图 */
async function gcsimTeam(e, {uid, cfg, custom, rolesData, gcsimMembers, calcNotes, preset}) {
  const names = gcsimMembers.map(m => m.name)
  const config = buildConfig(gcsimMembers, custom.combo)
  logger.info(logger.cyan(`[${pluginName}]队伍模拟[UID:${uid}]>>>${names.join('|')} 手法:${JSON.stringify(custom.combo)}`))
  logger.debug(`[${pluginName}] GCSim 配置：\n${config}`)
  const res = await runGcsim(config, gcsimBin(cfg.gcsimPath), Object.fromEntries(gcsimMembers.map(m => [m.key, m.name])))
  if (!res.ok) {
    logger.error(`[${pluginName}] GCSim：${res.msg}`)
    await e.reply(res.missing ? `${res.msg}\n请先安装 GCSim，见插件 README 的「GCSim 本地计算」` : res.msg, true)
    return true
  }
  let parsed = parseSample(res.sample, gcsimMembers.map(m => ({...m, critFull: !!cfg.teamCritFull})))
  // 主 C 满暴：GCSim 日志里有每一击的暴击伤害，不用重新模拟，直接按必暴击重算主 C 的期望
  if (cfg.mainCritFull && !cfg.teamCritFull) {
    const main = parsed.pie_data2.find(p => names.includes(p.char))?.char
    if (main) {
      parsed = parseSample(res.sample, gcsimMembers.map(m => ({...m, critFull: m.name === main})))
      if (rolesData[main]) rolesData[main].fightProp['暴击率'] = 100
      calcNotes.push(`主C满暴·${main}`)
    }
  }
  let data = gcsimTeamDamageRes(parsed, rolesData, names, uid, custom.labels)
  data.custom = true
  data.calcNotes = calcNotes
  data.presetName = preset?.name || ''
  let img = await puppeteer.screenshot('TeamDamage', screenData(e, data, cfg))
  await e.reply(img)
  return true
}

/** 主 C：小助手结果里输出最高的队员（跳过绽放等非角色来源） */
function mainCarry(result, roles) {
    let best = ''
    let bestDmg = -1
    for (const item of result.chart_data || []) {
        const [name, dmg] = String(item.name || '').split('\n')
        const value = parseFloat(dmg) || 0
        if (roles.includes(name) && value > bestDmg) {
            best = name
            bestDmg = value
        }
    }
    return best
}

function screenData(e, data, cfg = {}) {
    const miaoRes = `${cwd}/plugins/miao-plugin/resources/`
    // 伤害记录里旅行者写作「草主」等，要对应到结果里的「旅行者草」
    const traveler = Object.keys(data.avatars).find(n => n.startsWith(TRAVELER))
    const viewName = (name) => {
        const std = resolveName(name)
        return std === TRAVELER ? traveler || null : std
    }
    return {
        ...buildScreenView(data, viewName, miaoRes, fs.existsSync),
        data,
        showDamages: cfg.showDamages !== false,
        showAvatars: cfg.showAvatars !== false,
        quality: 100,
        saveId: e.user_id,
        miaoRes,
        tplFile: `${pluginRoot}/resources/Teyvat/html.html`,
        /** 绝对路径 */
        pluResPath: `${pluginRoot}/resources/Teyvat/`,
    }
}

async function covProfileTeyvatData(profile, uid) {
    let char = profile.char
    let a = profile.attr
    let base = profile.base
    let attr = {}
    _.each(['hp', 'def', 'atk', 'mastery'], (key) => {
        let fn = (n) => Format.comma(n, key === 'hp' ? 0 : 1)
        attr[key] = fn(a[key])
        attr[`${key}Base`] = fn(base[key])
        attr[`${key}Plus`] = fn(a[key] - base[key])
    })
    _.each(['cpct', 'cdmg', 'recharge', 'dmg'], (key) => {
        let fn = Format.pct
        let key2 = key
        if (key === 'dmg' && a.phy > a.dmg) {
            key2 = 'phy'
        }
        attr[key] = fn(a[key2])
        attr[`${key}Base`] = fn(base[key2])
        attr[`${key}Plus`] = fn(a[key2] - base[key2])
    })
    let TeyvatData = {}
    TeyvatData["uid"] = uid;
    TeyvatData["role"] = profile.char.name;
    TeyvatData["role_class"] = profile.cons;
    TeyvatData["level"] = profile.level;
    TeyvatData["weapon"] = profile.weapon.name;
    TeyvatData["weapon_level"] = profile.weapon.level;
    TeyvatData["weapon_class"] = '精炼' + profile.weapon.affix + '阶';

    TeyvatData["hp"] = Format.int(attr.hp?.replace(/,/g, "") ?? "");
    TeyvatData["base_hp"] = Format.int(attr.hpBase?.replace(/,/g, "") ?? "");
    TeyvatData["attack"] = Format.int(attr.atk?.replace(/,/g, "") ?? "");
    TeyvatData["base_attack"] = Format.int(attr.atkBase?.replace(/,/g, "") ?? "");
    TeyvatData["defend"] = Format.int(attr.def?.replace(/,/g, "") ?? "");
    TeyvatData["base_defend"] = Format.int(attr.defBase?.replace(/,/g, "") ?? "");
    TeyvatData["element"] = Format.int(attr.mastery?.replace(/,/g, "") ?? "");

    TeyvatData["crit"] = attr.cpct;
    TeyvatData["crit_dmg"] = attr.cdmg;
    TeyvatData["heal"] = Format.pct(a.heal);
    TeyvatData["recharge"] = attr.recharge;
    for (const key in dmgKeys) {
        if (profile.elem === dmgKeys[key]) {
            TeyvatData[key] = Format.pct(a.dmg);
        } else {
            TeyvatData[key] = Format.pct(0);
        }
    }

    TeyvatData["physical_dmg"] = Format.pct(a.phy);

    TeyvatData["ability1"] = profile.talent.a.level;
    TeyvatData["ability2"] = profile.talent.e.level;
    TeyvatData["ability3"] = profile.talent.q.level;
    let artisDetail = profile.getArtisMark()
    let str_artifacts = ''
    for (const key in artisDetail.sets) {
        if (str_artifacts === '') {
            str_artifacts = key + artisDetail.sets[key];
        } else {
            str_artifacts = str_artifacts + '+' + key + artisDetail.sets[key];
        }
    }
    TeyvatData["artifacts"] = str_artifacts;
    let artifacts_detail = []
    const artisTypes = ['生之花', '死之羽', '时之沙', '空之杯', '理之冠']
    for (const key in profile.artis.artis) {
        const ar = profile.artis.artis[key]
        // 未穿戴圣遗物的槽位没有主词条，跳过
        if (!ar?.main) continue
        let m_artifacts_detail = {}
        m_artifacts_detail["artifacts_name"] = ar.name
        // 按槽位号确定部位，避免空槽位导致后面的部位错位
        m_artifacts_detail["artifacts_type"] = artisTypes[key - 1] || ''
        m_artifacts_detail["level"] = ar.level
        m_artifacts_detail["maintips"] = attrsKeys[ar.main.key]
        m_artifacts_detail["mainvalue"] = artisDetail.artis[key]?.main?.value?.replace(/,/g, "") ?? "";
        let m_t_i = 0
        for (const key_att in ar.attrs) {
            m_t_i = m_t_i + 1
            let a_n = ar.attrs[key_att].key
            let a_v = artisDetail.artis[key]?.attrs?.[key_att]?.value?.replace(/,/g, "") ?? "";
            m_artifacts_detail["tips" + m_t_i] = attrsKeys[a_n] + "+" + a_v
        }
        artifacts_detail.push(m_artifacts_detail);
    }
    TeyvatData["artifacts_detail"] = artifacts_detail;
    return TeyvatData;
}

async function covProfileroleData(profile) {
    let roleData = {}
    roleData['id'] = profile.char.id
    //let char_p_l = Character.get(profile.char.name)
    //roleData['rarity'] = profile.char.id
    roleData['name'] = profile.char.name
    // 头像、立绘所在目录名，旅行者为「空 / 荧」
    roleData['imgName'] = profile.char.name
    roleData['element'] = attrsKeys[profile.elem]
    roleData['fetter'] = profile.char.fetter
    roleData['cons'] = profile.cons
    roleData['level'] = profile.level
    let weapon = {}
    weapon["name"] = profile.weapon.name;
    weapon["rarity"] = profile.weapon.star;
    weapon["affix"] = profile.weapon.affix;
    weapon["level"] = profile.weapon.level;
    weapon["icon"] = profile.weapon.img;
    weapon["weaponPath"] = profile.weapon.type + '/' + profile.weapon.name;

    roleData['weapon'] = weapon
    let fightProp = {}
    fightProp["暴击率"] = profile.attr.cpct
    fightProp["暴击伤害"] = profile.attr.cdmg
    fightProp["生命值"] = profile.attr.hp
    fightProp["攻击力"] = profile.attr.atk
    fightProp["防御力"] = profile.attr.def
    fightProp["元素精通"] = profile.attr.mastery
    fightProp["治疗加成"] = profile.attr.heal
    fightProp["元素充能效率"] = profile.attr.recharge
    roleData['fightProp'] = fightProp

    let skill_a = {}
    skill_a['style'] = ''
    skill_a['icon'] = 'Skill_A_' + profile.char.name
    skill_a['level'] = profile.talent.a.level
    skill_a['originLvl'] = profile.talent.a.original
    if (profile.talent.a.level > profile.talent.a.original) {
        skill_a['style'] = 'extra'
    }

    let skill_e = {}
    skill_e['style'] = ''
    skill_e['icon'] = 'Skill_S_' + profile.char.name
    skill_e['level'] = profile.talent.e.level
    skill_e['originLvl'] = profile.talent.e.original
    if (profile.talent.e.level > profile.talent.e.original) {
        skill_e['style'] = 'extra'
    }

    let skill_q = {}
    skill_q['style'] = ''
    skill_q['icon'] = 'Skill_E_' + profile.char.name
    skill_q['level'] = profile.talent.q.level
    skill_q['originLvl'] = profile.talent.q.original
    if (profile.talent.q.level > profile.talent.q.original) {
        skill_q['style'] = 'extra'
    }

    let skills = {}
    skills['a'] = skill_a;
    skills['e'] = skill_e;
    skills['q'] = skill_q;
    roleData['skills'] = skills
    let artisDetail = profile.getArtisMark()
    roleData['relicSet'] = artisDetail.sets
    // 角色主要的伤害倍率属性：取 miao 圣遗物评分权重里最高的（同分时生命/防御/精通优先于攻击）
    const weight = artisDetail.charWeight || {}
    roleData['keyStat'] = [['hp', 'hp'], ['def', 'def'], ['mastery', 'em'], ['atk', 'atk']]
        .reduce((best, [k, v]) => ((weight[k] || 0) > (weight[best?.[0]] || 0) ? [k, v] : best), null)?.[1] || ''
    return roleData;
}

/**
 * 请求小助手队伍伤害
 * @param {Object} TBody {uid, server, role_data, custom_combo?}
 * @returns {Promise<{ok: true, result: Object} | {ok: false, msg: string, empty?: boolean, rejected?: boolean}>}
 *   empty：服务端返回空 body；rejected：服务端没算出结果。用了自定义手法时两者都可能是手法里有非法动作
 */
async function getTeyvatData(TBody) {
    let text
    try {
        const response = await fetch('https://api.lelaer.com/ys/getTeamResult.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: JSON.stringify(TBody),
            signal: AbortSignal.timeout(20000)
        })
        text = await response.text()
    } catch (error) {
        logger.info(error)
        return {ok: false, msg: '提瓦特小助手接口无法访问，请稍后重试'}
    }
    if (!text.trim()) return {ok: false, empty: true, msg: '提瓦特小助手返回为空'}
    let json
    try {
        json = JSON.parse(text)
    } catch (error) {
        return {ok: false, msg: '提瓦特小助手返回异常，请稍后重试'}
    }
    if (json.code !== 200 || !json.result) {
        return {ok: false, msg: json.info || json.tips || '提瓦特小助手接口返回错误'}
    }
    // 队伍不受支持、或手法里有非法动作时 zdl_result 为空，提示在 zdl_tips1
    if (!json.result.zdl_result) {
        return {ok: false, rejected: true, msg: json.result.zdl_tips1 || '提瓦特小助手没能算出这个队伍的伤害'}
    }
    return {ok: true, result: json.result}
}

/* eslint-disable camelcase */
import fs from 'node:fs'
import plugin from '../../../../lib/plugins/plugin.js'
import { team } from './getTeam.js'
import { splitTokens } from './combo.js'
import MysApi from './GetATUID.js'
import helpData from './helpData.js'
import { presetList } from './presetList.js'
import puppeteer from '../../../../lib/puppeteer/puppeteer.js'
import { pluginName, pluginRoot } from '../../model/path.js'

function getVersion () {
  try {
    return JSON.parse(fs.readFileSync(`${pluginRoot}/package.json`, 'utf8')).version
  } catch {
    return ''
  }
}

export class BotEntry extends plugin {
  constructor () {
    super({
      name: '提瓦特小助手',
      dsc: '提瓦特小助手',
      event: 'message',
      priority: 3141,
      rule: [
        {
          // 放在计算指令前面，否则「帮助」会被当成队伍名
          reg: /^#队伍伤害(帮助|说明|教程|用法)$/,
          fnc: 'help'
        },
        {
          // 同样要放在计算指令前面，否则「预设」会被当成队伍名
          reg: /^#队伍伤害预设列表$/,
          fnc: 'presetList'
        },
        {
          reg: /^#队伍伤害(?:详情|过程|全图)?(\d{9,10})?(.*)$/,
          fnc: 'TeyvatEnTry'
        }
      ]
    })
  }

  async help (e) {
    const img = await puppeteer.screenshot('TeamDamageHelp', {
      ...helpData,
      tplFile: `${pluginRoot}/resources/Teyvat/help.html`,
      pluResPath: `${pluginRoot}/resources/Teyvat/`,
      miaoRes: `${process.cwd().replace(/\\/g, '/')}/plugins/miao-plugin/resources/`,
      pluginName,
      version: getVersion(),
      saveId: 'help'
    })
    await e.reply(img)
    return true
  }

  async presetList (e) {
    return presetList(e)
  }

  async GetNowUid (e) {
    let NoteUser = e.user
    let Uid = NoteUser._regUid || NoteUser.uid
    if (!Uid) Uid = e.user.getUid('gs')
    return Uid
  }

  async TeyvatEnTry (e) {
    let at = e.at
    // 结果图固定展示伤害过程，旧的 详情/过程/全图 前缀仍兼容但不再区分
    const regexTeam = /^#队伍伤害(?:详情|过程|全图)?(\d{9,10})?(.*)$/
    const matchTeam = e.msg.match(regexTeam)
    let uid = matchTeam[1] ? matchTeam[1] : await this.GetNowUid(e)
    if (at) {
      let AT_UID = await MysApi.getAT_UID(e, 'all')
      if (!AT_UID) {
        AT_UID = (await redis.get(`genshin:id-uid:${at}`)) || (await redis.get(`Yz:genshin:mys:qq-uid:${at}`))
      }
      if (AT_UID) {
        uid = AT_UID
      } else {
        e.reply(`QQ:${at}尚未绑定uid~\n请该用户先【#绑定uid】`)
        return true
      }
    }
    let roleList = matchTeam[2]
    logger.info(e.msg)
    if (!uid) {
      e.reply('尚未绑定uid，请先【#绑定xxx】\n直接指定查询：#队伍伤害100000000钟离，阿贝多，可莉,魈')
      return true
    }
    if (!roleList) {
      e.reply('指令错误，使用例子：\n#队伍伤害(@张三)钟离，阿贝多，可莉，魈\n#队伍伤害100000000钟离，阿贝多，可莉，魈\n#队伍伤害钟离，班尼特，香菱，行秋 钟离长e，班尼特eq，香菱q，e', true, { recallMsg: 30 })
      return true
    }
    await team(e, splitTokens(roleList), uid)
    return true
  }
}

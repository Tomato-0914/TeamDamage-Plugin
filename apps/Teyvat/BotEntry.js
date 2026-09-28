/* eslint-disable camelcase */
import plugin from '../../../../lib/plugins/plugin.js'
import _ from 'lodash'
import { team } from './getTeam.js'
import MysApi from './GetATUID.js'

export class BotEntry extends plugin {
  constructor () {
    super({
      name: '提瓦特小助手',
      dsc: '提瓦特小助手',
      event: 'message',
      priority: 3141,
      rule: [
        {
          reg: /^#队伍伤害(详情|过程|全图)?(\d+)?(.*)$/,
          fnc: 'TeyvatEnTry'
        }
      ]
    })
  }

  async GetNowUid (e) {
    let NoteUser = e.user
    let Uid = NoteUser._regUid || NoteUser.uid
    if (!Uid) Uid = e.user.getUid('gs')
    return Uid
  }

  async TeyvatEnTry (e) {
    let at = e.at
    const regexTeam = /^#队伍伤害(详情|过程|全图)?(\d+)?(.*)$/
    const matchTeam = e.msg.match(regexTeam)
    let uid = matchTeam[2] ? matchTeam[2] : await this.GetNowUid(e)
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
    let roleList = matchTeam[3]
    let detail = !!matchTeam[1]
    logger.info(e.msg)
    if (!uid) {
      e.reply('尚未绑定uid，请先【#绑定xxx】\n直接指定查询：#队伍伤害100000000钟离，阿贝多，可莉,魈')
      return true
    }
    if (!roleList) {
      e.reply('指令错误，使用例子：\n#队伍伤害(@张三)钟离，阿贝多，可莉，魈\n#队伍伤害100000000钟离，阿贝多，可莉，魈', true, { recallMsg: 30 })
      return true
    }
    let splitter = ['\\s', ',', '，', '、', '。', '-', '\\|']
    let roleAfterList = roleList.trim().split(new RegExp(splitter.join('|'))) || []
    await team(e, _.compact(roleAfterList), uid, detail)
    return true
  }
}

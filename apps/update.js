import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import plugin from '../../../lib/plugins/plugin.js'
import common from '../../../lib/common/common.js'
import { pluginRoot, pluginName } from '../model/path.js'

const git = (...args) => new Promise(resolve => {
  execFile('git', args, { cwd: pluginRoot, windowsHide: true, timeout: 120000 }, (error, stdout, stderr) => {
    resolve({ error, stdout: String(stdout).trim(), stderr: String(stderr).trim() })
  })
})

let updating = false

export class Update extends plugin {
  constructor () {
    super({
      name: `${pluginName}-更新`,
      dsc: `从 git 远程拉取${pluginName}更新并重启`,
      event: 'message',
      priority: -20,
      rule: [
        { reg: '^#(强制)?更新队伍伤害$', fnc: 'update' }
      ]
    })
  }

  async update (e) {
    if (!e.isMaster) return false
    if (updating) {
      await this.reply('已有更新任务在进行中，请稍候…')
      return true
    }
    if (!fs.existsSync(path.join(pluginRoot, '.git'))) {
      await this.reply(`${pluginName}不是通过 git clone 安装的，无法自动更新。`)
      return true
    }

    updating = true
    try {
      const force = /强制/.test(e.msg)
      const oldHead = await this.head()
      await this.reply(`正在${force ? '强制' : ''}更新${pluginName}…`)

      const dirty = force && !!(await git('status', '--porcelain', '--untracked-files=no')).stdout
      const ret = force ? await this.forceSync() : await git('pull', '--ff-only')
      if (ret.error) {
        const detail = ret.stderr || ret.error.message
        logger.error(`[${pluginName}] 更新失败`, detail)
        const brief = detail.split('\n').filter(l => !/^From |->/.test(l.trim())).join('\n').trim()
        await this.reply(`更新失败：\n${brief.slice(0, 500)}${force ? '' : '\n\n可尝试 #强制更新队伍伤害'}`)
        return true
      }

      const newHead = await this.head()
      const time = (await git('log', '-1', '--date=format:%Y-%m-%d %H:%M', '--pretty=%cd')).stdout || '未知'
      if (oldHead === newHead) {
        if (!dirty) {
          await this.reply(`${pluginName}已是最新版本\n最后更新：${time}`)
          return true
        }
        await this.reply(`已丢弃本地改动，恢复为最新版本\n最后更新：${time}`)
        await this.restart()
        return true
      }

      const log = (await git('log', `${oldHead}..${newHead}`, '-n', '20', '--date=format:%m-%d %H:%M', '--pretty=[%cd] %s')).stdout
      await this.sendLog([
        `${pluginName}更新成功\n${oldHead.slice(0, 7)} → ${newHead.slice(0, 7)}\n最后更新：${time}`,
        `更新日志：\n${log || '（无）'}`
      ])
      await this.restart()
    } catch (err) {
      logger.error(`[${pluginName}] 更新异常`, err)
      await this.reply(`更新出错：${err.message}`)
    } finally {
      updating = false
    }
    return true
  }

  async forceSync () {
    let ret = await git('fetch', '--all')
    if (ret.error) return ret
    if (!(await git('rev-parse', '--symbolic-full-name', '@{u}')).error) return git('reset', '--hard', '@{u}')

    let remoteHead = await git('rev-parse', '--abbrev-ref', 'origin/HEAD')
    if (remoteHead.error) {
      await git('remote', 'set-head', 'origin', '--auto')
      remoteHead = await git('rev-parse', '--abbrev-ref', 'origin/HEAD')
      if (remoteHead.error) return remoteHead
    }
    const ref = remoteHead.stdout
    const branch = ref.replace(/^origin\//, '')
    ret = await git('checkout', '-f', '-B', branch, ref)
    if (!ret.error) ret = await git('branch', `--set-upstream-to=${ref}`, branch)
    return ret
  }

  async head () {
    return (await git('rev-parse', 'HEAD')).stdout
  }

  async sendLog (msgs) {
    try {
      await this.reply(await common.makeForwardMsg(this.e, msgs, `${pluginName}更新日志`))
    } catch {
      await this.reply(msgs.join('\n\n'))
    }
  }

  async restart () {
    try {
      const { Restart } = await import('../../other/restart.js')
      await new Restart(this.e).restart()
    } catch (err) {
      logger.error(`[${pluginName}] 自动重启失败`, err)
      await this.reply('自动重启失败，请发送 #重启 使更新生效。')
    }
  }
}

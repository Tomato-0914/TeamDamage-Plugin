import {exec} from "child_process";
import plugin from "../../../lib/plugins/plugin.js";
import {pluginRoot, pluginName} from "../model/path.js";

export class UpdatePlugin extends plugin {
    constructor() {
        super({
            name: `${pluginName}插件更新`,
            dsc: `${pluginName}插件更新`,
            event: 'message',
            priority: 1,
            rule: [
                {
                    reg: /^#测试(强制)?更新$/,
                    fnc: 'updateFanSKYPlugin',
                },
            ]
        })
    }

    async updateFanSKYPlugin(e) {
        if (!e.isMaster) {
            return true
        }
        let isForce = e.msg.includes('强制')
        let command = 'git  pull'
        if (isForce) {
            command = 'git  checkout . && git  pull'
            e.reply('正在执行强制更新操作，请稍等')
        } else {
            e.reply('正在执行更新操作，请稍等')
        }
        exec(command, {cwd: pluginRoot}, function (error, stdout, stderr) {
            if (/(Already up[ -]to[ -]date|已经是最新的)/.test(stdout)) {
                e.reply(`目前已经是最新版${pluginName}了~`)
                return true
            }
            if (error) {
                e.reply(`${pluginName}更新失败！\nError code: ` + error.code + '\n' + error.stack + '\n 请稍后重试。')
                return true
            }
            e.reply(`${pluginName}更新成功，请手动重启Yunzai-Bot以应用更新...`)
            return true
        })
        return true
    }
}

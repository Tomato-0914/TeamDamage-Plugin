import fs from 'fs'
import { pluginRoot, pluginName } from './model/path.js'

let Version
logger.info(logger.magenta(`'-------------QwQ--------------`))
try {
    Version = JSON.parse(fs.readFileSync(`${pluginRoot}/package.json`, 'utf-8'));
} catch (err) {
    Version = {version: "unknown"}
}
logger.info(logger.magenta(`----${pluginName}插件【${Version.version}】初始化中------`))
const files = fs.readdirSync(`${pluginRoot}/apps`).filter(file => file.endsWith('.js'))
let ret = []
files.forEach((file) => {
    ret.push(import(`./apps/${file}`))
})
ret = await Promise.allSettled(ret)
let apps = {}
let APackageFanError = 0
for (let i in files) {
    let name = files[i].replace('.js', '')
    if (ret[i].status !== 'fulfilled') {
        logger.error(`[${pluginName}]载入JS错误：${logger.red(name)}`)
        const ARegexFan = /Cannot find package '([^']+)'/;
        let AFanReaSon = ret[i].reason + ""
        const AMatchFan = AFanReaSon.match(ARegexFan);
        if (AMatchFan) {
            logger.warn(`请先在${logger.red(`plugins/${pluginName}`)}目录运行：${logger.red(`pnpm install`)}安装依赖`)
            logger.error(AFanReaSon)
            APackageFanError++
        } else {
            logger.error(ret[i].reason)
        }
        delete apps[name];
        continue
    }
    apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}
logger.info(logger.magenta(`----${pluginName}插件载入完成------`))
if (APackageFanError > 0) {
    logger.warn(logger.yellow(`---请按提示安装依赖，否则对应功能会无效喵！------`))
}
export {apps}

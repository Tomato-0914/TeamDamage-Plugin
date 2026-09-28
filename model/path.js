import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件根目录（按本文件位置计算，不依赖插件文件夹名） */
export const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/')

/** 插件文件夹名 */
export const pluginName = path.basename(pluginRoot)

import { pluginName } from '../model/path.js'

export default {
  name: pluginName,
  title: '队伍伤害',
  author: '@Tomato-0914',
  authorLink: 'https://github.com/Tomato-0914',
  link: 'https://github.com/Tomato-0914/TeamDamage-Plugin',
  isV3: true,
  isV2: false,
  description: '原神队伍伤害计算，支持自定义手法与队伍简写预设',
  // 显示图标，此为个性化配置
  // 图标可在 https://icon-sets.iconify.design 这里进行搜索
  icon: 'mdi:sword-cross',
  // 图标颜色，例：#FF0000 或 rgb(255, 0, 0)
  iconColor: '#d19f56'
  // 如果想要显示成图片，也可以填写图标路径（绝对路径）
  // iconPath: path.join(pluginRoot, 'resources/icon.png'),
}

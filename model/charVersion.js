import { Character } from '../../miao-plugin/models/index.js'

/**
 * 原神大版本分组，按角色 id 区间划分（角色 id 基本按实装顺序递增）
 * 少数不按顺序的角色在 extra 里单独指定；新版本角色 id 更大，会自动落到最后一组
 */
const GROUPS = [
  { key: '1', title: '1.X 蒙德 · 璃月', maxId: 48, extra: [10000051] }, // 优菈
  { key: '2', title: '2.X 稻妻', maxId: 66, extra: [10000002, 10000062] }, // 神里绫华、埃洛伊
  { key: '3', title: '3.X 须弥', maxId: 82, extra: [10000061] }, // 绮良良
  { key: '4', title: '4.X 枫丹', maxId: 99 },
  { key: '5', title: '5.X 纳塔', maxId: 118 },
  { key: '6', title: '6.X 挪德卡莱', maxId: Infinity }
]

/** 旅行者（空 / 荧 / 多元素旅行者）id 不在区间里，归到 1.X */
const TRAVELER = /^1000000[57]$|^20000000$/

/** 角色所属大版本分组的下标，无法识别的角色返回 -1 */
function groupIndex (name) {
  const char = Character.get(name)
  if (!char) return -1
  const id = Number(char.id)
  if (TRAVELER.test(String(id))) return 0
  const extra = GROUPS.findIndex(g => g.extra?.includes(id))
  if (extra >= 0) return extra
  return GROUPS.findIndex(g => id % 10000 <= g.maxId)
}

/**
 * 队伍所属的大版本：取队员中最新的那个版本，即这套队伍成型的版本
 * @param {string[]} chars 角色名（可以是别名）
 * @returns {{key: string, title: string}}
 */
export function teamVersion (chars) {
  const idx = Math.max(0, ...chars.map(groupIndex))
  return GROUPS[idx]
}

/** 大版本分组，从新到旧 */
export const versionGroups = [...GROUPS].reverse()

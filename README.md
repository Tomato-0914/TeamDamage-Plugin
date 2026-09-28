# TeamDamage-Plugin

Yunzai-Bot / Miao-Yunzai 原神队伍伤害插件，基于 [FanSky_Qs](https://github.com/AFanSKyQs/FanSky_Qs) 精简而来，只保留队伍伤害功能，并支持自定义手法。

## 前置要求

- [Miao-Yunzai](https://gitee.com/yoimiya-kokomi/Miao-Yunzai)
- [miao-plugin](https://gitee.com/yoimiya-kokomi/miao-plugin)（读取角色面板数据及渲染资源）

## 安装

在 `Miao-Yunzai` 根目录下：

```
git clone --depth=1 https://github.com/Tomato-0914/TeamDamage-Plugin.git ./plugins/TeamDamage-Plugin/
```

## 功能

| 指令 | 说明 |
|---|---|
| `#测试队伍伤害钟离，阿贝多，可莉，魈` | 使用已绑定的 uid 计算队伍伤害（最多 4 人，只写一个角色时按单人计算） |
| `#测试队伍伤害100000000钟离，阿贝多` | 指定 uid 计算 |
| `#测试队伍伤害@张三 钟离，阿贝多` | 计算被艾特用户的队伍 |
| `#测试队伍伤害雷九` | 使用队伍简写 |
| `#测试队伍伤害钟离，班尼特，香菱，行秋 钟离长e，班尼特eq，香菱q，e` | 自定义手法 |
| `#测试更新` / `#测试强制更新` | 更新插件（主人） |

计算前需先通过 `#更新面板` 获取对应角色的面板数据。

结果图依次展示：手法、伤害过程（逐条伤害，最后一条的时间即实际轴长）、Buff 情况。

### 自定义手法

队伍写完后接手法，从第一个能识别为动作的词开始都算手法。不写手法时使用小助手的默认手法。

也可以不写队伍、直接写手法，队伍按角色在手法中首次出现的顺序自动识别（此时第一个动作必须写角色名）：

```
#测试队伍伤害仆人e重击 希诺宁eaa 尼可eq 奶奶eq 仆人qea1a2a3a4a5a6
```

| 写法 | 含义 |
|---|---|
| `e` / `战技` | 元素战技 |
| `短e` / `点e` / `e1` | 短按元素战技 |
| `长e` / `长按e` / `e2` | 长按元素战技 |
| `q` / `大招` / `爆发` | 元素爆发 |
| `重击` / `zj` | 重击 |
| `a` / `普攻` / `平a` | 普攻，紧跟在同一角色普攻后时接续下一段（`aaa` = 第 1~3 段），否则为第 1 段 |
| `a1` ~ `a9` | 普攻第 N 段 |
| `等0.5` / `等待1s` | 等待（0.1 ~ 20 秒） |

- 动作前写角色名（支持别名）指定由谁执行，**省略角色名则沿用上一个角色**；第一个动作不写角色名时默认为队伍第一位
- 字母不区分大小写：`e` / `E`、`zj` / `ZJ` 均可
- 同一角色可连写：`班尼特eq` = 班尼特 E 接 Q
- 可重复：`a1*3`、`重击3次`、`e2x2`
- 至少需要 2 个技能动作
- 也可配合队伍简写：`#测试队伍伤害雷九 雷神e，九条裟罗e，万叶e，班尼特q，雷神q`

如果某个动作该角色无法使用（例如普攻段数超出），小助手会拒绝计算，去掉该动作即可。

### 队伍简写

默认简写见 `config/default_SimpleTeamArr.yaml`。如需自定义，复制该文件为同目录下的 `SimpleTeamArr.yaml` 后修改，修改即时生效。

## 致谢

- 伤害计算：提瓦特小助手
- [@AFanSKyQs](https://github.com/AFanSKyQs)（[FanSky_Qs](https://github.com/AFanSKyQs/FanSky_Qs) 原作者）
- [@yoimiya-kokomi](https://github.com/yoimiya-kokomi)（Miao-Yunzai、miao-plugin 资源与数据）
- [@monsterxcn](https://github.com/monsterxcn)（[nonebot-plugin-gspanel](https://github.com/monsterxcn/nonebot-plugin-gspanel)）

## 其他

- 严禁用于任何商业用途

# FanSky_Qs

Yunzai-Bot / Miao-Yunzai 插件，仅保留**原神队伍伤害**功能。

原项目：[AFanSKyQs/FanSky_Qs](https://github.com/AFanSKyQs/FanSky_Qs)

## 前置要求

- [Miao-Yunzai](https://gitee.com/yoimiya-kokomi/Miao-Yunzai)
- [miao-plugin](https://gitee.com/yoimiya-kokomi/miao-plugin)（读取角色面板数据及渲染资源）

## 安装

在 `Miao-Yunzai` 根目录下：

```
git clone --depth=1 https://github.com/AFanSKyQs/FanSky_Qs.git ./plugins/FanSky_Qs/
```

## 功能

| 指令 | 说明 |
|---|---|
| `#队伍伤害钟离，阿贝多，可莉，魈` | 使用已绑定的 uid 计算队伍伤害（最多 4 人，只写一个角色时按单人计算） |
| `#队伍伤害100000000钟离，阿贝多` | 指定 uid 计算 |
| `#队伍伤害@张三 钟离，阿贝多` | 计算被艾特用户的队伍 |
| `#队伍伤害详情...` | 附带伤害过程明细 |
| `#队伍伤害雷九` | 使用队伍简写 |
| `#fans更新` / `#fans强制更新` | 更新插件（主人） |

计算前需先通过 `#更新面板` 获取对应角色的面板数据。

### 队伍简写

默认简写见 `config/default_SimpleTeamArr.yaml`。如需自定义，复制该文件为同目录下的 `SimpleTeamArr.yaml` 后修改，修改即时生效。

## 致谢

- 伤害计算：提瓦特小助手
- [@yoimiya-kokomi](https://github.com/yoimiya-kokomi)（Miao-Yunzai、miao-plugin 资源与数据）
- [@monsterxcn](https://github.com/monsterxcn)（[nonebot-plugin-gspanel](https://github.com/monsterxcn/nonebot-plugin-gspanel)）

## 其他

- 严禁将 FanSky_Qs 用于任何商业用途

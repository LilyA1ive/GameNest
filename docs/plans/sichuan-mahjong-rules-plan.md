# 四川麻将规则自定义计划

## 背景

当前四川麻将只支持"血战到底"一种固定模式。据维基百科（成都麻将条目），正规玩法由两个核心开关组合出 4 种标准模式：
- **标准打法** — 只打缺
- **标准下雨** — + 杠牌刮风下雨
- **标准血战** — + 血战到底
- **血战下雨** — + 血战 + 刮风下雨

在此基础上，还有若干常见可选规则（一炮多响、查花猪、查大叫、最后四张自动胡、换三张）。

## 设计方案

### 选项传递机制

复用现有 `state._options` 通道：
- 服务端 `applyRuntimeState` 已将 `room.options` 写入 `state._options`
- 前端通过 `set_option {key, value}` 写入
- 新增 key 前缀 `mj_` 避免与其他游戏冲突

### 规则开关定义

| 选项 key | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `mj_bloodBattle` | bool | `true` | 血战到底（false = 一家胡就结束） |
| `mj_rain` | bool | `false` | 刮风下雨（杠牌即时扣分） |
| `mj_multiWinner` | bool | `false` | 一炮多响 |
| `mj_checkFlowerPig` | bool | `false` | 流局查花猪 |
| `mj_checkBigCall` | bool | `false` | 流局查大叫 |
| `mj_lastFourAutoWin` | bool | `false` | 最后四张自动胡 |
| `mj_swapThree` | bool | `false` | 换三张（血流成河变体） |

### 计分系统重构

当前：赢家 fan 分简单累加，无玩家间转账。
目标：支持血战 + 刮风下雨的完整计分。

**计分规则（官方）：**
- 基本分 = 6 分
- 倍数 = 2^(番数-1)，即 1番=×1, 2番=×2, 3番=×4, 4番=×8...
- 点炮：只有点炮的人输分
- 自摸：所有未胡的人输分
- 刮风（明杠）：收引杠者 2 倍 / 其他未胡者 1 倍（视直杠/弯杠）
- 下雨（暗杠）：收所有未胡者 2 倍

**数据结构：**
- `state.gangPayments[]` — 每家的杠收入流水（即时结算用）
- `round_end` 消息增加 `payments` 字段记录玩家间转账明细

## 实施步骤

### Step 1: 游戏目录 + 前端规则面板
- [ ] `game-catalog.js` 标记四川麻将支持自定义规则
- [ ] 等待房间（waiting room）房主看到规则开关面板
- [ ] `set_option` 写入 `mj_*` 字段

### Step 2: 血战开关
- [ ] `registerWin` 读取 `mj_bloodBattle`：false 时直接 `phase='over'`
- [ ] 一家胡结束模式下，`endOfRound` 正常结算

### Step 3: 一炮多响
- [ ] claim 阶段收集所有可胡玩家
- [ ] 按顺序处理多个赢家，都加入 `state.winners`
- [ ] 点炮者分别付给每个赢家

### Step 4: 刮风下雨
- [ ] 杠牌时即时计算得分变化，写入 `state.gangPayments`
- [ ] 流局时未听牌者退还刮风下雨所得（查大叫时）
- [ ] 前端显示杠收入提示

### Step 5: 流局查花猪/查大叫
- [ ] 牌摸完时检查未胡玩家
- [ ] 花猪（未打缺）赔付
- [ ] 未听牌赔付听牌者最大可能番

### Step 6: 最后四张自动胡
- [ ] 牌墙剩 4 张时标记
- [ ] 可胡玩家必须胡，不可过

### Step 7: 换三张
- [ ] 定缺前增加换牌阶段
- [ ] 玩家选 3 张同色牌，按出牌顺序与对家/下家交换

### Step 8: Bot 适配
- [ ] Bot 处理一炮多响（claim 时判断）
- [ ] Bot 处理换三张（选牌逻辑）
- [ ] Bot 处理刮风下雨（杠牌决策）

### Step 9: 测试 + 国际化
- [ ] 单元测试覆盖各规则组合
- [ ] 中英文文案

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `games/mahjong-sichuan.js` | 核心：规则开关、一炮多响、刮风下雨、流局查花猪/大叫、最后四张、换三张 |
| `games/lib/mahjong-core.js` | 计分：基本分×倍数制 |
| `bots/mahjong-sichuan.js` | Bot 适配新规则 |
| `server.js` | `endOfRound` 支持玩家间转账明细 |
| `public/js/renderers/mahjong.js` | 规则面板 UI、杠收入动画、换三张界面 |
| `public/js/game-catalog.js` | 标记支持自定义 |
| `lang/server-zh.js` / `server-en.js` | 新增文案 |
| `tests/mahjong-sichuan.test.js` | 新增测试 |

## 验证方式

1. `npm run check` 语法通过
2. `npm test` 全部测试通过
3. 手动测试：开房切换各规则组合，确认行为正确
4. 机器人对战：各规则下 bot 不报错

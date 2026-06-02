# 多人数据合同草案

## 目标

当前不实现服务端、不接 WebSocket、不做匹配。这个文件只预留实时多人需要的数据结构，确保单机的输入、回放、成绩和玩家档案以后能平滑接入房间同步。

第一版多人目标是小房间实时同场驾驶。服务端应做房间状态和成绩校验的最终权威；客户端可以做输入预测、插值渲染和本地手感保持。

## 版本

```txt
protocolVersion  当前草案为 1
tickRate         目标 60 Hz，最终以固定模拟 tick 为准
timeUnit         秒使用 number，tick 使用整数
distanceUnit     米
angleUnit        弧度，除非字段名显式写 deg
```

消息都应带：

```txt
type
protocolVersion
roomId
clientId
sentAt
```

`sentAt` 使用客户端本地 ISO 时间，只用于调试和延迟估计；服务端收到后应补自己的时间戳。

## PlayerProfile

本地玩家档案和多人玩家展示共用同一语义：

```txt
player.id        多人会话内玩家 id，由服务端分配
player.name      展示名，1..18 字符
player.color     车身颜色，#rrggbb
player.carId     车辆 id，当前为 baseline
```

单机本地档案只保存 `name / color`，多人入房时由客户端带上本地档案，服务端补 `id` 并校验长度和颜色格式。

## RoomState

房间状态：

```txt
roomId
status           lobby | countdown | racing | finished
trackId
carId
createdAt
startedAt
serverTick
players[]
results[]
```

规则：

- 一个房间只跑一条赛道。
- 第一版所有玩家使用同一 `trackId`，允许以后扩展不同 `carId`。
- `serverTick` 是服务端权威 tick。
- `players[]` 使用 PlayerState。
- `results[]` 使用 ResultReport。

## PlayerState

```txt
id
clientId
name
color
carId
status           joined | ready | racing | finished | disconnected
lastInputTick
finishTimeS
valid
```

`disconnected` 玩家可以在短时间内保留位置，由服务端策略决定是否允许重连。

## InputPacket

客户端按 tick 上报输入：

```txt
type             input
protocolVersion
roomId
clientId
playerId
baseTick
inputs[]
sentAt
```

输入帧：

```txt
inputs[].tick
inputs[].throttle    -1 | 0 | 1
inputs[].steer       -1 | 0 | 1
inputs[].reset       boolean
```

规则：

- `tick` 必须单调递增。
- `baseTick` 是本包第一帧 tick。
- 客户端可以批量发送多个输入帧，减少消息频率。
- 服务端忽略重复 tick；缺失 tick 可按上一次输入或空输入补齐，具体策略后续实测决定。
- `reset` 第一版只用于本地/调试；正式比赛中服务端可以拒绝或标记成绩无效。

## Snapshot

服务端定期广播权威状态：

```txt
type             snapshot
protocolVersion
roomId
serverTick
trackId
players[]
sentAt
```

玩家快照：

```txt
players[].id
players[].status
players[].x
players[].y
players[].bodyAngleRad
players[].moveAngleRad
players[].vx
players[].vy
players[].lapTimeS
players[].lapDistanceM
players[].lapProgress
players[].nextCheckpointIndex
players[].valid
```

客户端渲染远端玩家时使用快照插值；本地玩家可以先预测，再在收到权威快照后平滑纠正。

## ResultReport

成绩上报和服务端确认使用同一字段集合：

```txt
resultId
roomId
trackId
carId
player.id
player.name
player.color
timeS
valid
invalidReason
finishedAt
inputHash
replayRef
serverTick
```

规则：

- 单机排行榜的 `LeaderboardRecord` 与 `ResultReport` 应保持字段可映射。
- `inputHash` 用于后续校验输入流和回放一致性，当前只预留。
- `replayRef` 可以引用本地回放、服务端回放或缺省为空。
- 服务端确认的 `valid=false` 不应进入正式排行榜，但可以用于调试记录。

## 与单机数据的映射

```txt
playerProfile.name        -> player.name
playerProfile.color       -> player.color
getActiveCarId()          -> player.carId / result.carId
inputFrame.tick           -> inputs[].tick
inputFrame.throttle       -> inputs[].throttle
inputFrame.steer          -> inputs[].steer
ReplayRecord.keyframes    -> Snapshot 采样或回放导出
LeaderboardRecord         -> ResultReport 子集
```

当前单机仍使用浏览器 `localStorage`。多人实现前，不应为了这个合同引入服务端、账号、构建流程或新依赖。

## 实时多人原型方案

第一版原型只验证“同一房间内多车可见、能跑完、成绩可信度可解释”。不追求正式匹配、账号、观战、断线重连和全球低延迟。

### 拓扑

```txt
Browser Client  <-- WebSocket -->  Room Server
```

服务端职责：

- 创建和关闭房间。
- 分配 `roomId / player.id`。
- 接收、排序和缓存输入包。
- 以固定 tick 推进权威模拟。
- 广播权威快照。
- 判定完赛和成绩有效性。

客户端职责：

- 读取键盘并生成 InputPacket。
- 本地预测自己的车辆。
- 插值渲染远端车辆。
- 根据权威快照平滑纠正本地状态。
- 展示服务端确认的成绩。

### 房间流程

```txt
connect
  -> join_room
  -> room_state(lobby)
  -> ready
  -> countdown
  -> racing
  -> result_confirmed
  -> room_state(finished)
```

消息：

```txt
join_room       client -> server, 带 playerProfile、trackId 或 roomId
room_state      server -> client, 当前房间全量状态
ready           client -> server, 玩家准备
start_countdown server -> client, 服务端指定 startTick
input           client -> server, 批量输入帧
snapshot        server -> client, 权威状态
result_report   server -> client, 服务端确认成绩
leave_room      client -> server
error           server -> client
```

`start_countdown.startTick` 是服务端未来 tick。客户端收到后把本地比赛起点对齐到该 tick；如果网络慢导致已经错过 startTick，客户端立即进入 racing，并从最近快照追上。

### 输入预测

本地玩家：

```txt
1. 每个渲染帧读取键盘，写入 inputFrame。
2. 按固定 tick 聚合 inputFrame，生成 InputPacket。
3. 立即用同一输入推进本地预测状态。
4. 保存最近 N 个 tick 的输入和预测状态。
5. 收到服务端 snapshot 后，用 snapshot 覆盖对应 tick 的权威状态。
6. 从该 tick 之后重放本地输入到当前 tick。
7. 如果纠正距离很小，插值消除误差；如果过大，直接吸附到权威状态。
```

建议阈值：

```txt
softCorrectionDistanceM   0.5
hardCorrectionDistanceM   4.0
softCorrectionTimeS       0.12
inputBufferTicks          120
```

第一版可以先不做完整回滚重放，只做“本地预测 + 权威快照轻柔拉回”。如果手感明显被拉扯，再引入严格 rollback。

### 远端插值

远端玩家不预测，只插值：

```txt
renderTime = latestServerTime - interpolationDelay
```

建议：

```txt
snapshotRate             20 Hz
interpolationDelay       100 ms
maxExtrapolation         150 ms
```

当快照短暂丢失时，可最多外推 `maxExtrapolation`；超过后保持最后状态，并在 UI 上标记连接质量。

### 服务端权威边界

服务端权威：

- 房间状态。
- 起跑 tick。
- 每个玩家的权威车辆状态。
- 检查点通过顺序。
- 完赛时间。
- 成绩 `valid / invalidReason`。

客户端权威：

- 本地输入采集。
- 本地相机、HUD、音画反馈。
- 临时预测状态。
- 非排名用途的本地回放预览。

服务端不应信任客户端提交的 `timeS / lapDistanceM / checkpoint`。客户端可以提交这些字段用于调试，但正式结果必须由服务端模拟或校验得到。

### 成绩校验

最低校验：

```txt
trackId 匹配房间
carId 合法
input tick 单调递增
检查点顺序完整
finish tick 来自服务端模拟
未触发服务端禁止的 reset/debug 行为
```

增强校验：

```txt
inputHash 覆盖完整输入流
replayRef 指向服务端保存的输入流或关键帧
ResultReport.timeS 由 finishTick - startTick 计算
LeaderboardRecord 只接受服务端确认的 valid=true
```

### 延迟和丢包

客户端应显示但不必阻止比赛的网络指标：

```txt
pingMs
jitterMs
packetLossPct
serverTickDelta
```

处理策略：

- 输入包允许重复发送最近若干 tick，服务端按 tick 去重。
- 快照丢包时靠插值缓冲吸收。
- 客户端落后太多时，服务端发送全量 `room_state`。
- 玩家短断线时标记 `disconnected`，车辆可以按最后输入滑行或冻结，具体手感后续实测。

### 原型阶段停止条件

如果出现以下情况，先暂停实时多人，回到单机/回放基础修正：

- 固定 tick 模拟还不能从输入稳定复现车辆轨迹。
- 服务端和客户端同输入下漂移误差持续扩大。
- 快照纠正明显破坏驾驶手感。
- 检查点和成绩校验不能在服务端独立判断。
- 需要账号、部署、持久化服务或构建工具才能继续，而这些尚未单独确认。

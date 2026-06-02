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

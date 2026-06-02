# 单圈玩法和排行榜

## 目标

当前玩法是每条赛道跑一次记录一次成绩。排行榜只服务本地试玩和调参，不包含账号、联网、删除记录或反作弊。

## 游戏状态

游戏流程由 `gameState` 控制，单圈计时细节仍由 `lapState` 维护。`gameState` 是外层流程状态，后续菜单、结算页、回放和多人都从这里接入。

```txt
menu          页面加载前的初始状态
track_select 赛道选择状态，允许上下切换赛道和确认
countdown     已确认赛道，等待第一次给油起跑
racing        比赛计时中
finish_coast  完赛后的短暂滑行
result        完赛结果状态，车辆停止，等待后续重开或返回选择
replay        本地回放播放状态，只按关键帧驱动画面，不记录新成绩
```

当前 `countdown` 还不显示视觉倒计时，只表示赛道已经确认、车辆位于起点、等待玩家起跑。真正倒计时 UI 和起跑节奏在后续 checkpoint 单独实现。

状态流转：

```txt
menu
  -> track_select    数据加载完成

track_select
  -> countdown       确认赛道

countdown
  -> racing          第一次给油
  -> track_select    按 R 重置并返回选择

racing
  -> finish_coast    有效完赛
  -> track_select    按 R 重置并返回选择

finish_coast
  -> result          滑行时间结束

result
  -> track_select    按 R 重置并返回选择
  -> replay          点击结果面板 Replay

replay
  -> result          回放播放结束
  -> track_select    按 R 重置并返回选择
```

`isSessionStarted()` 在 `racing / finish_coast / result / replay` 返回 true，用于阻止比赛中或回放中切换赛道。`track_select` 和 `countdown` 仍允许选择或重新确认赛道。

## 完赛规则

环形赛道：

- 从 `Ready` 状态开始，第一次加速进入 `Run`。
- 沿赛道方向累计单圈进度。
- 按顺序通过所有检查点后，才能通过终点或累计达到赛道长度完成单圈。
- 完赛时间取冲线当帧的 `lapTime`。

直线赛道：

- 赛道数据用 `finishDistanceM` 定义完赛距离。
- 从 `Ready` 状态开始，第一次加速进入 `Run`。
- 实际行驶距离达到 `finishDistanceM` 时完成。
- 完赛时间取达到距离当帧的 `testTime`。

完成后进入 `Coast`，车辆滑行约 2 秒后进入 `Finish`。滑行只做视觉收尾，不再改变成绩时间。

## 检查点

环形赛道支持可选 `checkpoints` 字段，用于防止抄近道和从终点附近倒绕完赛：

```txt
checkpoints[].progressM  从起点沿赛道中心线累计的进度, m
```

如果赛道没有显式配置 `checkpoints`，运行时会按赛道长度自动生成 4 个默认检查点：

```txt
lapLengthM * 1 / 5
lapLengthM * 2 / 5
lapLengthM * 3 / 5
lapLengthM * 4 / 5
```

规则：

- 检查点必须按 `progressM` 从小到大依次通过。
- 一帧内可以跨过多个检查点。
- 通过终点但检查点未全部通过时，不记录成绩，也不进入完赛滑行。
- 直线赛道不使用检查点，仍按 `finishDistanceM` 完赛。

## 结算流程

进入 `result` 后显示本次成绩：

```txt
trackName
timeS
player.name
player.color
rank
total
isBest
```

操作：

- `Enter` / `Space`：重开当前赛道。
- `R`：复位并返回赛道选择。
- 结果面板上的 `Retry`、`Replay` 和 `Tracks` 按钮提供重开、回放和返回选择入口。

## 回放记录

每次有效完赛会保存一条本地回放记录。回放先服务 Ghost 和多人前的数据验证，不参与碰撞，也不会再次记录成绩。

存储位置：浏览器 `localStorage`。

```txt
key: night-rally.replays.v1
```

记录字段：

```txt
id
version
trackId
trackName
timeS
player.name
player.color
createdAt
inputs[].tick
inputs[].throttle
inputs[].steer
keyframes[].t
keyframes[].x
keyframes[].y
keyframes[].bodyAngleRad
keyframes[].moveAngleRad
```

当前回放播放使用关键帧插值，只做视觉回放。输入流也会一起保存，后续固定 tick 模拟完成后，可以用输入流重放出更严格的 Ghost。

## Ghost 车

比赛中会读取当前赛道最快有效成绩的 `replayRef`。如果能找到对应本地回放记录，则按当前比赛时间采样关键帧，绘制一个半透明 Ghost 车。旧成绩里的 `replayId` 会在读取时兼容转换成 `replayRef`。

规则：

- Ghost 只做视觉参考，不参与碰撞。
- Ghost 不影响地表、成绩、完赛判断和排行榜。
- 当前 Ghost 使用关键帧插值，后续固定 tick 完成后再改成输入流重放。

## 成绩记录

每次有效完赛记录一条：

```txt
version
trackId
trackName
carId
player.name
player.color
timeS
distanceM
valid
replayRef.type
replayRef.id
createdAt
```

字段语义：

```txt
version         当前为 2
trackId         赛道 id
trackName       记录时的赛道显示名
carId           车辆 id，当前 baseline 车辆为 baseline
player          本地玩家档案快照，包含 name 和 color
timeS           完赛时间, s
distanceM       计时距离，环形赛道为单圈长度，直线为 finishDistanceM
valid           当前只保存 true；以后可用于无效成绩留痕
replayRef       可选本地回放引用，当前格式为 { type: "localStorage", id }
createdAt       ISO 时间
```

同一次完赛只能记录一次。重置并重新开始后可以再次记录。读取旧数据时会把缺少 `version / carId / player / valid / replayRef` 的记录正规化到当前结构；坏数据会被忽略。

## 排行榜

- 存储位置：浏览器 `localStorage`。
- key：`night-rally.leaderboard.v1`。
- 存储上限：每条赛道保留最快 50 条。
- 展示上限：当前赛道最快 Top 20。
- 排序：按 `timeS` 从小到大。
- 容错：读取到坏数据时忽略坏记录或回退为空数据。

存储结构按赛道分组：

```txt
{
  [trackId]: LeaderboardRecord[]
}
```

导入时支持当前分组结构，也支持扁平 `records: LeaderboardRecord[]`。合并时按 `trackId / carId / createdAt / timeS / replayRef` 去重，然后每条赛道只保留最快 50 条。

## 本地记录文件

排行榜面板提供 `Export` / `Import`。运行时仍使用浏览器存储；JSON 文件只作为手动备份、迁移和后续本地文件能力的合同。

导出文件名：

```txt
night-rally-records-YYYYMMDD.json
```

导出结构：

```txt
type                      night-rally.local-records
version                   当前为 1
exportedAt                ISO 时间
leaderboardVersion        当前成绩记录版本，当前为 2
replayVersion             当前回放记录版本，当前为 1
leaderboard               同 localStorage 的 night-rally.leaderboard.v1
replays                   同 localStorage 的 night-rally.replays.v1
```

导入规则：

- 导入文件会与当前浏览器里的成绩和回放合并，不会先清空本地数据。
- 成绩按当前排行榜正规化规则过滤、排序和截断。
- 回放按 `id` 去重，并保留最新 30 条。
- 导入坏 JSON 或坏结构时不写入，并在面板显示失败状态。

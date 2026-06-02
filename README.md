# Night Rally

Night Rally 是一个纯 H5 Canvas 的俯视角街机赛车手感原型。当前重点是单圈玩法、赛道数据和可量化的车辆运动模型。

## 启动

在仓库根目录启动静态服务：

```sh
python3 -m http.server 5173
```

然后打开：

```text
http://localhost:5173
```

不要直接用 `file://` 打开 `index.html`。页面会通过 `fetch` 读取 `data/` 下的车辆和赛道 JSON，直接打开文件时大多数浏览器会拦截这些请求。

## 玩法

进入页面后，右侧会显示赛道列表。当前有：

- 浙江国际赛车场
- 北京金港国际赛车场
- 3公里直道

选中赛道后开始单圈驾驶。真实赛道跑完一圈后，车辆会短暂滑行并停下；直道跑满 3 公里后也会结束。

完赛后会显示本次成绩和当前赛道排名。按 `Enter` / `Space` 可以重开当前赛道，按 `R` 可以复位并回到赛道选择；结果面板里的 `Replay` 可以播放本次完赛回放。再次比赛时，如果当前赛道有最快成绩回放，会显示半透明 Ghost 车作为参考。

每次有效完赛都会记录一次成绩。右侧赛道面板会显示当前赛道最快 Top 20；成绩和回放默认保存在当前浏览器的 `localStorage` 中，不会自动同步到其他设备。排行榜面板里的 `Export` / `Import` 可以把本地成绩和回放索引导出或导入为 JSON 文件。

## 操作

选赛道：

- `W` / `ArrowUp`：上一个赛道
- `S` / `ArrowDown`：下一个赛道
- `A` / `ArrowLeft`：确认赛道
- `D` / `ArrowRight`：确认赛道
- `Enter` / `Space`：确认赛道

驾驶：

- `W` / `ArrowUp`：加速
- `S` / `ArrowDown`：刹车 / 倒车
- `A` / `ArrowLeft`：左转
- `D` / `ArrowRight`：右转
- `R`：复位并回到赛道选择

## 数据

- 车辆数据：`data/cars/baseline.json`
- 赛道列表：`data/tracks/index.json`
- 赛道文件：`data/tracks/*.json`
- 成绩存储：浏览器 `localStorage` 的 `night-rally.leaderboard.v1`
- 回放存储：浏览器 `localStorage` 的 `night-rally.replays.v1`
- 玩家档案：浏览器 `localStorage` 的 `night-rally.playerProfile.v1`
- 本地记录文件：排行榜面板导出的 `night-rally-records-YYYYMMDD.json`

## 规格

- `specs/handling-model.md`：横向操控和漂移手感模型
- `specs/longitudinal-speed.md`：纵向速度曲线模型
- `specs/lap-gameplay.md`：单圈、检查点、回放、Ghost 和排行榜
- `specs/multiplayer-contract.md`：未来实时多人房间、输入、快照和成绩合同

新增赛道时，在 `data/tracks/` 新建赛道 JSON，再把它加入 `data/tracks/index.json`。

## 调参

车辆手感主要在 `data/cars/baseline.json` 和 `src/main.js` 的运动算法中调整。改完后刷新浏览器，先试玩确认手感，再继续下一轮微调。

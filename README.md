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

选中赛道后开始单圈驾驶。真实赛道跑完一圈后，车辆会短暂滑行并停下；直道用于加速和操控测试。

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

新增赛道时，在 `data/tracks/` 新建赛道 JSON，再把它加入 `data/tracks/index.json`。

## 调参

车辆手感主要在 `data/cars/baseline.json` 和 `src/main.js` 的运动算法中调整。改完后刷新浏览器，先试玩确认手感，再继续下一轮微调。

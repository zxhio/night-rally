# 车辆纵向速度模型

## 模型概述

加速和刹车的速度不从物理公式计算，而是从实测曲线查表。

曲线存了一组 (速度, 时间, 距离) 数据点。车辆在曲线上"走"——每帧推进 dt，从曲线读出新速度。

每帧核心步骤：**当前速度 → 反查曲线位置 → 推进 dt → 读新速度、算位移**。

怠速滑行没有实测数据，用阻力公式直接算。

所有模型每帧统一产出 `speedKmhNext` 和 `distanceDeltaM`，写回持久状态。

## 命名规则

```txt
Kmh       km/h
Ms        m/s
M         meter
S         second
Next      下一帧
Delta     本帧增量
```

## 每帧流程

```
input, dt
    ↓
speedKmh → speedAbsKmh → speedMs
                  → dir
    ↓
输入状态判定 → 选择模型
    ↓
模型计算 → speedKmhNext, distanceDeltaM
    ↓
speedKmh   ← speedKmhNext
distanceM  ← distanceM + distanceDeltaM
    ↓
gHud, renderX
```

## 变量

帧间持久：

```txt
speedKmh        带方向速度, km/h
distanceM       累计距离, m
```

每帧只读：

```txt
input           玩家输入, -1 / 0 / 1
dt              帧时间, s
g0              9.80665
```

从 speedKmh 派生（每帧计算）：

```txt
speedAbsKmh     abs(speedKmh)
speedMs         speedAbsKmh / 3.6
dir             speedAbsKmh > 0 ? sign(speedKmh) : sign(input)
```

所有模型统一产出：

```txt
speedKmhNext    下一帧速度 → 写回 speedKmh
distanceDeltaM  本帧位移   → 累加到 distanceM
```

## 输入状态

```txt
speedKmh > 0 and input > 0  => forward_accel
speedKmh < 0 and input < 0  => reverse_accel
speedKmh > 0 and input < 0  => brake
speedKmh < 0 and input > 0  => brake
speedKmh = 0 and input > 0  => forward_accel
speedKmh = 0 and input < 0  => reverse_accel
speedKmh = 0 and input = 0  => stationary
input = 0 and speedKmh != 0 => idle_coast
```

## 公共输出

HUD G：

```txt
speedMsNext = abs(speedKmhNext) / 3.6
gHud = (speedMsNext - speedMs) / dt / g0
```

渲染：

```txt
renderX = distanceM * PX_PER_METER
```

---

## 曲线 API

`accelCurve` 和 `brakeCurve` 都提供相同的方法：

```txt
.speedAt(t)      曲线时间 → 速度 km/h
.timeAt(speed)   速度 → 曲线时间（反查）
.distanceAt(t)   曲线时间 → 累计距离 m
```

曲线约束：

```txt
points 按 timeS 升序排列
相邻点不能有相同 speedKmh
timeAt(speed) 使用 speed 范围 clamp，不外推
speedAt(t) 和 distanceAt(t) 使用 t 范围 clamp，不外推

accelCurve.speedKmh 随 timeS 严格递增
brakeCurve.speedKmh 随 timeS 严格递减
```

内部实现 — 区间 `[p0, p1]` 内 (`p0.timeS ≤ t ≤ p1.timeS`) 线性插值：

```txt
ratio = (t - p0.timeS) / (p1.timeS - p0.timeS)

.speedAt(t) =
  p0.speedKmh + (p1.speedKmh - p0.speedKmh) * ratio

.timeAt(speed) =
  p0.timeS + (p1.timeS - p0.timeS)
    * (speed - p0.speedKmh) / (p1.speedKmh - p0.speedKmh)
```

距离带校准系数：

```txt
rawSegmentDistanceM =
  (p0.speedKmh / 3.6 + p1.speedKmh / 3.6) / 2 * (p1.timeS - p0.timeS)

distanceScale =
  measuredDistanceExists
    ? (p1.distanceM - p0.distanceM) / rawSegmentDistanceM
    : 1

.distanceAt(t) =
  p0.distanceM
  + distanceScale
    * (p0.speedKmh / 3.6 + .speedAt(t) / 3.6) / 2
    * (t - p0.timeS)
```

---

## 静止

```txt
speedKmhNext = 0
distanceDeltaM = 0
distanceMNext = distanceM
```

---

## 加速

```txt
accelTime     = accelCurve.timeAt(speedAbsKmh)
accelTimeNext = min(accelTime + dt, accelCurve.maxTimeS)

speedKmhNext  = dir * accelCurve.speedAt(accelTimeNext)

distanceDeltaM =
  dir * (accelCurve.distanceAt(accelTimeNext) - accelCurve.distanceAt(accelTime))

distanceMNext = distanceM + distanceDeltaM
```

---

## 倒车加速

```txt
reverseAccelScale = 0.5
reverseMaxKmh = 60
```

倒车速度映射到前进曲线（例如倒车 30 km/h 查前进曲线 60 km/h 处的加速度）：

```txt
accelTime     = accelCurve.timeAt(speedAbsKmh / reverseAccelScale)
accelTimeNext = min(accelTime + dt, accelCurve.maxTimeS)

speedAbsNextKmh =
  min(accelCurve.speedAt(accelTimeNext) * reverseAccelScale, reverseMaxKmh)

speedKmhNext = -speedAbsNextKmh

distanceDeltaM =
  -((speedAbsKmh / 3.6 + speedAbsNextKmh / 3.6) / 2) * dt

distanceMNext = distanceM + distanceDeltaM
```

---

## 刹车

### ≤ 100 km/h

```txt
brakeTime     = brakeCurve.timeAt(speedAbsKmh)
brakeTimeNext = min(brakeTime + dt, brakeCurve.maxTimeS)

speedKmhNext  = dir * brakeCurve.speedAt(brakeTimeNext)

distanceDeltaM =
  dir * (brakeCurve.distanceAt(brakeTimeNext) - brakeCurve.distanceAt(brakeTime))

distanceMNext = distanceM + distanceDeltaM
```

### > 100 km/h

```txt
brakeHighG     = -1.12
brakeHighAccel = brakeHighG * g0
speed100Ms     = 100 / 3.6
```

本帧不跨过 100：

```txt
speedMsNext = speedMs + brakeHighAccel * dt
speedKmhNext = dir * speedMsNext * 3.6

distanceDeltaM = dir * (speedMs + speedMsNext) / 2 * dt
distanceMNext = distanceM + distanceDeltaM
```

本帧跨过 100：

```txt
timeTo100S = (speed100Ms - speedMs) / brakeHighAccel
timeInCurveS = dt - timeTo100S

distanceHighM = dir * (speedMs + speed100Ms) / 2 * timeTo100S

brakeTime100 = brakeCurve.timeAt(100)
brakeTimeNext = min(brakeTime100 + timeInCurveS, brakeCurve.maxTimeS)
distanceCurveM =
  dir * (brakeCurve.distanceAt(brakeTimeNext) - brakeCurve.distanceAt(brakeTime100))

speedKmhNext = dir * brakeCurve.speedAt(brakeTimeNext)
distanceDeltaM = distanceHighM + distanceCurveM
distanceMNext = distanceM + distanceDeltaM
```

---

## 怠速滑行

```txt
rollingResistanceFloor = 0.7
drag = 0.035
```

```txt
idleAccel = -(rollingResistanceFloor + drag * speedMs * speedMs)

speedMsNext = max(0, speedMs + idleAccel * dt)
if speedMsNext < 0.05: speedMsNext = 0

speedKmhNext = dir * speedMsNext * 3.6

distanceDeltaM = dir * (speedMs + speedMsNext) / 2 * dt
distanceMNext = distanceM + distanceDeltaM
```

---

## 曲线数据构建（离线）

### 加速曲线

数据源：

```txt
point.speedKmh       静止起步速度点
point.timeS          从 0 起步累计时间
point.distanceM      从 0 起步累计距离

pull.startSpeedKmh   滚动加速起点速度
pull.localTimeS      从 startSpeedKmh 开始的局部时间
pull.localDistanceM  从 startSpeedKmh 开始的局部距离

mark.speedKmh        距离锚点速度
mark.timeS           距离锚点时间
mark.distanceM       距离锚点距离
```

pulls 转全局：

```txt
anchorTimeS = points.timeAt(pull.startSpeedKmh)
anchorDistanceM = points.distanceAt(pull.startSpeedKmh)

pull.globalTimeS = anchorTimeS + pull.localTimeS
pull.globalDistanceM = anchorDistanceM + pull.localDistanceM
```

合并主曲线：

```txt
accelCurve = sortByTime(points + pullsGlobal + marks)
```

如果不同来源的锚点导致相邻点时间不递增（例如距离锚点和速度锚点非常接近但有测量误差），构建时跳过后一个点，保证最终曲线的 `timeS` 和 `speedKmh` 都严格单调。

车辆实测数据不写在本 spec 里。按车型放在 `data/cars/*.json`，运行时或离线构建工具从 data 文件读取：

```txt
vehicle.max       最高车速 km/h
vehicle.dim       车辆尺寸
vehicle.points    静止起步速度-时间-距离点
vehicle.marks     距离锚点
vehicle.pulls     滚动加速测试
vehicle.brake     刹车测试
vehicle.tail      高速尾段估算规则
```

### 刹车曲线

刹车曲线同样从车型 data 构建，不在 spec 内写具体车型数据：

```txt
brake.from             刹车起点速度
brake.total.to         刹车终点速度
brake.total.t          总耗时
brake.total.d          总距离
brake.points[].to      每段结束速度
brake.points[].t       从 brake.from 开始的累计时间
brake.points[].d       从 brake.from 开始的累计距离
```

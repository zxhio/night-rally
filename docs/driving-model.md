# Driving Model

本文档描述 Night Rally v0.1 的车辆运动算法。当前目标是爽滑、可控的俯视角街机手感，不做真实车辆物理模拟。

## 核心想法

车辆每帧维护 3 个核心状态：

```js
car.x
car.y
car.angle
car.vx
car.vy
```

`angle` 是车头方向。`vx / vy` 是实际移动速度。
好玩的地方来自两者不完全一致：车头已经转过去了，但速度还带着上一瞬间的惯性继续滑。

## 速度单位

`TUNING` 里的速度使用游戏内单位，不直接等于 Canvas 像素速度。

```js
SPEED_SCALE = 4
pixelSpeed = gameSpeed * SPEED_SCALE
gameSpeed = pixelSpeed / SPEED_SCALE
```

这样做的原因：

- HUD 可以显示接近真实语义的速度，比如最高速度 `80`。
- 未来装备升级可以从 `80` 往上加，不会让数值膨胀到几百。
- Canvas 内部仍然有足够的像素速度，让画面移动正常。

当前约定：

```js
TUNING.maxSpeed = 80
```

## 坐标约定

- `x` 向右增加。
- `y` 向下增加。
- `angle = 0` 表示车头朝右。
- `forward = { x: cos(angle), y: sin(angle) }`
- `right = { x: -forward.y, y: forward.x }`

## 每帧更新顺序

当前实现对应 `src/main.js` 的 `update(dt)`。

### 1. 读取输入

```text
throttle = 1  油门
throttle = -1 刹车 / 倒车
steer = -1    左转
steer = 1     右转
```

键盘输入会先经过转向缓冲：

```js
steeringInput = moveToward(steeringInput, rawSteer, rate * dt)
```

当前配置：

```js
steerBuildRate: 4.2
steerReleaseRate: 7.5
```

含义：

- 按下方向键不会立刻满打方向，而是快速推过去。
- 松开方向键会更快回中。
- 短按/轻打不容易直接触发大角度漂移。

键位：

- `W` / `ArrowUp`：油门
- `S` / `ArrowDown`：刹车 / 倒车
- `A` / `ArrowLeft`：左转
- `D` / `ArrowRight`：右转
- `R`：重置

### 2. 根据当前车头计算转向能力

先用当前车头方向计算车头方向速度：

```js
facingSpeed = dot(velocity, facing)
speedRatio = abs(facingSpeed) / maxSpeed
```

代码里实际使用的是像素速度：

```js
maxSpeedPx = toPixels(TUNING.maxSpeed)
speedRatio = abs(facingSpeed) / maxSpeedPx
```

转向能力不是固定值：

```js
steerPower = lowSpeedFactor * highSpeedPenalty
```

当前规则：

- 低速时至少保留一点转向能力。
- 速度上来后转向更有效。
- 接近极速时略微变钝。
- 倒车时转向方向反过来。

目的：低速不笨重，高速不乱甩。

### 3. 更新车头角度

```js
car.angle += steer * turnRate * steerPower * reverseTurn * dt
```

这里改变的是车头方向，不是直接改变移动方向。
移动方向要等后面通过速度分解和抓地力慢慢跟上。

### 4. 分解速度

用新的车头方向，把当前速度分解成两个标量：

```js
forwardSpeed = dot(velocity, forward)
sideSpeed = dot(velocity, right)
```

含义：

- `forwardSpeed`：沿车头方向的速度。
- `sideSpeed`：车身横向滑动速度。

俯视角街机赛车的手感主要由 `sideSpeed` 控制。
`sideSpeed` 越大，车越在横滑；`sideSpeed` 被消掉得越快，抓地越强。

### 5. 油门、刹车、倒车

油门只影响 `forwardSpeed`。加速度会随速度升高逐渐变弱：

```js
speedRatio = forwardSpeed / maxSpeed
engineCurve = pow(1 - speedRatio, accelerationFalloff)
engineAcceleration = acceleration * engineCurve
forwardSpeed += engineAcceleration * throttleScale * dt
```

代码里会先把游戏单位转换成像素单位：

```js
forwardSpeed = applyThrottle(forwardSpeed, maxSpeedPx, throttleScale, dt)
```

`applyThrottle` 的规则：

```js
speedRatio = 0    => full acceleration
speedRatio = 0.5  => weaker acceleration
speedRatio -> 1   => very weak acceleration
```

当前配置：

```js
accelerationFalloff: 0.9
```

含义：速度越接近 `maxSpeed`，发动机提供的加速度越弱。

代码里还会在高速区补一点 `topSpeedHold`，用于抵消接近最高速时的阻力：

```js
topSpeedHold = (dragLossAtMax + rollingLoss) * speedRatio * speedRatio
```

没有这项时，`drag` 和 `rollingResistance` 会让车稳定卡在最高速以下。它不是额外冲刺，而是让车辆可以慢慢贴近 `maxSpeed`。

漂移时油门有效性会降低：

```js
throttleScale = 1 - driftAmount * (1 - driftThrottlePower)
```

当前 `driftThrottlePower = 0.35`，表示满漂移时油门只剩 35% 效果。

刹车逻辑分两段：

```text
如果还在向前快跑，S 是刹车。
如果前向速度已经很低，S 进入倒车。
```

这样比“按 S 立刻反向加速”更像街机赛车。

### 6. 判断是否漂移

当前漂移不是只看横向速度，还看大角度转向带来的负载：

```js
steerAmount = abs(steer)
hardSteer = clamp((steerAmount - 0.72) / 0.28, 0, 1)
turnLoad = hardSteer * abs(forwardSpeed) * speedRatio
driftLoad = abs(sideSpeed) + turnLoad * 0.42
isDrifting = driftLoad > driftThreshold
```

`driftThreshold` 会随速度变大：

```js
driftThreshold = 42 + speedRatio * 88
```

含义：

- `sideSpeed` 表示车身已经在横滑。
- `hardSteer` 表示转向输入超过 72% 后的大角度转向部分。
- `turnLoad` 表示高速大角度转向正在把车推向漂移。
- 小角度转向不会直接增加 `turnLoad`，仍然按正常抓地行驶。
- 低速时横滑一点就算漂。
- 高速时允许更大的负载，避免 HUD 过早显示满漂移。

### 7. 用抓地力消除横向速度

核心公式：

```js
sideSpeed *= exp(-grip * dt)
```

这是一种帧率稳定的衰减写法。

不同状态使用不同抓地力：

```text
正常行驶：grip
漂移中：driftGrip
```

数值越大，横滑被消除得越快，车越稳。
数值越小，横滑保留得越久，车越滑。

### 8. 漂移速度损失

漂移不只是视觉效果，也会损失前向速度，并削弱油门。

```js
driftAmount = clamp((driftLoad - driftThreshold) / 95, 0, 1)
forwardSpeed *= exp(-driftSpeedLoss * driftAmount * dt)
```

含义：

- 轻微漂移只损失一点速度。
- 大角度漂移会明显掉速。
- 按住油门也不能完全抵消掉速，因为油门会被 `driftThrottlePower` 削弱。
- `driftSpeedLoss` 越大，漂移代价越高。

### 9. 阻力和速度限制

阻力分两类：

```js
dragForce = drag * forwardSpeed * abs(forwardSpeed) / maxSpeed
rollingResistance = fixed small resistance
```

`drag` 主要限制高速继续增长。
`rollingResistance` 负责松油门后慢慢停下，避免低速滑太久。

最后限制速度：

```js
forwardSpeed = clamp(forwardSpeed, -reverseMaxSpeed, maxSpeed)
```

代码里限制的是像素速度：

```js
forwardSpeed = clamp(forwardSpeed, -reverseMaxSpeedPx, maxSpeedPx)
```

### 10. 重新合成速度

```js
vx = forward.x * forwardSpeed + right.x * sideSpeed
vy = forward.y * forwardSpeed + right.y * sideSpeed
```

这是整个模型最关键的一步：
前向速度跟着车头，横向速度保留惯性，于是产生“车头转了，车身还在滑”的爽滑感。

### 11. 更新位置

```js
x += vx * dt
y += vy * dt
```

之后再处理边界、镜头和 HUD。

### 12. 生成漂移痕迹

当 `driftAmount` 足够高时，在两个后轮位置生成短线段：

```js
rear = car.position - forward * rearOffset
leftMark = rear - right * halfTrack
rightMark = rear + right * halfTrack
```

每条痕迹保存：

```js
x1, y1, x2, y2, alpha, life
```

绘制时按 `alpha * life` 显示，并让 `life` 每帧缓慢衰减。
当前只保留最近一批痕迹，避免数组无限增长。

## 参数表

所有车感参数在 `src/main.js` 顶部的 `TUNING`。

| 参数 | 含义 | 变大后 |
|---|---|---|
| `acceleration` | 游戏单位下的油门加速度 | 起步和提速更快 |
| `reverseAcceleration` | 游戏单位下的倒车加速度 | 倒车更有力 |
| `maxSpeed` | 游戏单位下的最高前进速度 | 直线更快，弯道风险更高 |
| `reverseMaxSpeed` | 游戏单位下的最高倒车速度 | 倒车更快 |
| `brakePower` | 游戏单位下的刹车力度 | 更快减速，入弯更容易控 |
| `accelerationFalloff` | 高速加速度衰减曲线 | 越大越早变慢 |
| `turnRate` | 基础转向速度 | 车头响应更快 |
| `steerBuildRate` | 转向输入推到满值的速度 | 越大越快满打方向 |
| `steerReleaseRate` | 转向输入回中的速度 | 越大越快回正 |
| `grip` | 正常抓地力 | 横滑更快消失，车更稳 |
| `driftGrip` | 漂移抓地力 | 漂移中更容易收住 |
| `driftThrottlePower` | 漂移时保留的油门效率 | 越小越难边漂边加速 |
| `driftSpeedLoss` | 漂移时的前向速度损失 | 漂移代价更高 |
| `drag` | 高速空气阻力 | 极速更难维持 |
| `rollingResistance` | 低速滚动阻力 | 松油门后更快停下 |
| `wallBounce` | 撞边界反弹 | 撞边界后弹得更明显 |

当前基础数值：

```js
acceleration: 105
reverseAcceleration: 50
maxSpeed: 80
reverseMaxSpeed: 35
brakePower: 205
accelerationFalloff: 0.9
```

## 漂移痕迹

漂移痕迹是可视化反馈，不直接改变车辆运动。它由 `driftAmount` 控制：

```js
driftAmount = clamp((driftLoad - driftThreshold) / 95, 0, 1)
```

数值越高：

- HUD 上 Drift 百分比越高。
- 后轮痕迹越深。
- 痕迹线段越长。

如果转向角足够大但横向速度还没完全形成，`turnLoad` 也会让痕迹提前出现。这能把“正在被推入漂移”的状态标出来。轻微转向不会触发这个提前漂移反馈。

## 调参顺序

每次只改一个参数，刷新浏览器，跑几次，再决定保留还是撤回。

推荐顺序：

1. `acceleration`
2. `maxSpeed`
3. `brakePower`
4. `turnRate`
5. `grip`
6. `driftGrip`
7. `drag`
8. `rollingResistance`

不要先调漂移。先让直线加速、刹车和基础转向舒服，再调横滑。

## 体感问题对应表

| 体感问题 | 优先尝试 |
|---|---|
| 起步太肉 | 提高 `acceleration` |
| 速度太快控制不住 | 降低 `maxSpeed` 或提高 `drag` |
| 刹车拖太久 | 提高 `brakePower` |
| 车头像船一样慢 | 提高 `turnRate` |
| 一碰方向就抽搐 | 降低 `turnRate` 或提高 `grip` |
| 完全滑不起来 | 降低 `driftGrip` 或 `grip` |
| 漂出去救不回来 | 提高 `driftGrip` 或降低 `turnRate` |
| 松油门滑太久 | 提高 `rollingResistance` |
| 高速一直飙 | 提高 `drag` 或降低 `maxSpeed` |

## 当前限制

- 只有单一跑道表面，没有不同地面摩擦。
- 没有轮胎温度、悬挂、质量、角速度或真实碰撞。
- 没有 AI、武器、圈速和赛道检查点。
- 漂移判断只用于 HUD 和抓地力切换，不是完整漂移系统。

这些限制是有意保留的。v0.1 只验证车感核心循环。

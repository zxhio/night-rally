# 街机车辆操控模型

## 目标

横向操控以好玩、丝滑、可救车为第一目标。数据不模拟真实车辆横向极限，但每个参数都要有单位、范围和可调含义。

纵向速度仍由 `specs/longitudinal-speed.md` 的数据曲线决定；横向模型只决定车头朝向、实际行进方向、侧滑强度和漂移轨迹。

当前 baseline 车辆使用模拟数据，最高速度先限制在 160 km/h。主动侧滑从 80 km/h 以上开始更合理，低速和微调方向应主要表现为抓地转向和轻微车尾摆动。

不复刻 K-Rally 的名称、素材、赛道或 UI，只借鉴高层手感目标：快速响应、低速能转、高速可控、甩尾可维持、反打能救。

## 数据字段

字段放在 `data/cars/*.json` 的 `handling` 中：

```txt
handling.mode                         固定为 arcade_v2

handling.steer.build                  转向输入建立速度, 1/s
handling.steer.release                转向输入回正速度, 1/s
handling.steer.speed_band.low         低速转向锚点, km/h
handling.steer.speed_band.mid         中速转向锚点, km/h
handling.steer.speed_band.high        高速转向锚点, km/h
handling.steer.yaw_deg_s.low          低速最大车头角速度, deg/s
handling.steer.yaw_deg_s.mid          中速最大车头角速度, deg/s
handling.steer.yaw_deg_s.high         高速最大车头角速度, deg/s
handling.steer.low_speed_boost        接近静止时的额外转向倍率

handling.tires.follow                 正常行进方向追随车头速度, 1/s
handling.tires.slide_follow           侧滑时行进方向追随车头速度, 1/s
handling.tires.slip_soft_deg          开始计算侧滑量的滑移角, deg
handling.tires.slip_max_deg           视为满侧滑的滑移角, deg

handling.slide.build                  侧滑强度建立速度, 1/s
handling.slide.release                侧滑强度释放速度, 1/s
handling.slide.steer_at               进入主动侧滑的转向输入阈值, 0..1
handling.slide.min_kmh                主动侧滑开始速度, km/h，当前 160 封顶 baseline 使用 80
handling.slide.hold_kmh               已经进入侧滑后的最低维持速度, km/h
handling.slide.full_kmh               主动侧滑完全生效速度, km/h
handling.slide.brake_bonus            刹车带来的额外侧滑目标, 0..1
handling.slide.throttle_keep          侧滑时保留的油门效率, 0..1
handling.slide.drag                   侧滑前向掉速系数, 1/s
handling.slide.decel_kmh_s            侧滑时最小掉速, km/h/s
handling.slide.sustain_kmh            按住油门漂移时收敛的弯中速度, km/h
handling.slide.recover_kmh_s          按住油门漂移低于弯中速度时的回补速度, km/h/s

handling.turn.loss_steer_min          抓地转向掉速开始的转向输入阈值, 0..1
handling.turn.loss_steer_full         抓地转向掉速完全生效的转向输入阈值, 0..1
handling.turn.loss_curve              抓地转向掉速压力曲线指数
handling.turn.drag                    抓地转向前向掉速系数, 1/s
handling.turn.decel_kmh_s             抓地转向最小掉速, km/h/s
handling.turn.sustain_kmh             按住油门抓地转向时收敛的弯中速度, km/h
handling.turn.recover_kmh_s           按住油门抓地转向低于弯中速度时的回补速度, km/h/s

handling.assist.counter_steer         反打降低侧滑/增加角速度的辅助倍率
handling.assist.recover               反打时额外行进方向追随速度, 1/s
handling.assist.straighten            无转向输入时额外回正追随速度, 1/s
```

## 每帧流程

```txt
inputSteer, inputThrottle, dt
speedKmhNext, distanceDeltaM  ← 纵向模型
steerNormNext                 ← 输入平滑
yawRateDegS                   ← 速度分段角速度
bodyAngleRadNext              ← 车头角速度积分
slideTarget                   ← 转向/速度/刹车/滑移角共同决定
driftAmountNext               ← 指数追随 slideTarget
moveAngleRadNext              ← 行进方向追随车头
xMNext, yMNext                ← 沿 moveAngleRadNext 积分
```

当前代码边界：

```txt
update(dt)                         游戏状态分派、结果态/滑行态处理、HUD 和镜头收尾
updateDrivingSimulation(input, dt) 单帧驾驶模拟：输入、地表、速度、转向、碰撞、完赛判断、轮胎痕迹
```

`updateDrivingSimulation` 仍然使用当前全局车辆状态，这是为了保持车感和改动范围稳定。后续拆模拟核心时，再把车辆、赛道采样、完赛规则改成显式 state 输入/输出，并引入固定 tick。

## 输入快照

键盘输入先转换成每个逻辑帧的输入快照。后续回放、Ghost 和多人同步都应该消费同样结构，而不是直接读取键盘状态。

```txt
inputFrame.tick          本地输入帧序号
inputFrame.accelerate    是否按下油门键
inputFrame.brake         是否按下刹车/倒车键
inputFrame.steerLeft     是否按下左转键
inputFrame.steerRight    是否按下右转键
inputFrame.throttle      Number(accelerate) - Number(brake), -1..1
inputFrame.steer         Number(steerRight) - Number(steerLeft), -1..1
```

当前键位映射：

```txt
accelerate: W / ArrowUp
brake:      S / ArrowDown
steerLeft:  A / ArrowLeft
steerRight: D / ArrowRight
```

`inputFrame.tick` 在每次重置车辆时归零。这个 tick 还不是固定步长模拟 tick；固定 tick 会在模拟核心拆分阶段再引入。

## 转向输入

```txt
steerTarget = inputSteer
steerRate =
  steerTarget == 0
    ? handling.steer.release
    : handling.steer.build

steerNormNext = moveToward(
  steerNorm,
  steerTarget,
  steerRate * dt
)
```

`steerNorm` 范围是 `-1..1`，正负号表示左右。

## 车头角速度

最大角速度按速度分段插值：

```txt
if speedAbsKmh <= speed_band.low:
  yawMaxDegS = lerp(yaw_low * 0.72, yaw_low, smoothstep(0, speed_band.low, speedAbsKmh))
else if speedAbsKmh <= speed_band.mid:
  yawMaxDegS = lerp(yaw_low, yaw_mid, smoothstep(speed_band.low, speed_band.mid, speedAbsKmh))
else:
  yawMaxDegS = lerp(yaw_mid, yaw_high, smoothstep(speed_band.mid, speed_band.high, speedAbsKmh))
```

低速辅助和反打辅助：

```txt
lowSpeedBoost =
  lerp(
    handling.steer.low_speed_boost,
    1,
    smoothstep(0, speed_band.low, speedAbsKmh)
  )

counterSteer =
  sign(steerNormNext) != 0
  and sign(steerNormNext) == -sign(slipDeg)

counterYawScale =
  counterSteer
    ? 1 + handling.assist.counter_steer * driftAmount
    : 1

yawRateDegS =
  steerNormNext
  * yawMaxDegS
  * lowSpeedBoost
  * counterYawScale
```

倒车时转向反向：

```txt
reverseTurn = speedKmhNext < 0 ? -1 : 1
bodyAngleRadNext =
  bodyAngleRad
  + degToRad(yawRateDegS) * reverseTurn * dt
```

## 侧滑强度

`slipDeg` 是车头方向和行进方向的夹角：

```txt
slipDeg = radToDeg(angleDelta(bodyAngleRad, moveAngleRad))
slipAbsDeg = abs(slipDeg)
```

主动侧滑来自“速度够快 + 转向够大”：

```txt
steerPressure =
  smoothstep(handling.slide.steer_at, 1, abs(steerNormNext))

enterSpeedPressure =
  smoothstep(handling.slide.min_kmh, handling.slide.full_kmh, speedAbsKmh)

holdSpeedPressure =
  smoothstep(handling.slide.hold_kmh, handling.slide.full_kmh, speedAbsKmh)

speedPressure =
  driftAmount > 0.04
    ? max(enterSpeedPressure, holdSpeedPressure)
    : enterSpeedPressure
```

被动侧滑来自已有滑移角：

```txt
slipPressure =
  smoothstep(
    handling.tires.slip_soft_deg,
    handling.tires.slip_max_deg,
    slipAbsDeg
  )
```

刹车可辅助甩尾，反打会压低目标侧滑：

```txt
brakePressure =
  inputThrottle < 0 ? handling.slide.brake_bonus : 0

recovery =
  counterSteer
    ? handling.assist.counter_steer * driftAmount
    : 0

slideTarget =
  clamp(
    steerPressure * speedPressure
    + slipPressure * 0.55
    + brakePressure
    - recovery,
    0,
    1
  )
```

侧滑强度使用指数追随，避免硬切：

```txt
slideRate =
  slideTarget > driftAmount
    ? handling.slide.build
    : handling.slide.release

driftAmountNext =
  lerp(
    driftAmount,
    slideTarget,
    1 - exp(-slideRate * dt)
  )
```

## 行进方向追随

`bodyAngleRad` 是车头方向，`moveAngleRad` 是实际行进方向。侧滑越强，行进方向越不愿意追车头。

```txt
baseFollow =
  lerp(
    handling.tires.follow,
    handling.tires.slide_follow,
    driftAmountNext
  )

recoverFollow =
  counterSteer
    ? handling.assist.counter_steer * driftAmountNext
      + handling.assist.recover
    : 0

straightenFollow =
  abs(steerNormNext) < 0.05
    ? handling.assist.straighten * (1 - driftAmountNext)
    : 0

followRate =
  baseFollow + recoverFollow + straightenFollow

moveAngleRadNext =
  moveAngleRad
  + angleDelta(bodyAngleRadNext, moveAngleRad)
    * (1 - exp(-followRate * dt))
```

变量含义：

```txt
baseFollow       基础追随速度, 1/s
recoverFollow    反打救车时追加的追随速度, 1/s
straightenFollow 松开方向时追加的回正追随速度, 1/s
followRate       本帧最终追随速度, 1/s
angleDelta       车头方向和行进方向之间的最短角度差, rad
```

`baseFollow` 按 `driftAmountNext` 在正常抓地和侧滑之间插值：

- `driftAmountNext = 0` 时接近 `handling.tires.follow`，行进方向更快追车头，车辆更稳。
- `driftAmountNext = 1` 时接近 `handling.tires.slide_follow`，行进方向更慢追车头，车辆更容易保持横滑。

`recoverFollow` 只在反打时生效，用于让玩家可以把已经甩出去的车尾救回来。`straightenFollow` 只在几乎没有方向输入时生效，用于松开方向后自然回稳。

`1 - exp(-followRate * dt)` 是帧率稳定的追随比例。`followRate` 越大，本帧 `moveAngleRad` 越接近 `bodyAngleRadNext`；`followRate` 越小，车辆越保留原来的行进方向。

## 掉速和油门效率

抓地转向会有轻微速度损失；侧滑会有明显速度损失，并削弱油门效率。这样点按方向仍然可控，持续压方向会慢慢丢速度，进入漂移后会丢更多速度。

按住油门时，转向/漂移掉速不是无限扣到 0，而是收敛到可调的弯中维持速度。松开油门或刹车时，维持速度为 0，车辆可以自然滑停或被刹停。

```txt
throttleScale =
  1 - driftAmount * (1 - handling.slide.throttle_keep)

turnSteerPressure =
  pow(
    smoothstep(
      handling.turn.loss_steer_min,
      handling.turn.loss_steer_full,
      abs(steerNormNext)
    ),
    handling.turn.loss_curve
  )

turnAmount =
  turnSteerPressure
  * smoothstep(25, 85, speedAbsKmh)
  * (1 - driftAmountNext)

sustainKmh =
  inputThrottle > 0
    ? lerp(
        handling.turn.sustain_kmh,
        handling.slide.sustain_kmh,
        driftAmountNext
      )
    : 0

excessKmh =
  max(0, speedAbsKmh - sustainKmh)

lossKmh =
  min(
    excessKmh,
    (
      excessKmh
      * (
        handling.turn.drag * turnAmount
        + handling.slide.drag * driftAmountNext
      )
      + (
        handling.turn.decel_kmh_s * turnAmount
        + handling.slide.decel_kmh_s * driftAmountNext
      )
    ) * dt
  )

speedKmhAfterTurnAndSlide =
  speedAbsKmh - lossKmh

cornerAmount =
  max(turnAmount, driftAmountNext)

recoverKmhS =
  lerp(
    handling.turn.recover_kmh_s,
    handling.slide.recover_kmh_s,
    driftAmountNext
  ) * cornerAmount

speedKmhAfterSustain =
  inputThrottle > 0
    and cornerAmount > 0
    and speedKmhAfterTurnAndSlide < sustainKmh
    ? min(
        sustainKmh,
        speedKmhAfterTurnAndSlide + recoverKmhS * dt
      )
    : speedKmhAfterTurnAndSlide
```

## 位移积分

```txt
xMNext = xM + cos(moveAngleRadNext) * distanceDeltaM
yMNext = yM + sin(moveAngleRadNext) * distanceDeltaM
```

当前原型内部用像素速度积分，但单位含义与上面一致。

## 调参指标

HUD 至少显示：

```txt
speedKmh
steerNorm
slipAbsDeg
driftAmount
yawRateDegS
turnRadiusM
```

转弯半径用于量化“转向角度够不够”：

```txt
turnRadiusM =
  speedMS / max(abs(degToRad(yawRateDegS)), epsilon)
```

## 漂移轨迹

当 `driftAmount` 足够大时，从后轴两侧生成短线段：

```txt
emitDriftTrail =
  driftAmount > 0.08
  and speedAbsKmh > 20
```

线段方向使用 `moveAngleRadNext`，位置使用车身后轴两侧。漂移轨迹只做可视化，不参与车辆运动。

## 赛道地表

默认弯道地图使用原创封闭赛道，不复刻真实赛道；节奏参考技术型 16 弯赛道：长直道、发卡、连续中低速弯和回头弯。当前中心线长度目标约 3200 m。

赛道按车辆到中心线的距离分层。当前实现已经取消可借路肩，赛道数据里的 `curbWidth` 保持为 `0`，跑道边缘外直接进入草地：

```txt
road   沥青主路面，正常抓地和速度上限
grass  草坪缓冲区，压得越深惩罚越强
fence  草坪外侧栅栏，限制车辆离开赛道区域
```

草地惩罚不按“进入草地/不进入草地”的二值状态计算，而是按车辆出线程度渐进计算。这样只压一点草地时速度损失较小，整车深入草地并接近外侧边界时才接近最大惩罚。

当前计算输入：

```txt
distance          车辆中心到赛道中心线的横向距离
carHalfWidth      半车宽
roadHalfWidth     主路面半宽
grassWidth        草地缓冲宽度
outsideWheelDepth max(0, distance + carHalfWidth - roadHalfWidth)
```

惩罚强度：

```txt
carOffRoad =
  clamp(outsideWheelDepth / carWidth, 0, 1)

grassDepth =
  clamp(outsideWheelDepth / grassWidth, 0, 1)

penalty =
  carOffRoad * smoothstep(0, 1, grassDepth)
```

`penalty` 范围是 `0..1`：

- `0`：车辆完全在主路面内。
- 接近 `0`：只有外侧轮轻微压草，速度损失很小。
- 接近 `1`：车辆基本离开主路并深入草地，接近最大惩罚。

地表影响分两段：进入更低抓地状态时做一次速度比例缩减；停留在草地上时降低油门加速能力和转向效率。地表不改变刹车减速能力。车辆回到主路面后，加速能力恢复到 100%，油门可以重新把速度拉上来：

```txt
steerInputNext =
  inputSteer * surface.steer

if surface.speedDropScale < previousSurface.speedDropScale:
  speedAfterSurfaceEnter =
    speedBeforeInput * surface.speedDropScale

throttleScale =
  throttleScale * surface.accelScale
```

草地最大惩罚由代码参数控制：

```txt
speedDropScale = lerp(1.0, 0.5, penalty)
accelScale     = lerp(1.0, 0.65, penalty)
steer          = lerp(1.0, 0.82, penalty)
```

重刹痕迹只在前进速度为正且按刹车时触发；倒车不会产生刹车痕迹。

## 边界

```txt
dt <= 0                 => 不更新
speedAbsKmh == 0        => 可低速转向，但不产生位移
followRate < 0          => 非法车辆数据
slide.throttle_keep     => clamp 到 0..1
slideTarget             => clamp 到 0..1
turnRadiusM             => HUD 上限显示为 --
fence collision         => 使用加密平滑中心线检测，推回赛道区域，碰撞后方向按栅栏切线镜面反射，速度按 speedBefore * cos(collisionAngle) 投影保留
```

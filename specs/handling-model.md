# 街机车辆操控模型

## 目标

横向操控以好玩、丝滑、可救车为第一目标。数据不模拟真实车辆横向极限，但每个参数都要有单位、范围和可调含义。

纵向速度仍由 `specs/longitudinal-speed.md` 的数据曲线决定；横向模型只决定车头朝向、实际行进方向、侧滑强度和漂移轨迹。

当前 baseline 车辆使用模拟数据，最高速度先限制在 120 km/h。主动侧滑从 70 km/h 以上开始更合理，低速和微调方向应主要表现为抓地转向和轻微车尾摆动。

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
handling.slide.min_kmh                主动侧滑开始速度, km/h，当前 120 封顶 baseline 使用 70
handling.slide.full_kmh               主动侧滑完全生效速度, km/h
handling.slide.brake_bonus            刹车带来的额外侧滑目标, 0..1
handling.slide.throttle_keep          侧滑时保留的油门效率, 0..1
handling.slide.drag                   侧滑前向掉速系数, 1/s
handling.slide.decel_kmh_s            侧滑时最小掉速, km/h/s

handling.turn.drag                    抓地转向前向掉速系数, 1/s
handling.turn.decel_kmh_s             抓地转向最小掉速, km/h/s

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

speedPressure =
  smoothstep(handling.slide.min_kmh, handling.slide.full_kmh, speedAbsKmh)
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

## 掉速和油门效率

抓地转向会有轻微速度损失；侧滑会有明显速度损失，并削弱油门效率。这样点按方向仍然可控，持续压方向会慢慢丢速度，进入漂移后会丢更多速度。

```txt
throttleScale =
  1 - driftAmount * (1 - handling.slide.throttle_keep)

turnAmount =
  smoothstep(0.08, 1, abs(steerNormNext))
  * (1 - driftAmountNext)

speedKmhAfterTurnAndSlide =
  min(
    speedKmhNext
      * exp(
        -(
          handling.turn.drag * turnAmount
          + handling.slide.drag * driftAmountNext
        ) * dt
      ),
    speedKmhBeforeInput
      - (
        handling.turn.decel_kmh_s * turnAmount
        + handling.slide.decel_kmh_s * driftAmountNext
      ) * dt
  )
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

## 边界

```txt
dt <= 0                 => 不更新
speedAbsKmh == 0        => 可低速转向，但不产生位移
followRate < 0          => 非法车辆数据
slide.throttle_keep     => clamp 到 0..1
slideTarget             => clamp 到 0..1
turnRadiusM             => HUD 上限显示为 --
```

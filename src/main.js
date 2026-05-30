const VEHICLE_DATA_URL = "data/cars/lynkco-03-plus-2019.json";

const DEFAULT_TUNING = {
  reverseAccelerationScale: 0.5,
  reverseMaxSpeedKmh: 60,
  turnRate: 2.05,
  steerBuildRate: 4.2,
  steerReleaseRate: 7.5,
  grip: 9.2,
  driftGrip: 2.9,
  driftThrottlePower: 0.35,
  driftSpeedLoss: 1.8,
  drag: 0.035,
  rollingResistanceFloor: 0.7,
  wallBounce: 0.28,
};

const PX_PER_METER = 10;
const ROAD_MARKING = {
  dashM: 6,
  gapM: 9,
  widthM: 0.18,
  edgeOffsetM: 2.8,
};

const WORLD = {
  width: 12000,
  height: 900,
  runwayY: 450,
  runwayWidth: 14 * PX_PER_METER,
  margin: 44,
};

const KMH_PER_GAME_SPEED = 3.5;
const SPEED_SCALE = KMH_PER_GAME_SPEED * PX_PER_METER / 3.6;
const METERS_PER_PIXEL = 1 / PX_PER_METER;
const STANDARD_G = 9.80665;
const SKID_MARKS_MAX = 420;

let vehicleModel = null;
let TUNING = null;
let CAR_SPEC = null;
let VEHICLE_ACCEL_SEGMENTS = [];
let VEHICLE_TAIL = null;

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const speedEl = document.querySelector("#speed");
const accelEl = document.querySelector("#accel");
const timeEl = document.querySelector("#time");
const distanceEl = document.querySelector("#distance");

const keys = new Set();
const view = { width: 0, height: 0, dpr: 1 };
const camera = { x: 0, y: WORLD.runwayY, zoom: 1 };
const car = {
  x: 260,
  y: WORLD.runwayY,
  angle: 0,
  vx: 0,
  vy: 0,
  radius: 0,
};

let lastTime = performance.now();
let driftAmount = 0;
let steeringInput = 0;
let testTime = 0;
let testDistance = 0;
let testActive = false;
let lastSpeedKmh = 0;
let accelG = 0;
const skidMarks = [];

window.addEventListener("keydown", (event) => {
  keys.add(event.code);

  if (event.code === "KeyR") {
    resetCar();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("resize", resize);
resize();
drawStatus("Loading vehicle data...");

loadVehicleModel(VEHICLE_DATA_URL)
  .then((model) => {
    applyVehicleModel(model);
    resetCar();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  })
  .catch(handleVehicleLoadError);

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function update(dt) {
  const input = readInput();
  if (!testActive && input.throttle > 0) {
    testActive = true;
  }

  steeringInput = updateSteeringInput(steeringInput, input.steer, dt);
  input.steer = steeringInput;
  const maxSpeedPx = toPixels(TUNING.maxSpeed);
  const reverseMaxSpeedPx = toPixels(TUNING.reverseMaxSpeed);
  const facing = angleVector(car.angle);
  const facingSpeed = dot(car.vx, car.vy, facing.x, facing.y);
  const speedRatio = clamp(Math.abs(facingSpeed) / maxSpeedPx, 0, 1);
  const steerPower = clamp(Math.abs(facingSpeed) / 190, 0.16, 1) * (1 - speedRatio * 0.34);
  const reverseTurn = facingSpeed < -8 ? -1 : 1;
  car.angle += input.steer * TUNING.turnRate * steerPower * reverseTurn * dt;

  const forward = angleVector(car.angle);
  const right = { x: -forward.y, y: forward.x };
  let forwardSpeed = dot(car.vx, car.vy, forward.x, forward.y);
  let sideSpeed = dot(car.vx, car.vy, right.x, right.y);
  const preThrottleDrift = getDriftState(input, forwardSpeed, sideSpeed, speedRatio);

  if (input.throttle > 0) {
    if (forwardSpeed < 0) {
      forwardSpeed = applyBrake(forwardSpeed, dt);
    } else {
      const throttleScale = 1 - preThrottleDrift.amount * (1 - TUNING.driftThrottlePower);
      forwardSpeed = applyThrottle(forwardSpeed, maxSpeedPx, throttleScale, dt);
    }
  }

  if (input.throttle < 0) {
    if (forwardSpeed > 0) {
      forwardSpeed = applyBrake(forwardSpeed, dt);
    } else {
      forwardSpeed = applyReverse(forwardSpeed, reverseMaxSpeedPx, dt);
    }
  }

  if (input.throttle === 0) {
    forwardSpeed = applyIdleCoast(forwardSpeed, maxSpeedPx, dt);
  }

  const drift = getDriftState(input, forwardSpeed, sideSpeed, speedRatio);
  const grip = drift.active ? TUNING.driftGrip : TUNING.grip;
  sideSpeed *= Math.exp(-grip * dt);
  forwardSpeed *= Math.exp(-TUNING.driftSpeedLoss * drift.amount * dt);

  forwardSpeed = clamp(forwardSpeed, -reverseMaxSpeedPx, maxSpeedPx);

  car.vx = forward.x * forwardSpeed + right.x * sideSpeed;
  car.vy = forward.y * forwardSpeed + right.y * sideSpeed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  if (testActive) {
    testTime += dt;
  }
  testDistance = Math.max(0, (car.x - 260) * METERS_PER_PIXEL);
  updateAccelerationMeter(dt);

  resolveBounds();
  driftAmount = drift.amount;
  addSkidMarks(forward, right, driftAmount);
  updateCamera(dt);
  updateHud();
}

function draw() {
  ctx.clearRect(0, 0, view.width, view.height);

  ctx.save();
  ctx.translate(view.width / 2, view.height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawWorld();
  drawRunway();
  drawSkidMarks();
  drawCarShadow();
  drawCar();

  ctx.restore();
}

function drawWorld() {
  ctx.fillStyle = "#26362d";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.strokeStyle = "rgba(238, 243, 236, 0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD.width; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.height);
    ctx.stroke();
  }

  ctx.strokeStyle = "#111514";
  ctx.lineWidth = 24;
  ctx.strokeRect(12, 12, WORLD.width - 24, WORLD.height - 24);
}

function drawRunway() {
  const y = WORLD.runwayY - WORLD.runwayWidth / 2;

  ctx.fillStyle = "#171c1c";
  roundRect(WORLD.margin, y - 28, WORLD.width - WORLD.margin * 2, WORLD.runwayWidth + 56, 18);
  ctx.fill();

  ctx.fillStyle = "#343a38";
  roundRect(WORLD.margin + 18, y, WORLD.width - (WORLD.margin + 18) * 2, WORLD.runwayWidth, 12);
  ctx.fill();

  ctx.strokeStyle = "rgba(238, 243, 236, 0.18)";
  ctx.lineWidth = ROAD_MARKING.widthM * PX_PER_METER;
  ctx.setLineDash([ROAD_MARKING.dashM * PX_PER_METER, ROAD_MARKING.gapM * PX_PER_METER]);
  ctx.beginPath();
  ctx.moveTo(WORLD.margin + 80, WORLD.runwayY);
  ctx.lineTo(WORLD.width - WORLD.margin - 80, WORLD.runwayY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(238, 243, 236, 0.24)";
  ctx.lineWidth = ROAD_MARKING.widthM * PX_PER_METER;
  ctx.beginPath();
  ctx.moveTo(WORLD.margin + 18, y + ROAD_MARKING.edgeOffsetM * PX_PER_METER);
  ctx.lineTo(WORLD.width - WORLD.margin - 18, y + ROAD_MARKING.edgeOffsetM * PX_PER_METER);
  ctx.moveTo(WORLD.margin + 18, y + WORLD.runwayWidth - ROAD_MARKING.edgeOffsetM * PX_PER_METER);
  ctx.lineTo(WORLD.width - WORLD.margin - 18, y + WORLD.runwayWidth - ROAD_MARKING.edgeOffsetM * PX_PER_METER);
  ctx.stroke();

  drawStartMarker();
}

function drawStartMarker() {
  const x = 220;
  const y = WORLD.runwayY - WORLD.runwayWidth / 2;
  const stripeCount = 8;
  const stripeHeight = WORLD.runwayWidth / stripeCount;
  const stripeWidth = 2 * PX_PER_METER;

  for (let i = 0; i < stripeCount; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#f0efe5" : "#111514";
    ctx.fillRect(x, y + i * stripeHeight, stripeWidth, stripeHeight);
  }
}

function drawCarShadow() {
  const bodyLength = CAR_SPEC.lengthM * PX_PER_METER;
  const bodyWidth = CAR_SPEC.widthM * PX_PER_METER;

  ctx.save();
  ctx.translate(car.x + bodyLength * 0.12, car.y + bodyWidth * 0.28);
  ctx.rotate(car.angle);
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  roundRect(-bodyLength / 2, -bodyWidth / 2, bodyLength, bodyWidth, 6);
  ctx.fill();
  ctx.restore();
}

function drawCar() {
  const bodyLength = CAR_SPEC.lengthM * PX_PER_METER;
  const bodyWidth = CAR_SPEC.widthM * PX_PER_METER;
  const wheelbase = CAR_SPEC.wheelbaseM * PX_PER_METER;
  const axleOffset = wheelbase / 2;
  const wheelLength = bodyLength * 0.22;
  const wheelWidth = 5;

  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  if (driftAmount > 0.1) {
    ctx.strokeStyle = `rgba(238, 243, 236, ${0.12 + driftAmount * 0.34})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.32, -bodyWidth * 0.56);
    ctx.lineTo(-bodyLength * 0.92 - driftAmount * 34, -bodyWidth * 0.72);
    ctx.moveTo(-bodyLength * 0.32, bodyWidth * 0.56);
    ctx.lineTo(-bodyLength * 0.92 - driftAmount * 34, bodyWidth * 0.72);
    ctx.stroke();
  }

  ctx.fillStyle = "#d64141";
  roundRect(-bodyLength / 2, -bodyWidth / 2, bodyLength, bodyWidth, 6);
  ctx.fill();

  ctx.fillStyle = "#f0d36a";
  ctx.beginPath();
  ctx.moveTo(bodyLength / 2 - bodyLength * 0.18, -bodyWidth * 0.36);
  ctx.lineTo(bodyLength / 2 + bodyLength * 0.08, 0);
  ctx.lineTo(bodyLength / 2 - bodyLength * 0.18, bodyWidth * 0.36);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#151917";
  ctx.fillRect(-bodyLength * 0.22, -bodyWidth * 0.35, bodyLength * 0.34, bodyWidth * 0.7);

  ctx.fillStyle = "#222626";
  ctx.fillRect(-axleOffset - wheelLength / 2, -bodyWidth / 2 - wheelWidth, wheelLength, wheelWidth);
  ctx.fillRect(axleOffset - wheelLength / 2, -bodyWidth / 2 - wheelWidth, wheelLength, wheelWidth);
  ctx.fillRect(-axleOffset - wheelLength / 2, bodyWidth / 2, wheelLength, wheelWidth);
  ctx.fillRect(axleOffset - wheelLength / 2, bodyWidth / 2, wheelLength, wheelWidth);

  ctx.restore();
}

function addSkidMarks(forward, right, intensity) {
  if (intensity <= 0.05) {
    return;
  }

  const rearOffset = CAR_SPEC.wheelbaseM * PX_PER_METER / 2;
  const rearX = car.x - forward.x * rearOffset;
  const rearY = car.y - forward.y * rearOffset;
  const halfTrack = CAR_SPEC.widthM * PX_PER_METER * 0.46;
  const length = 8 + intensity * 18;
  const alpha = 0.1 + intensity * 0.34;

  skidMarks.push(
    {
      x1: rearX + right.x * halfTrack,
      y1: rearY + right.y * halfTrack,
      x2: rearX + right.x * halfTrack - forward.x * length,
      y2: rearY + right.y * halfTrack - forward.y * length,
      alpha,
      life: 1,
    },
    {
      x1: rearX - right.x * halfTrack,
      y1: rearY - right.y * halfTrack,
      x2: rearX - right.x * halfTrack - forward.x * length,
      y2: rearY - right.y * halfTrack - forward.y * length,
      alpha,
      life: 1,
    },
  );

  if (skidMarks.length > SKID_MARKS_MAX) {
    skidMarks.splice(0, skidMarks.length - SKID_MARKS_MAX);
  }
}

function drawSkidMarks() {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 3;

  for (const mark of skidMarks) {
    ctx.strokeStyle = `rgba(12, 14, 13, ${mark.alpha * mark.life})`;
    ctx.beginPath();
    ctx.moveTo(mark.x1, mark.y1);
    ctx.lineTo(mark.x2, mark.y2);
    ctx.stroke();
    mark.life *= 0.996;
  }

  while (skidMarks.length > 0 && skidMarks[0].life < 0.08) {
    skidMarks.shift();
  }

  ctx.restore();
}

function readInput() {
  const up = keys.has("KeyW") || keys.has("ArrowUp");
  const down = keys.has("KeyS") || keys.has("ArrowDown");

  return {
    throttle: Number(up) - Number(down),
    steer: 0,
  };
}

function updateSteeringInput(current, target, dt) {
  const rate = target === 0 ? TUNING.steerReleaseRate : TUNING.steerBuildRate;
  const step = rate * dt;

  if (current < target) {
    return Math.min(target, current + step);
  }

  if (current > target) {
    return Math.max(target, current - step);
  }

  return current;
}

function resolveBounds() {
  const minX = WORLD.margin + car.radius;
  const maxX = WORLD.width - WORLD.margin - car.radius;
  const minY = WORLD.margin + car.radius;
  const maxY = WORLD.height - WORLD.margin - car.radius;

  if (car.x < minX) {
    car.x = minX;
    car.vx = Math.abs(car.vx) * TUNING.wallBounce;
  }
  if (car.x > maxX) {
    car.x = maxX;
    car.vx = -Math.abs(car.vx) * TUNING.wallBounce;
  }
  if (car.y < minY) {
    car.y = minY;
    car.vy = Math.abs(car.vy) * TUNING.wallBounce;
  }
  if (car.y > maxY) {
    car.y = maxY;
    car.vy = -Math.abs(car.vy) * TUNING.wallBounce;
  }
}

function updateCamera(dt) {
  const baseZoom = clamp(Math.min(view.width / 1040, view.height / 560), 0.7, 1);
  const lookAhead = angleVector(car.angle);
  const targetX = car.x + lookAhead.x * 22;
  const targetY = car.y + lookAhead.y * 8;

  camera.zoom += (baseZoom - camera.zoom) * Math.min(1, dt * 2);
  camera.x += (targetX - camera.x) * Math.min(1, dt * 4);
  camera.y += (targetY - camera.y) * Math.min(1, dt * 4);
}

function updateHud() {
  speedEl.textContent = String(Math.round(toKmh(toGameSpeed(Math.hypot(car.vx, car.vy)))));
  accelEl.textContent = formatAccelG(accelG);
  timeEl.textContent = testTime.toFixed(2);
  distanceEl.textContent = testDistance.toFixed(1);
}

function resetCar() {
  car.x = 260;
  car.y = WORLD.runwayY;
  car.angle = 0;
  car.vx = 0;
  car.vy = 0;
  steeringInput = 0;
  testTime = 0;
  testDistance = 0;
  testActive = false;
  lastSpeedKmh = 0;
  accelG = 0;
  skidMarks.length = 0;
  camera.x = car.x;
  camera.y = car.y;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(240, rect.height);

  view.width = width;
  view.height = height;
  view.dpr = dpr;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

async function loadVehicleModel(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function applyVehicleModel(data) {
  vehicleModel = data;
  TUNING = {
    ...DEFAULT_TUNING,
    maxSpeed: toGameSpeedFromKmh(readNumber(data.max, "max")),
    reverseMaxSpeed: toGameSpeedFromKmh(DEFAULT_TUNING.reverseMaxSpeedKmh),
    brakeG: Math.abs(getAverageBrakeG(data.brake)),
  };
  CAR_SPEC = readVehicleDimensions(data.dim);
  VEHICLE_ACCEL_SEGMENTS = buildAccelerationSegments(data);
  VEHICLE_TAIL = readVehicleTail(data.tail);
  car.radius = CAR_SPEC.lengthM * PX_PER_METER * 0.55;
}

function readVehicleDimensions(dim) {
  if (!dim || dim.unit !== "mm") {
    throw new Error("vehicle dim must use mm");
  }

  return {
    lengthM: readNumber(dim.l, "dim.l") / 1000,
    widthM: readNumber(dim.w, "dim.w") / 1000,
    heightM: readNumber(dim.h, "dim.h") / 1000,
    wheelbaseM: readNumber(dim.wb, "dim.wb") / 1000,
  };
}

function buildAccelerationSegments(data) {
  const points = [
    { speedKmh: 0, timeS: 0 },
    ...readTimedPoints(data.points, "points"),
    ...readPullSegments(data.pulls, data.points),
    ...readMarkPoints(data.marks),
  ].sort((a, b) => a.speedKmh - b.speedKmh);

  const uniquePoints = [];
  for (const point of points) {
    const previous = uniquePoints[uniquePoints.length - 1];
    if (previous && previous.speedKmh === point.speedKmh) {
      if (Math.abs(previous.timeS - point.timeS) > 0.001) {
        throw new Error(`conflicting time for ${point.speedKmh} km/h`);
      }
      continue;
    }
    uniquePoints.push(point);
  }

  const monotonicPoints = [];
  for (const point of uniquePoints) {
    const previous = monotonicPoints[monotonicPoints.length - 1];
    if (previous && point.timeS <= previous.timeS) {
      continue;
    }
    monotonicPoints.push(point);
  }

  const segments = [];
  for (let i = 1; i < monotonicPoints.length; i += 1) {
    const from = monotonicPoints[i - 1];
    const to = monotonicPoints[i];
    const segmentTime = to.timeS - from.timeS;

    if (segmentTime <= 0) {
      throw new Error(`invalid acceleration segment ${from.speedKmh}-${to.speedKmh}`);
    }

    segments.push({
      fromKmh: from.speedKmh,
      toKmh: to.speedKmh,
      segmentTime,
    });
  }

  if (segments.length === 0) {
    throw new Error("vehicle points must define at least one acceleration segment");
  }

  return segments;
}

function readTimedPoints(points, fieldName) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map((point, index) => ({
    speedKmh: readNumber(point.v, `${fieldName}[${index}].v`),
    timeS: readNumber(point.t, `${fieldName}[${index}].t`),
  }));
}

function readMarkPoints(marks) {
  if (!Array.isArray(marks)) {
    return [];
  }

  return marks.map((mark, index) => ({
    speedKmh: readNumber(mark.v, `marks[${index}].v`),
    timeS: readNumber(mark.t, `marks[${index}].t`),
  }));
}

function readPullSegments(pulls, launchPoints) {
  if (!Array.isArray(pulls)) {
    return [];
  }

  const launchCurve = [
    { speedKmh: 0, timeS: 0 },
    ...readTimedPoints(launchPoints, "points"),
  ].sort((a, b) => a.speedKmh - b.speedKmh);
  const segments = [];

  for (const [pullIndex, pull] of pulls.entries()) {
    const fromKmh = readNumber(pull.from, `pulls[${pullIndex}].from`);
    const anchorTime = timeAtSpeed(launchCurve, fromKmh);

    for (const point of readTimedPoints(pull.points, `pulls[${pullIndex}].points`)) {
      segments.push({
        speedKmh: point.speedKmh,
        timeS: anchorTime + point.timeS,
      });
    }
  }

  return segments;
}

function timeAtSpeed(points, speedKmh) {
  if (points.length < 2) {
    throw new Error("timeAtSpeed requires at least two points");
  }

  const speed = clamp(speedKmh, points[0].speedKmh, points[points.length - 1].speedKmh);

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];

    if (speed <= to.speedKmh) {
      const ratio = (speed - from.speedKmh) / (to.speedKmh - from.speedKmh);
      return from.timeS + (to.timeS - from.timeS) * ratio;
    }
  }

  return points[points.length - 1].timeS;
}

function readVehicleTail(tail) {
  if (!tail) {
    return null;
  }

  if (tail.mode !== "linear_decay") {
    throw new Error(`unsupported tail mode ${tail.mode}`);
  }

  return {
    fromKmh: readNumber(tail.from, "tail.from"),
    decayRangeKmh: Math.max(1, readNumber(tail.slow, "tail.slow")),
    minScale: clamp(readNumber(tail.min, "tail.min"), 0, 1),
  };
}

function getAverageBrakeG(brake) {
  if (!brake?.total || !Number.isFinite(brake.from)) {
    return 1.1;
  }

  const speedMs = brake.from / 3.6;
  const timeS = readNumber(brake.total.t, "brake.total.t");

  return speedMs / timeS / STANDARD_G;
}

function readNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new Error(`vehicle data field ${name} must be a number`);
  }

  return value;
}

function handleVehicleLoadError(error) {
  console.error(error);
  drawStatus(`Failed to load ${VEHICLE_DATA_URL}: ${error.message}`);
}

function drawStatus(message) {
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.fillStyle = "#101312";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.fillStyle = "#eef3ec";
  ctx.font = "16px Inter, ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, view.width / 2, view.height / 2);
}

function angleVector(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function dot(ax, ay, bx, by) {
  return ax * bx + ay * by;
}

function toPixels(speed) {
  return speed * SPEED_SCALE;
}

function toGameSpeed(pixelSpeed) {
  return pixelSpeed / SPEED_SCALE;
}

function toKmh(gameSpeed) {
  return gameSpeed * KMH_PER_GAME_SPEED;
}

function toGameSpeedFromKmh(kmh) {
  return kmh / KMH_PER_GAME_SPEED;
}

function getDriftState(input, forwardSpeed, sideSpeed, speedRatio) {
  const steerAmount = Math.abs(input.steer);
  const hardSteer = clamp((steerAmount - 0.72) / 0.28, 0, 1);
  const driftThreshold = 42 + speedRatio * 88;
  const turnLoad = hardSteer * Math.abs(forwardSpeed) * speedRatio;
  const driftLoad = Math.abs(sideSpeed) + turnLoad * 0.42;
  const amount = clamp((driftLoad - driftThreshold) / 95, 0, 1);

  return {
    active: driftLoad > driftThreshold,
    amount,
  };
}

function updateAccelerationMeter(dt) {
  if (dt <= 0) {
    return;
  }

  const facing = angleVector(car.angle);
  const forwardSpeed = dot(car.vx, car.vy, facing.x, facing.y);
  const absSpeedKmh = Math.abs(toKmh(toGameSpeed(forwardSpeed)));
  const driveG = ((absSpeedKmh - lastSpeedKmh) / 3.6 / dt) / 9.80665;

  if (!Number.isFinite(driveG)) {
    return;
  }

  accelG = driveG;
  lastSpeedKmh = absSpeedKmh;
}

function formatAccelG(value) {
  const normalized = Math.abs(value) < 0.005 ? 0 : value;

  return normalized.toFixed(2);
}

function applyThrottle(forwardSpeed, maxSpeed, throttleScale, dt) {
  const speed = Math.max(forwardSpeed, 0);
  const speedKmh = toKmh(toGameSpeed(speed));
  const engineAcceleration = toPixels(getVehicleAcceleration(speedKmh));

  return forwardSpeed + engineAcceleration * throttleScale * dt;
}

function applyBrake(forwardSpeed, dt) {
  const brakeAcceleration = toPixels(toGameSpeedFromKmh(TUNING.brakeG * STANDARD_G * 3.6));

  if (forwardSpeed > 0) {
    return Math.max(0, forwardSpeed - brakeAcceleration * dt);
  }

  if (forwardSpeed < 0) {
    return Math.min(0, forwardSpeed + brakeAcceleration * dt);
  }

  return 0;
}

function applyReverse(forwardSpeed, reverseMaxSpeed, dt) {
  const reverseSpeedKmh = Math.abs(toKmh(toGameSpeed(forwardSpeed)));
  const reverseAcceleration = toPixels(getVehicleAcceleration(reverseSpeedKmh) * TUNING.reverseAccelerationScale);

  return Math.max(-reverseMaxSpeed, forwardSpeed - reverseAcceleration * dt);
}

function applyIdleCoast(forwardSpeed, maxSpeed, dt) {
  const speed = Math.abs(forwardSpeed);

  if (speed <= 0) {
    return 0;
  }

  const rollingLoss = toPixels(TUNING.rollingResistanceFloor);
  const dragLoss = TUNING.drag * speed * speed / maxSpeed;
  const nextSpeed = Math.max(0, speed - (rollingLoss + dragLoss) * dt);

  return Math.sign(forwardSpeed) * nextSpeed;
}

function getVehicleAcceleration(speedKmh) {
  const segment =
    VEHICLE_ACCEL_SEGMENTS.find(({ fromKmh, toKmh }) => speedKmh >= fromKmh && speedKmh < toKmh) ??
    VEHICLE_ACCEL_SEGMENTS[VEHICLE_ACCEL_SEGMENTS.length - 1];
  const tailScale = getVehicleTailScale(speedKmh);

  return ((toGameSpeedFromKmh(segment.toKmh) - toGameSpeedFromKmh(segment.fromKmh)) / segment.segmentTime) * tailScale;
}

function getVehicleTailScale(speedKmh) {
  if (!VEHICLE_TAIL || speedKmh < VEHICLE_TAIL.fromKmh) {
    return 1;
  }

  const progress = clamp((speedKmh - VEHICLE_TAIL.fromKmh) / VEHICLE_TAIL.decayRangeKmh, 0, 1);

  return Math.max(VEHICLE_TAIL.minScale, 1 - progress);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

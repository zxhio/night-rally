const VEHICLE_DATA_URL = "data/cars/baseline.json";

const DEFAULT_TUNING = {
  reverseAccelerationScale: 0.5,
  reverseMaxSpeedKmh: 60,
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

const TRACKS = {
  straight: {
    name: "Straight",
    width: 12000,
    height: 900,
    startX: 260,
    startY: 450,
    startAngle: 0,
  },
  circuit: {
    name: "Circuit",
    width: 1800,
    height: 1200,
    startX: 360,
    startY: 880,
    startAngle: 0,
    centerX: 900,
    centerY: 600,
    outerRx: 660,
    outerRy: 420,
    innerRx: 390,
    innerRy: 205,
  },
};

const WORLD = {
  width: TRACKS.straight.width,
  height: TRACKS.straight.height,
  runwayY: TRACKS.straight.startY,
  runwayWidth: 14 * PX_PER_METER,
  margin: 44,
};

const KMH_PER_GAME_SPEED = 3.5;
const SPEED_SCALE = KMH_PER_GAME_SPEED * PX_PER_METER / 3.6;
const METERS_PER_PIXEL = 1 / PX_PER_METER;
const STANDARD_G = 9.80665;
const SKID_MARKS_MAX = 420;
const DRIFT_TRAIL_MIN_AMOUNT = 0.08;
const DRIFT_TRAIL_MIN_KMH = 20;
const DRIFT_TRAIL_FADE = 0.996;
const TURN_RADIUS_MAX_M = 999;

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
const steerEl = document.querySelector("#steer");
const slipEl = document.querySelector("#slip");
const driftEl = document.querySelector("#drift");
const yawEl = document.querySelector("#yaw");
const radiusEl = document.querySelector("#radius");
const trackButtons = [...document.querySelectorAll("[data-track]")];

const keys = new Set();
const view = { width: 0, height: 0, dpr: 1 };
const camera = { x: 0, y: WORLD.runwayY, zoom: 1 };
const car = {
  x: 260,
  y: WORLD.runwayY,
  angle: 0,
  bodyAngleRad: 0,
  moveAngleRad: 0,
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
let driftActive = false;
let slipDeg = 0;
let yawRateDegS = 0;
let turnRadiusM = TURN_RADIUS_MAX_M;
let activeTrackId = "straight";
const skidMarks = [];

window.addEventListener("keydown", (event) => {
  keys.add(event.code);

  if (event.code === "KeyR") {
    resetCar();
  }

  if (event.code === "Digit1") {
    setTrack("straight");
  }

  if (event.code === "Digit2") {
    setTrack("circuit");
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

for (const button of trackButtons) {
  button.addEventListener("click", () => {
    setTrack(button.dataset.track);
  });
}

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
  let forward = angleVector(car.bodyAngleRad);
  let right = { x: -forward.y, y: forward.x };
  const travel = angleVector(car.moveAngleRad);
  let forwardSpeed = dot(car.vx, car.vy, travel.x, travel.y);
  const speedBeforeInput = forwardSpeed;
  const previousDriftAmount = driftAmount;

  if (input.throttle > 0) {
    if (forwardSpeed < 0) {
      forwardSpeed = applyBrake(forwardSpeed, dt);
    } else {
      const throttleScale = 1 - previousDriftAmount * (1 - TUNING.slideThrottleKeep);
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

  forwardSpeed = clamp(forwardSpeed, -reverseMaxSpeedPx, maxSpeedPx);

  const speedAbsKmh = Math.abs(toKmh(toGameSpeed(forwardSpeed)));
  const slipBeforeDeg = signedSlipDeg();
  const yawControl = getArcadeYawControl(input.steer, speedAbsKmh, slipBeforeDeg);
  yawRateDegS = yawControl.yawRateDegS;
  turnRadiusM = getTurnRadiusM(speedAbsKmh, yawRateDegS);
  const reverseTurn = forwardSpeed < -0.1 ? -1 : 1;
  car.bodyAngleRad += degToRad(yawRateDegS) * reverseTurn * dt;
  car.angle = car.bodyAngleRad;

  forward = angleVector(car.bodyAngleRad);
  right = { x: -forward.y, y: forward.x };

  const slideTarget = getSlideTarget(input, speedAbsKmh, slipBeforeDeg);
  const slideRate = slideTarget > driftAmount ? TUNING.slideBuildRate : TUNING.slideReleaseRate;
  driftAmount = expFollow(driftAmount, slideTarget, slideRate, dt);
  driftActive = driftAmount > 0.04;
  if (!driftActive) {
    driftAmount = 0;
  }
  forwardSpeed = applyTurnAndSlideSpeedLoss(forwardSpeed, speedBeforeInput, Math.abs(input.steer), driftAmount, dt);

  const counterSteer = Math.sign(input.steer) !== 0 && Math.sign(input.steer) === -Math.sign(slipBeforeDeg);
  const recoveryGrip = counterSteer ? TUNING.counterSteerAssist * driftAmount + TUNING.recoverAssist : 0;
  const noSteerGrip = Math.abs(input.steer) < 0.05 ? TUNING.straightenAssist * (1 - driftAmount) : 0;
  const grip = lerp(TUNING.travelFollowRate, TUNING.slideFollowRate, driftAmount) + recoveryGrip + noSteerGrip;
  const gripFollow = 1 - Math.exp(-grip * dt);
  car.moveAngleRad += angleDelta(car.bodyAngleRad, car.moveAngleRad) * gripFollow;
  const moveDirection = angleVector(car.moveAngleRad);
  car.vx = moveDirection.x * forwardSpeed;
  car.vy = moveDirection.y * forwardSpeed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  if (testActive) {
    testTime += dt;
  }
  testDistance = Math.max(0, (car.x - 260) * METERS_PER_PIXEL);
  updateAccelerationMeter(dt);

  resolveBounds();
  slipDeg = Math.abs(radToDeg(angleDelta(car.bodyAngleRad, car.moveAngleRad)));
  addSkidMarks(forward, right, moveDirection, driftAmount, speedAbsKmh);
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
  drawTrack();
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

function drawTrack() {
  if (activeTrackId === "circuit") {
    drawCircuit();
    return;
  }

  drawRunway();
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

function drawCircuit() {
  const track = TRACKS.circuit;

  ctx.fillStyle = "#171c1c";
  drawEllipse(track.centerX, track.centerY, track.outerRx + 34, track.outerRy + 34);
  ctx.fill();

  ctx.fillStyle = "#343a38";
  drawEllipse(track.centerX, track.centerY, track.outerRx, track.outerRy);
  ctx.fill();

  ctx.fillStyle = "#26362d";
  drawEllipse(track.centerX, track.centerY, track.innerRx, track.innerRy);
  ctx.fill();

  ctx.strokeStyle = "rgba(238, 243, 236, 0.22)";
  ctx.lineWidth = ROAD_MARKING.widthM * PX_PER_METER;
  ctx.setLineDash([ROAD_MARKING.dashM * PX_PER_METER, ROAD_MARKING.gapM * PX_PER_METER]);
  drawEllipse(track.centerX, track.centerY, (track.outerRx + track.innerRx) / 2, (track.outerRy + track.innerRy) / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(238, 243, 236, 0.24)";
  ctx.lineWidth = ROAD_MARKING.widthM * PX_PER_METER;
  drawEllipse(track.centerX, track.centerY, track.outerRx - 24, track.outerRy - 24);
  ctx.stroke();
  drawEllipse(track.centerX, track.centerY, track.innerRx + 24, track.innerRy + 24);
  ctx.stroke();

  drawCircuitStartMarker();
}

function drawCircuitStartMarker() {
  const track = TRACKS.circuit;
  const stripeCount = 8;
  const stripeWidth = 2 * PX_PER_METER;
  const stripeHeight = 7 * PX_PER_METER / stripeCount;
  const x = track.startX - stripeWidth / 2;
  const y = track.startY - stripeHeight * stripeCount / 2;

  for (let i = 0; i < stripeCount; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#f0efe5" : "#111514";
    ctx.fillRect(x, y + i * stripeHeight, stripeWidth, stripeHeight);
  }
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
  ctx.rotate(car.bodyAngleRad);
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
  ctx.rotate(car.bodyAngleRad);

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

function addSkidMarks(forward, right, moveDirection, intensity, speedKmh) {
  if (intensity <= DRIFT_TRAIL_MIN_AMOUNT || speedKmh <= DRIFT_TRAIL_MIN_KMH) {
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
      x2: rearX + right.x * halfTrack - moveDirection.x * length,
      y2: rearY + right.y * halfTrack - moveDirection.y * length,
      alpha,
      life: 1,
    },
    {
      x1: rearX - right.x * halfTrack,
      y1: rearY - right.y * halfTrack,
      x2: rearX - right.x * halfTrack - moveDirection.x * length,
      y2: rearY - right.y * halfTrack - moveDirection.y * length,
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
    mark.life *= DRIFT_TRAIL_FADE;
  }

  while (skidMarks.length > 0 && skidMarks[0].life < 0.08) {
    skidMarks.shift();
  }

  ctx.restore();
}

function readInput() {
  const up = keys.has("KeyW") || keys.has("ArrowUp");
  const down = keys.has("KeyS") || keys.has("ArrowDown");
  const left = keys.has("KeyA") || keys.has("ArrowLeft");
  const right = keys.has("KeyD") || keys.has("ArrowRight");

  return {
    throttle: Number(up) - Number(down),
    steer: Number(right) - Number(left),
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
  const lookAhead = angleVector(car.bodyAngleRad);
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
  steerEl.textContent = `${Math.round(steeringInput * 100)}%`;
  slipEl.textContent = String(Math.round(slipDeg));
  driftEl.textContent = `${Math.round(driftAmount * 100)}%`;
  yawEl.textContent = String(Math.round(yawRateDegS));
  radiusEl.textContent = turnRadiusM >= TURN_RADIUS_MAX_M ? "--" : String(Math.round(turnRadiusM));
}

function setTrack(trackId) {
  if (!TRACKS[trackId] || trackId === activeTrackId) {
    return;
  }

  activeTrackId = trackId;
  WORLD.width = TRACKS[trackId].width;
  WORLD.height = TRACKS[trackId].height;
  WORLD.runwayY = TRACKS[trackId].startY;

  for (const button of trackButtons) {
    button.classList.toggle("is-active", button.dataset.track === trackId);
  }

  resetCar();
}

function resetCar() {
  const track = TRACKS[activeTrackId];
  car.x = track.startX;
  car.y = track.startY;
  car.angle = track.startAngle;
  car.bodyAngleRad = track.startAngle;
  car.moveAngleRad = track.startAngle;
  car.vx = 0;
  car.vy = 0;
  steeringInput = 0;
  testTime = 0;
  testDistance = 0;
  testActive = false;
  lastSpeedKmh = 0;
  accelG = 0;
  driftActive = false;
  slipDeg = 0;
  yawRateDegS = 0;
  turnRadiusM = TURN_RADIUS_MAX_M;
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
    ...readVehicleHandling(data.handling),
    maxSpeed: toGameSpeedFromKmh(readNumber(data.max, "max")),
    reverseMaxSpeed: toGameSpeedFromKmh(DEFAULT_TUNING.reverseMaxSpeedKmh),
    brakeG: Math.abs(getAverageBrakeG(data.brake)),
  };
  CAR_SPEC = readVehicleDimensions(data.dim);
  VEHICLE_ACCEL_SEGMENTS = buildAccelerationSegments(data);
  VEHICLE_TAIL = readVehicleTail(data.tail);
  car.radius = CAR_SPEC.lengthM * PX_PER_METER * 0.55;
}

function readVehicleHandling(handling) {
  const steer = handling?.steer;
  const tires = handling?.tires;
  const slide = handling?.slide;
  const turn = handling?.turn;
  const assist = handling?.assist;

  if (handling?.mode !== "arcade_v2") {
    throw new Error("vehicle handling.mode must be arcade_v2");
  }

  if (!steer || !tires || !slide || !turn || !assist) {
    throw new Error("vehicle handling.steer, handling.tires, handling.slide, handling.turn and handling.assist are required");
  }

  return {
    steerBuildRate: readNumber(steer.build, "handling.steer.build"),
    steerReleaseRate: readNumber(steer.release, "handling.steer.release"),
    steerSpeedLowKmh: readNumber(steer.speed_band?.low, "handling.steer.speed_band.low"),
    steerSpeedMidKmh: readNumber(steer.speed_band?.mid, "handling.steer.speed_band.mid"),
    steerSpeedHighKmh: readNumber(steer.speed_band?.high, "handling.steer.speed_band.high"),
    yawLowDegS: readNumber(steer.yaw_deg_s?.low, "handling.steer.yaw_deg_s.low"),
    yawMidDegS: readNumber(steer.yaw_deg_s?.mid, "handling.steer.yaw_deg_s.mid"),
    yawHighDegS: readNumber(steer.yaw_deg_s?.high, "handling.steer.yaw_deg_s.high"),
    lowSpeedSteerBoost: readNumber(steer.low_speed_boost, "handling.steer.low_speed_boost"),
    travelFollowRate: readNumber(tires.follow, "handling.tires.follow"),
    slideFollowRate: readNumber(tires.slide_follow, "handling.tires.slide_follow"),
    slipSoftDeg: readNumber(tires.slip_soft_deg, "handling.tires.slip_soft_deg"),
    slipMaxDeg: readNumber(tires.slip_max_deg, "handling.tires.slip_max_deg"),
    slideBuildRate: readNumber(slide.build, "handling.slide.build"),
    slideReleaseRate: readNumber(slide.release, "handling.slide.release"),
    slideSteerAt: readNumber(slide.steer_at, "handling.slide.steer_at"),
    slideMinKmh: readNumber(slide.min_kmh, "handling.slide.min_kmh"),
    slideFullKmh: readNumber(slide.full_kmh, "handling.slide.full_kmh"),
    slideBrakeBonus: readNumber(slide.brake_bonus, "handling.slide.brake_bonus"),
    slideThrottleKeep: readNumber(slide.throttle_keep, "handling.slide.throttle_keep"),
    slideDrag: readNumber(slide.drag, "handling.slide.drag"),
    slideDecelKmhS: readNumber(slide.decel_kmh_s, "handling.slide.decel_kmh_s"),
    turnDrag: readNumber(turn.drag, "handling.turn.drag"),
    turnDecelKmhS: readNumber(turn.decel_kmh_s, "handling.turn.decel_kmh_s"),
    counterSteerAssist: readNumber(assist.counter_steer, "handling.assist.counter_steer"),
    recoverAssist: readNumber(assist.recover, "handling.assist.recover"),
    straightenAssist: readNumber(assist.straighten, "handling.assist.straighten"),
  };
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

function angleDelta(target, current) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function radToDeg(value) {
  return value * 180 / Math.PI;
}

function degToRad(value) {
  return value * Math.PI / 180;
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

function getArcadeYawControl(steer, speedAbsKmh, currentSlipDeg) {
  const maxYawDegS = getMaxYawDegS(speedAbsKmh);
  const lowSpeedBoost = lerp(TUNING.lowSpeedSteerBoost, 1, smoothstep(0, TUNING.steerSpeedLowKmh, speedAbsKmh));
  const slipRecover = Math.sign(steer) !== 0 && Math.sign(steer) === -Math.sign(currentSlipDeg)
    ? 1 + TUNING.counterSteerAssist * driftAmount
    : 1;
  const yawRateDegS = steer * maxYawDegS * lowSpeedBoost * slipRecover;

  return { yawRateDegS };
}

function getMaxYawDegS(speedAbsKmh) {
  if (speedAbsKmh <= TUNING.steerSpeedLowKmh) {
    const t = smoothstep(0, TUNING.steerSpeedLowKmh, speedAbsKmh);

    return lerp(TUNING.yawLowDegS * 0.72, TUNING.yawLowDegS, t);
  }

  if (speedAbsKmh <= TUNING.steerSpeedMidKmh) {
    const t = smoothstep(TUNING.steerSpeedLowKmh, TUNING.steerSpeedMidKmh, speedAbsKmh);

    return lerp(TUNING.yawLowDegS, TUNING.yawMidDegS, t);
  }

  const t = smoothstep(TUNING.steerSpeedMidKmh, TUNING.steerSpeedHighKmh, speedAbsKmh);

  return lerp(TUNING.yawMidDegS, TUNING.yawHighDegS, t);
}

function getSlideTarget(input, speedAbsKmh, currentSlipDeg) {
  const steerAmount = Math.abs(input.steer);
  const steerPressure = smoothstep(TUNING.slideSteerAt, 1, steerAmount);
  const speedPressure = smoothstep(TUNING.slideMinKmh, TUNING.slideFullKmh, speedAbsKmh);
  const slipPressure = smoothstep(TUNING.slipSoftDeg, TUNING.slipMaxDeg, Math.abs(currentSlipDeg));
  const brakePressure = input.throttle < 0 ? TUNING.slideBrakeBonus : 0;
  const counterSteer = Math.sign(input.steer) !== 0 && Math.sign(input.steer) === -Math.sign(currentSlipDeg);
  const recovery = counterSteer ? TUNING.counterSteerAssist * driftAmount : 0;
  const target = steerPressure * speedPressure + slipPressure * 0.55 + brakePressure - recovery;

  return clamp(target, 0, 1);
}

function getTurnRadiusM(speedAbsKmh, yawRate) {
  const yawRateRadS = Math.abs(degToRad(yawRate));

  if (yawRateRadS < 0.001 || speedAbsKmh < 1) {
    return TURN_RADIUS_MAX_M;
  }

  return clamp((speedAbsKmh / 3.6) / yawRateRadS, 0, TURN_RADIUS_MAX_M);
}

function signedSlipDeg() {
  return radToDeg(angleDelta(car.bodyAngleRad, car.moveAngleRad));
}

function expFollow(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

function updateAccelerationMeter(dt) {
  if (dt <= 0) {
    return;
  }

  const facing = angleVector(car.bodyAngleRad);
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

function applyTurnAndSlideSpeedLoss(forwardSpeed, speedBeforeInput, steerAmount, slideAmount, dt) {
  const turnAmount = smoothstep(0.08, 1, steerAmount) * (1 - slideAmount);
  if (turnAmount <= 0 && slideAmount <= 0) {
    return forwardSpeed;
  }

  const sign = Math.sign(forwardSpeed) || Math.sign(speedBeforeInput) || 1;
  const speed = Math.abs(forwardSpeed);
  const inputSpeed = Math.abs(speedBeforeInput);
  const drag = TUNING.turnDrag * turnAmount + TUNING.slideDrag * slideAmount;
  const decelKmhS = TUNING.turnDecelKmhS * turnAmount + TUNING.slideDecelKmhS * slideAmount;
  const dragSpeed = speed * Math.exp(-drag * dt);
  const decelSpeed = Math.max(0, inputSpeed - toPixels(toGameSpeedFromKmh(decelKmhS)) * dt);

  return sign * Math.min(dragSpeed, decelSpeed);
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

function lerp(from, to, ratio) {
  return from + (to - from) * ratio;
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }

  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);

  return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function drawEllipse(x, y, radiusX, radiusY) {
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
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

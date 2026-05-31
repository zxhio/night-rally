const VEHICLE_DATA_URL = "data/cars/baseline.json?v=20260601-turn-loss-drift-threshold";

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

const CIRCUIT_PATH = [
  [9716, 3615],
  [9716, 2273],
  [9605, 1527],
  [9119, 1228],
  [8634, 1489],
  [8149, 1527],
  [7701, 1414],
  [7329, 1787],
  [7403, 2346],
  [7888, 2868],
  [8298, 3316],
  [8000, 3801],
  [8560, 4175],
  [9157, 4436],
  [8970, 4958],
  [8038, 5220],
  [6881, 5145],
  [6210, 4921],
  [6060, 4287],
  [6284, 3690],
  [5874, 3353],
  [5351, 3615],
  [5166, 4137],
  [4792, 4175],
  [4530, 3690],
  [4455, 2944],
  [4083, 2682],
  [3896, 2273],
  [3000, 2346],
  [1882, 2607],
  [1173, 2832],
  [1098, 3241],
  [1882, 3391],
  [3225, 3353],
  [3934, 3540],
  [4403, 4802],
  [5216, 5703],
  [6248, 5956],
  [7552, 5816],
  [8859, 6113],
  [9828, 6039],
  [10314, 5554],
  [10051, 4584],
];
const CIRCUIT_COLLISION_PATH = buildSmoothedCircuitSamples(CIRCUIT_PATH, 16);

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
    width: 10800,
    height: 6800,
    startX: 9716,
    startY: 3615,
    startAngle: getPathSegmentAngle(CIRCUIT_PATH, 0),
    path: CIRCUIT_PATH,
    collisionPath: CIRCUIT_COLLISION_PATH,
    roadHalfWidth: 70,
    curbWidth: 21,
    grassWidth: 96,
    fencePadding: 30,
  },
};

const WORLD = {
  width: TRACKS.circuit.width,
  height: TRACKS.circuit.height,
  runwayY: TRACKS.circuit.startY,
  runwayWidth: 14 * PX_PER_METER,
  margin: 44,
};

const KMH_PER_GAME_SPEED = 3.5;
const SPEED_SCALE = KMH_PER_GAME_SPEED * PX_PER_METER / 3.6;
const METERS_PER_PIXEL = 1 / PX_PER_METER;
const STANDARD_G = 9.80665;
const SKID_MARKS_MAX = 420;
const DRIFT_ACTIVE_MIN_AMOUNT = 0.04;
const DRIFT_RESET_MIN_AMOUNT = 0.005;
const DRIFT_TRAIL_MIN_AMOUNT = 0.08;
const DRIFT_TRAIL_MIN_KMH = 20;
const DRIFT_TRAIL_FADE = 0.996;
const BRAKE_TRAIL_MIN_KMH = 35;
const BRAKE_TRAIL_INTENSITY = 0.3;
const TURN_RADIUS_MAX_M = 999;
const SURFACE = {
  road: { label: "Road", speedDropScale: 1, accelScale: 1, steer: 1 },
  curb: { label: "Curb", speedDropScale: 0.95, accelScale: 1, steer: 0.94 },
  grass: { label: "Grass", speedDropScale: 0.9, accelScale: 0.8, steer: 0.8 },
};
const TRACK_PALETTE = {
  grassOuter: "#4f7136",
  grassInner: "#6f8d4c",
  curbOuter: "#c7cbc3",
  curbInner: "#8f9893",
  road: "#343a38",
};
const FENCE_COLLISION = {
  driftKeep: 0.25,
};
const DIRT_SPECKS = Array.from({ length: 180 }, (_, index) => ({
  x: (index * 149 + 83) % TRACKS.circuit.width,
  y: (index * 211 + 47) % TRACKS.circuit.height,
  r: 1 + (index % 4) * 0.55,
  a: 0.05 + (index % 5) * 0.018,
}));

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
const surfaceEl = document.querySelector("#surface");
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
let activeTrackId = "circuit";
let currentSurface = SURFACE.road;
let previousSurface = SURFACE.road;
const skidMarks = [];

window.addEventListener("keydown", (event) => {
  keys.add(event.code);

  if (event.code === "KeyR") {
    resetCar();
  }

  if (event.code === "Digit1") {
    setTrack("circuit");
  }

  if (event.code === "Digit2") {
    setTrack("straight");
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

  previousSurface = currentSurface;
  currentSurface = getSurfaceAt(car.x, car.y);
  steeringInput = updateSteeringInput(steeringInput, input.steer * currentSurface.steer, dt);
  input.steer = steeringInput;
  const maxSpeedPx = toPixels(TUNING.maxSpeed);
  const reverseMaxSpeedPx = toPixels(TUNING.reverseMaxSpeed);
  let forward = angleVector(car.bodyAngleRad);
  let right = { x: -forward.y, y: forward.x };
  const travel = angleVector(car.moveAngleRad);
  let forwardSpeed = dot(car.vx, car.vy, travel.x, travel.y);
  forwardSpeed = applySurfaceEntrySpeedDrop(forwardSpeed, previousSurface, currentSurface);
  const previousDriftAmount = driftAmount;
  const brakingForward = input.throttle < 0 && forwardSpeed > 0;

  if (input.throttle > 0) {
    if (forwardSpeed < 0) {
      forwardSpeed = applyBrake(forwardSpeed, dt);
    } else {
      const throttleScale = (1 - previousDriftAmount * (1 - TUNING.slideThrottleKeep)) * currentSurface.accelScale;
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

  const slideTarget = getSlideTarget(input, speedAbsKmh, slipBeforeDeg, brakingForward);
  const slideRate = slideTarget > driftAmount ? TUNING.slideBuildRate : TUNING.slideReleaseRate;
  driftAmount = expFollow(driftAmount, slideTarget, slideRate, dt);
  driftActive = driftAmount > DRIFT_ACTIVE_MIN_AMOUNT;
  if (driftAmount < DRIFT_RESET_MIN_AMOUNT && slideTarget < DRIFT_RESET_MIN_AMOUNT) {
    driftAmount = 0;
  }
  forwardSpeed = applyTurnAndSlideSpeedLoss(forwardSpeed, Math.abs(input.steer), driftAmount, input.throttle, dt);
  forwardSpeed = applyCornerSustain(forwardSpeed, Math.abs(input.steer), driftAmount, input.throttle, dt);

  const counterSteer = Math.sign(input.steer) !== 0 && Math.sign(input.steer) === -Math.sign(slipBeforeDeg);
  const recoveryGrip = counterSteer ? TUNING.counterSteerAssist * driftAmount + TUNING.recoverAssist : 0;
  const noSteerGrip = Math.abs(input.steer) < 0.05 ? TUNING.straightenAssist * (1 - driftAmount) : 0;
  const grip = lerp(TUNING.travelFollowRate, TUNING.slideFollowRate, driftAmount) + recoveryGrip + noSteerGrip;
  const gripFollow = 1 - Math.exp(-grip * dt);
  car.moveAngleRad += angleDelta(car.bodyAngleRad, car.moveAngleRad) * gripFollow;
  const moveDirection = angleVector(car.moveAngleRad);
  car.vx = moveDirection.x * forwardSpeed;
  car.vy = moveDirection.y * forwardSpeed;
  const previousX = car.x;
  const previousY = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  if (testActive) {
    testTime += dt;
  }
  testDistance += Math.hypot(car.x - previousX, car.y - previousY) * METERS_PER_PIXEL;
  updateAccelerationMeter(dt);

  resolveBounds();
  if (activeTrackId === "circuit") {
    resolveTrackFence();
  }
  slipDeg = Math.abs(radToDeg(angleDelta(car.bodyAngleRad, car.moveAngleRad)));
  const trailIntensity = getTireTrailIntensity(driftAmount, brakingForward, speedAbsKmh);
  addSkidMarks(forward, right, moveDirection, trailIntensity, speedAbsKmh);
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
  ctx.fillStyle = activeTrackId === "circuit" ? "#b78345" : "#26362d";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  if (activeTrackId === "circuit") {
    drawDirtTexture();
  }

  ctx.strokeStyle = "rgba(238, 243, 236, 0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD.width; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.height);
    ctx.stroke();
  }

  ctx.strokeStyle = activeTrackId === "circuit" ? "rgba(54, 41, 28, 0.42)" : "#111514";
  ctx.lineWidth = 24;
  ctx.strokeRect(12, 12, WORLD.width - 24, WORLD.height - 24);
}

function drawDirtTexture() {
  for (const speck of DIRT_SPECKS) {
    ctx.fillStyle = `rgba(91, 59, 29, ${speck.a * 0.72})`;
    ctx.beginPath();
    ctx.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
    ctx.fill();
  }
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
  const grassHalfWidth = track.roadHalfWidth + track.curbWidth + track.grassWidth;
  const curbHalfWidth = track.roadHalfWidth + track.curbWidth;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.strokeStyle = TRACK_PALETTE.grassOuter;
  ctx.lineWidth = grassHalfWidth * 2;
  strokeCircuitPath(track.path);
  ctx.stroke();

  ctx.strokeStyle = TRACK_PALETTE.curbOuter;
  ctx.lineWidth = curbHalfWidth * 2;
  strokeCircuitPath(track.path);
  ctx.stroke();

  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = "rgba(196, 78, 67, 0.34)";
  ctx.lineWidth = curbHalfWidth * 2 - 6;
  strokeCircuitPath(track.path);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = TRACK_PALETTE.road;
  ctx.lineWidth = track.roadHalfWidth * 2;
  strokeCircuitPath(track.path);
  ctx.stroke();

  ctx.strokeStyle = "rgba(238, 243, 236, 0.22)";
  ctx.lineWidth = ROAD_MARKING.widthM * PX_PER_METER;
  ctx.setLineDash([ROAD_MARKING.dashM * PX_PER_METER, ROAD_MARKING.gapM * PX_PER_METER]);
  strokeCircuitPath(track.path);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();

  drawCircuitStartMarker();
}

function drawCircuitStartMarker() {
  const track = TRACKS.circuit;
  const startAngle = getPathSegmentAngle(track.path, 0);
  const stripeCount = 8;
  const lineLength = track.roadHalfWidth * 2;
  const stripeWidth = lineLength / stripeCount;
  const stripeHeight = 2 * PX_PER_METER;

  ctx.save();
  ctx.translate(track.startX, track.startY);
  ctx.rotate(startAngle + Math.PI / 2);
  for (let i = 0; i < stripeCount; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#f0efe5" : "#111514";
    ctx.fillRect(-lineLength / 2 + i * stripeWidth, -stripeHeight / 2, stripeWidth, stripeHeight);
  }
  ctx.restore();
}

function getPathSegmentAngle(points, index) {
  const current = points[index % points.length];
  const next = points[(index + 1) % points.length];

  return Math.atan2(next[1] - current[1], next[0] - current[0]);
}

function buildSmoothedCircuitSamples(points, stepsPerCurve) {
  const first = points[0];
  const samples = [[first[0], first[1]]];
  let fromX = first[0];
  let fromY = first[1];

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const controlX = current[0];
    const controlY = current[1];
    const toX = (current[0] + next[0]) / 2;
    const toY = (current[1] + next[1]) / 2;

    for (let step = 1; step <= stepsPerCurve; step += 1) {
      const t = step / stepsPerCurve;
      const inverse = 1 - t;
      const x = inverse * inverse * fromX + 2 * inverse * t * controlX + t * t * toX;
      const y = inverse * inverse * fromY + 2 * inverse * t * controlY + t * t * toY;
      samples.push([x, y]);
    }

    fromX = toX;
    fromY = toY;
  }

  return samples;
}

function strokeCircuitPath(points) {
  const first = points[0];
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const midX = (current[0] + next[0]) / 2;
    const midY = (current[1] + next[1]) / 2;
    ctx.quadraticCurveTo(current[0], current[1], midX, midY);
  }

  ctx.closePath();
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

function resolveTrackFence() {
  const track = TRACKS.circuit;
  const sample = getTrackSample(car.x, car.y);
  const fenceLimit = track.roadHalfWidth + track.curbWidth + track.grassWidth + track.fencePadding - car.radius * 0.35;

  if (sample.distance <= fenceLimit) {
    return;
  }

  const push = sample.distance - fenceLimit;
  car.x -= sample.normal.x * push;
  car.y -= sample.normal.y * push;

  const outwardSpeed = dot(car.vx, car.vy, sample.normal.x, sample.normal.y);
  if (outwardSpeed > 0) {
    const incomingSpeed = Math.hypot(car.vx, car.vy);
    const travelX = incomingSpeed > 0.001 ? car.vx / incomingSpeed : 0;
    const travelY = incomingSpeed > 0.001 ? car.vy / incomingSpeed : 0;
    const tangentProjection = dot(travelX, travelY, sample.tangent.x, sample.tangent.y);
    const normalProjection = dot(travelX, travelY, sample.normal.x, sample.normal.y);
    const reflectedX = travelX - 2 * normalProjection * sample.normal.x;
    const reflectedY = travelY - 2 * normalProjection * sample.normal.y;
    const reflectedLength = Math.hypot(reflectedX, reflectedY) || 1;
    const retainedSpeed = incomingSpeed * Math.abs(tangentProjection);

    car.vx = reflectedX / reflectedLength * retainedSpeed;
    car.vy = reflectedY / reflectedLength * retainedSpeed;
    driftAmount *= FENCE_COLLISION.driftKeep;

    const collisionAngle = Math.atan2(reflectedY, reflectedX);
    car.moveAngleRad = collisionAngle;
    car.bodyAngleRad = collisionAngle;
    car.angle = collisionAngle;
  }
}

function updateCamera(dt) {
  const minZoom = activeTrackId === "circuit" ? 0.42 : 0.7;
  const maxZoom = activeTrackId === "circuit" ? 0.7 : 1;
  const baseZoom = clamp(Math.min(view.width / 1040, view.height / 560), minZoom, maxZoom);
  const lookAhead = angleVector(car.bodyAngleRad);
  const unclampedTargetX = car.x + lookAhead.x * 22;
  const unclampedTargetY = car.y + lookAhead.y * 8;
  const halfViewW = view.width / 2 / baseZoom;
  const halfViewH = view.height / 2 / baseZoom;
  const targetX = clamp(unclampedTargetX, halfViewW, WORLD.width - halfViewW);
  const targetY = clamp(unclampedTargetY, halfViewH, WORLD.height - halfViewH);

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
  surfaceEl.textContent = currentSurface.label;
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
  currentSurface = getSurfaceAt(car.x, car.y);
  previousSurface = currentSurface;
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
    slideHoldKmh: readNumber(slide.hold_kmh, "handling.slide.hold_kmh"),
    slideFullKmh: readNumber(slide.full_kmh, "handling.slide.full_kmh"),
    slideBrakeBonus: readNumber(slide.brake_bonus, "handling.slide.brake_bonus"),
    slideThrottleKeep: readNumber(slide.throttle_keep, "handling.slide.throttle_keep"),
    slideDrag: readNumber(slide.drag, "handling.slide.drag"),
    slideDecelKmhS: readNumber(slide.decel_kmh_s, "handling.slide.decel_kmh_s"),
    slideSustainKmh: readNumber(slide.sustain_kmh, "handling.slide.sustain_kmh"),
    slideRecoverKmhS: readNumber(slide.recover_kmh_s, "handling.slide.recover_kmh_s"),
    turnDrag: readNumber(turn.drag, "handling.turn.drag"),
    turnDecelKmhS: readNumber(turn.decel_kmh_s, "handling.turn.decel_kmh_s"),
    turnSustainKmh: readNumber(turn.sustain_kmh, "handling.turn.sustain_kmh"),
    turnRecoverKmhS: readNumber(turn.recover_kmh_s, "handling.turn.recover_kmh_s"),
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

function getSlideTarget(input, speedAbsKmh, currentSlipDeg, brakingForward) {
  const steerAmount = Math.abs(input.steer);
  const steerPressure = smoothstep(TUNING.slideSteerAt, 1, steerAmount);
  const enterSpeedPressure = smoothstep(TUNING.slideMinKmh, TUNING.slideFullKmh, speedAbsKmh);
  const holdSpeedPressure = smoothstep(TUNING.slideHoldKmh, TUNING.slideFullKmh, speedAbsKmh);
  const speedPressure = driftAmount > DRIFT_ACTIVE_MIN_AMOUNT
    ? Math.max(enterSpeedPressure, holdSpeedPressure)
    : enterSpeedPressure;
  const slipPressure = smoothstep(TUNING.slipSoftDeg, TUNING.slipMaxDeg, Math.abs(currentSlipDeg));
  const brakePressure = brakingForward ? TUNING.slideBrakeBonus : 0;
  const counterSteer = Math.sign(input.steer) !== 0 && Math.sign(input.steer) === -Math.sign(currentSlipDeg);
  const recovery = counterSteer ? TUNING.counterSteerAssist * driftAmount : 0;
  const target = steerPressure * speedPressure + slipPressure * 0.55 + brakePressure - recovery;

  return clamp(target, 0, 1);
}

function getTireTrailIntensity(slideAmount, brakingForward, speedKmh) {
  const brakeTrail = brakingForward && speedKmh > BRAKE_TRAIL_MIN_KMH ? BRAKE_TRAIL_INTENSITY : 0;

  return Math.max(slideAmount, brakeTrail);
}

function getSurfaceAt(x, y) {
  if (activeTrackId !== "circuit") {
    return SURFACE.road;
  }

  const track = TRACKS.circuit;
  const sample = getTrackSample(x, y);

  if (sample.distance <= track.roadHalfWidth) {
    return SURFACE.road;
  }

  if (sample.distance <= track.roadHalfWidth + track.curbWidth) {
    return SURFACE.curb;
  }

  return SURFACE.grass;
}

function getTrackSample(x, y) {
  const path = TRACKS.circuit.collisionPath ?? TRACKS.circuit.path;
  let best = null;

  for (let i = 0; i < path.length; i += 1) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const sample = getSegmentSample(x, y, a, b);

    if (!best || sample.distanceSq < best.distanceSq) {
      best = sample;
    }
  }

  return best;
}

function getSegmentSample(x, y, a, b) {
  const ax = a[0];
  const ay = a[1];
  const bx = b[0];
  const by = b[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const ratio = lengthSq > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / lengthSq, 0, 1) : 0;
  const px = ax + dx * ratio;
  const py = ay + dy * ratio;
  const nx = x - px;
  const ny = y - py;
  const distanceSq = nx * nx + ny * ny;
  const distance = Math.sqrt(distanceSq);
  const normal = distance > 0.0001
    ? { x: nx / distance, y: ny / distance }
    : { x: -dy / Math.sqrt(lengthSq || 1), y: dx / Math.sqrt(lengthSq || 1) };
  const segmentLength = Math.sqrt(lengthSq || 1);
  const tangent = { x: dx / segmentLength, y: dy / segmentLength };

  return { x: px, y: py, normal, tangent, distance, distanceSq };
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

function applySurfaceEntrySpeedDrop(forwardSpeed, fromSurface, toSurface) {
  if (forwardSpeed === 0 || toSurface.speedDropScale >= fromSurface.speedDropScale) {
    return forwardSpeed;
  }

  return forwardSpeed * toSurface.speedDropScale;
}

function applyTurnAndSlideSpeedLoss(forwardSpeed, steerAmount, slideAmount, throttle, dt) {
  const speedKmh = Math.abs(toKmh(toGameSpeed(forwardSpeed)));
  const speedPressure = smoothstep(25, 85, speedKmh);
  const turnAmount = smoothstep(0.08, 1, steerAmount) * speedPressure * (1 - slideAmount);
  if (turnAmount <= 0 && slideAmount <= 0) {
    return forwardSpeed;
  }

  const sign = Math.sign(forwardSpeed) || 1;
  const speedPx = Math.abs(forwardSpeed);
  const speedGame = toGameSpeed(speedPx);
  const speedKmhAbs = toKmh(speedGame);
  const sustainKmh = throttle > 0 ? getCornerSustainKmh(slideAmount) : 0;
  const excessKmh = Math.max(0, speedKmhAbs - sustainKmh);

  if (excessKmh <= 0) {
    return forwardSpeed;
  }

  const drag = TUNING.turnDrag * turnAmount + TUNING.slideDrag * slideAmount;
  const decelKmhS = TUNING.turnDecelKmhS * turnAmount + TUNING.slideDecelKmhS * slideAmount;
  const lossKmh = Math.min(excessKmh, (excessKmh * drag + decelKmhS) * dt);
  const nextSpeed = toPixels(toGameSpeedFromKmh(Math.max(0, speedKmhAbs - lossKmh)));

  return sign * nextSpeed;
}

function applyCornerSustain(forwardSpeed, steerAmount, slideAmount, throttle, dt) {
  if (throttle <= 0) {
    return forwardSpeed;
  }

  const turnAmount = smoothstep(0.08, 1, steerAmount) * (1 - slideAmount);
  const cornerAmount = Math.max(turnAmount, slideAmount);
  if (cornerAmount <= 0) {
    return forwardSpeed;
  }

  const sign = Math.sign(forwardSpeed) || 1;
  const speedKmh = Math.abs(toKmh(toGameSpeed(forwardSpeed)));
  const sustainKmh = getCornerSustainKmh(slideAmount);
  if (speedKmh >= sustainKmh) {
    return forwardSpeed;
  }

  const recoverKmhS = lerp(TUNING.turnRecoverKmhS, TUNING.slideRecoverKmhS, slideAmount) * cornerAmount;
  const nextSpeedKmh = Math.min(sustainKmh, speedKmh + recoverKmhS * dt);

  return sign * toPixels(toGameSpeedFromKmh(nextSpeedKmh));
}

function getCornerSustainKmh(slideAmount) {
  return lerp(TUNING.turnSustainKmh, TUNING.slideSustainKmh, slideAmount);
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

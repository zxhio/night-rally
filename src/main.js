const VEHICLE_DATA_URL = "data/cars/baseline.json?v=20260601-track-data";
const TRACK_DATA_URL = "data/tracks/index.json?v=20260601-track-data";
const TRACK_DATA_BASE_URL = "data/tracks/";
const LEADERBOARD_STORAGE_KEY = "night-rally.leaderboard.v1";
const REPLAY_STORAGE_KEY = "night-rally.replays.v1";
const PLAYER_PROFILE_STORAGE_KEY = "night-rally.playerProfile.v1";
const DISPLAY_SETTINGS_STORAGE_KEY = "night-rally.displaySettings.v1";
const LOCAL_RECORDS_EXPORT_VERSION = 1;
const LEADERBOARD_RECORD_VERSION = 2;
const LEADERBOARD_MAX_RECORDS_PER_TRACK = 50;
const LEADERBOARD_DISPLAY_LIMIT = 20;
const REPLAY_MAX_RECORDS = 30;
const REPLAY_KEYFRAME_INTERVAL_S = 0.1;

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

let TRACKS = {};
let TRACK_LIST = [];

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
const SKID_MARKS_MAX = 260;
const DRIFT_ACTIVE_MIN_AMOUNT = 0.04;
const DRIFT_RESET_MIN_AMOUNT = 0.005;
const DRIFT_TRAIL_MIN_AMOUNT = 0.08;
const DRIFT_TRAIL_MIN_KMH = 20;
const DRIFT_TRAIL_FADE = 0.996;
const BRAKE_TRAIL_MIN_KMH = 35;
const BRAKE_TRAIL_INTENSITY = 0.3;
const TURN_RADIUS_MAX_M = 999;
const HUD_UPDATE_INTERVAL_S = 0.1;
const THUMBNAIL_UPDATE_INTERVAL_S = 0.12;
const LAP_STATE = {
  ready: "ready",
  running: "running",
  finishing: "finishing",
  finished: "finished",
};
const GAME_STATE = {
  menu: "menu",
  trackSelect: "track_select",
  trackAction: "track_action",
  recordSelect: "record_select",
  recordTools: "record_tools",
  multiplayer: "multiplayer",
  settings: "settings",
  countdown: "countdown",
  racing: "racing",
  finishCoast: "finish_coast",
  result: "result",
  replay: "replay",
};
const INPUT_ACTIONS = {
  accelerate: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown"],
  steerLeft: ["KeyA", "ArrowLeft"],
  steerRight: ["KeyD", "ArrowRight"],
};
const LAP_PROGRESS_JUMP_BUFFER_M = 18;
const LAP_FINISH_LINE_WINDOW_M = 90;
const DEFAULT_LAP_CHECKPOINT_COUNT = 4;
const LAP_SAMPLE_WINDOW_SEGMENTS = 48;
const TRACK_CORRIDOR_SAMPLE_WINDOW_SEGMENTS = 96;
const LAP_REVERSE_CORRECT_M = 40;
const LAP_REVERSE_CORRECT_AHEAD_M = 6;
const LAP_FINISH_COAST_S = 2;
const SURFACE = {
  road: { label: "Road", speedDropScale: 1, accelScale: 1, steer: 1 },
  curb: { label: "Curb", speedDropScale: 0.95, accelScale: 1, steer: 0.94 },
  grass: { label: "Grass", speedDropScale: 0.9, accelScale: 0.8, steer: 0.8 },
};
const GRASS_SURFACE = {
  speedDropMin: 0.5,
  accelMin: 0.65,
  steerMin: 0.82,
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
const DEFAULT_PLAYER_PROFILE = {
  playerId: "legacy-player",
  name: "Player",
  color: "#d64141",
};
const DEFAULT_DISPLAY_SETTINGS = {
  advancedHudVisible: false,
};
const PLAYER_COLOR_OPTIONS = ["#d64141", "#2f80ed", "#2fbf71", "#f0b43f", "#b86ff0", "#f46d43"];
const SETTINGS_ITEM_COUNT = 3;
const SETTINGS_ITEM = {
  name: 0,
  color: 1,
  display: 2,
};
const TRACK_ACTION_ITEMS = [
  {
    id: "start",
    title: "开始",
    detail: "直接开跑，不使用记录",
  },
  {
    id: "challenge",
    title: "挑战记录",
    detail: "选择一条本地记录作为 Ghost",
  },
  {
    id: "records",
    title: "导入导出记录",
    detail: "管理当前地图的本地记录",
  },
];
const MAIN_MENU_ITEMS = [
  {
    id: "practice",
    title: "练习模式",
    detail: "默认地图直接开跑",
  },
  {
    id: "race",
    title: "竞速模式",
    detail: "选择地图和记录",
  },
  {
    id: "multiplayer",
    title: "多人模式",
    detail: "待开发",
  },
  {
    id: "settings",
    title: "设置",
    detail: "车手档案和详细数据",
  },
];

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
const hudEl = document.querySelector(".hud");
const hudHintEl = document.querySelector("#hud-hint");
const steerEl = document.querySelector("#steer");
const slipEl = document.querySelector("#slip");
const driftEl = document.querySelector("#drift");
const yawEl = document.querySelector("#yaw");
const radiusEl = document.querySelector("#radius");
const surfaceEl = document.querySelector("#surface");
const lapStateEl = document.querySelector("#lap-state");
const lapProgressEl = document.querySelector("#lap-progress");
const trackPanel = document.querySelector("#track-panel");
const resultPanel = document.querySelector("#result-panel");
const controlHintEl = document.querySelector("#control-hint");

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
let activeTrackId = null;
let selectedTrackId = null;
let defaultTrackId = null;
let gameState = GAME_STATE.menu;
let trackSelectorState = "";
let selectedMainMenuIndex = 0;
let selectedTrackActionIndex = 0;
let selectedRecordIndex = 0;
let selectedGhostReplayId = null;
let leaderboardState = "";
let localRecordsStatus = "";
let playerProfile = loadPlayerProfile();
let playerProfileState = getPlayerProfileState();
let selectedSettingsIndex = SETTINGS_ITEM.name;
let selectedSettingsColorIndex = getPlayerColorIndex(playerProfile.color);
let displaySettings = loadDisplaySettings();
let currentSurface = SURFACE.road;
let previousSurface = SURFACE.road;
let lapState = LAP_STATE.ready;
let lapTime = 0;
let lapDistance = 0;
let lapProgress = 0;
let lapLastProgressM = 0;
let lapLastSegmentIndex = 0;
let lapReverseM = 0;
let lapNextCheckpointIndex = 0;
let lapPassedCheckpoints = 0;
let lapFinishCoastTime = 0;
let lapFinishVx = 0;
let lapFinishVy = 0;
let finishRecorded = false;
let lastFinishResult = null;
let inputTick = 0;
let inputFrame = createEmptyInputFrame();
let replayCapture = createEmptyReplayCapture();
let replayPlayback = null;
let hudUpdateAccumulator = HUD_UPDATE_INTERVAL_S;
let thumbnailUpdateAccumulator = THUMBNAIL_UPDATE_INTERVAL_S;
let advancedHudVisible = displaySettings.advancedHudVisible;
const skidMarks = [];

applyAdvancedHudVisibility();

window.addEventListener("keydown", (event) => {
  if (!activeTrackId) {
    return;
  }

  if (isMenuOverlayMode()) {
    if (!isTextEntryTarget(event)) {
      event.preventDefault();
      handleMenuOverlayKey(event);
    }
    return;
  }

  if (event.code === "KeyH" && !isTextEntryTarget(event)) {
    toggleAdvancedHud();
    return;
  }

  if (event.code === "KeyR") {
    resetCar();
    openTrackSelection();
    return;
  }

  if (gameState === GAME_STATE.replay) {
    return;
  }

  if (gameState === GAME_STATE.result && (event.code === "Enter" || event.code === "Space")) {
    restartCurrentTrack();
    return;
  }

  if (/^Digit[1-9]$/.test(event.code)) {
    const track = TRACK_LIST[Number(event.code.slice(5)) - 1];
    if (track) {
      confirmTrackSelection(track.id);
    }
    return;
  }

  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("resize", resize);
resize();
drawStatus("Loading data...");

Promise.all([loadJson(VEHICLE_DATA_URL), loadTrackData(TRACK_DATA_URL)])
  .then(([model, trackData]) => {
    applyVehicleModel(model);
    applyTrackData(trackData);
    resetCar();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  })
  .catch(handleLoadError);

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  update(dt);
  if (!isMenuOverlayMode()) {
    draw(getRenderState());
  }
  requestAnimationFrame(loop);
}

function update(dt) {
  if (isMenuOverlayMode()) {
    steeringInput = updateSteeringInput(steeringInput, 0, dt);
    updateCamera(dt);
    updateHud(dt);
    return;
  }

  const input = readInputFrame();
  if (gameState === GAME_STATE.replay) {
    updateReplayPlayback(dt);
    updateCamera(dt);
    updateHud(dt);
    return;
  }

  if (gameState === GAME_STATE.result && hasTimedRunTrack()) {
    holdFinishedLap(dt);
    return;
  }

  if (gameState === GAME_STATE.finishCoast && hasTimedRunTrack()) {
    updateFinishCoast(dt);
    return;
  }

  updateDrivingSimulation(input, dt);
  updateCamera(dt);
  updateHud(dt);
}

function updateDrivingSimulation(input, dt) {
  if (!testActive && input.throttle > 0) {
    testActive = true;
  }
  updateStraightStartMode(input);
  maybeStartReplayCapture(input);
  captureReplayInput(input);

  previousSurface = currentSurface;
  currentSurface = getSurfaceAt(car.x, car.y);
  steeringInput = updateSteeringInput(steeringInput, input.steer * currentSurface.steer, dt);
  const driveInput = {
    ...input,
    steer: steeringInput,
  };
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
  const yawControl = getArcadeYawControl(driveInput.steer, speedAbsKmh, slipBeforeDeg);
  yawRateDegS = yawControl.yawRateDegS;
  turnRadiusM = getTurnRadiusM(speedAbsKmh, yawRateDegS);
  const reverseTurn = forwardSpeed < -0.1 ? -1 : 1;
  car.bodyAngleRad += degToRad(yawRateDegS) * reverseTurn * dt;
  car.angle = car.bodyAngleRad;

  forward = angleVector(car.bodyAngleRad);
  right = { x: -forward.y, y: forward.x };

  const slideTarget = getSlideTarget(driveInput, speedAbsKmh, slipBeforeDeg, brakingForward);
  const slideRate = slideTarget > driftAmount ? TUNING.slideBuildRate : TUNING.slideReleaseRate;
  driftAmount = expFollow(driftAmount, slideTarget, slideRate, dt);
  driftActive = driftAmount > DRIFT_ACTIVE_MIN_AMOUNT;
  if (driftAmount < DRIFT_RESET_MIN_AMOUNT && slideTarget < DRIFT_RESET_MIN_AMOUNT) {
    driftAmount = 0;
  }
  forwardSpeed = applyTurnAndSlideSpeedLoss(forwardSpeed, Math.abs(driveInput.steer), driftAmount, input.throttle, dt);
  forwardSpeed = applyCornerSustain(forwardSpeed, Math.abs(driveInput.steer), driftAmount, input.throttle, dt);

  const counterSteer = Math.sign(driveInput.steer) !== 0 && Math.sign(driveInput.steer) === -Math.sign(slipBeforeDeg);
  const recoveryGrip = counterSteer ? TUNING.counterSteerAssist * driftAmount + TUNING.recoverAssist : 0;
  const noSteerGrip = Math.abs(driveInput.steer) < 0.05 ? TUNING.straightenAssist * (1 - driftAmount) : 0;
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
  const frameDistanceM = Math.hypot(car.x - previousX, car.y - previousY) * METERS_PER_PIXEL;

  if (testActive) {
    testTime += dt;
  }
  testDistance += frameDistanceM;
  updateAccelerationMeter(dt);

  resolveBounds();
  if (hasFenceTrack()) {
    resolveTrackFence();
  }
  updateLapMode(input, dt, frameDistanceM);
  updateStraightFinishMode();
  slipDeg = Math.abs(radToDeg(angleDelta(car.bodyAngleRad, car.moveAngleRad)));
  captureReplayKeyframe(dt);
  const trailIntensity = getTireTrailIntensity(driftAmount, brakingForward, speedAbsKmh);
  addSkidMarks(forward, right, moveDirection, trailIntensity, speedAbsKmh);
}

function getRenderState() {
  return {
    track: getActiveTrack(),
    camera: { ...camera },
    car: { ...car },
    view: { ...view },
  };
}

function draw(renderState = getRenderState()) {
  ctx.clearRect(0, 0, view.width, view.height);

  ctx.save();
  ctx.translate(view.width / 2, view.height / 2);
  ctx.scale(renderState.camera.zoom, renderState.camera.zoom);
  ctx.translate(-renderState.camera.x, -renderState.camera.y);

  drawWorld(renderState);
  drawTrack(renderState);
  drawSkidMarks();
  drawGhostCar();
  drawCarShadow();
  drawCar();

  ctx.restore();
}

function drawWorld(renderState = getRenderState()) {
  const track = renderState.track;
  const visibleBounds = getVisibleWorldBounds();

  ctx.fillStyle = track.background ?? "#b78345";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  if (track.type === "circuit") {
    drawDirtTexture(track, visibleBounds);
  }

  ctx.strokeStyle = "rgba(238, 243, 236, 0.04)";
  ctx.lineWidth = 1;
  for (let x = visibleBounds.minX; x <= visibleBounds.maxX; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.height);
    ctx.stroke();
  }

  ctx.strokeStyle = track.type === "circuit" ? "rgba(54, 41, 28, 0.42)" : "#111514";
  ctx.lineWidth = 24;
  ctx.strokeRect(12, 12, WORLD.width - 24, WORLD.height - 24);
}

function getVisibleWorldBounds(padding = 160) {
  const halfWidth = view.width / 2 / camera.zoom;
  const halfHeight = view.height / 2 / camera.zoom;

  return {
    minX: Math.max(0, Math.floor((camera.x - halfWidth - padding) / 100) * 100),
    maxX: Math.min(WORLD.width, Math.ceil((camera.x + halfWidth + padding) / 100) * 100),
    minY: Math.max(0, camera.y - halfHeight - padding),
    maxY: Math.min(WORLD.height, camera.y + halfHeight + padding),
  };
}

function drawDirtTexture(track, visibleBounds) {
  for (const speck of track.dirtSpecks) {
    if (
      speck.x < visibleBounds.minX
      || speck.x > visibleBounds.maxX
      || speck.y < visibleBounds.minY
      || speck.y > visibleBounds.maxY
    ) {
      continue;
    }

    ctx.fillStyle = `rgba(91, 59, 29, ${speck.a * 0.72})`;
    ctx.beginPath();
    ctx.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTrack(renderState = getRenderState()) {
  const track = renderState.track;
  if (track.type === "circuit") {
    drawCircuit(track);
    return;
  }

  drawRunway(track);
}

function drawRunway(track) {
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

  drawStartMarker(track);
}

function drawCircuit(track) {
  const grassHalfWidth = track.roadHalfWidth + track.curbWidth + track.grassWidth;
  const curbHalfWidth = track.roadHalfWidth + track.curbWidth;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.strokeStyle = "rgba(32, 46, 25, 0.54)";
  ctx.lineWidth = grassHalfWidth * 2 + 4;
  strokeCircuitPath(track.path);
  ctx.stroke();

  ctx.strokeStyle = TRACK_PALETTE.grassOuter;
  ctx.lineWidth = grassHalfWidth * 2;
  strokeCircuitPath(track.path);
  ctx.stroke();

  if (track.curbWidth > 0) {
    ctx.strokeStyle = TRACK_PALETTE.curbOuter;
    ctx.lineWidth = curbHalfWidth * 2;
    strokeCircuitPath(track.path);
    ctx.stroke();

    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = "rgba(196, 78, 67, 0.34)";
    ctx.lineWidth = Math.max(1, curbHalfWidth * 2 - 6);
    strokeCircuitPath(track.path);
    ctx.stroke();
    ctx.setLineDash([]);
  }

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

  drawCircuitStartMarker(track);
}

function drawCircuitStartMarker(track) {
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

function buildPathMetrics(points) {
  const cumulativePx = [0];
  let lengthPx = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    lengthPx += Math.hypot(next[0] - current[0], next[1] - current[1]);
    cumulativePx.push(lengthPx);
  }

  return {
    cumulativePx,
    lengthPx,
    lengthM: lengthPx / PX_PER_METER,
  };
}

function getTrackPoseAtProgress(track, progressM) {
  const progressPx = wrap(progressM * PX_PER_METER, track.lap.lengthPx);
  const path = track.collisionPath;
  const cumulative = track.lap.cumulativePx;
  let segmentIndex = 0;

  for (let i = 1; i < cumulative.length; i += 1) {
    if (progressPx <= cumulative[i]) {
      segmentIndex = i - 1;
      break;
    }
  }

  const segmentStartPx = cumulative[segmentIndex];
  const segmentEndPx = cumulative[segmentIndex + 1] ?? track.lap.lengthPx;
  const segmentLengthPx = Math.max(1, segmentEndPx - segmentStartPx);
  const ratio = clamp((progressPx - segmentStartPx) / segmentLengthPx, 0, 1);
  const a = path[segmentIndex];
  const b = path[(segmentIndex + 1) % path.length];
  const x = lerp(a[0], b[0], ratio);
  const y = lerp(a[1], b[1], ratio);
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);

  return { x, y, angle, progressPx };
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

function drawStartMarker(track) {
  const x = track.startX - 4 * PX_PER_METER;
  const y = WORLD.runwayY - WORLD.runwayWidth / 2;
  const stripeCount = 8;
  const stripeHeight = WORLD.runwayWidth / stripeCount;
  const stripeWidth = 2 * PX_PER_METER;

  drawRunwayMarker(x, y, stripeWidth, stripeHeight, stripeCount);

  if (Number.isFinite(track.finishDistanceM)) {
    drawRunwayMarker(track.startX + track.finishDistanceM * PX_PER_METER, y, stripeWidth, stripeHeight, stripeCount);
  }
}

function drawRunwayMarker(x, y, stripeWidth, stripeHeight, stripeCount) {
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
  const colors = getCarPaint(playerProfile.color);
  drawCarBody({
    x: car.x,
    y: car.y,
    angle: car.bodyAngleRad,
    drift: driftAmount,
    alpha: 1,
    bodyColor: colors.body,
    noseColor: colors.nose,
    cabinColor: "#151917",
    wheelColor: "#222626",
  });
}

function drawCarBody({
  x,
  y,
  angle,
  drift = 0,
  alpha = 1,
  bodyColor = "#d64141",
  noseColor = "#f0d36a",
  cabinColor = "#151917",
  wheelColor = "#222626",
}) {
  const bodyLength = CAR_SPEC.lengthM * PX_PER_METER;
  const bodyWidth = CAR_SPEC.widthM * PX_PER_METER;
  const wheelbase = CAR_SPEC.wheelbaseM * PX_PER_METER;
  const axleOffset = wheelbase / 2;
  const wheelLength = bodyLength * 0.22;
  const wheelWidth = 5;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (drift > 0.1) {
    ctx.strokeStyle = `rgba(238, 243, 236, ${0.12 + drift * 0.34})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.32, -bodyWidth * 0.56);
    ctx.lineTo(-bodyLength * 0.92 - drift * 34, -bodyWidth * 0.72);
    ctx.moveTo(-bodyLength * 0.32, bodyWidth * 0.56);
    ctx.lineTo(-bodyLength * 0.92 - drift * 34, bodyWidth * 0.72);
    ctx.stroke();
  }

  ctx.fillStyle = bodyColor;
  roundRect(-bodyLength / 2, -bodyWidth / 2, bodyLength, bodyWidth, 6);
  ctx.fill();

  ctx.fillStyle = noseColor;
  ctx.beginPath();
  ctx.moveTo(bodyLength / 2 - bodyLength * 0.18, -bodyWidth * 0.36);
  ctx.lineTo(bodyLength / 2 + bodyLength * 0.08, 0);
  ctx.lineTo(bodyLength / 2 - bodyLength * 0.18, bodyWidth * 0.36);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = cabinColor;
  ctx.fillRect(-bodyLength * 0.22, -bodyWidth * 0.35, bodyLength * 0.34, bodyWidth * 0.7);

  ctx.fillStyle = wheelColor;
  ctx.fillRect(-axleOffset - wheelLength / 2, -bodyWidth / 2 - wheelWidth, wheelLength, wheelWidth);
  ctx.fillRect(axleOffset - wheelLength / 2, -bodyWidth / 2 - wheelWidth, wheelLength, wheelWidth);
  ctx.fillRect(-axleOffset - wheelLength / 2, bodyWidth / 2, wheelLength, wheelWidth);
  ctx.fillRect(axleOffset - wheelLength / 2, bodyWidth / 2, wheelLength, wheelWidth);

  ctx.restore();
}

function drawGhostCar() {
  if (gameState !== GAME_STATE.racing || !hasTimedRunTrack()) {
    return;
  }

  const ghost = getActiveGhostPose();
  if (!ghost) {
    return;
  }

  drawCarBody({
    x: ghost.x,
    y: ghost.y,
    angle: ghost.bodyAngleRad,
    alpha: 0.42,
    bodyColor: ghost.color ?? "#eef3ec",
    noseColor: "#eef3ec",
    cabinColor: "#3d4744",
    wheelColor: "#eef3ec",
  });
}

function getActiveGhostPose() {
  const track = getActiveTrack();
  const replay = getReplayRecord(selectedGhostReplayId);
  const timeS = hasLapTrack(track) ? lapTime : testTime;

  if (!replay || replay.trackId !== track.id || !Number.isFinite(timeS)) {
    return null;
  }

  const pose = sampleReplayPose(replay, timeS);

  return pose ? {
    ...pose,
    color: replay.player?.color,
  } : null;
}

function sampleReplayPose(replay, timeS) {
  const keyframes = replay.keyframes;
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    return null;
  }

  if (timeS <= keyframes[0].t) {
    return keyframes[0];
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (timeS <= next.t) {
      const ratio = clamp((timeS - current.t) / Math.max(0.001, next.t - current.t), 0, 1);

      return interpolateReplayPose(current, next, ratio);
    }
  }

  return keyframes[keyframes.length - 1];
}

function interpolateReplayPose(current, next, ratio) {
  const pose = {
    x: lerp(current.x, next.x, ratio),
    y: lerp(current.y, next.y, ratio),
    bodyAngleRad: lerpAngle(current.bodyAngleRad, next.bodyAngleRad, ratio),
    moveAngleRad: lerpAngle(current.moveAngleRad, next.moveAngleRad, ratio),
  };
  const replayMetrics = [
    "vx",
    "vy",
    "speedKmh",
    "accelG",
    "driftAmount",
    "steeringInput",
    "slipDeg",
    "yawRateDegS",
    "turnRadiusM",
    "testTime",
    "testDistance",
    "lapTime",
    "lapDistance",
    "lapProgress",
  ];

  for (const metric of replayMetrics) {
    if (Number.isFinite(current[metric]) && Number.isFinite(next[metric])) {
      pose[metric] = lerp(current[metric], next[metric], ratio);
    }
  }

  return pose;
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

  let expiredCount = 0;
  while (expiredCount < skidMarks.length && skidMarks[expiredCount].life < 0.08) {
    expiredCount += 1;
  }

  if (expiredCount > 0) {
    skidMarks.splice(0, expiredCount);
  }

  ctx.restore();
}

function createEmptyInputFrame() {
  return {
    tick: 0,
    throttle: 0,
    steer: 0,
    accelerate: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
  };
}

function readInputFrame() {
  inputTick += 1;
  inputFrame = {
    tick: inputTick,
    accelerate: isInputActionPressed("accelerate"),
    brake: isInputActionPressed("brake"),
    steerLeft: isInputActionPressed("steerLeft"),
    steerRight: isInputActionPressed("steerRight"),
  };
  inputFrame.throttle = Number(inputFrame.accelerate) - Number(inputFrame.brake);
  inputFrame.steer = Number(inputFrame.steerRight) - Number(inputFrame.steerLeft);

  return inputFrame;
}

function isInputActionPressed(action) {
  return INPUT_ACTIONS[action].some((code) => keys.has(code));
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
  const track = getActiveTrack();
  const sample = getTrackCorridorSample(track, car.x, car.y);
  const fenceLimit = getGrassEdgeLimit(track) - car.radius * 0.35;

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

function updateLapMode(input, dt, frameDistanceM) {
  if (!hasLapTrack()) {
    return;
  }

  const track = getActiveTrack();
  const sample = getLapTrackSample(track, car.x, car.y);
  const sampleProgressM = sample.progressPx * METERS_PER_PIXEL;

  if (lapState === LAP_STATE.ready) {
    lapLastProgressM = sampleProgressM;
    lapLastSegmentIndex = sample.segmentIndex;
    lapDistance = 0;
    lapProgress = 0;
    resetLapCheckpointProgress();

    if (input.throttle > 0) {
      lapState = LAP_STATE.running;
      setGameState(GAME_STATE.racing);
      lapTime = 0;
    }

    return;
  }

  if (lapState !== LAP_STATE.running) {
    return;
  }

  lapTime += dt;

  let progressDeltaM = sampleProgressM - lapLastProgressM;
  if (progressDeltaM < -track.lap.lengthM / 2) {
    progressDeltaM += track.lap.lengthM;
  } else if (progressDeltaM > track.lap.lengthM / 2) {
    progressDeltaM -= track.lap.lengthM;
  }

  const maxProgressDeltaM = frameDistanceM + LAP_PROGRESS_JUMP_BUFFER_M;
  const crossedFinishLine = lapDistance > track.lap.lengthM - LAP_FINISH_LINE_WINDOW_M
    && lapLastProgressM > track.lap.lengthM - LAP_FINISH_LINE_WINDOW_M
    && sampleProgressM < LAP_FINISH_LINE_WINDOW_M
    && progressDeltaM > 0;

  if (progressDeltaM >= 0 && progressDeltaM <= maxProgressDeltaM) {
    lapDistance += progressDeltaM;
    lapLastProgressM = sampleProgressM;
    lapLastSegmentIndex = sample.segmentIndex;
    updateLapCheckpoints(track, lapDistance);
  } else if (progressDeltaM < 0 && Math.abs(progressDeltaM) <= maxProgressDeltaM) {
    lapReverseM += Math.abs(progressDeltaM);
    lapLastProgressM = sampleProgressM;
    lapLastSegmentIndex = sample.segmentIndex;
  } else if (progressDeltaM > 0) {
    lapReverseM = Math.max(0, lapReverseM - progressDeltaM);
  }

  if (lapReverseM >= LAP_REVERSE_CORRECT_M) {
    correctLapReverse(track);
    return;
  }

  const canFinish = hasPassedRequiredCheckpoints(track);
  if ((lapDistance >= track.lap.lengthM || crossedFinishLine) && canFinish) {
    lapDistance = track.lap.lengthM;
    recordFinishTime(track, lapTime);
    startLapFinishCoast();
  }

  lapProgress = clamp(lapDistance / track.lap.lengthM, 0, 1);
}

function updateStraightFinishMode() {
  const track = getActiveTrack();

  if (!hasStraightFinish(track) || lapState !== LAP_STATE.running || !testActive) {
    return;
  }

  if (testDistance >= track.finishDistanceM) {
    recordFinishTime(track, testTime);
    startLapFinishCoast();
  }
}

function updateStraightStartMode(input) {
  if (!hasStraightFinish() || lapState !== LAP_STATE.ready || input.throttle <= 0) {
    return;
  }

  lapState = LAP_STATE.running;
  setGameState(GAME_STATE.racing);
  testTime = 0;
  testDistance = 0;
}

function resetLapCheckpointProgress() {
  lapNextCheckpointIndex = 0;
  lapPassedCheckpoints = 0;
}

function updateLapCheckpoints(track, distanceM) {
  if (!Array.isArray(track.checkpoints)) {
    return;
  }

  while (
    lapNextCheckpointIndex < track.checkpoints.length
    && distanceM >= track.checkpoints[lapNextCheckpointIndex].progressM
  ) {
    lapNextCheckpointIndex += 1;
    lapPassedCheckpoints = lapNextCheckpointIndex;
  }
}

function hasPassedRequiredCheckpoints(track) {
  return !Array.isArray(track.checkpoints)
    || lapPassedCheckpoints >= track.checkpoints.length;
}

function holdFinishedLap(dt) {
  car.vx = 0;
  car.vy = 0;
  steeringInput = updateSteeringInput(steeringInput, 0, dt);
  driftAmount = 0;
  driftActive = false;
  yawRateDegS = 0;
  accelG = 0;
  lastSpeedKmh = 0;
  currentSurface = getSurfaceAt(car.x, car.y);
  previousSurface = currentSurface;
  slipDeg = Math.abs(radToDeg(angleDelta(car.bodyAngleRad, car.moveAngleRad)));
  updateCamera(dt);
  updateHud(dt);
}

function startLapFinishCoast() {
  lapState = LAP_STATE.finishing;
  setGameState(GAME_STATE.finishCoast);
  lapFinishCoastTime = 0;
  lapFinishVx = car.vx;
  lapFinishVy = car.vy;
  steeringInput = 0;
  driftAmount = 0;
  driftActive = false;
  yawRateDegS = 0;
  accelG = 0;
  lastSpeedKmh = Math.round(toKmh(toGameSpeed(Math.hypot(car.vx, car.vy))));
}

function updateFinishCoast(dt) {
  lapFinishCoastTime += dt;
  const previousX = car.x;
  const previousY = car.y;
  const remainingRatio = clamp(1 - lapFinishCoastTime / LAP_FINISH_COAST_S, 0, 1);

  car.vx = lapFinishVx * remainingRatio;
  car.vy = lapFinishVy * remainingRatio;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  resolveBounds();
  if (hasFenceTrack()) {
    resolveTrackFence();
  }
  testDistance += Math.hypot(car.x - previousX, car.y - previousY) * METERS_PER_PIXEL;
  steeringInput = 0;
  driftAmount = 0;
  driftActive = false;
  yawRateDegS = 0;
  accelG = 0;
  lastSpeedKmh = 0;
  currentSurface = getSurfaceAt(car.x, car.y);
  previousSurface = currentSurface;
  slipDeg = Math.abs(radToDeg(angleDelta(car.bodyAngleRad, car.moveAngleRad)));

  if (lapFinishCoastTime >= LAP_FINISH_COAST_S) {
    stopCarForLapFinish();
    lapState = LAP_STATE.finished;
    setGameState(GAME_STATE.result);
    updateResultPanel();
  }

  updateCamera(dt);
  updateHud(dt);
}

function stopCarForLapFinish() {
  car.vx = 0;
  car.vy = 0;
  driftAmount = 0;
  driftActive = false;
  yawRateDegS = 0;
  accelG = 0;
  lastSpeedKmh = 0;
  car.moveAngleRad = car.bodyAngleRad;
}

function correctLapReverse(track) {
  const correctedProgressM = clamp(lapDistance + LAP_REVERSE_CORRECT_AHEAD_M, 0, track.lap.lengthM - 1);
  const pose = getTrackPoseAtProgress(track, correctedProgressM);

  car.x = pose.x;
  car.y = pose.y;
  car.vx = 0;
  car.vy = 0;
  car.bodyAngleRad = pose.angle;
  car.moveAngleRad = pose.angle;
  car.angle = pose.angle;
  steeringInput = 0;
  driftAmount = 0;
  lapReverseM = 0;
  lapLastProgressM = pose.progressPx * METERS_PER_PIXEL;
  currentSurface = getSurfaceAt(car.x, car.y);
  previousSurface = currentSurface;
}

function updateCamera(dt) {
  const minZoom = isCircuitTrack() ? 0.48 : 0.7;
  const maxZoom = isCircuitTrack() ? 0.78 : 1;
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

function updateHud(dt = HUD_UPDATE_INTERVAL_S, force = false) {
  hudUpdateAccumulator += dt;
  thumbnailUpdateAccumulator += dt;

  if (!force && hudUpdateAccumulator < HUD_UPDATE_INTERVAL_S) {
    return;
  }

  hudUpdateAccumulator = 0;
  speedEl.textContent = String(Math.round(toKmh(toGameSpeed(Math.hypot(car.vx, car.vy)))));
  accelEl.textContent = formatAccelG(accelG);
  timeEl.textContent = formatTime(hasLapTrack() ? lapTime : testTime);
  distanceEl.textContent = testDistance.toFixed(1);
  steerEl.textContent = `${Math.round(steeringInput * 100)}%`;
  slipEl.textContent = String(Math.round(slipDeg));
  driftEl.textContent = `${Math.round(driftAmount * 100)}%`;
  yawEl.textContent = String(Math.round(yawRateDegS));
  radiusEl.textContent = turnRadiusM >= TURN_RADIUS_MAX_M ? "--" : String(Math.round(turnRadiusM));
  surfaceEl.textContent = currentSurface.label;
  lapStateEl.textContent = getLapStateLabel();
  lapProgressEl.textContent = `${Math.round(lapProgress * 100)}% lap`;
  updateControlHint();
  updateTrackSelector();

  if (force || thumbnailUpdateAccumulator >= THUMBNAIL_UPDATE_INTERVAL_S) {
    thumbnailUpdateAccumulator = 0;
    updateTrackThumbnails();
  }
}

function getLapStateLabel() {
  if (!hasTimedRunTrack()) {
    return "Test";
  }

  if (gameState === GAME_STATE.trackSelect) {
    return "Select";
  }

  if (gameState === GAME_STATE.racing) {
    return "Run";
  }

  if (gameState === GAME_STATE.finishCoast) {
    return "Coast";
  }

  if (gameState === GAME_STATE.result) {
    return "Finish";
  }

  if (gameState === GAME_STATE.replay) {
    return "Replay";
  }

  return "Ready";
}

function recordFinishTime(track, timeS) {
  if (finishRecorded || !Number.isFinite(timeS) || timeS <= 0) {
    return;
  }

  finishRecorded = true;
  captureReplayKeyframe(0, true);
  const replayId = saveReplayCapture(track, timeS);
  const record = {
    version: LEADERBOARD_RECORD_VERSION,
    trackId: track.id,
    trackName: track.name,
    carId: getActiveCarId(),
    player: { ...playerProfile },
    timeS,
    distanceM: hasLapTrack(track) ? track.lap.lengthM : track.finishDistanceM,
    valid: true,
    replayRef: replayId ? { type: "localStorage", id: replayId } : null,
    createdAt: new Date().toISOString(),
  };
  const result = saveLeaderboardRecord(track.id, record);
  lastFinishResult = {
    ...record,
    rank: result.rank,
    total: result.total,
    isBest: result.rank === 1,
  };
  updateResultPanel();
}

function saveLeaderboardRecord(trackId, record) {
  const records = loadLeaderboardRecords();
  const trackRecords = Array.isArray(records[trackId]) ? records[trackId] : [];
  const normalizedRecord = normalizeLeaderboardRecord(record, trackId);

  if (!normalizedRecord) {
    return {
      rank: null,
      total: trackRecords.length,
    };
  }

  const nextRecords = [...trackRecords, normalizedRecord]
    .filter(isValidLeaderboardRecord)
    .sort((a, b) => a.timeS - b.timeS)
    .slice(0, LEADERBOARD_MAX_RECORDS_PER_TRACK);
  const savedRecord = nextRecords.find((candidate) => candidate.createdAt === normalizedRecord.createdAt);
  const rank = savedRecord ? nextRecords.indexOf(savedRecord) + 1 : null;

  records[trackId] = nextRecords;

  if (saveLeaderboardRecords(records)) {
    updateTrackSelector(true);
  }

  return {
    rank,
    total: nextRecords.length,
  };
}

function loadLeaderboardRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEADERBOARD_STORAGE_KEY) ?? "{}");

    return normalizeLeaderboardStore(parsed);
  } catch (error) {
    console.warn("Failed to load leaderboard", error);
    return {};
  }
}

function saveLeaderboardRecords(records) {
  try {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (error) {
    console.warn("Failed to save leaderboard", error);
    return false;
  }
}

function normalizeLeaderboardStore(value) {
  if (Array.isArray(value)) {
    return normalizeLeaderboardRecordList(value);
  }

  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(Object.entries(value).map(([trackId, records]) => {
    const normalized = Array.isArray(records)
      ? records
        .map((record) => normalizeLeaderboardRecord(record, trackId))
        .filter(isValidLeaderboardRecord)
        .sort((a, b) => a.timeS - b.timeS)
        .slice(0, LEADERBOARD_MAX_RECORDS_PER_TRACK)
      : [];

    return [trackId, normalized];
  }));
}

function normalizeLeaderboardRecordList(records) {
  const store = {};

  for (const record of records) {
    const normalized = normalizeLeaderboardRecord(record, record?.trackId);
    if (!isValidLeaderboardRecord(normalized)) {
      continue;
    }

    if (!Array.isArray(store[normalized.trackId])) {
      store[normalized.trackId] = [];
    }
    store[normalized.trackId].push(normalized);
  }

  return normalizeLeaderboardStore(store);
}

function normalizeLeaderboardRecord(record, fallbackTrackId) {
  if (!record || typeof record !== "object" || !Number.isFinite(record.timeS) || record.timeS <= 0) {
    return null;
  }

  const trackId = typeof record.trackId === "string" && record.trackId.length > 0 ? record.trackId : fallbackTrackId;
  if (typeof trackId !== "string" || trackId.length === 0) {
    return null;
  }

  const replayId = getLeaderboardRecordReplayId(record);

  return {
    version: LEADERBOARD_RECORD_VERSION,
    trackId,
    trackName: typeof record.trackName === "string" && record.trackName.length > 0
      ? record.trackName
      : TRACKS[trackId]?.name ?? trackId,
    carId: typeof record.carId === "string" && record.carId.length > 0 ? record.carId : getActiveCarId(),
    player: normalizePlayerProfile(record.player),
    timeS: record.timeS,
    distanceM: Number.isFinite(record.distanceM) ? record.distanceM : null,
    valid: record.valid !== false,
    replayRef: replayId ? { type: "localStorage", id: replayId } : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
  };
}

function isValidLeaderboardRecord(record) {
  return record
    && typeof record === "object"
    && record.version === LEADERBOARD_RECORD_VERSION
    && typeof record.trackId === "string"
    && typeof record.carId === "string"
    && record.player
    && typeof record.player.playerId === "string"
    && typeof record.player.name === "string"
    && typeof record.player.color === "string"
    && Number.isFinite(record.timeS)
    && record.timeS > 0
    && record.valid === true
    && typeof record.createdAt === "string";
}

function getLeaderboardRecordReplayId(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  if (record.replayRef && typeof record.replayRef === "object" && typeof record.replayRef.id === "string") {
    return record.replayRef.id;
  }

  return typeof record.replayId === "string" ? record.replayId : null;
}

function loadPlayerProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAYER_PROFILE_STORAGE_KEY) ?? "{}");
    const profile = normalizePlayerProfile(raw, { createMissingId: true });
    if (profile.playerId !== raw?.playerId) {
      localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    }

    return profile;
  } catch (error) {
    console.warn("Failed to load player profile", error);
    return normalizePlayerProfile({}, { createMissingId: true });
  }
}

function savePlayerProfile(nextProfile) {
  playerProfile = normalizePlayerProfile(nextProfile, {
    createMissingId: true,
    fallbackPlayerId: playerProfile?.playerId,
  });
  selectedSettingsColorIndex = getPlayerColorIndex(playerProfile.color);

  try {
    localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify(playerProfile));
  } catch (error) {
    console.warn("Failed to save player profile", error);
  }

  playerProfileState = getPlayerProfileState();
  updateTrackSelector(true);
}

function normalizePlayerProfile(value, options = {}) {
  const profile = value && typeof value === "object" ? value : {};
  const fallbackPlayerId = normalizePlayerId(options.fallbackPlayerId);
  const playerId = normalizePlayerId(profile.playerId)
    ?? fallbackPlayerId
    ?? (options.createMissingId ? createPlayerId() : DEFAULT_PLAYER_PROFILE.playerId);
  const name = typeof profile.name === "string" ? profile.name.trim().slice(0, 18) : "";
  const color = normalizeHexColor(profile.color);

  return {
    playerId,
    name: name || DEFAULT_PLAYER_PROFILE.name,
    color: color ?? DEFAULT_PLAYER_PROFILE.color,
  };
}

function normalizePlayerId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const playerId = value.trim().slice(0, 80);

  return playerId.length > 0 ? playerId : null;
}

function createPlayerId() {
  if (globalThis.crypto?.randomUUID) {
    return `player-${globalThis.crypto.randomUUID()}`;
  }

  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeHexColor(value) {
  if (typeof value !== "string") {
    return null;
  }

  const color = value.trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
}

function getPlayerProfileState() {
  return `${playerProfile.playerId}:${playerProfile.name}:${playerProfile.color}`;
}

function getPlayerColorIndex(color) {
  return Math.max(0, PLAYER_COLOR_OPTIONS.indexOf(normalizeHexColor(color) ?? DEFAULT_PLAYER_PROFILE.color));
}

function loadDisplaySettings() {
  try {
    return normalizeDisplaySettings(JSON.parse(localStorage.getItem(DISPLAY_SETTINGS_STORAGE_KEY) ?? "{}"));
  } catch (error) {
    console.warn("Failed to load display settings", error);
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

function saveDisplaySettings(nextSettings) {
  displaySettings = normalizeDisplaySettings(nextSettings);

  try {
    localStorage.setItem(DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(displaySettings));
  } catch (error) {
    console.warn("Failed to save display settings", error);
  }
}

function normalizeDisplaySettings(value) {
  const settings = value && typeof value === "object" ? value : {};

  return {
    advancedHudVisible: settings.advancedHudVisible === true,
  };
}

function getCarPaint(color) {
  const body = normalizeHexColor(color) ?? DEFAULT_PLAYER_PROFILE.color;

  return {
    body,
    nose: mixHexColors(body, "#ffffff", 0.42),
  };
}

function mixHexColors(from, to, ratio) {
  const fromRgb = hexToRgb(from);
  const toRgb = hexToRgb(to);
  const amount = clamp(ratio, 0, 1);

  return rgbToHex({
    r: Math.round(lerp(fromRgb.r, toRgb.r, amount)),
    g: Math.round(lerp(fromRgb.g, toRgb.g, amount)),
    b: Math.round(lerp(fromRgb.b, toRgb.b, amount)),
  });
}

function hexToRgb(color) {
  const value = color.replace("#", "");

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function createLocalRecordsExport() {
  return {
    type: "night-rally.local-records",
    version: LOCAL_RECORDS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    leaderboardVersion: LEADERBOARD_RECORD_VERSION,
    replayVersion: 1,
    leaderboard: loadLeaderboardRecords(),
    replays: loadReplayRecords(),
  };
}

function exportLocalRecordsFile() {
  const snapshot = createLocalRecordsExport();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `night-rally-records-${formatLocalRecordsFileDate(new Date())}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  setLocalRecordsStatus(`Exported ${countLeaderboardRecords(snapshot.leaderboard)} records`);
}

function importLocalRecordsFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.style.display = "none";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      input.remove();
      return;
    }

    try {
      const result = importLocalRecordsJson(await file.text());
      setLocalRecordsStatus(`Imported ${result.recordCount} records`);
    } catch (error) {
      console.warn("Failed to import local records", error);
      setLocalRecordsStatus("Import failed");
    } finally {
      input.remove();
    }
  }, { once: true });

  document.body.append(input);
  input.click();
}

function importLocalRecordsJson(text) {
  const parsed = JSON.parse(text);
  const incoming = normalizeLocalRecordsImport(parsed);
  const leaderboard = mergeLeaderboardStores(loadLeaderboardRecords(), incoming.leaderboard);
  const replays = mergeReplayRecords(loadReplayRecords(), incoming.replays);

  if (!saveLeaderboardRecords(leaderboard)) {
    throw new Error("failed to save leaderboard records");
  }

  if (!saveReplayRecords(replays)) {
    throw new Error("failed to save replay records");
  }

  updateTrackSelector(true);

  return {
    recordCount: countLeaderboardRecords(incoming.leaderboard),
    replayCount: incoming.replays.length,
  };
}

function normalizeLocalRecordsImport(value) {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawLeaderboard = payload.leaderboard ?? payload.records ?? value;
  const rawReplays = Array.isArray(payload.replays) ? payload.replays : [];

  return {
    leaderboard: normalizeLeaderboardStore(rawLeaderboard),
    replays: rawReplays.map(normalizeReplayRecord).filter(isValidReplayRecord),
  };
}

function mergeLeaderboardStores(base, incoming) {
  const trackIds = new Set([...Object.keys(base), ...Object.keys(incoming)]);
  const merged = {};

  for (const trackId of trackIds) {
    const byKey = new Map();
    const records = [
      ...(Array.isArray(base[trackId]) ? base[trackId] : []),
      ...(Array.isArray(incoming[trackId]) ? incoming[trackId] : []),
    ];

    for (const record of records) {
      const normalized = normalizeLeaderboardRecord(record, trackId);
      if (isValidLeaderboardRecord(normalized)) {
        byKey.set(getLeaderboardRecordKey(normalized), normalized);
      }
    }

    merged[trackId] = [...byKey.values()]
      .sort((a, b) => a.timeS - b.timeS)
      .slice(0, LEADERBOARD_MAX_RECORDS_PER_TRACK);
  }

  return merged;
}

function getLeaderboardRecordKey(record) {
  return [
    record.trackId,
    record.carId,
    record.createdAt,
    record.timeS.toFixed(3),
    getLeaderboardRecordReplayId(record) ?? "",
  ].join("|");
}

function countLeaderboardRecords(records) {
  return Object.values(records).reduce((total, trackRecords) => (
    total + (Array.isArray(trackRecords) ? trackRecords.length : 0)
  ), 0);
}

function mergeReplayRecords(base, incoming) {
  const byId = new Map();

  for (const replay of [...base, ...incoming]) {
    const normalized = normalizeReplayRecord(replay);
    if (isValidReplayRecord(normalized)) {
      byId.set(normalized.id, normalized);
    }
  }

  return [...byId.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, REPLAY_MAX_RECORDS);
}

function saveReplayRecords(replays) {
  try {
    localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(replays.slice(0, REPLAY_MAX_RECORDS)));
    return true;
  } catch (error) {
    console.warn("Failed to save replays", error);
    return false;
  }
}

function setLocalRecordsStatus(message) {
  localRecordsStatus = message;
  updateTrackSelector(true);
}

function formatLocalRecordsFileDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
}

function createEmptyReplayCapture() {
  return {
    active: false,
    trackId: null,
    startedAt: null,
    elapsedS: 0,
    keyframeElapsedS: 0,
    inputs: [],
    keyframes: [],
  };
}

function maybeStartReplayCapture(input) {
  if (replayCapture.active || gameState !== GAME_STATE.racing || input.throttle <= 0) {
    return;
  }

  startReplayCapture(getActiveTrack());
}

function startReplayCapture(track) {
  replayCapture = {
    ...createEmptyReplayCapture(),
    active: true,
    trackId: track.id,
    startedAt: new Date().toISOString(),
  };
  captureReplayKeyframe(0, true);
}

function captureReplayInput(input) {
  if (!replayCapture.active || gameState !== GAME_STATE.racing) {
    return;
  }

  replayCapture.inputs.push({
    tick: input.tick,
    throttle: input.throttle,
    steer: input.steer,
  });
}

function captureReplayKeyframe(dt, force = false) {
  if (!replayCapture.active || gameState !== GAME_STATE.racing) {
    return;
  }

  replayCapture.elapsedS += dt;
  replayCapture.keyframeElapsedS += dt;
  if (!force && replayCapture.keyframeElapsedS < REPLAY_KEYFRAME_INTERVAL_S) {
    return;
  }

  replayCapture.keyframeElapsedS = 0;
  replayCapture.keyframes.push({
    t: replayCapture.elapsedS,
    x: car.x,
    y: car.y,
    vx: car.vx,
    vy: car.vy,
    bodyAngleRad: car.bodyAngleRad,
    moveAngleRad: car.moveAngleRad,
    speedKmh: toKmh(toGameSpeed(Math.hypot(car.vx, car.vy))),
    accelG,
    driftAmount,
    steeringInput,
    slipDeg,
    yawRateDegS,
    turnRadiusM,
    testTime,
    testDistance,
    lapTime,
    lapDistance,
    lapProgress,
  });
}

function saveReplayCapture(track, timeS) {
  if (!replayCapture.active || replayCapture.keyframes.length === 0) {
    return null;
  }

  const replay = {
    id: `replay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    version: 1,
    trackId: track.id,
    trackName: track.name,
    timeS,
    player: { ...playerProfile },
    createdAt: new Date().toISOString(),
    inputs: replayCapture.inputs,
    keyframes: replayCapture.keyframes,
  };
  const replays = loadReplayRecords()
    .filter((candidate) => isValidReplayRecord(candidate) && candidate.id !== replay.id);
  replays.unshift(replay);

  const saved = saveReplayRecords(replays);
  replayCapture = createEmptyReplayCapture();

  if (!saved) {
    return null;
  }

  return replay.id;
}

function loadReplayRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REPLAY_STORAGE_KEY) ?? "[]");

    return Array.isArray(parsed) ? parsed.map(normalizeReplayRecord).filter(isValidReplayRecord) : [];
  } catch (error) {
    console.warn("Failed to load replays", error);
    return [];
  }
}

function getReplayRecord(replayId) {
  if (!replayId) {
    return null;
  }

  return loadReplayRecords().find((replay) => replay.id === replayId) ?? null;
}

function isValidReplayRecord(replay) {
  return replay
    && typeof replay === "object"
    && typeof replay.id === "string"
    && typeof replay.trackId === "string"
    && replay.player
    && typeof replay.player.playerId === "string"
    && typeof replay.player.name === "string"
    && typeof replay.player.color === "string"
    && Array.isArray(replay.inputs)
    && Array.isArray(replay.keyframes)
    && replay.keyframes.length > 0;
}

function normalizeReplayRecord(replay) {
  if (!replay || typeof replay !== "object") {
    return null;
  }

  return {
    ...replay,
    player: normalizePlayerProfile(replay.player),
  };
}

function startReplayPlayback(replayId) {
  const replay = getReplayRecord(replayId);
  if (!replay || !TRACKS[replay.trackId]) {
    return;
  }

  keys.clear();
  activeTrackId = replay.trackId;
  selectedTrackId = replay.trackId;
  resetCar();
  replayPlayback = {
    replay,
    elapsedS: 0,
    keyframeIndex: 0,
    distanceM: 0,
  };
  setGameState(GAME_STATE.replay);
  updateResultPanel();
  updateTrackSelector(true);
}

function updateReplayPlayback(dt) {
  if (!replayPlayback) {
    setGameState(GAME_STATE.result);
    return;
  }

  replayPlayback.elapsedS += dt;
  const keyframes = replayPlayback.replay.keyframes;
  while (
    replayPlayback.keyframeIndex < keyframes.length - 2
    && keyframes[replayPlayback.keyframeIndex + 1].t <= replayPlayback.elapsedS
  ) {
    replayPlayback.keyframeIndex += 1;
  }

  const current = keyframes[replayPlayback.keyframeIndex];
  const next = keyframes[replayPlayback.keyframeIndex + 1] ?? current;
  const duration = Math.max(0.001, next.t - current.t);
  const ratio = clamp((replayPlayback.elapsedS - current.t) / duration, 0, 1);
  const pose = interpolateReplayPose(current, next, ratio);
  const previousX = car.x;
  const previousY = car.y;
  const derivedVx = Number.isFinite(pose.vx) ? pose.vx : (next.x - current.x) / duration;
  const derivedVy = Number.isFinite(pose.vy) ? pose.vy : (next.y - current.y) / duration;
  const speedKmh = Number.isFinite(pose.speedKmh)
    ? pose.speedKmh
    : toKmh(toGameSpeed(Math.hypot(derivedVx, derivedVy)));

  car.x = pose.x;
  car.y = pose.y;
  car.bodyAngleRad = pose.bodyAngleRad;
  car.moveAngleRad = pose.moveAngleRad;
  car.angle = car.bodyAngleRad;
  car.vx = derivedVx;
  car.vy = derivedVy;
  steeringInput = Number.isFinite(pose.steeringInput) ? pose.steeringInput : 0;
  driftAmount = Number.isFinite(pose.driftAmount)
    ? pose.driftAmount
    : smoothstep(10, 42, Math.abs(radToDeg(angleDelta(car.bodyAngleRad, car.moveAngleRad))));
  driftActive = driftAmount > DRIFT_ACTIVE_MIN_AMOUNT;
  yawRateDegS = Number.isFinite(pose.yawRateDegS)
    ? pose.yawRateDegS
    : getReplayYawRateDegS(current, next, duration);
  turnRadiusM = Number.isFinite(pose.turnRadiusM) ? pose.turnRadiusM : getTurnRadiusM(speedKmh, yawRateDegS);
  slipDeg = Number.isFinite(pose.slipDeg)
    ? pose.slipDeg
    : Math.abs(radToDeg(angleDelta(car.bodyAngleRad, car.moveAngleRad)));
  if (Number.isFinite(pose.accelG)) {
    accelG = pose.accelG;
    lastSpeedKmh = speedKmh;
  } else {
    updateAccelerationMeter(dt);
  }
  testTime = Number.isFinite(pose.testTime) ? pose.testTime : replayPlayback.elapsedS;
  lapTime = Number.isFinite(pose.lapTime) ? pose.lapTime : replayPlayback.elapsedS;
  replayPlayback.distanceM += Math.hypot(car.x - previousX, car.y - previousY) * METERS_PER_PIXEL;
  testDistance = Number.isFinite(pose.testDistance) ? pose.testDistance : replayPlayback.distanceM;
  lapDistance = Number.isFinite(pose.lapDistance) ? pose.lapDistance : replayPlayback.distanceM;
  lapProgress = Number.isFinite(pose.lapProgress)
    ? pose.lapProgress
    : clamp(lapDistance / Math.max(1, getActiveTrack().lap?.lengthM ?? testDistance), 0, 1);
  currentSurface = getSurfaceAt(car.x, car.y);
  previousSurface = currentSurface;
  addReplaySkidMarks(speedKmh);

  if (replayPlayback.elapsedS >= keyframes[keyframes.length - 1].t) {
    replayPlayback = null;
    setGameState(GAME_STATE.result);
    updateResultPanel();
  }
}

function getReplayYawRateDegS(current, next, duration) {
  return radToDeg(angleDelta(next.bodyAngleRad, current.bodyAngleRad)) / duration;
}

function addReplaySkidMarks(speedKmh) {
  const intensity = Math.max(driftAmount, smoothstep(12, 38, slipDeg));
  if (intensity <= DRIFT_TRAIL_MIN_AMOUNT || speedKmh <= DRIFT_TRAIL_MIN_KMH) {
    return;
  }

  const forward = angleVector(car.bodyAngleRad);
  const right = { x: -forward.y, y: forward.x };
  const moveDirection = angleVector(car.moveAngleRad);
  addSkidMarks(forward, right, moveDirection, intensity, speedKmh);
}

function renderTrackSelector() {
  if (!trackPanel || TRACK_LIST.length === 0) {
    return;
  }

  const compact = !isMenuOverlayMode();
  trackPanel.classList.toggle("is-compact", compact);
  trackPanel.classList.toggle("is-start", !compact);
  trackPanel.classList.toggle("is-menu", gameState === GAME_STATE.menu);
  trackPanel.replaceChildren();

  if (gameState === GAME_STATE.menu) {
    trackPanel.append(createMainMenuPanel());
    return;
  }

  if (gameState === GAME_STATE.trackSelect) {
    trackPanel.append(createRaceTrackPanel());
    return;
  }

  if (gameState === GAME_STATE.trackAction) {
    trackPanel.append(createTrackActionPanel());
    return;
  }

  if (gameState === GAME_STATE.recordSelect) {
    trackPanel.append(createRecordSelectionPanel());
    return;
  }

  if (gameState === GAME_STATE.recordTools) {
    trackPanel.append(createRecordToolsPanel());
    return;
  }

  if (gameState === GAME_STATE.multiplayer) {
    trackPanel.append(createMultiplayerPanel());
    return;
  }

  if (gameState === GAME_STATE.settings) {
    trackPanel.append(createSettingsPanel());
    return;
  }

  const tracks = [getActiveTrack()];
  for (const track of tracks) {
    trackPanel.append(createTrackCard(track, compact));
  }

  trackPanel.append(createLeaderboardPanel(getDisplayedLeaderboardTrack()));
}

function createMainMenuPanel() {
  const panel = document.createElement("section");
  panel.className = "start-panel main-menu-panel";

  const title = document.createElement("strong");
  title.className = "start-title";
  title.textContent = "Night Rally";

  const modes = document.createElement("div");
  modes.className = "mode-grid";

  MAIN_MENU_ITEMS.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-card";
    button.classList.toggle("is-selected", index === selectedMainMenuIndex);
    button.addEventListener("click", () => {
      selectedMainMenuIndex = index;
      activateMainMenuItem();
    });

    const name = document.createElement("strong");
    name.textContent = item.title;

    const detail = document.createElement("span");
    detail.textContent = item.detail;

    button.append(name, detail);
    modes.append(button);
  });

  const controls = document.createElement("span");
  controls.className = "start-controls";
  controls.textContent = "↑↓ 切换 · Enter 确认";

  panel.append(title, controls, modes);

  return panel;
}

function createRaceTrackPanel() {
  const panel = document.createElement("section");
  panel.className = "start-panel race-track-panel";

  const title = document.createElement("strong");
  title.className = "start-title";
  title.textContent = "竞速模式";

  const hint = createTrackHint();

  const trackList = document.createElement("div");
  trackList.className = "start-track-list";
  TRACK_LIST.forEach((candidate) => {
    trackList.append(createTrackCard(candidate, false, () => openTrackAction(candidate.id)));
  });

  const controls = document.createElement("span");
  controls.className = "start-controls";
  controls.textContent = "↑↓ 切换 · Enter 确认 · Esc 返回";

  panel.append(title, controls, hint, trackList);

  return panel;
}

function createTrackActionPanel() {
  const track = TRACKS[selectedTrackId] ?? getActiveTrack();
  selectedTrackActionIndex = clamp(selectedTrackActionIndex, 0, TRACK_ACTION_ITEMS.length - 1);

  const panel = document.createElement("section");
  panel.className = "start-panel track-action-panel";

  const title = document.createElement("strong");
  title.className = "start-title";
  title.textContent = "竞速模式";

  const trackName = document.createElement("span");
  trackName.className = "start-track";
  trackName.textContent = `${track.name} · ${track.displayLength}`;

  const controls = document.createElement("span");
  controls.className = "start-controls";
  controls.textContent = "↑↓ 选择 · Enter 确认 · Esc 返回地图";

  const actions = document.createElement("div");
  actions.className = "action-list";

  TRACK_ACTION_ITEMS.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-card action-card";
    button.classList.toggle("is-selected", index === selectedTrackActionIndex);
    button.addEventListener("click", () => {
      selectedTrackActionIndex = index;
      activateTrackAction();
    });

    const name = document.createElement("strong");
    name.textContent = item.title;

    const detail = document.createElement("span");
    detail.textContent = item.detail;

    button.append(name, detail);
    actions.append(button);
  });

  panel.append(title, trackName, controls, actions);

  return panel;
}

function createRecordSelectionPanel() {
  const track = TRACKS[selectedTrackId] ?? getActiveTrack();
  const options = getRecordSelectionOptions(track.id);
  selectedRecordIndex = clamp(selectedRecordIndex, 0, options.length - 1);

  const panel = document.createElement("section");
  panel.className = "start-panel record-panel";

  const title = document.createElement("strong");
  title.className = "start-title";
  title.textContent = "选择记录";

  const trackName = document.createElement("span");
  trackName.className = "start-track";
  trackName.textContent = `${track.name} · ${track.displayLength}`;

  const list = document.createElement("div");
  list.className = "record-list";

  options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "record-card";
    button.classList.toggle("is-selected", index === selectedRecordIndex);
    button.addEventListener("click", () => {
      selectedRecordIndex = index;
      confirmRecordSelection();
    });

    const label = document.createElement("strong");
    label.textContent = option.label;

    const detail = document.createElement("span");
    detail.textContent = option.detail;

    button.append(label, detail);
    list.append(button);
  });

  const controls = document.createElement("span");
  controls.className = "start-controls";
  controls.textContent = "↑↓ 选择 · Enter 开跑 · Esc 返回地图";

  panel.append(title, trackName, list, controls);

  return panel;
}

function createRecordToolsPanel() {
  const track = TRACKS[selectedTrackId] ?? getActiveTrack();

  const panel = document.createElement("section");
  panel.className = "start-panel record-tools-panel";

  const title = document.createElement("strong");
  title.className = "start-title";
  title.textContent = "导入导出记录";

  const trackName = document.createElement("span");
  trackName.className = "start-track";
  trackName.textContent = `${track.name} · ${track.displayLength}`;

  const controls = document.createElement("span");
  controls.className = "start-controls";
  controls.textContent = "Esc / Backspace 返回";

  panel.append(title, trackName, createLeaderboardPanel(track), controls);

  return panel;
}

function createMultiplayerPanel() {
  const panel = document.createElement("section");
  panel.className = "start-panel placeholder-panel";

  const title = document.createElement("strong");
  title.className = "start-title";
  title.textContent = "多人模式";

  const message = document.createElement("p");
  message.className = "placeholder-message";
  message.textContent = "待开发";

  const controls = document.createElement("span");
  controls.className = "start-controls";
  controls.textContent = "Esc / Backspace 返回";

  panel.append(title, message, controls);

  return panel;
}

function createSettingsPanel() {
  const panel = document.createElement("section");
  panel.className = "start-panel settings-panel";

  const title = document.createElement("strong");
  title.className = "start-title";
  title.textContent = "设置";

  const profileTitle = document.createElement("span");
  profileTitle.className = "settings-section-title";
  profileTitle.textContent = "车手档案";

  const displayRow = document.createElement("div");
  displayRow.className = "settings-option-row";

  const displayTitle = document.createElement("span");
  displayTitle.className = "settings-section-title";
  displayTitle.textContent = "默认显示详细数据";

  const display = document.createElement("button");
  display.type = "button";
  display.className = "settings-toggle";
  display.classList.toggle("is-selected", selectedSettingsIndex === SETTINGS_ITEM.display);
  display.textContent = displaySettings.advancedHudVisible ? "开启" : "关闭";
  display.addEventListener("click", () => {
    selectedSettingsIndex = SETTINGS_ITEM.display;
    toggleDefaultDetailedHud();
  });
  displayRow.append(displayTitle, display);

  const controls = document.createElement("span");
  controls.className = "start-controls";
  controls.textContent = "↑↓ 选择 · ←→ 调颜色 · Enter 调整 · Esc 返回";

  panel.append(title, profileTitle, createPlayerProfilePanel(), displayRow, controls);

  return panel;
}

function createStartPanel(track) {
  const panel = document.createElement("section");
  panel.className = "start-panel";

  const title = document.createElement("strong");
  title.className = "start-title";
  title.textContent = "Night Rally";

  const thumb = document.createElement("canvas");
  thumb.className = "start-thumb";
  thumb.dataset.track = track.id;
  thumb.width = 320;
  thumb.height = 180;
  drawTrackThumbnail(thumb, track);

  const trackName = document.createElement("span");
  trackName.className = "start-track";
  trackName.textContent = `${track.name} · ${track.displayLength}`;

  const start = document.createElement("button");
  start.type = "button";
  start.className = "start-action";
  start.textContent = "开始练习";
  start.addEventListener("click", () => confirmTrackSelection(track.id));

  const controls = document.createElement("span");
  controls.className = "start-controls";
  controls.textContent = "WASD / 方向键驾驶 · Enter 开始";

  const quick = document.createElement("span");
  quick.className = "start-quick";
  quick.textContent = "↑↓ 切换赛道 · 1 直道  2 浙江国际  3 金港";

  const tracks = document.createElement("details");
  tracks.className = "start-details start-management";

  const tracksSummary = document.createElement("summary");
  tracksSummary.textContent = "选择赛道和记录";

  const trackList = document.createElement("div");
  trackList.className = "start-track-list";
  TRACK_LIST.forEach((candidate) => {
    trackList.append(createTrackCard(candidate, false));
  });

  tracks.append(tracksSummary, trackList, createLeaderboardPanel(track));

  const profile = document.createElement("details");
  profile.className = "start-details";

  const summary = document.createElement("summary");
  summary.textContent = `${playerProfile.name} · 车手设置`;

  profile.append(summary, createPlayerProfilePanel());
  panel.append(title, thumb, trackName, start, controls, quick, tracks, profile);

  return panel;
}

function createTrackCard(track, disabled, onSelect = confirmTrackSelection) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "track-card";
  button.dataset.track = track.id;
  button.disabled = disabled;
  button.classList.toggle("is-active", track.id === activeTrackId);
  button.classList.toggle("is-selected", track.id === selectedTrackId);
  button.addEventListener("click", () => onSelect(track.id));

  const thumb = document.createElement("canvas");
  thumb.className = "track-thumb";
  thumb.dataset.track = track.id;
  thumb.width = 184;
  thumb.height = 110;
  drawTrackThumbnail(thumb, track);

  const meta = document.createElement("span");
  meta.className = "track-meta";

  const name = document.createElement("span");
  name.className = "track-name";
  name.textContent = track.name;

  const length = document.createElement("span");
  length.className = "track-length";
  length.textContent = track.displayLength;

  meta.append(name, length);
  button.append(thumb, meta);

  return button;
}

function createTrackHint() {
  const hint = document.createElement("div");
  hint.className = "track-hint";

  const title = document.createElement("strong");
  title.className = "track-hint-title";
  title.textContent = "选择赛道";

  const subtitle = document.createElement("span");
  subtitle.className = "track-hint-subtitle";
  subtitle.textContent = "↑↓ 切换 · Enter 确认";

  hint.append(title, subtitle);

  return hint;
}

function updateTrackSelector(force = false) {
  if (!trackPanel || !activeTrackId) {
    return;
  }

  const leaderboardTrackId = getDisplayedLeaderboardTrack()?.id ?? "";
  const nextState = [
    activeTrackId,
    selectedTrackId,
    gameState,
    selectedTrackActionIndex,
    selectedRecordIndex,
    selectedGhostReplayId ?? "",
    leaderboardTrackId,
    leaderboardState,
    localRecordsStatus,
    playerProfileState,
    selectedSettingsIndex,
    selectedSettingsColorIndex,
    advancedHudVisible ? "hud-on" : "hud-off",
  ].join(":");
  if (!force && nextState === trackSelectorState) {
    return;
  }

  trackSelectorState = nextState;
  renderTrackSelector();
}

function createLeaderboardPanel(track) {
  const panel = document.createElement("section");
  panel.className = "leaderboard";

  const title = document.createElement("div");
  title.className = "leaderboard-title";

  const label = document.createElement("span");
  label.textContent = "Leaderboard";

  const count = document.createElement("span");
  count.textContent = "Top 20";

  title.append(label, count);
  panel.append(title);

  const list = document.createElement("ol");
  list.className = "leaderboard-list";

  const records = getLeaderboardRecordsForTrack(track?.id).slice(0, LEADERBOARD_DISPLAY_LIMIT);
  leaderboardState = `${track?.id ?? ""}:${records.map((record) => `${record.timeS.toFixed(3)}@${record.createdAt}@${record.player.name}@${record.player.color}`).join("|")}`;

  if (records.length === 0) {
    const empty = document.createElement("li");
    empty.className = "leaderboard-empty";
    empty.textContent = "No times yet";
    list.append(empty);
  } else {
    records.forEach((record, index) => {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      const entry = document.createElement("span");
      const swatch = document.createElement("span");
      const time = document.createElement("strong");
      const player = document.createElement("span");
      const date = document.createElement("span");

      rank.className = "leaderboard-rank";
      rank.textContent = String(index + 1).padStart(2, "0");
      entry.className = "leaderboard-entry";
      swatch.className = "leaderboard-swatch";
      swatch.style.setProperty("--player-color", record.player.color);
      time.textContent = formatTime(record.timeS);
      player.className = "leaderboard-player";
      player.textContent = record.player.name;
      date.textContent = formatRecordDate(record.createdAt);
      entry.append(swatch, time, player);
      item.append(rank, entry, date);
      list.append(item);
    });
  }

  panel.append(list);
  panel.append(createLocalRecordsTools());

  return panel;
}

function createPlayerProfilePanel() {
  const panel = document.createElement("section");
  panel.className = "player-profile";

  const name = document.createElement("input");
  name.className = "player-name-input";
  name.classList.toggle("is-selected", selectedSettingsIndex === SETTINGS_ITEM.name);
  name.type = "text";
  name.maxLength = 18;
  name.value = playerProfile.name;
  name.setAttribute("aria-label", "Player name");
  name.addEventListener("focus", () => {
    selectedSettingsIndex = SETTINGS_ITEM.name;
  });
  name.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.code === "Enter") {
      name.blur();
    }
  });
  name.addEventListener("change", () => {
    savePlayerProfile({
      ...playerProfile,
      name: name.value,
    });
  });

  const colors = document.createElement("div");
  colors.className = "player-color-list";

  PLAYER_COLOR_OPTIONS.forEach((color, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "player-color-option";
    option.style.setProperty("--player-color", color);
    option.setAttribute("aria-label", `Use car color ${color}`);
    option.classList.toggle("is-active", color === playerProfile.color);
    option.classList.toggle("is-selected", selectedSettingsIndex === SETTINGS_ITEM.color && index === selectedSettingsColorIndex);
    option.addEventListener("click", () => {
      selectedSettingsIndex = SETTINGS_ITEM.color;
      selectedSettingsColorIndex = index;
      savePlayerProfile({
        ...playerProfile,
        color,
      });
      draw(getRenderState());
    });
    colors.append(option);
  });

  panel.append(name, colors);

  return panel;
}

function createLocalRecordsTools() {
  const tools = document.createElement("div");
  tools.className = "local-records-tools";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.className = "local-records-action";
  exportButton.textContent = "Export";
  exportButton.addEventListener("click", (event) => {
    event.stopPropagation();
    exportLocalRecordsFile();
  });

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.className = "local-records-action";
  importButton.textContent = "Import";
  importButton.addEventListener("click", (event) => {
    event.stopPropagation();
    importLocalRecordsFile();
  });

  tools.append(exportButton, importButton);

  if (localRecordsStatus) {
    const status = document.createElement("span");
    status.className = "local-records-status";
    status.textContent = localRecordsStatus;
    tools.append(status);
  }

  return tools;
}

function updateResultPanel() {
  if (!resultPanel) {
    return;
  }

  resultPanel.hidden = gameState !== GAME_STATE.result || !lastFinishResult;
  if (resultPanel.hidden) {
    resultPanel.replaceChildren();
    return;
  }

  const summary = document.createElement("div");
  summary.className = "result-summary";

  const trackName = document.createElement("span");
  trackName.className = "result-track";
  trackName.textContent = lastFinishResult.trackName;

  const time = document.createElement("strong");
  time.className = "result-time";
  time.textContent = formatTime(lastFinishResult.timeS);

  const rank = document.createElement("span");
  rank.className = "result-rank";
  rank.textContent = formatResultRank(lastFinishResult);

  const player = document.createElement("span");
  player.className = "result-player";

  const swatch = document.createElement("span");
  swatch.className = "result-player-swatch";
  swatch.style.setProperty("--player-color", lastFinishResult.player.color);

  const playerName = document.createElement("span");
  playerName.textContent = lastFinishResult.player.name;

  player.append(swatch, playerName);
  const hint = document.createElement("span");
  hint.className = "result-hint";
  hint.textContent = "Enter 再来 · R 换赛道";

  summary.append(trackName, time, rank, player, hint);

  const actions = document.createElement("div");
  actions.className = "result-actions";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "result-action is-primary";
  retry.textContent = "再来一次";
  retry.addEventListener("click", restartCurrentTrack);

  const replay = document.createElement("button");
  replay.type = "button";
  replay.className = "result-action is-secondary";
  replay.textContent = "回放";
  replay.disabled = !getLeaderboardRecordReplayId(lastFinishResult);
  replay.addEventListener("click", () => startReplayPlayback(getLeaderboardRecordReplayId(lastFinishResult)));

  const select = document.createElement("button");
  select.type = "button";
  select.className = "result-action is-secondary";
  select.textContent = "换赛道";
  select.addEventListener("click", () => {
    resetCar();
    openTrackSelection();
  });

  actions.append(retry, replay, select);
  resultPanel.replaceChildren(summary, actions);
}

function formatResultRank(result) {
  if (!Number.isFinite(result.rank)) {
    return "Result saved locally";
  }

  const bestLabel = result.isBest ? " · Best" : "";

  return `Rank #${result.rank} / ${result.total}${bestLabel}`;
}

function updateControlHint() {
  if (!controlHintEl) {
    return;
  }

  const message = gameState === GAME_STATE.countdown ? "W / ↑ 加速" : "";
  controlHintEl.hidden = message.length === 0;
  controlHintEl.textContent = message;
}

function getDisplayedLeaderboardTrack() {
  return gameState === GAME_STATE.trackSelect
    || gameState === GAME_STATE.trackAction
    || gameState === GAME_STATE.recordSelect
    || gameState === GAME_STATE.recordTools
    ? TRACKS[selectedTrackId]
    : getActiveTrack();
}

function getLeaderboardRecordsForTrack(trackId) {
  const records = loadLeaderboardRecords()[trackId] ?? [];

  return Array.isArray(records)
    ? records.filter(isValidLeaderboardRecord).sort((a, b) => a.timeS - b.timeS)
    : [];
}

function formatRecordDate(value) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "--";
  }

  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function updateTrackThumbnails() {
  if (!trackPanel) {
    return;
  }

  for (const thumb of trackPanel.querySelectorAll(".track-thumb")) {
    const track = TRACKS[thumb.dataset.track];
    if (track && (track.id === activeTrackId || isTrackSelectionMode())) {
      drawTrackThumbnail(thumb, track);
    }
  }
}

function refreshTrackThumbnail(trackId) {
  if (!trackPanel) {
    return;
  }

  const thumb = trackPanel.querySelector(`.track-thumb[data-track="${trackId}"]`);
  const track = TRACKS[trackId];
  if (thumb && track) {
    drawTrackThumbnail(thumb, track);
  }
}

function isTrackSelectionMode() {
  return gameState === GAME_STATE.trackSelect;
}

function isMenuOverlayMode() {
  return gameState === GAME_STATE.menu
    || gameState === GAME_STATE.trackSelect
    || gameState === GAME_STATE.trackAction
    || gameState === GAME_STATE.recordSelect
    || gameState === GAME_STATE.recordTools
    || gameState === GAME_STATE.multiplayer
    || gameState === GAME_STATE.settings;
}

function openTrackSelection(trackId = activeTrackId) {
  setGameState(GAME_STATE.trackSelect);
  selectedTrackId = TRACKS[trackId] ? trackId : activeTrackId;
  selectedTrackActionIndex = 0;
  selectedGhostReplayId = null;
  updateResultPanel();
  updateTrackSelector(true);
  updateHud(HUD_UPDATE_INTERVAL_S, true);
  draw();
}

function openMainMenu() {
  keys.clear();
  setGameState(GAME_STATE.menu);
  updateResultPanel();
  updateTrackSelector(true);
  updateHud(HUD_UPDATE_INTERVAL_S, true);
  draw();
}

function handleMenuOverlayKey(event) {
  if (gameState === GAME_STATE.menu) {
    return handleMainMenuKey(event);
  }

  if (gameState === GAME_STATE.trackSelect) {
    return handleTrackSelectionKey(event);
  }

  if (gameState === GAME_STATE.trackAction) {
    return handleTrackActionKey(event);
  }

  if (gameState === GAME_STATE.recordSelect) {
    return handleRecordSelectionKey(event);
  }

  if (gameState === GAME_STATE.recordTools) {
    return handleRecordToolsKey(event);
  }

  if (gameState === GAME_STATE.settings) {
    return handleSettingsKey(event);
  }

  if (event.code === "Escape" || event.code === "Backspace" || event.code === "Enter" || event.code === "Space") {
    openMainMenu();
    return true;
  }

  return false;
}

function handleMainMenuKey(event) {
  if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "ArrowLeft" || event.code === "KeyA") {
    moveMainMenuSelection(-1);
    return true;
  }

  if (event.code === "ArrowDown" || event.code === "KeyS" || event.code === "ArrowRight" || event.code === "KeyD") {
    moveMainMenuSelection(1);
    return true;
  }

  if (event.code === "Enter" || event.code === "Space") {
    activateMainMenuItem();
    return true;
  }

  return false;
}

function moveMainMenuSelection(direction) {
  selectedMainMenuIndex = wrapIndex(selectedMainMenuIndex + direction, MAIN_MENU_ITEMS.length);
  updateTrackSelector(true);
}

function activateMainMenuItem() {
  const item = MAIN_MENU_ITEMS[selectedMainMenuIndex];

  if (item?.id === "practice") {
    startPracticeMode();
    return;
  }

  if (item?.id === "race") {
    openTrackSelection();
    return;
  }

  if (item?.id === "multiplayer") {
    setGameState(GAME_STATE.multiplayer);
    updateTrackSelector(true);
    updateHud(HUD_UPDATE_INTERVAL_S, true);
    return;
  }

  if (item?.id === "settings") {
    selectedSettingsIndex = SETTINGS_ITEM.name;
    selectedSettingsColorIndex = getPlayerColorIndex(playerProfile.color);
    setGameState(GAME_STATE.settings);
    updateTrackSelector(true);
    updateHud(HUD_UPDATE_INTERVAL_S, true);
  }
}

function startPracticeMode() {
  const practiceTrackId = defaultTrackId ?? activeTrackId;
  startTimedRun(practiceTrackId, null);
}

function confirmTrackSelection(trackId = selectedTrackId) {
  startTimedRun(trackId, null);
}

function startTimedRun(trackId = selectedTrackId, ghostReplayId = null) {
  if (!TRACKS[trackId] || isSessionStarted()) {
    return;
  }

  keys.clear();
  applyDefaultDetailedHud();
  activeTrackId = trackId;
  selectedTrackId = trackId;
  selectedGhostReplayId = ghostReplayId;
  setGameState(GAME_STATE.countdown);
  resetCar();
  updateResultPanel();
  updateTrackSelector(true);
  updateHud(HUD_UPDATE_INTERVAL_S, true);
}

function restartCurrentTrack() {
  if (!activeTrackId) {
    return;
  }

  keys.clear();
  applyDefaultDetailedHud();
  resetCar();
  setGameState(GAME_STATE.countdown);
  selectedTrackId = activeTrackId;
  updateResultPanel();
  updateTrackSelector(true);
  updateHud(HUD_UPDATE_INTERVAL_S, true);
}

function handleTrackSelectionKey(event) {
  if (event.code === "Escape" || event.code === "Backspace") {
    openMainMenu();
    return true;
  }

  if (event.code === "ArrowUp" || event.code === "KeyW") {
    moveTrackSelection(-1);
    return true;
  }

  if (event.code === "ArrowDown" || event.code === "KeyS") {
    moveTrackSelection(1);
    return true;
  }

  if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "Enter" || event.code === "Space") {
    openTrackAction();
    return true;
  }

  return false;
}

function openTrackAction(trackId = selectedTrackId) {
  if (!TRACKS[trackId]) {
    return;
  }

  keys.clear();
  selectedTrackId = trackId;
  selectedTrackActionIndex = 0;
  selectedGhostReplayId = null;
  setGameState(GAME_STATE.trackAction);
  updateTrackSelector(true);
  updateHud(HUD_UPDATE_INTERVAL_S, true);
  draw();
}

function handleTrackActionKey(event) {
  if (event.code === "Escape" || event.code === "Backspace") {
    openTrackSelection(selectedTrackId);
    return true;
  }

  if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "ArrowLeft" || event.code === "KeyA") {
    moveTrackActionSelection(-1);
    return true;
  }

  if (event.code === "ArrowDown" || event.code === "KeyS" || event.code === "ArrowRight" || event.code === "KeyD") {
    moveTrackActionSelection(1);
    return true;
  }

  if (event.code === "Enter" || event.code === "Space") {
    activateTrackAction();
    return true;
  }

  return false;
}

function moveTrackActionSelection(direction) {
  selectedTrackActionIndex = wrapIndex(selectedTrackActionIndex + direction, TRACK_ACTION_ITEMS.length);
  updateTrackSelector(true);
}

function activateTrackAction() {
  const item = TRACK_ACTION_ITEMS[selectedTrackActionIndex];

  if (item?.id === "start") {
    startTimedRun(selectedTrackId, null);
    return;
  }

  if (item?.id === "challenge") {
    openRecordSelection(selectedTrackId);
    return;
  }

  if (item?.id === "records") {
    openRecordTools(selectedTrackId);
  }
}

function openRecordSelection(trackId = selectedTrackId) {
  if (!TRACKS[trackId]) {
    return;
  }

  keys.clear();
  selectedTrackId = trackId;
  selectedRecordIndex = 0;
  selectedGhostReplayId = null;
  setGameState(GAME_STATE.recordSelect);
  updateTrackSelector(true);
  updateHud(HUD_UPDATE_INTERVAL_S, true);
  draw();
}

function handleRecordSelectionKey(event) {
  if (event.code === "Escape" || event.code === "Backspace") {
    openTrackAction(selectedTrackId);
    return true;
  }

  if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "ArrowLeft" || event.code === "KeyA") {
    moveRecordSelection(-1);
    return true;
  }

  if (event.code === "ArrowDown" || event.code === "KeyS" || event.code === "ArrowRight" || event.code === "KeyD") {
    moveRecordSelection(1);
    return true;
  }

  if (event.code === "Enter" || event.code === "Space") {
    confirmRecordSelection();
    return true;
  }

  return false;
}

function openRecordTools(trackId = selectedTrackId) {
  if (!TRACKS[trackId]) {
    return;
  }

  keys.clear();
  selectedTrackId = trackId;
  setGameState(GAME_STATE.recordTools);
  updateTrackSelector(true);
  updateHud(HUD_UPDATE_INTERVAL_S, true);
  draw();
}

function handleRecordToolsKey(event) {
  if (event.code === "Escape" || event.code === "Backspace" || event.code === "Enter" || event.code === "Space") {
    openTrackAction(selectedTrackId);
    return true;
  }

  return false;
}

function moveRecordSelection(direction) {
  const options = getRecordSelectionOptions(selectedTrackId);
  selectedRecordIndex = wrapIndex(selectedRecordIndex + direction, options.length);
  updateTrackSelector(true);
}

function confirmRecordSelection() {
  const options = getRecordSelectionOptions(selectedTrackId);
  const option = options[clamp(selectedRecordIndex, 0, options.length - 1)];

  startTimedRun(selectedTrackId, option?.replayId ?? null);
}

function getRecordSelectionOptions(trackId) {
  const replaysById = new Map(loadReplayRecords().map((replay) => [replay.id, replay]));
  const recordOptions = getLeaderboardRecordsForTrack(trackId)
    .map((record, index) => {
      const replayId = getLeaderboardRecordReplayId(record);
      const replay = replaysById.get(replayId);
      if (!replay) {
        return null;
      }

      return {
        replayId,
        label: `${String(index + 1).padStart(2, "0")} · ${formatTime(record.timeS)}`,
        detail: `${record.player.name} · ${formatRecordDate(record.createdAt)}`,
      };
    })
    .filter(Boolean);

  return [
    {
      replayId: null,
      label: "不使用记录",
      detail: recordOptions.length > 0 ? "独自开跑" : "当前地图还没有可用记录",
    },
    ...recordOptions,
  ];
}

function moveTrackSelection(direction) {
  const currentIndex = Math.max(0, TRACK_LIST.findIndex((track) => track.id === selectedTrackId));
  const previousTrackId = selectedTrackId;
  const nextIndex = wrapIndex(currentIndex + direction, TRACK_LIST.length);
  selectedTrackId = TRACK_LIST[nextIndex].id;
  updateTrackSelector(true);
  refreshTrackThumbnail(previousTrackId);
  refreshTrackThumbnail(selectedTrackId);
}

function handleSettingsKey(event) {
  if (event.code === "Escape" || event.code === "Backspace") {
    openMainMenu();
    return true;
  }

  if (event.code === "ArrowUp" || event.code === "KeyW") {
    moveSettingsSelection(-1);
    return true;
  }

  if (event.code === "ArrowDown" || event.code === "KeyS") {
    moveSettingsSelection(1);
    return true;
  }

  if (selectedSettingsIndex === SETTINGS_ITEM.color && (
    event.code === "ArrowLeft"
    || event.code === "KeyA"
    || event.code === "ArrowRight"
    || event.code === "KeyD"
  )) {
    const direction = event.code === "ArrowLeft" || event.code === "KeyA" ? -1 : 1;
    selectSettingsColor(direction);
    return true;
  }

  if (event.code === "Enter" || event.code === "Space") {
    activateSettingsSelection();
    return true;
  }

  return false;
}

function moveSettingsSelection(direction) {
  selectedSettingsIndex = wrapIndex(selectedSettingsIndex + direction, SETTINGS_ITEM_COUNT);
  updateTrackSelector(true);
}

function selectSettingsColor(direction) {
  selectedSettingsColorIndex = wrapIndex(selectedSettingsColorIndex + direction, PLAYER_COLOR_OPTIONS.length);
  savePlayerProfile({
    ...playerProfile,
    color: PLAYER_COLOR_OPTIONS[selectedSettingsColorIndex],
  });
  draw(getRenderState());
}

function activateSettingsSelection() {
  if (selectedSettingsIndex === SETTINGS_ITEM.name) {
    const input = trackPanel?.querySelector(".player-name-input");
    input?.focus();
    input?.select();
    return;
  }

  if (selectedSettingsIndex === SETTINGS_ITEM.color) {
    savePlayerProfile({
      ...playerProfile,
      color: PLAYER_COLOR_OPTIONS[selectedSettingsColorIndex],
    });
    draw(getRenderState());
    return;
  }

  if (selectedSettingsIndex === SETTINGS_ITEM.display) {
    toggleDefaultDetailedHud();
  }
}

function drawTrackThumbnail(canvasEl, track) {
  const thumbCtx = canvasEl.getContext("2d");
  const width = canvasEl.width;
  const height = canvasEl.height;

  drawTrackThumbnailBase(thumbCtx, track, width, height);

  if (track.id === activeTrackId) {
    drawThumbnailCarMarker(thumbCtx, track, width, height);
  }
}

function drawTrackThumbnailBase(thumbCtx, track, width, height) {
  const cache = getTrackThumbnailCache(track, width, height);
  thumbCtx.clearRect(0, 0, width, height);
  thumbCtx.drawImage(cache.canvas, 0, 0);
}

function getTrackThumbnailCache(track, width, height) {
  if (track.thumbnailCache?.width === width && track.thumbnailCache.height === height) {
    return track.thumbnailCache;
  }

  const cacheCanvas = document.createElement("canvas");
  cacheCanvas.width = width;
  cacheCanvas.height = height;
  const cacheCtx = cacheCanvas.getContext("2d");

  cacheCtx.fillStyle = track.background ?? "#b78345";
  cacheCtx.fillRect(0, 0, width, height);

  if (track.type === "circuit") {
    drawCircuitThumbnail(cacheCtx, track, width, height);
  } else {
    drawStraightThumbnail(cacheCtx, width, height);
  }

  track.thumbnailCache = {
    width,
    height,
    canvas: cacheCanvas,
  };

  return track.thumbnailCache;
}

function drawCircuitThumbnail(thumbCtx, track, width, height) {
  const toThumb = getThumbnailProjector(track, width, height);

  strokeThumbnailPath(thumbCtx, track.path, toThumb, 4, "rgba(238, 243, 236, 0.78)");

  const start = toThumb([track.startX, track.startY]);
  thumbCtx.save();
  thumbCtx.translate(start[0], start[1]);
  thumbCtx.rotate(track.startAngle + Math.PI / 2);
  thumbCtx.strokeStyle = "#f0efe5";
  thumbCtx.lineWidth = 2;
  thumbCtx.beginPath();
  thumbCtx.moveTo(-7, 0);
  thumbCtx.lineTo(7, 0);
  thumbCtx.stroke();
  thumbCtx.restore();
}

function drawThumbnailCarMarker(thumbCtx, track, width, height) {
  const toThumb = getThumbnailProjector(track, width, height);
  const [x, y] = toThumb([car.x, car.y]);
  const markerSize = isTrackSelectionMode() ? 6 : 8;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  thumbCtx.save();
  thumbCtx.translate(x, y);
  thumbCtx.rotate(car.bodyAngleRad);
  thumbCtx.fillStyle = "#f04444";
  thumbCtx.strokeStyle = "#f7eee8";
  thumbCtx.lineWidth = 1.4;
  thumbCtx.beginPath();
  thumbCtx.moveTo(markerSize, 0);
  thumbCtx.lineTo(-markerSize * 0.72, -markerSize * 0.58);
  thumbCtx.lineTo(-markerSize * 0.42, 0);
  thumbCtx.lineTo(-markerSize * 0.72, markerSize * 0.58);
  thumbCtx.closePath();
  thumbCtx.fill();
  thumbCtx.stroke();
  thumbCtx.restore();
}

function drawStraightThumbnail(thumbCtx, width, height) {
  const roadY = height / 2;
  thumbCtx.strokeStyle = "rgba(238, 243, 236, 0.78)";
  thumbCtx.lineCap = "round";
  thumbCtx.lineWidth = 4;
  thumbCtx.beginPath();
  thumbCtx.moveTo(12, roadY);
  thumbCtx.lineTo(width - 12, roadY);
  thumbCtx.stroke();

  thumbCtx.fillStyle = "#f0efe5";
  thumbCtx.fillRect(12, roadY - 6, 2, 12);
}

function strokeThumbnailPath(thumbCtx, points, transformPoint, lineWidth, color) {
  const first = transformPoint(points[0]);
  thumbCtx.save();
  thumbCtx.lineJoin = "round";
  thumbCtx.lineCap = "round";
  thumbCtx.strokeStyle = color;
  thumbCtx.lineWidth = lineWidth;
  thumbCtx.beginPath();
  thumbCtx.moveTo(first[0], first[1]);

  for (let i = 0; i < points.length; i += 1) {
    const current = transformPoint(points[i]);
    const next = transformPoint(points[(i + 1) % points.length]);
    const midX = (current[0] + next[0]) / 2;
    const midY = (current[1] + next[1]) / 2;
    thumbCtx.quadraticCurveTo(current[0], current[1], midX, midY);
  }

  thumbCtx.closePath();
  thumbCtx.stroke();
  thumbCtx.restore();
}

function getPathBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point[0]),
    minY: Math.min(bounds.minY, point[1]),
    maxX: Math.max(bounds.maxX, point[0]),
    maxY: Math.max(bounds.maxY, point[1]),
  }), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  });
}

function getThumbnailProjector(track, width, height) {
  const bounds = track.type === "circuit" ? getPathBounds(track.path) : {
    minX: 0,
    minY: 0,
    maxX: track.width,
    maxY: track.height,
  };
  const padding = 14;
  const scale = Math.min(
    (width - padding * 2) / Math.max(1, bounds.maxX - bounds.minX),
    (height - padding * 2) / Math.max(1, bounds.maxY - bounds.minY),
  );
  const offsetX = (width - (bounds.maxX - bounds.minX) * scale) / 2 - bounds.minX * scale;
  const offsetY = (height - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale;

  return ([x, y]) => [x * scale + offsetX, y * scale + offsetY];
}

function setTrack(trackId) {
  if (isSessionStarted()) {
    return;
  }

  if (!TRACKS[trackId] || trackId === activeTrackId) {
    return;
  }

  activeTrackId = trackId;
  applyTrackToWorld(TRACKS[trackId]);
  resetCar();
}

function resetCar() {
  const track = TRACKS[activeTrackId];
  applyTrackToWorld(track);
  car.x = track.startX;
  car.y = track.startY;
  car.angle = track.startAngle;
  car.bodyAngleRad = track.startAngle;
  car.moveAngleRad = track.startAngle;
  car.vx = 0;
  car.vy = 0;
  steeringInput = 0;
  resetInputStream();
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
  resetLapMode();
  camera.x = car.x;
  camera.y = car.y;
  updateHud(HUD_UPDATE_INTERVAL_S, true);
  draw();
}

function resetInputStream() {
  inputTick = 0;
  inputFrame = createEmptyInputFrame();
  replayCapture = createEmptyReplayCapture();
  replayPlayback = null;
}

function resetLapMode() {
  lapState = hasTimedRunTrack() ? LAP_STATE.ready : LAP_STATE.running;
  lapTime = 0;
  lapDistance = 0;
  lapProgress = 0;
  lapReverseM = 0;
  resetLapCheckpointProgress();
  lapFinishCoastTime = 0;
  lapFinishVx = 0;
  lapFinishVy = 0;
  finishRecorded = false;
  if (hasLapTrack()) {
    const sample = getTrackSample(car.x, car.y);
    lapLastProgressM = sample.progressPx * METERS_PER_PIXEL;
    lapLastSegmentIndex = sample.segmentIndex;
  } else {
    lapLastProgressM = 0;
    lapLastSegmentIndex = 0;
  }
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

async function loadJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function loadTrackData(indexUrl) {
  const index = await loadJson(indexUrl);

  if (!Array.isArray(index?.tracks) || index.tracks.length === 0) {
    throw new Error("track index must define tracks");
  }

  const tracks = await Promise.all(index.tracks.map(async (entry, indexPosition) => {
    const file = readString(entry.file, `track index tracks[${indexPosition}].file`);
    const track = await loadJson(`${TRACK_DATA_BASE_URL}${file}?v=20260601-track-data`);

    if (entry.id && track.id !== entry.id) {
      throw new Error(`track index id ${entry.id} does not match ${track.id}`);
    }

    return track;
  }));

  return {
    default: index.default,
    tracks,
  };
}

function applyTrackData(data) {
  if (!Array.isArray(data?.tracks) || data.tracks.length === 0) {
    throw new Error("track data must define tracks");
  }

  TRACK_LIST = data.tracks.map(normalizeTrack);
  TRACKS = Object.fromEntries(TRACK_LIST.map((track) => [track.id, track]));
  defaultTrackId = TRACKS[data.default] ? data.default : TRACK_LIST[0].id;
  activeTrackId = defaultTrackId;
  selectedTrackId = activeTrackId;
  setGameState(GAME_STATE.menu);
  applyTrackToWorld(getActiveTrack());
  renderTrackSelector();
}

function normalizeTrack(rawTrack) {
  const id = readString(rawTrack.id, "track.id");
  const type = readString(rawTrack.type, `tracks.${id}.type`);
  const world = rawTrack.world ?? {};
  const start = rawTrack.start ?? {};
  const track = {
    id,
    type,
    name: readString(rawTrack.name, `tracks.${id}.name`),
    width: readTrackNumber(world.width, `tracks.${id}.world.width`),
    height: readTrackNumber(world.height, `tracks.${id}.world.height`),
    startX: readTrackNumber(start.x, `tracks.${id}.start.x`),
    startY: readTrackNumber(start.y, `tracks.${id}.start.y`),
    startAngle: Number.isFinite(start.angle) ? start.angle : 0,
    displayLength: rawTrack.display?.length ?? "",
    background: type === "straight" ? "#26362d" : "#b78345",
    dirtSpecks: [],
  };

  if (type === "circuit") {
    const surface = rawTrack.surface ?? {};
    track.path = readPointList(rawTrack.path, `tracks.${id}.path`);
    track.collisionPath = buildSmoothedCircuitSamples(track.path, rawTrack.collisionSteps ?? 16);
    track.lap = buildPathMetrics(track.collisionPath);
    track.checkpoints = readLapCheckpoints(rawTrack.checkpoints, track.lap.lengthM, `tracks.${id}.checkpoints`);
    track.startAngle = Number.isFinite(start.angle) ? start.angle : getPathSegmentAngle(track.path, 0);
    track.roadHalfWidth = readTrackNumber(surface.roadHalfWidth, `tracks.${id}.surface.roadHalfWidth`);
    track.curbWidth = readTrackNumber(surface.curbWidth, `tracks.${id}.surface.curbWidth`);
    track.grassWidth = readTrackNumber(surface.grassWidth, `tracks.${id}.surface.grassWidth`);
    track.fencePadding = readTrackNumber(surface.fencePadding, `tracks.${id}.surface.fencePadding`);
    track.dirtSpecks = buildDirtSpecks(track);
  } else if (type === "straight") {
    track.runwayWidth = readTrackNumber(rawTrack.runwayWidthM ?? 14, `tracks.${id}.runwayWidthM`) * PX_PER_METER;
    track.finishDistanceM = Number.isFinite(rawTrack.finishDistanceM)
      ? readTrackNumber(rawTrack.finishDistanceM, `tracks.${id}.finishDistanceM`)
      : null;
  } else {
    throw new Error(`unsupported track type ${type}`);
  }

  return track;
}

function applyTrackToWorld(track) {
  WORLD.width = track.width;
  WORLD.height = track.height;
  WORLD.runwayY = track.startY;
  WORLD.runwayWidth = track.runwayWidth ?? 14 * PX_PER_METER;
}

function buildDirtSpecks(track) {
  return Array.from({ length: 180 }, (_, index) => ({
    x: (index * 149 + 83) % track.width,
    y: (index * 211 + 47) % track.height,
    r: 1 + (index % 4) * 0.55,
    a: 0.05 + (index % 5) * 0.018,
  }));
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
    turnLossSteerMin: readNumber(turn.loss_steer_min, "handling.turn.loss_steer_min"),
    turnLossSteerFull: readNumber(turn.loss_steer_full, "handling.turn.loss_steer_full"),
    turnLossCurve: readNumber(turn.loss_curve, "handling.turn.loss_curve"),
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

function readTrackNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new Error(`track data field ${name} must be a number`);
  }

  return value;
}

function readString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`data field ${name} must be a string`);
  }

  return value;
}

function readPointList(points, name) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error(`${name} must define at least three points`);
  }

  return points.map((point, index) => {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      throw new Error(`${name}[${index}] must be [x, y]`);
    }

    return [point[0], point[1]];
  });
}

function readLapCheckpoints(checkpoints, lapLengthM, name) {
  if (!Array.isArray(checkpoints)) {
    return buildDefaultLapCheckpoints(lapLengthM);
  }

  const normalized = checkpoints
    .map((checkpoint, index) => readLapCheckpoint(checkpoint, lapLengthM, `${name}[${index}]`))
    .filter((checkpoint) => checkpoint.progressM > 0 && checkpoint.progressM < lapLengthM)
    .sort((a, b) => a.progressM - b.progressM);

  if (normalized.length === 0) {
    return buildDefaultLapCheckpoints(lapLengthM);
  }

  return normalized;
}

function readLapCheckpoint(checkpoint, lapLengthM, name) {
  if (Number.isFinite(checkpoint)) {
    return { progressM: clamp(checkpoint, 0, lapLengthM) };
  }

  if (checkpoint && typeof checkpoint === "object" && Number.isFinite(checkpoint.progressM)) {
    return { progressM: clamp(checkpoint.progressM, 0, lapLengthM) };
  }

  throw new Error(`${name} must be a progress meter value or { progressM }`);
}

function buildDefaultLapCheckpoints(lapLengthM) {
  return Array.from({ length: DEFAULT_LAP_CHECKPOINT_COUNT }, (_, index) => ({
    progressM: lapLengthM * (index + 1) / (DEFAULT_LAP_CHECKPOINT_COUNT + 1),
  }));
}

function handleLoadError(error) {
  console.error(error);
  drawStatus(`Failed to load data: ${error.message}`);
}

function getActiveTrack() {
  return TRACKS[activeTrackId] ?? TRACK_LIST[0];
}

function isCircuitTrack(track = getActiveTrack()) {
  return track?.type === "circuit";
}

function hasLapTrack(track = getActiveTrack()) {
  return Boolean(track?.lap);
}

function hasFenceTrack(track = getActiveTrack()) {
  return Boolean(track?.path && Number.isFinite(track.fencePadding));
}

function hasSurfaceTrack(track = getActiveTrack()) {
  return Boolean(track?.path && Number.isFinite(track.roadHalfWidth));
}

function hasStraightFinish(track = getActiveTrack()) {
  return track?.type === "straight" && Number.isFinite(track.finishDistanceM);
}

function hasTimedRunTrack(track = getActiveTrack()) {
  return hasLapTrack(track) || hasStraightFinish(track);
}

function getActiveCarId() {
  return typeof vehicleModel?.id === "string" && vehicleModel.id.length > 0 ? vehicleModel.id : "baseline";
}

function isSessionStarted() {
  return gameState === GAME_STATE.racing
    || gameState === GAME_STATE.finishCoast
    || gameState === GAME_STATE.result
    || gameState === GAME_STATE.replay;
}

function toggleAdvancedHud() {
  advancedHudVisible = !advancedHudVisible;
  applyAdvancedHudVisibility();
  updateTrackSelector(true);
}

function toggleDefaultDetailedHud() {
  const nextVisible = !displaySettings.advancedHudVisible;
  saveDisplaySettings({ advancedHudVisible: nextVisible });
  advancedHudVisible = nextVisible;
  applyAdvancedHudVisibility();
  updateTrackSelector(true);
}

function applyDefaultDetailedHud() {
  advancedHudVisible = displaySettings.advancedHudVisible;
  applyAdvancedHudVisibility();
}

function applyAdvancedHudVisibility() {
  hudEl?.classList.toggle("is-advanced", advancedHudVisible);
  if (hudHintEl) {
    hudHintEl.textContent = advancedHudVisible ? "H 隐藏详细数据" : "H 显示详细数据";
  }
}

function isTextEntryTarget(event) {
  const target = event.target;

  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target?.isContentEditable === true;
}

function setGameState(nextState) {
  if (gameState === nextState) {
    return;
  }

  gameState = nextState;
  trackSelectorState = "";
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
  if (!hasSurfaceTrack()) {
    return SURFACE.road;
  }

  const track = getActiveTrack();
  const sample = getTrackCorridorSample(track, x, y);
  const carHalfWidth = getCarHalfWidth();

  if (sample.distance + carHalfWidth <= track.roadHalfWidth) {
    return SURFACE.road;
  }

  return getGrassSurface(track, sample.distance, carHalfWidth);
}

function getGrassEdgeLimit(track) {
  return track.roadHalfWidth + track.curbWidth + track.grassWidth;
}

function getGrassSurface(track, distance, carHalfWidth) {
  const grassWidth = Math.max(1, getGrassEdgeLimit(track) - track.roadHalfWidth);
  const carWidth = Math.max(1, carHalfWidth * 2);
  const outsideWheelDepth = Math.max(0, distance + carHalfWidth - track.roadHalfWidth);
  const carOffRoad = clamp(outsideWheelDepth / carWidth, 0, 1);
  const grassDepth = clamp(outsideWheelDepth / grassWidth, 0, 1);
  const penalty = carOffRoad * smoothstep(0, 1, grassDepth);

  return {
    ...SURFACE.grass,
    speedDropScale: lerp(SURFACE.road.speedDropScale, GRASS_SURFACE.speedDropMin, penalty),
    accelScale: lerp(SURFACE.road.accelScale, GRASS_SURFACE.accelMin, penalty),
    steer: lerp(SURFACE.road.steer, GRASS_SURFACE.steerMin, penalty),
  };
}

function getCarHalfWidth() {
  return Math.max(1, (CAR_SPEC?.widthM ?? 1.8) * PX_PER_METER * 0.5);
}

function getTrackCorridorSample(track, x, y) {
  if (!track?.collisionPath || !Number.isFinite(lapLastSegmentIndex)) {
    return getTrackSample(x, y);
  }

  return getTrackSampleInWindow(track, x, y, lapLastSegmentIndex, TRACK_CORRIDOR_SAMPLE_WINDOW_SEGMENTS);
}

function getLapTrackSample(track, x, y) {
  if (!track?.collisionPath || !Number.isFinite(lapLastSegmentIndex)) {
    return getTrackSample(x, y);
  }

  return getTrackSampleInWindow(track, x, y, lapLastSegmentIndex, LAP_SAMPLE_WINDOW_SEGMENTS);
}

function getTrackSampleInWindow(track, x, y, centerSegmentIndex, windowSegments) {
  const path = track.collisionPath;
  const lap = track.lap;
  let best = null;

  for (let offset = -windowSegments; offset <= windowSegments; offset += 1) {
    const index = wrapIndex(centerSegmentIndex + offset, path.length);
    const sample = getSegmentSample(x, y, path[index], path[(index + 1) % path.length]);

    if (!best || sample.distanceSq < best.distanceSq) {
      best = sample;
      best.segmentIndex = index;
      best.segmentRatio = sample.ratio;
    }
  }

  const segmentStartPx = lap.cumulativePx[best.segmentIndex] ?? 0;
  const segmentLengthPx = (lap.cumulativePx[best.segmentIndex + 1] ?? segmentStartPx) - segmentStartPx;
  best.progressPx = segmentStartPx + segmentLengthPx * best.segmentRatio;

  return best;
}

function getTrackSample(x, y) {
  const track = getActiveTrack();
  const path = track.collisionPath ?? track.path;
  const lap = track.lap;
  let best = null;

  for (let i = 0; i < path.length; i += 1) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const sample = getSegmentSample(x, y, a, b);

    if (!best || sample.distanceSq < best.distanceSq) {
      best = sample;
      best.segmentIndex = i;
      best.segmentRatio = sample.ratio;
    }
  }

  if (lap && best) {
    const segmentStartPx = lap.cumulativePx[best.segmentIndex] ?? 0;
    const segmentLengthPx = (lap.cumulativePx[best.segmentIndex + 1] ?? segmentStartPx) - segmentStartPx;
    best.progressPx = segmentStartPx + segmentLengthPx * best.segmentRatio;
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

  return { x: px, y: py, normal, tangent, distance, distanceSq, ratio };
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

function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds - minutes * 60;

  return `${minutes}m ${restSeconds.toFixed(2).padStart(5, "0")}s`;
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

  return forwardSpeed * (toSurface.speedDropScale / Math.max(0.01, fromSurface.speedDropScale));
}

function applyTurnAndSlideSpeedLoss(forwardSpeed, steerAmount, slideAmount, throttle, dt) {
  const speedKmh = Math.abs(toKmh(toGameSpeed(forwardSpeed)));
  const speedPressure = smoothstep(25, 85, speedKmh);
  const turnAmount = getTurnLossPressure(steerAmount) * speedPressure * (1 - slideAmount);
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

  const turnAmount = getTurnLossPressure(steerAmount) * (1 - slideAmount);
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

function getTurnLossPressure(steerAmount) {
  const pressure = smoothstep(TUNING.turnLossSteerMin, TUNING.turnLossSteerFull, steerAmount);

  return Math.pow(pressure, TUNING.turnLossCurve);
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

function lerpAngle(from, to, ratio) {
  return from + angleDelta(to, from) * ratio;
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

function wrap(value, max) {
  return ((value % max) + max) % max;
}

function wrapIndex(value, length) {
  return ((value % length) + length) % length;
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

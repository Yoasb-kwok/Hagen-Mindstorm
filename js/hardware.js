(function (root, factory) {
  const api = factory();
  root.HM = Object.assign(root.HM || {}, api);
  if (typeof module === "object" && module != null && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ARENA = { w: 150, h: 100 };
  const BODY_RADIUS = 7;
  const WHEEL_R = 2.8;
  const TRACK = 11.2;
  const MAX_DPS = 720;
  const RAY_START = 6.2;
  const SENSOR_RANGE = 200;
  const PORTS = ["A", "B", "C", "D", "E", "F"];
  const CM_PER_ROTATION = Math.round(2 * Math.PI * WHEEL_R * 10) / 10;

  const COLOR_ID = {
    none: 0,
    black: 1,
    violet: 2,
    blue: 3,
    azure: 4,
    green: 5,
    yellow: 6,
    red: 7,
    white: 8,
  };

  function headingVector(deg) {
    const r = (deg * Math.PI) / 180;
    return { x: Math.sin(r), y: -Math.cos(r) };
  }

  function pointAhead(robot, cm) {
    const dir = headingVector(robot.heading);
    return { x: robot.x + dir.x * cm, y: robot.y + dir.y * cm };
  }

  function dpsFromPercent(percent) {
    const n = Math.max(-100, Math.min(100, Number(percent) || 0));
    return (n / 100) * MAX_DPS;
  }

  function wheelsForTravel(cm) {
    return (cm / WHEEL_R) * (180 / Math.PI);
  }

  function wheelsForTurn(headingDeg) {
    return (Math.abs(headingDeg) * TRACK) / (2 * WHEEL_R);
  }

  function defaultSense() {
    return { distance: "D", color: "C", press: "E" };
  }

  function configuredSense() {
    const hm = globalThis.HM || {};
    if (hm.running && hm.sensePorts) return hm.sensePorts;
    const stacks = (hm.project && hm.project.stacks) || [];
    let found = null;
    stacks.forEach((stack) => {
      (stack.blocks || []).forEach((block) => {
        if (block && block.opcode === "sense_set" && block.fields) found = block.fields;
      });
    });
    if (!found) {
      if (hm.hub && hm.hub.connected && hm.sensePorts) return hm.sensePorts;
      return defaultSense();
    }
    return {
      distance: found.distance || "D",
      color: found.color || "C",
      press: found.press || "E",
    };
  }

  function defaultMotion() {
    const speed = {};
    PORTS.forEach((port) => { speed[port] = 75; });
    return { speed, left: "A", right: "B", moveSpeed: 50, cmPerRotation: CM_PER_ROTATION };
  }

  function steerGains(steering) {
    const steer = Math.max(-100, Math.min(100, Number(steering) || 0));
    if (steer >= 0) return { left: 1, right: 1 - steer / 50 };
    return { left: 1 + steer / 50, right: 1 };
  }

  function degreesForMove(amount, unit, cmPerRotation) {
    const n = Number(amount) || 0;
    const per = Number(cmPerRotation) || CM_PER_ROTATION;
    if (unit === "degrees") return n;
    if (unit === "rotations") return n * 360;
    if (unit === "in") return (n * 2.54 / per) * 360;
    if (unit === "seconds") return 0;
    return (n / per) * 360;
  }

  function wheelStepToMotion(leftDeg, rightDeg, heading) {
    const leftCm = leftDeg * (Math.PI / 180) * WHEEL_R;
    const rightCm = rightDeg * (Math.PI / 180) * WHEEL_R;
    const dist = (leftCm + rightCm) / 2;
    const dHead = ((leftCm - rightCm) / TRACK) * (180 / Math.PI);
    const dir = headingVector(heading + dHead / 2);
    return { heading: heading + dHead, dx: dir.x * dist, dy: dir.y * dist };
  }

  function circleHitsRect(cx, cy, rad, box) {
    const nx = Math.max(box.x, Math.min(cx, box.x + box.w));
    const ny = Math.max(box.y, Math.min(cy, box.y + box.h));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < rad * rad;
  }

  function blocked(x, y, world) {
    if (x - BODY_RADIUS < 0 || y - BODY_RADIUS < 0 || x + BODY_RADIUS > world.w || y + BODY_RADIUS > world.h) {
      return true;
    }
    return world.obstacles.some((box) => circleHitsRect(x, y, BODY_RADIUS, box));
  }

  function tryMove(robot, dx, dy, world) {
    if (!blocked(robot.x + dx, robot.y + dy, world)) {
      return { x: robot.x + dx, y: robot.y + dy, hit: false };
    }
    if (!blocked(robot.x + dx, robot.y, world)) return { x: robot.x + dx, y: robot.y, hit: true };
    if (!blocked(robot.x, robot.y + dy, world)) return { x: robot.x, y: robot.y + dy, hit: true };
    return { x: robot.x, y: robot.y, hit: true };
  }

  function rayWalls(origin, dir, w, h) {
    let best = Infinity;
    if (dir.x > 1e-8) best = Math.min(best, (w - origin.x) / dir.x);
    if (dir.x < -1e-8) best = Math.min(best, (0 - origin.x) / dir.x);
    if (dir.y > 1e-8) best = Math.min(best, (h - origin.y) / dir.y);
    if (dir.y < -1e-8) best = Math.min(best, (0 - origin.y) / dir.y);
    return best;
  }

  function rayAabb(origin, dir, box) {
    let tmin = 0;
    let tmax = Infinity;
    const axes = [
      [origin.x, dir.x, box.x, box.x + box.w],
      [origin.y, dir.y, box.y, box.y + box.h],
    ];
    for (let i = 0; i < axes.length; i++) {
      const origin1 = axes[i][0];
      const dir1 = axes[i][1];
      const min = axes[i][2];
      const max = axes[i][3];
      if (Math.abs(dir1) < 1e-8) {
        if (origin1 < min || origin1 > max) return null;
      } else {
        let t1 = (min - origin1) / dir1;
        let t2 = (max - origin1) / dir1;
        if (t1 > t2) {
          const swap = t1;
          t1 = t2;
          t2 = swap;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    if (tmax < 0) return null;
    return tmin > 0 ? tmin : null;
  }

  function pointInRect(x, y, box) {
    return x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h;
  }

  function measureDistance(robot, world) {
    const dir = headingVector(robot.heading);
    const origin = pointAhead(robot, RAY_START);
    if (world.obstacles.some((box) => pointInRect(origin.x, origin.y, box))) return 0;
    let best = rayWalls(origin, dir, world.w, world.h);
    for (let i = 0; i < world.obstacles.length; i++) {
      const hit = rayAabb(origin, dir, world.obstacles[i]);
      if (hit != null && hit < best) best = hit;
    }
    if (!Number.isFinite(best) || best > SENSOR_RANGE) return null;
    return best;
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = dx * dx + dy * dy;
    if (len === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function paintOf(region) {
    return {
      color: region.color,
      colorId: region.colorId,
      light: region.light,
      fill: region.fill,
    };
  }

  function sampleSurface(x, y, world) {
    const regions = world.regions;
    for (let i = regions.length - 1; i >= 0; i--) {
      const region = regions[i];
      if (region.kind === "rect") {
        if (pointInRect(x, y, region)) return paintOf(region);
      } else if (region.kind === "segment") {
        if (distToSegment(x, y, region.x1, region.y1, region.x2, region.y2) <= region.width / 2) {
          return paintOf(region);
        }
      }
    }
    return paintOf(world.floor);
  }

  function mat(x, y, w, h, color, light, fill) {
    return { kind: "rect", x, y, w, h, color, colorId: COLOR_ID[color], light, fill };
  }

  function tape(x1, y1, x2, y2) {
    return {
      kind: "segment",
      x1, y1, x2, y2,
      width: 3.4,
      color: "black",
      colorId: COLOR_ID.black,
      light: 8,
      fill: "#242424",
    };
  }

  function floor(color, light, fill) {
    return { color, colorId: COLOR_ID[color], light, fill };
  }

  function preset(id) {
    const paper = floor("white", 90, "#efe8dc");
    if (id === "lane") {
      return {
        w: ARENA.w,
        h: ARENA.h,
        floor: paper,
        regions: [mat(108, 18, 24, 18, "yellow", 72, "#e2c14a")],
        obstacles: [{ id: "box", x: 86, y: 36, w: 16, h: 28 }],
        robot: { x: 36, y: 50, heading: 90, pitch: 0, roll: 0 },
      };
    }
    if (id === "line") {
      return {
        w: ARENA.w,
        h: ARENA.h,
        floor: floor("white", 94, "#f3f0e8"),
        regions: [
          tape(28, 22, 122, 22),
          tape(122, 22, 122, 78),
          tape(122, 78, 28, 78),
          tape(28, 78, 28, 22),
          mat(108, 62, 20, 16, "red", 46, "#e15b55"),
          mat(18, 14, 20, 16, "blue", 40, "#3c6fe0"),
        ],
        obstacles: [],
        robot: { x: 28, y: 22, heading: 90, pitch: 0, roll: 0 },
      };
    }
    if (id === "open") {
      return {
        w: ARENA.w,
        h: ARENA.h,
        floor: paper,
        regions: [],
        obstacles: [{ id: "box", x: 108, y: 38, w: 18, h: 22 }],
        robot: { x: 46, y: 50, heading: 90, pitch: 0, roll: 0 },
      };
    }
    return {
      w: ARENA.w,
      h: ARENA.h,
      floor: paper,
      regions: [
        mat(18, 16, 30, 22, "red", 46, "#e15b55"),
        mat(18, 60, 30, 22, "blue", 40, "#3c6fe0"),
        mat(104, 16, 30, 22, "green", 52, "#3aaa62"),
        mat(104, 60, 30, 22, "yellow", 74, "#e2c14a"),
        mat(62, 38, 22, 18, "black", 8, "#2a2a2a"),
      ],
      obstacles: [{ id: "crate", x: 124, y: 34, w: 14, h: 32 }],
      robot: { x: 72, y: 86, heading: 0, pitch: 0, roll: 0 },
    };
  }

  function createDrive() {
    function fresh() {
      return { angle: 0, dps: 0, remaining: null, resolver: null };
    }
    const motors = {};
    const pair = { left: "A", right: "B" };
    PORTS.forEach((port) => { motors[port] = fresh(); });

    function release(motor) {
      const done = motor.resolver;
      motor.resolver = null;
      motor.dps = 0;
      motor.remaining = null;
      if (done) queueMicrotask(done);
    }

    function command(port, dpsSigned, remainingSigned) {
      const motor = motors[port];
      if (!motor) return Promise.resolve();
      release(motor);
      if (remainingSigned == null) {
        motor.dps = dpsSigned || 0;
        motor.remaining = null;
        return Promise.resolve();
      }
      if (!dpsSigned || !remainingSigned) return Promise.resolve();
      motor.dps = Math.sign(remainingSigned) * Math.abs(dpsSigned);
      motor.remaining = remainingSigned;
      return new Promise((resolve) => {
        motor.resolver = resolve;
      });
    }

    function stop(port) {
      if (motors[port]) release(motors[port]);
    }

    function stopAll() {
      PORTS.forEach(stop);
    }

    function resetAngles() {
      PORTS.forEach((port) => { motors[port].angle = 0; });
    }

    function step(dt, robot, world) {
      const dtSafe = Math.max(0, Math.min(0.05, dt));
      const moved = {};
      const finished = [];
      PORTS.forEach((port) => {
        const motor = motors[port];
        if (!motor.dps) return;
        let delta = motor.dps * dtSafe;
        if (motor.remaining != null && Math.abs(delta) >= Math.abs(motor.remaining)) {
          delta = motor.remaining;
          motor.angle += delta;
          moved[port] = delta;
          const done = motor.resolver;
          motor.dps = 0;
          motor.remaining = null;
          motor.resolver = null;
          if (done) finished.push(done);
          return;
        }
        if (motor.remaining != null) motor.remaining -= delta;
        motor.angle += delta;
        moved[port] = delta;
      });
      const leftPort = pair.left || "A";
      const rightPort = pair.right || "B";
      const leftDeg = moved[leftPort] || 0;
      const rightDeg = rightPort === leftPort ? leftDeg : (moved[rightPort] || 0);
      const motion = wheelStepToMotion(leftDeg, rightDeg, robot.heading);
      const next = tryMove(robot, motion.dx, motion.dy, world);
      robot.x = next.x;
      robot.y = next.y;
      robot.heading = motion.heading;
      robot.bump = next.hit;
      if (finished.length) queueMicrotask(() => finished.forEach((fn) => fn()));
      return robot;
    }

    return { motors, pair, command, stop, stopAll, resetAngles, step };
  }

  return {
    ARENA,
    BODY_RADIUS,
    WHEEL_R,
    TRACK,
    MAX_DPS,
    RAY_START,
    SENSOR_RANGE,
    COLOR_ID,
    headingVector,
    pointAhead,
    PORTS,
    CM_PER_ROTATION,
    dpsFromPercent,
    defaultSense,
    configuredSense,
    defaultMotion,
    steerGains,
    degreesForMove,
    wheelsForTravel,
    wheelsForTurn,
    wheelStepToMotion,
    tryMove,
    measureDistance,
    sampleSurface,
    preset,
    createDrive,
  };
});

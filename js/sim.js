(function (root, factory) {
  const api = factory(root);
  root.HM = Object.assign(root.HM || {}, api);
  if (typeof module === "object" && module != null && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const HM = root.HM;
  const FONT = {
    " ": [0, 0, 0, 0, 0],
    "?": [7, 1, 2, 0, 2],
    A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6],
    E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5],
    I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
    M: [5, 7, 7, 5, 5], N: [5, 7, 7, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4],
    Q: [2, 5, 5, 7, 1], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
    U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
    Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
    0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6],
    4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 6, 5, 2], 7: [7, 1, 2, 2, 2],
    8: [2, 5, 2, 5, 2], 9: [2, 5, 3, 1, 6],
  };
  const IMAGES = {
    happy: [0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0],
    smile: [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0],
    sad: [0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    heart: [0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0],
    yes: [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    no: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1],
    arrow_n: [0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    arrow_e: [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    square: [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1],
  };
  const HUB_COLORS = {
    black: "#1c1c1c", violet: "#7a4db8", blue: "#2f6fdb", azure: "#2aa8c9",
    green: "#2f9d57", yellow: "#e2b423", red: "#d64545", white: "#f7f4ee", orange: "#e07a2f",
  };
  const keys = new Set();
  let view = { s: 4, ox: 16, oy: 16 };
  let pointer = null;
  let audio = null;
  const tones = [];

  function glyph(ch) {
    const rows = FONT[ch] || FONT["?"];
    const pixels = Array(25).fill(0);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) {
        if (rows[y] & (1 << (2 - x))) pixels[y * 5 + (x + 1)] = 100;
      }
    }
    return pixels;
  }

  function showImage(name) {
    const pattern = IMAGES[name] || IMAGES.happy;
    HM.matrix = pattern.map((cell) => (cell ? 100 : 0));
  }

  function clearMatrix() {
    HM.matrix = Array(25).fill(0);
  }

  function setPixel(col, row, brightness) {
    const x = Math.max(0, Math.min(4, col));
    const y = Math.max(0, Math.min(4, row));
    HM.matrix[y * 5 + x] = Math.max(0, Math.min(100, brightness));
  }

  async function scrollText(text, token) {
    const chars = String(text || "").toUpperCase().split("");
    if (!chars.length) return;
    for (let i = 0; i < chars.length; i++) {
      if (token && token.stopped) return;
      HM.matrix = glyph(chars[i]);
      await HM.sleep(320, token);
    }
  }

  function unlock() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audio) audio = new Ctx();
    if (audio.state === "suspended") audio.resume();
  }

  function beep(freq, seconds) {
    unlock();
    if (!audio) return Promise.resolve();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = Math.max(40, Math.min(2000, Number(freq) || 440));
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    const stopAt = audio.currentTime + Math.max(0.05, seconds);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    osc.stop(stopAt);
    tones.push(osc);
    return new Promise((resolve) => setTimeout(resolve, Math.max(0.05, seconds) * 1000));
  }

  function stopSounds() {
    tones.splice(0).forEach((osc) => {
      try { osc.stop(); } catch (err) { /* already stopped */ }
    });
  }

  function world() {
    const base = HM.preset(HM.project.arena || "mats");
    return {
      w: base.w,
      h: base.h,
      floor: base.floor,
      regions: base.regions,
      obstacles: HM.project.obstacles || [],
    };
  }

  function readSensors(current) {
    const point = HM.pointAhead(HM.robot, HM.RAY_START);
    const surface = HM.sampleSurface(point.x, point.y, current);
    const distance = HM.measureDistance(HM.robot, current);
    const force = HM.robot.forceHeld ? 8 : (HM.robot.bump ? 5 : 0);
    let timer = HM.timerShown || 0;
    if (HM.running && HM.timerMark) timer = (performance.now() - HM.timerMark) / 1000;
    return {
      distance,
      distanceFeature: distance == null ? 200 : distance,
      reflection: surface.light,
      color: surface.color,
      colorId: surface.colorId,
      fill: surface.fill,
      force,
      pressed: force >= 1,
      pitch: Number(HM.robot.pitch) || 0,
      roll: Number(HM.robot.roll) || 0,
      button: !!HM.robot.button,
      timer,
    };
  }

  function handDrive() {
    if (HM.running) return;
    let left = 0;
    let right = 0;
    const speed = HM.dpsFromPercent(42);
    if (keys.has("up")) { left += speed; right += speed; }
    if (keys.has("down")) { left -= speed; right -= speed; }
    if (keys.has("left")) { left -= speed; right += speed; }
    if (keys.has("right")) { left += speed; right -= speed; }
    const pair = HM.drive.pair || { left: "A", right: "B" };
    ["A", "B"].forEach((port) => {
      if (port !== pair.left && port !== pair.right && HM.drive.motors[port]) {
        HM.drive.motors[port].dps = 0;
        HM.drive.motors[port].remaining = null;
      }
    });
    if (HM.drive.motors[pair.left]) {
      HM.drive.motors[pair.left].dps = left;
      HM.drive.motors[pair.left].remaining = null;
    }
    if (pair.right !== pair.left && HM.drive.motors[pair.right]) {
      HM.drive.motors[pair.right].dps = right;
      HM.drive.motors[pair.right].remaining = null;
    }
  }

  function resize() {
    const canvas = document.getElementById("arena-canvas");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fit(canvas, current) {
    const pad = 16;
    const s = Math.min((canvas.clientWidth - pad * 2) / current.w, (canvas.clientHeight - pad * 2) / current.h);
    view = {
      s,
      ox: (canvas.clientWidth - current.w * s) / 2,
      oy: (canvas.clientHeight - current.h * s) / 2,
    };
  }

  function px(x, y) {
    return [view.ox + x * view.s, view.oy + y * view.s];
  }

  function cm(x, y) {
    return { x: (x - view.ox) / view.s, y: (y - view.oy) / view.s };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function draw(current) {
    const canvas = document.getElementById("arena-canvas");
    const ctx = canvas.getContext("2d");
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 40 || h < 40) return;
    fit(canvas, current);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#d9d1c3";
    ctx.fillRect(0, 0, w, h);
    const origin = px(0, 0);
    ctx.save();
    ctx.translate(origin[0], origin[1]);
    ctx.scale(view.s, view.s);
    roundRect(ctx, 0, 0, current.w, current.h, 2);
    ctx.fillStyle = current.floor.fill;
    ctx.fill();
    ctx.strokeStyle = "rgba(40, 32, 24, 0.08)";
    ctx.lineWidth = 0.15;
    for (let x = 10; x < current.w; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, current.h);
      ctx.stroke();
    }
    for (let y = 10; y < current.h; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(current.w, y);
      ctx.stroke();
    }
    current.regions.forEach((region) => {
      ctx.fillStyle = region.fill;
      if (region.kind === "rect") {
        roundRect(ctx, region.x, region.y, region.w, region.h, 1.2);
        ctx.fill();
      } else if (region.kind === "segment") {
        ctx.strokeStyle = region.fill;
        ctx.lineWidth = region.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(region.x1, region.y1);
        ctx.lineTo(region.x2, region.y2);
        ctx.stroke();
      }
    });
    current.obstacles.forEach((box) => {
      ctx.fillStyle = "rgba(40, 30, 20, 0.18)";
      roundRect(ctx, box.x + 0.6, box.y + 0.8, box.w, box.h, 1);
      ctx.fill();
      ctx.fillStyle = "#c9844a";
      roundRect(ctx, box.x, box.y, box.w, box.h, 1);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(box.x + 1, box.y + 1, box.w - 2, 1.2);
    });
    drawRobot(ctx, current);
    ctx.restore();
  }

  function drawRobot(ctx, current) {
    const robot = HM.robot;
    ctx.save();
    ctx.translate(robot.x, robot.y);
    ctx.rotate((robot.heading * Math.PI) / 180);
    ctx.fillStyle = "rgba(40, 30, 20, 0.16)";
    ctx.beginPath();
    ctx.ellipse(0.4, 0.8, 7.2, 5.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1d2328";
    roundRect(ctx, -8.2, -4.6, 3.1, 9.2, 1);
    ctx.fill();
    roundRect(ctx, 5.1, -4.6, 3.1, 9.2, 1);
    ctx.fill();
    ctx.fillStyle = robot.bump ? "#8d3b32" : "#2f6b62";
    roundRect(ctx, -6.2, -6.6, 12.4, 13.2, 2.4);
    ctx.fill();
    ctx.fillStyle = HM.hubColor || "#f2c14e";
    roundRect(ctx, -5.2, -5.6, 10.4, 2.2, 1);
    ctx.fill();
    const arm = (HM.drive.motors.F.angle * Math.PI) / 180;
    ctx.save();
    ctx.translate(6.2, 0);
    ctx.rotate(arm);
    ctx.fillStyle = "#d7a15e";
    roundRect(ctx, 0, -0.8, 6.5, 1.6, 0.6);
    ctx.fill();
    ctx.restore();
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const bright = HM.matrix[y * 5 + x] || 0;
        ctx.fillStyle = bright > 0 ? "rgba(255, 244, 214," + (0.25 + bright / 140) + ")" : "rgba(0,0,0,0.18)";
        ctx.fillRect(-2.1 + x * 0.92, -2.2 + y * 0.92, 0.72, 0.72);
      }
    }
    ctx.fillStyle = "#f4f7f4";
    ctx.beginPath();
    ctx.arc(-1.1, -6.9, 0.7, 0, Math.PI * 2);
    ctx.arc(1.1, -6.9, 0.7, 0, Math.PI * 2);
    ctx.fill();
    const sensor = readSensors(current);
    ctx.fillStyle = sensor.fill || "#ddd";
    ctx.beginPath();
    ctx.arc(0, -5.2, 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const start = HM.pointAhead(robot, HM.RAY_START);
    const reach = sensor.distance == null ? 28 : sensor.distance;
    const end = HM.pointAhead(robot, HM.RAY_START + reach);
    ctx.save();
    ctx.strokeStyle = sensor.distance == null ? "rgba(227, 155, 43, 0.35)" : "rgba(227, 155, 43, 0.9)";
    ctx.setLineDash([1.2, 0.8]);
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  function updateReadouts(sensors) {
    const dist = document.getElementById("read-distance");
    const color = document.getElementById("read-color");
    const light = document.getElementById("read-light");
    const force = document.getElementById("read-force");
    const tilt = document.getElementById("read-tilt");
    const timer = document.getElementById("read-timer");
    const predict = document.getElementById("read-predict");
    const swatch = document.getElementById("read-swatch");
    if (!dist) return;
    const ports = HM.configuredSense ? HM.configuredSense() : { distance: "D", color: "C", press: "E" };
    const distanceLabel = document.getElementById("label-distance");
    const colorLabel = document.getElementById("label-color");
    const pressLabel = document.getElementById("label-press");
    if (distanceLabel) distanceLabel.textContent = "Distance " + ports.distance;
    if (colorLabel) colorLabel.textContent = "Color " + ports.color;
    if (pressLabel) pressLabel.textContent = "Press " + ports.press;
    dist.textContent = sensors.distance == null ? "no object" : Math.round(sensors.distance) + " cm";
    color.textContent = sensors.color;
    if (swatch) swatch.style.background = sensors.fill;
    light.textContent = Math.round(sensors.reflection) + "%";
    force.textContent = sensors.force.toFixed(0) + " N";
    tilt.textContent = Math.round(sensors.pitch) + "° / " + Math.round(sensors.roll) + "°";
    timer.textContent = sensors.timer.toFixed(1) + " s";
    const names = {};
    (HM.project.ml.classes || []).forEach((item) => { names[item.id] = item.name; });
    const prediction = HM.lastPrediction;
    if (!prediction || !prediction.ready) predict.textContent = "no model";
    else predict.textContent = (names[prediction.classId] || "class") + " · " + Math.round(prediction.confidence * 100) + "%";
  }

  let last = 0;
  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    handDrive();
    const current = world();
    HM.drive.step(dt, HM.robot, current);
    const sensors = readSensors(current);
    HM.sensors = sensors;
    if (HM.describePorts) HM.describePorts();
    if (HM.hub && HM.hub.followPhoto) HM.hub.followPhoto();
    if (HM.hub && HM.hub.connected && HM.hub.liveSense) {
      const livePack = HM.hub.liveSense();
      HM.hub.sensors = livePack.sensors;
      HM.hub.reading = livePack.reading;
      HM.lastReading = livePack.reading;
    }
    const live = HM.hub && HM.hub.connected && HM.hub.sensors;
    if (!live) {
      HM.lastReading = {
        distance: sensors.distanceFeature,
        reflection: sensors.reflection,
        color: sensors.colorId,
        force: sensors.force,
        pitch: sensors.pitch,
        roll: sensors.roll,
      };
    }
    if (HM.project.ml.mode === "images") {
      if (HM.vision) HM.vision.predictFrame(now);
    } else {
      HM.lastPrediction = HM.knnPredict(HM.project.ml.samples, HM.lastReading, HM.project.ml.k, HM.project.ml.use);
    }
    updateReadouts(live ? Object.assign({}, sensors, HM.hub.sensors, { timer: sensors.timer }) : sensors);
    draw(current);
    const lab = document.getElementById("lab");
    if (lab && !lab.hidden && HM.drawPlot) HM.drawPlot();
    requestAnimationFrame(frame);
  }

  function mount() {
    clearMatrix();
    HM.hubColor = "#2f6f62";
    const canvas = document.getElementById("arena-canvas");
    new ResizeObserver(resize).observe(canvas);
    resize();
    window.addEventListener("keydown", (event) => {
      if (event.target.closest("input, textarea, select")) return;
      const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      if (!map[event.key]) return;
      keys.add(map[event.key]);
      event.preventDefault();
    });
    window.addEventListener("keyup", (event) => {
      const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      if (map[event.key]) keys.delete(map[event.key]);
    });
    window.addEventListener("blur", () => keys.clear());
    canvas.addEventListener("pointerdown", (event) => {
      const rect = canvas.getBoundingClientRect();
      const point = cm(event.clientX - rect.left, event.clientY - rect.top);
      const current = world();
      for (let i = current.obstacles.length - 1; i >= 0; i--) {
        const box = current.obstacles[i];
        if (point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) {
          pointer = { kind: "box", box, dx: point.x - box.x, dy: point.y - box.y };
          canvas.setPointerCapture(event.pointerId);
          return;
        }
      }
      if (!HM.running && Math.hypot(point.x - HM.robot.x, point.y - HM.robot.y) < 12) {
        pointer = { kind: "robot", dx: point.x - HM.robot.x, dy: point.y - HM.robot.y };
        canvas.setPointerCapture(event.pointerId);
      }
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!pointer) return;
      const rect = canvas.getBoundingClientRect();
      const point = cm(event.clientX - rect.left, event.clientY - rect.top);
      if (pointer.kind === "robot") {
        const current = world();
        const dx = point.x - pointer.dx - HM.robot.x;
        const dy = point.y - pointer.dy - HM.robot.y;
        const moved = HM.tryMove(HM.robot, dx, dy, current);
        HM.robot.x = moved.x;
        HM.robot.y = moved.y;
      } else {
        pointer.box.x = Math.max(0, Math.min(HM.ARENA.w - pointer.box.w, point.x - pointer.dx));
        pointer.box.y = Math.max(0, Math.min(HM.ARENA.h - pointer.box.h, point.y - pointer.dy));
      }
    });
    canvas.addEventListener("pointerup", () => {
      pointer = null;
      HM.saveSoon();
    });
    requestAnimationFrame(frame);
  }

  return {
    sim: { mount, world, readSensors },
    matrixApi: { showImage, clearMatrix, setPixel, scrollText },
    sound: { beep, stop: stopSounds, unlock },
    hubColors: HUB_COLORS,
    IMAGES,
  };
});

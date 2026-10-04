(function () {
  "use strict";

  const HM = window.HM;
  const STORE = "hagen-mindstorm-v1";
  let undoStack = [];
  let redoStack = [];
  let saveTimer = 0;
  let toastTimer = 0;
  let modalResolve = null;
  let lessonId = "drive";

  function blankProject() {
    const built = HM.LESSONS[0].build();
    const base = HM.preset(built.arena);
    return {
      id: HM.uid("p"),
      name: "Driving base",
      stacks: built.stacks,
      variables: ["count"],
      ml: { k: 3, classes: HM.defaultClasses(), samples: [], use: HM.defaultUse(), score: null, mode: "sensors" },
      arena: built.arena,
      obstacles: HM.clone(base.obstacles),
      robot: HM.clone(built.robot),
    };
  }

  function bootRobot(robot) {
    HM.robot = Object.assign({
      x: 48, y: 78, heading: 0, pitch: 0, roll: 0,
      forceHeld: false, button: false, bump: false,
    }, robot || {});
  }

  function serialize() {
    return JSON.stringify({
      name: HM.project.name,
      stacks: HM.project.stacks,
      variables: HM.project.variables,
      ml: HM.project.ml,
      arena: HM.project.arena,
      obstacles: HM.project.obstacles,
      robot: {
        x: HM.robot.x, y: HM.robot.y, heading: HM.robot.heading,
        pitch: HM.robot.pitch, roll: HM.robot.roll,
      },
    });
  }

  function applySnap(text) {
    const data = JSON.parse(text);
    HM.project.name = data.name;
    HM.project.stacks = data.stacks;
    HM.project.variables = data.variables;
    HM.project.ml = data.ml;
    HM.project.arena = data.arena;
    HM.project.obstacles = data.obstacles;
    bootRobot(data.robot);
    HM.selectedId = null;
    HM.cursor = null;
    syncControls();
    refresh();
  }

  function pushRaw(snap) {
    if (!snap || snap === serialize()) return;
    if (undoStack.length && undoStack[undoStack.length - 1] === snap) return;
    undoStack.push(snap);
    redoStack = [];
    if (undoStack.length > 60) undoStack.shift();
  }

  function flushField() {
    if (!HM._fieldSnap) return;
    const snap = HM._fieldSnap;
    HM._fieldSnap = null;
    pushRaw(snap);
  }

  HM.serialize = serialize;
  HM.pushHistory = function (snap) {
    flushField();
    pushRaw(snap);
  };
  HM.noteHistory = function () {
    if (!HM._fieldSnap) HM._fieldSnap = serialize();
  };
  HM.restore = function (text) {
    applySnap(text);
  };
  HM.undo = function () {
    flushField();
    if (HM.running) HM.stopProgram();
    if (!undoStack.length) return;
    redoStack.push(serialize());
    applySnap(undoStack.pop());
  };
  HM.redo = function () {
    flushField();
    if (HM.running) HM.stopProgram();
    if (!redoStack.length) return;
    undoStack.push(serialize());
    applySnap(redoStack.pop());
  };

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  HM.saveSoon = saveSoon;

  function saveNow() {
    if (!HM.project || !HM.robot) return;
    HM.project.robot = {
      x: HM.robot.x, y: HM.robot.y, heading: HM.robot.heading,
      pitch: HM.robot.pitch, roll: HM.robot.roll,
    };
    try {
      localStorage.setItem(STORE, JSON.stringify({ version: 1, project: HM.project }));
    } catch (err) {
      if (!HM._storageWarned && HM.project.ml && HM.project.ml.mode === "images") {
        HM._storageWarned = true;
        HM.toast("Photos stay for this visit. The browser could not store every picture.");
      }
    }
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.project || !data.project.stacks) return null;
      return data.project;
    } catch (err) {
      return null;
    }
  }

  HM.toast = function (message) {
    const el = document.getElementById("toast");
    el.hidden = false;
    el.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  };

  HM.log = function (message) {
    HM.logs = HM.logs || [];
    HM.logs.push(String(message));
    if (HM.logs.length > 80) HM.logs.shift();
    const el = document.getElementById("console");
    el.textContent = HM.logs.join("\n");
    el.scrollTop = el.scrollHeight;
  };
  HM.clearConsole = function () {
    HM.logs = [];
    document.getElementById("console").textContent = "";
  };

  HM.setRunning = function (running) {
    document.getElementById("run").disabled = running;
    document.getElementById("stop").disabled = !running;
  };

  function refreshCode() {
    const code = HM.generatePython(HM.project);
    document.getElementById("python").innerHTML = HM.highlightPython(code);
  }

  function updateChrome() {
    const name = document.getElementById("project-name");
    if (document.activeElement !== name) name.value = HM.project.name;
    const count = (HM.project.ml.samples || []).length;
    document.getElementById("open-lab").textContent = count ? "Learn · " + count : "Learn";
    document.getElementById("arena").value = HM.project.arena || "mats";
    document.getElementById("pitch").value = HM.robot.pitch || 0;
    document.getElementById("roll").value = HM.robot.roll || 0;
    document.getElementById("k-slider").value = HM.project.ml.k;
    document.getElementById("k-label").textContent = HM.project.ml.k;
    const cells = document.querySelectorAll("#matrix i");
    cells.forEach((cell, index) => {
      const value = (HM.matrix && HM.matrix[index]) || 0;
      cell.style.opacity = String(0.15 + value / 130);
    });
  }

  function refresh() {
    HM.editor.render();
    refreshCode();
    updateChrome();
    if (!document.getElementById("lab").hidden) renderLab();
    saveSoon();
  }
  HM.refresh = refresh;

  const MOTOR_PORT_BLOCKS = {
    motor_run: true,
    motor_goto: true,
    motor_spin: true,
    motor_stop: true,
    motor_set_speed: true,
    motor_pos: true,
    motor_speed_get: true,
    motor_degrees: true,
    motor_start: true,
    motor_angle: true,
  };

  function walkProject(visit) {
    function walk(blocks) {
      (blocks || []).forEach((block) => {
        if (!block) return;
        visit(block);
        Object.keys(block.branches || {}).forEach((key) => walk(block.branches[key]));
        Object.keys(block.inputs || {}).forEach((key) => {
          if (block.inputs[key]) walk([block.inputs[key]]);
        });
      });
    }
    (HM.project.stacks || []).forEach((stack) => walk(stack.blocks));
  }

  HM.describePorts = function () {
    const line = document.getElementById("port-line");
    if (!line) return;
    const idle = "Any port A–F can be a motor, distance sensor, color sensor, or press sensor. Connect the hub and it reports which device is on each port. Arrow keys drive when stopped.";
    if (!HM.hub || !HM.hub.connected) {
      if (line.textContent !== idle) line.textContent = idle;
      return;
    }
    const names = { motor: "motor", distance: "distance", color: "color", force: "press" };
    const fresh = HM.hub.freshPorts ? HM.hub.freshPorts() : [];
    const text = fresh.length
      ? "Hub ports: " + fresh.map((item) => item.port + " " + (names[item.kind] || item.kind)).join(" · ") + "."
      : "Connected to " + (HM.hub.name || "the hub") + ". Waiting for it to report which device is on each port.";
    if (line.textContent !== text) line.textContent = text;
  };

  HM.syncHubPorts = function () {
    HM.describePorts();
    if (!HM.hub || !HM.hub.connected || !HM.hub.freshPorts || !HM.project) return;
    const fresh = HM.hub.freshPorts();
    const signature = fresh.map((item) => item.port + ":" + item.kind).join(",");
    if (signature === HM._hubPortSignature) return;
    HM._hubPortSignature = signature;
    if (!fresh.length) return;
    const layout = {};
    fresh.forEach((item) => { layout[item.port] = item.kind; });
    const currentMotion = HM.motion || HM.defaultMotion();
    const assigned = HM.hub.assignPorts(layout, HM.sensePorts || HM.defaultSense(), {
      left: currentMotion.left,
      right: currentMotion.right,
    });
    HM.sensePorts = assigned.sense;
    if (!HM.motion) HM.motion = HM.defaultMotion();
    HM.motion.left = assigned.motion.left;
    HM.motion.right = assigned.motion.right;
    if (HM.drive && HM.drive.pair) {
      HM.drive.pair.left = assigned.motion.left;
      HM.drive.pair.right = assigned.motion.right;
    }
    let changed = false;
    walkProject((block) => {
      if (block.opcode === "sense_set") {
        if (block.fields.distance !== assigned.sense.distance) { block.fields.distance = assigned.sense.distance; changed = true; }
        if (block.fields.color !== assigned.sense.color) { block.fields.color = assigned.sense.color; changed = true; }
        if (block.fields.press !== assigned.sense.press) { block.fields.press = assigned.sense.press; changed = true; }
      }
      if (block.opcode === "move_set_motors") {
        if (block.fields.left !== assigned.motion.left) { block.fields.left = assigned.motion.left; changed = true; }
        if (assigned.motors.length >= 2 && block.fields.right !== assigned.motion.right) {
          block.fields.right = assigned.motion.right;
          changed = true;
        }
      }
      if (assigned.motors.length === 1 && MOTOR_PORT_BLOCKS[block.opcode] && block.fields.port !== assigned.motors[0]) {
        block.fields.port = assigned.motors[0];
        changed = true;
      }
    });
    const names = { motor: "motor", distance: "distance", color: "color", force: "press" };
    const summary = fresh.map((item) => item.port + " " + (names[item.kind] || item.kind)).join(", ");
    if (HM.log) HM.log("Hub ports: " + summary);
    if (HM.toast) HM.toast("Hub ports: " + summary);
    if (changed) refresh();
    else HM.describePorts();
  };
  HM.afterEdit = function () {
    refreshCode();
    updateChrome();
    saveSoon();
  };

  function syncControls() {
    document.getElementById("arena").value = HM.project.arena;
  }

  function setView(view) {
    const app = document.getElementById("app");
    app.classList.remove("view-blocks", "view-split", "view-python");
    app.classList.add(view === "blocks" ? "view-blocks" : view === "python" ? "view-python" : "view-split");
    document.querySelectorAll(".views button").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.view === view);
    });
  }

  function ask(title, body, opts) {
    const options = opts || {};
    const dialog = document.getElementById("modal");
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").textContent = body || "";
    const field = document.getElementById("modal-field");
    const input = document.getElementById("modal-input");
    field.hidden = !options.input;
    if (options.input) {
      input.value = options.value || "";
      setTimeout(() => input.focus(), 30);
    }
    dialog.showModal();
    return new Promise((resolve) => { modalResolve = resolve; });
  }

  function closeModal(value) {
    const dialog = document.getElementById("modal");
    if (dialog.open) dialog.close();
    if (!modalResolve) return;
    const resolve = modalResolve;
    modalResolve = null;
    if (!value) resolve(null);
    else if (!document.getElementById("modal-field").hidden) resolve(document.getElementById("modal-input").value);
    else resolve(true);
  }

  HM.createVariable = async function () {
    const name = await ask("New variable", "Use a short name, such as count or speed.", { input: true, value: "score" });
    if (!name || !String(name).trim()) return;
    const clean = String(name).trim().slice(0, 24);
    if (!HM.project.variables.includes(clean)) {
      const backup = serialize();
      HM.project.variables.push(clean);
      HM.pushHistory(backup);
    }
    refresh();
  };

  function renderLessons() {
    const list = document.getElementById("lesson-list");
    list.innerHTML = "";
    HM.LESSONS.forEach((lesson, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = (index + 1) + ". " + lesson.title;
      button.classList.toggle("is-on", lesson.id === lessonId);
      button.addEventListener("click", () => {
        lessonId = lesson.id;
        renderLessons();
      });
      item.appendChild(button);
      list.appendChild(item);
    });
    const lesson = HM.LESSONS.find((item) => item.id === lessonId) || HM.LESSONS[0];
    const detail = document.getElementById("lesson-detail");
    detail.innerHTML = "";
    const title = document.createElement("h2");
    title.textContent = lesson.title;
    const summary = document.createElement("p");
    summary.textContent = lesson.summary + " About " + lesson.minutes + " minutes.";
    const steps = document.createElement("ol");
    lesson.steps.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      steps.appendChild(li);
    });
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const load = document.createElement("button");
    load.type = "button";
    load.className = "primary";
    load.textContent = "Load this lesson";
    load.addEventListener("click", () => applyLesson(lesson));
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => document.getElementById("course-dialog").close());
    actions.append(load, close);
    detail.append(title, summary, steps, actions);
  }

  async function applyLesson(lesson) {
    if (HM.running) HM.stopProgram();
    if (HM.project.stacks.length) {
      const ok = await ask("Load lesson", "Replace the current blocks with this lesson? Training samples stay.");
      if (!ok) return;
    }
    const backup = serialize();
    const built = lesson.build();
    HM.project.stacks = built.stacks;
    if (built.arena) {
      HM.project.arena = built.arena;
      HM.project.obstacles = HM.clone(HM.preset(built.arena).obstacles);
    }
    if (built.robot) bootRobot(built.robot);
    if (built.use) HM.project.ml.use = Object.assign({}, HM.defaultUse(), built.use);
    (built.ensureClasses || []).forEach((item) => {
      if (!HM.project.ml.classes.some((cls) => cls.id === item.id)) HM.project.ml.classes.push(item);
    });
    HM.cursor = { stackId: built.stacks[0].id, seq: "", index: built.stacks[0].blocks.length };
    HM.selectedId = null;
    HM.pushHistory(backup);
    document.getElementById("course-dialog").close();
    refresh();
    HM.toast(lesson.title + " is on the canvas.");
  }

  function renderFeatures() {
    const host = document.getElementById("feature-list");
    host.innerHTML = "";
    HM.FEATURES.forEach((feature) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!HM.project.ml.use[feature.key];
      input.addEventListener("change", () => {
        HM.noteHistory();
        HM.project.ml.use[feature.key] = input.checked;
        HM.project.ml.score = null;
        HM.afterEdit();
        renderLab();
      });
      label.append(input, " " + feature.label);
      host.appendChild(label);
    });
  }

  function renderLab() {
    const host = document.getElementById("lab-classes");
    host.innerHTML = "";
    HM.project.ml.classes.forEach((item) => {
      const row = document.createElement("div");
      row.className = "class-row";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "lab-class";
      radio.value = item.id;
      radio.checked = item.id === (HM.activeClass || HM.project.ml.classes[0].id);
      radio.addEventListener("change", () => { HM.activeClass = item.id; });
      const color = document.createElement("input");
      color.type = "color";
      color.value = item.color;
      color.addEventListener("input", () => { item.color = color.value; saveSoon(); });
      const name = document.createElement("input");
      name.type = "text";
      name.value = item.name;
      name.addEventListener("change", () => {
        item.name = name.value.trim().slice(0, 24) || item.name;
        refresh();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini";
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        const backup = serialize();
        HM.project.ml.classes = HM.project.ml.classes.filter((cls) => cls.id !== item.id);
        HM.project.ml.samples = HM.project.ml.samples.filter((sample) => sample.classId !== item.id);
        HM.pushHistory(backup);
        refresh();
      });
      if (HM.project.ml.mode === "images") {
        const count = document.createElement("span");
        const n = HM.classPhotoCounts(HM.project.ml.samples, HM.project.ml.classes)[item.id] || 0;
        count.className = "class-count" + (n >= HM.MIN_CLASS_PHOTOS ? " is-ready" : "");
        count.textContent = n + "/9";
        row.append(radio, color, name, count, remove);
      } else row.append(radio, color, name, remove);
      host.appendChild(row);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "mini";
    add.textContent = "Add class";
    add.addEventListener("click", async () => {
      const name = await ask("New class", "Name the kind of example, such as floor or obstacle.", { input: true, value: "floor" });
      if (!name || !String(name).trim()) return;
      const backup = serialize();
      const id = HM.uid("class");
      HM.project.ml.classes.push({ id, name: String(name).trim().slice(0, 24), color: "#7a4db8" });
      HM.activeClass = id;
      HM.pushHistory(backup);
      refresh();
    });
    host.appendChild(add);
    renderFeatures();
    applyModeChrome();
    const score = HM.project.ml.score;
    const accuracy = document.getElementById("accuracy");
    if (HM.project.ml.mode === "images") {
      const report = HM.imageReady(HM.project.ml.samples, HM.project.ml.classes);
      const started = HM.project.ml.classes.filter((item) => report.counts[item.id] > 0);
      const progress = started.map((item) => item.name + " " + report.counts[item.id] + "/9").join(" · ");
      const countLine = document.getElementById("photo-count");
      if (countLine) countLine.textContent = progress ? "9 photos for each class you are teaching. " + progress + "." : "Choose a class and add 9 photos of that thing. A class with no photos is left out.";
      if (score == null) accuracy.textContent = report.ok ? "Every class you started has at least 9 photos. Train to score them." : "Add 9 photos to each class you want the model to recognize. A class with no photos is left out.";
      else accuracy.textContent = "Leave-one-out score: " + Math.round(score * 100) + "% of the photos. A perfect score can still just be memorizing.";
    } else if (score == null) accuracy.textContent = "Train hides each sample once and asks the others to guess it.";
    else accuracy.textContent = "Leave-one-out score: " + Math.round(score * 100) + "% of " + HM.project.ml.samples.filter((sample) => sample.kind !== "image").length + " samples. A perfect score can still just be memorizing.";
    renderTable();
    HM.drawPlot();
  }

  function applyModeChrome() {
    const images = HM.project.ml.mode === "images";
    document.getElementById("lab").classList.toggle("mode-images", images);
    document.getElementById("photo-lab").hidden = !images;
    document.getElementById("mode-sensors").classList.toggle("is-on", !images);
    document.getElementById("mode-images").classList.toggle("is-on", images);
    document.getElementById("lab-blurb").textContent = images
      ? "Photograph each class at least 9 times. Prediction blocks use the camera, or the last photo, in this browser."
      : "k-nearest neighbors. Capture a reading, label it, then let the blocks ask for a vote.";
    const clear = document.getElementById("clear-samples");
    if (clear) clear.textContent = images ? "Clear photos" : "Clear samples";
    if (images && HM.vision) HM.vision.renderGallery();
  }

  function setLabMode(mode) {
    if (!HM.project.ml.mode) HM.project.ml.mode = "sensors";
    if (HM.project.ml.mode === mode) {
      applyModeChrome();
      return;
    }
    HM.noteHistory();
    HM.project.ml.mode = mode;
    HM.project.ml.score = null;
    if (mode !== "images" && HM.vision) HM.vision.stop();
    applyModeChrome();
    renderLab();
    saveSoon();
  }

  function renderTable() {
    const host = document.getElementById("lab-table");
    const samples = (HM.project.ml.samples || []).filter((sample) => sample.kind !== "image");
    if (!samples.length) {
      host.textContent = "No samples yet.";
      return;
    }
    const names = {};
    HM.project.ml.classes.forEach((item) => { names[item.id] = item.name; });
    const table = document.createElement("table");
    const head = document.createElement("tr");
    ["Class", "Distance", "Light", "Color", ""].forEach((label) => {
      const th = document.createElement("th");
      th.textContent = label;
      head.appendChild(th);
    });
    table.appendChild(head);
    samples.slice(-12).reverse().forEach((sample) => {
      const row = document.createElement("tr");
      [names[sample.classId] || sample.classId, Math.round(sample.features.distance), Math.round(sample.features.reflection), sample.features.color].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      const del = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mini";
      button.textContent = "Delete";
      button.addEventListener("click", () => {
        HM.project.ml.samples = HM.project.ml.samples.filter((item) => item.id !== sample.id);
        HM.project.ml.score = null;
        refresh();
      });
      del.appendChild(button);
      row.appendChild(del);
      table.appendChild(row);
    });
    host.innerHTML = "";
    host.appendChild(table);
  }

  HM.drawPlot = function () {
    const canvas = document.getElementById("plot");
    if (!canvas || HM.project.ml.mode === "images") return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#f6f3ec";
    ctx.fillRect(0, 0, w, h);
    const use = HM.project.ml.use;
    const xKey = use.distance ? "distance" : (use.pitch ? "pitch" : "reflection");
    const yKey = use.reflection && xKey !== "reflection" ? "reflection" : (use.roll ? "roll" : "color");
    const xMax = xKey === "distance" ? 200 : (xKey === "color" ? 8 : 100);
    const yMax = yKey === "reflection" ? 100 : (yKey === "color" ? 8 : 90);
    const pad = 16;
    const sx = (value) => pad + (Math.max(0, Math.min(xMax, value)) / xMax) * (w - pad * 2);
    const sy = (value) => h - pad - (Math.max(0, Math.min(yMax, value)) / yMax) * (h - pad * 2);
    ctx.strokeStyle = "#ddd4c6";
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.fillStyle = "#6d756e";
    ctx.font = "10px sans-serif";
    ctx.fillText(xKey, w - 70, h - 4);
    ctx.fillText(yKey, 4, 12);
    const colors = {};
    HM.project.ml.classes.forEach((item) => { colors[item.id] = item.color; });
    (HM.project.ml.samples || []).forEach((sample) => {
      if (!sample.features || Array.isArray(sample.features)) return;
      ctx.fillStyle = colors[sample.classId] || "#333";
      ctx.beginPath();
      ctx.arc(sx(sample.features[xKey] || 0), sy(sample.features[yKey] || 0), 4, 0, Math.PI * 2);
      ctx.fill();
    });
    if (HM.lastReading) {
      ctx.strokeStyle = "#1c2420";
      ctx.lineWidth = 2;
      const x = sx(HM.lastReading[xKey] || 0);
      const y = sy(HM.lastReading[yKey] || 0);
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
    }
    const names = {};
    HM.project.ml.classes.forEach((item) => { names[item.id] = item.name; });
    const prediction = HM.lastPrediction;
    const box = document.getElementById("neighbors");
    if (!box) return;
    if (!prediction || !prediction.neighbors || !prediction.neighbors.length) {
      box.textContent = "Neighbors show up after the first samples.";
      return;
    }
    const vote = prediction.neighbors.map((item) => (names[item.classId] || "class") + " (" + item.d.toFixed(2) + ")").join(", ");
    box.textContent = "Nearest: " + vote + " → " + (names[prediction.classId] || "—");
  };

  HM.openLab = function () {
    document.getElementById("lab").hidden = false;
    if (!HM.project.ml.mode) HM.project.ml.mode = "sensors";
    if (!HM.activeClass && HM.project.ml.classes[0]) HM.activeClass = HM.project.ml.classes[0].id;
    if (HM.vision) HM.vision.park(true);
    renderLab();
  };

  function captureSample() {
    if (!HM.lastReading) return;
    const chosen = document.querySelector("input[name=lab-class]:checked");
    const classId = (chosen && chosen.value) || HM.activeClass || (HM.project.ml.classes[0] && HM.project.ml.classes[0].id);
    if (!classId) {
      HM.toast("Add a class before capturing.");
      return;
    }
    const backup = serialize();
    HM.project.ml.samples.push({ id: HM.uid("sample"), classId, features: Object.assign({}, HM.lastReading) });
    const sensorRows = HM.project.ml.samples.filter((sample) => sample.kind !== "image");
    if (sensorRows.length > 200) {
      const oldest = sensorRows[0];
      HM.project.ml.samples = HM.project.ml.samples.filter((sample) => sample.id !== oldest.id);
    }
    HM.project.ml.score = null;
    HM.pushHistory(backup);
    refresh();
  }

  function train() {
    if (HM.project.ml.mode === "images") {
      const report = HM.imageReady(HM.project.ml.samples, HM.project.ml.classes);
      if (!report.ok) {
        const missing = report.short.map((item) => item.name + " " + report.counts[item.id] + "/9");
        if (missing.length) HM.toast("Each class needs 9 photos: " + missing.join(", ") + ".");
        else HM.toast("Train needs two classes with at least 9 photos each.");
        HM.project.ml.score = null;
        renderLab();
        return;
      }
      const score = HM.imageScore(HM.project.ml.samples, HM.project.ml.k);
      HM.project.ml.score = score;
      HM.toast("Trained on photos. Leave-one-out score " + Math.round(score * 100) + "%.");
      renderLab();
      refreshCode();
      saveSoon();
      return;
    }
    const score = HM.looScore(HM.project.ml.samples, HM.project.ml.k, HM.project.ml.use);
    HM.project.ml.score = score;
    if (score == null) HM.toast("Capture at least two samples and turn on a feature.");
    else HM.toast("Trained. Leave-one-out score " + Math.round(score * 100) + "%.");
    renderLab();
    refreshCode();
    saveSoon();
  }

  async function loadDemo(kind) {
    const sensorRows = HM.project.ml.samples.filter((sample) => sample.kind !== "image");
    if (sensorRows.length) {
      const ok = await ask("Load demo samples", "Replace the current sensor samples with the demo set?");
      if (!ok) return;
    }
    const backup = serialize();
    if (kind === "color") {
      ["red", "blue", "floor"].forEach((id) => {
        if (!HM.project.ml.classes.some((item) => item.id === id)) {
          const colors = { red: "#d64545", blue: "#3a5bd9", floor: "#8d8678" };
          HM.project.ml.classes.push({ id, name: id, color: colors[id] });
        }
      });
      HM.project.ml.use = { distance: false, reflection: true, color: true, force: false, pitch: false, roll: false };
    } else {
      HM.project.ml.use = { distance: true, reflection: true, color: false, force: false, pitch: false, roll: false };
    }
    const photos = HM.project.ml.samples.filter((sample) => sample.kind === "image");
    HM.project.ml.samples = photos.concat(HM.demoSamples(kind));
    HM.project.ml.score = HM.looScore(HM.project.ml.samples, HM.project.ml.k, HM.project.ml.use);
    HM.pushHistory(backup);
    refresh();
    HM.toast(kind === "color" ? "Color demo samples loaded." : "Distance demo samples loaded.");
  }

  function exportProject() {
    saveNow();
    const blob = new Blob([JSON.stringify({ kind: "hagen-mindstorm", version: 1, project: HM.project }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = (HM.project.name || "project").replace(/\s+/g, "-").toLowerCase() + ".json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function importProject(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const project = data.project || data;
        if (!project.stacks || !project.ml) throw new Error("This file is not a Hagen Mindstorm project.");
        HM.project = project;
        bootRobot(project.robot);
        HM.cursor = null;
        HM.selectedId = null;
        undoStack = [];
        redoStack = [];
        refresh();
        HM.toast("Project imported.");
      } catch (err) {
        HM.toast(err.message || "Could not read that file.");
      }
    };
    reader.readAsText(file);
  }

  async function newProject() {
    const ok = await ask("New project", "Start a fresh driving-base program? The current project stays in this browser until you export it, but the canvas will be replaced.");
    if (!ok) return;
    HM.project = blankProject();
    bootRobot(HM.project.robot);
    undoStack = [];
    redoStack = [];
    HM.cursor = null;
    refresh();
  }

  function matrixCells() {
    const host = document.getElementById("matrix");
    for (let i = 0; i < 25; i++) {
      const cell = document.createElement("i");
      host.appendChild(cell);
    }
  }

  function bind() {
    document.querySelectorAll(".views button").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });
    document.getElementById("run").addEventListener("click", () => {
      HM.sound.unlock();
      if (HM.vision) HM.vision.arm();
      if (HM.hub && HM.hub.connected) HM.hub.runCurrent();
      else HM.runProgram();
    });
    document.getElementById("stop").addEventListener("click", () => {
      if (HM.hub && HM.hub.connected) HM.hub.stopProgram();
      HM.stopProgram();
    });
    document.getElementById("undo").addEventListener("click", () => HM.undo());
    document.getElementById("redo").addEventListener("click", () => HM.redo());
    document.getElementById("open-course").addEventListener("click", () => {
      renderLessons();
      document.getElementById("course-dialog").showModal();
    });
    document.getElementById("open-lab").addEventListener("click", () => HM.openLab());
    document.getElementById("lab-close").addEventListener("click", () => {
      document.getElementById("lab").hidden = true;
      if (HM.vision) HM.vision.park(false);
    });
    document.getElementById("mode-sensors").addEventListener("click", () => setLabMode("sensors"));
    document.getElementById("mode-images").addEventListener("click", () => setLabMode("images"));
    document.getElementById("open-about").addEventListener("click", () => document.getElementById("about-dialog").showModal());
    document.getElementById("about-close").addEventListener("click", () => document.getElementById("about-dialog").close());
    document.getElementById("coach-dismiss").addEventListener("click", () => {
      document.getElementById("coach").hidden = true;
      try { localStorage.setItem("hagen-mindstorm-coach", "1"); } catch (err) { /* ignore */ }
    });
    document.getElementById("modal-ok").addEventListener("click", () => closeModal(true));
    document.getElementById("modal-cancel").addEventListener("click", () => closeModal(false));
    document.getElementById("project-name").addEventListener("change", (event) => {
      HM.noteHistory();
      HM.project.name = event.target.value.trim().slice(0, 40) || "Untitled";
      flushField();
      saveSoon();
    });
    document.getElementById("arena").addEventListener("change", (event) => {
      const backup = serialize();
      const base = HM.preset(event.target.value);
      HM.project.arena = event.target.value;
      HM.project.obstacles = HM.clone(base.obstacles);
      bootRobot(base.robot);
      HM.pushHistory(backup);
      refresh();
    });
    document.getElementById("reset-pose").addEventListener("click", () => {
      const base = HM.preset(HM.project.arena || "mats");
      bootRobot(base.robot);
      document.getElementById("pitch").value = 0;
      document.getElementById("roll").value = 0;
      saveSoon();
    });
    const hub = document.getElementById("hub-button");
    hub.addEventListener("pointerdown", (event) => {
      HM.robot.button = true;
      hub.setPointerCapture(event.pointerId);
    });
    hub.addEventListener("pointerup", () => { HM.robot.button = false; });
    hub.addEventListener("pointercancel", () => { HM.robot.button = false; });
    const force = document.getElementById("force-button");
    force.addEventListener("pointerdown", (event) => {
      HM.robot.forceHeld = true;
      force.setPointerCapture(event.pointerId);
    });
    force.addEventListener("pointerup", () => { HM.robot.forceHeld = false; });
    force.addEventListener("pointercancel", () => { HM.robot.forceHeld = false; });
    document.getElementById("pitch").addEventListener("input", (event) => { HM.robot.pitch = Number(event.target.value); });
    document.getElementById("roll").addEventListener("input", (event) => { HM.robot.roll = Number(event.target.value); });
    document.getElementById("copy-code").addEventListener("click", async () => {
      const text = document.getElementById("python").innerText;
      try {
        await navigator.clipboard.writeText(text);
        HM.toast("Python copied.");
      } catch (err) {
        HM.toast("Select the Python and copy it manually.");
      }
    });
    document.getElementById("export-project").addEventListener("click", exportProject);
    document.getElementById("import-project").addEventListener("click", () => document.getElementById("import-file").click());
    document.getElementById("import-file").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) importProject(file);
      event.target.value = "";
    });
    document.getElementById("new-project").addEventListener("click", newProject);
    document.getElementById("capture").addEventListener("click", captureSample);
    document.getElementById("train").addEventListener("click", train);
    document.getElementById("demo-distance").addEventListener("click", () => loadDemo("distance"));
    document.getElementById("demo-color").addEventListener("click", () => loadDemo("color"));
    document.getElementById("clear-samples").addEventListener("click", async () => {
      const images = HM.project.ml.mode === "images";
      const has = (HM.project.ml.samples || []).some((sample) => images ? sample.kind === "image" : sample.kind !== "image");
      if (!has) return;
      const ok = await ask(images ? "Clear photos" : "Clear samples", images ? "Remove every training photo?" : "Remove every sensor sample?");
      if (!ok) return;
      const backup = serialize();
      HM.project.ml.samples = HM.project.ml.samples.filter((sample) => images ? sample.kind !== "image" : sample.kind === "image");
      HM.project.ml.score = null;
      HM.pushHistory(backup);
      refresh();
    });
    document.getElementById("k-slider").addEventListener("input", (event) => {
      HM.project.ml.k = Number(event.target.value);
      document.getElementById("k-label").textContent = HM.project.ml.k;
      HM.project.ml.score = null;
      saveSoon();
    });
    document.addEventListener("focusout", (event) => {
      if (event.target.closest && event.target.closest(".block input, .block select, #project-name")) flushField();
    });
    window.addEventListener("keydown", (event) => {
      const typing = event.target.closest && event.target.closest("input, textarea, select");
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) HM.redo();
        else HM.undo();
        return;
      }
      if (meta && event.key === "Enter") {
        event.preventDefault();
        if (HM.running) HM.stopProgram();
        else {
          HM.sound.unlock();
          if (HM.vision) HM.vision.arm();
          if (HM.hub && HM.hub.connected) HM.hub.runCurrent();
          else HM.runProgram();
        }
        return;
      }
      if (typing) return;
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        HM.editor.deleteSelected();
      }
      if (event.key === "Escape") {
        if (HM.hub && HM.hub.connected && (HM.hub.programRunning || HM.hub.sending)) HM.hub.stopProgram();
        if (HM.running) HM.stopProgram();
      }
    });
    setInterval(() => {
      const cells = document.querySelectorAll("#matrix i");
      if (!HM.matrix) return;
      cells.forEach((cell, index) => {
        cell.style.opacity = String(0.15 + (HM.matrix[index] || 0) / 130);
      });
    }, 80);
  }

  function init() {
    matrixCells();
    const stored = loadStore();
    HM.project = stored || blankProject();
    if (!HM.project.ml.use) HM.project.ml.use = HM.defaultUse();
    if (!HM.project.ml.mode) HM.project.ml.mode = "sensors";
    if (!HM.project.variables) HM.project.variables = ["count"];
    if (!HM.project.obstacles) HM.project.obstacles = HM.clone(HM.preset(HM.project.arena || "mats").obstacles);
    HM.drive = HM.createDrive();
    bootRobot(HM.project.robot);
    HM.matrix = Array(25).fill(0);
    HM.logs = [];
    try {
      if (localStorage.getItem("hagen-mindstorm-coach") === "1") document.getElementById("coach").hidden = true;
    } catch (err) { /* ignore */ }
    bind();
    HM.editor.mount();
    HM.sim.mount();
    if (HM.vision) HM.vision.mount();
    if (HM.hub) HM.hub.mount();
    refreshCode();
    updateChrome();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

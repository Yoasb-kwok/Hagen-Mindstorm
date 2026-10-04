(function (root, factory) {
  const api = factory(root);
  root.HM = Object.assign(root.HM || {}, api);
  if (typeof module === "object" && module != null && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const HM = root.HM;

  function StopStack() {}
  StopStack.prototype = Object.create(Error.prototype);

  function sleep(ms, token) {
    return new Promise((resolve) => {
      if (!token || token.stopped) {
        resolve();
        return;
      }
      let cancel;
      const timer = setTimeout(() => {
        if (token.cancels) token.cancels = token.cancels.filter((fn) => fn !== cancel);
        resolve();
      }, ms);
      cancel = () => {
        clearTimeout(timer);
        resolve();
      };
      token.cancels.push(cancel);
    });
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function truthy(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") return value !== "" && value !== "0";
    return !!value;
  }

  function slot(block, name, token) {
    if (block.inputs[name]) return evalBlock(block.inputs[name], token);
    return block.fields[name];
  }

  function sensors() {
    return HM.sensors || {
      distance: null,
      distanceFeature: 200,
      reflection: 0,
      color: "white",
      colorId: 8,
      force: 0,
      pressed: false,
      pitch: 0,
      roll: 0,
      button: false,
      timer: 0,
    };
  }

  function senseNow() {
    const virtual = sensors();
    const ports = HM.sensePorts || HM.defaultSense();
    const hub = HM.hub;
    if (!hub || !hub.connected || !hub.ports) return virtual;
    const distance = hub.ports[ports.distance];
    const color = hub.ports[ports.color];
    const press = hub.ports[ports.press];
    const live = Object.assign({}, virtual);
    if (distance && distance.kind === "distance") {
      live.distance = distance.distance;
      live.distanceFeature = distance.distance == null ? 200 : distance.distance;
    } else {
      live.distance = null;
      live.distanceFeature = 200;
    }
    if (color && color.kind === "color") {
      live.color = color.color;
      live.colorId = color.colorId;
      live.reflection = color.reflection;
      live.fill = color.fill;
    } else {
      live.color = "none";
      live.colorId = 0;
      live.reflection = 0;
      live.fill = "#888888";
    }
    if (press && press.kind === "force") {
      live.force = press.force;
      live.pressed = !!press.pressed;
    } else {
      live.force = 0;
      live.pressed = false;
    }
    return live;
  }

  function evalBlock(block, token) {
    if (!block) return false;
    const sense = senseNow();
    const f = block.fields;
    switch (block.opcode) {
      case "motor_angle":
      case "motor_pos":
        return HM.drive.motors[f.port] ? Math.round(HM.drive.motors[f.port].angle) : 0;
      case "motor_speed_get":
        return HM.drive.motors[f.port] ? Math.round((HM.drive.motors[f.port].dps / HM.MAX_DPS) * 100) : 0;
      case "rep_distance":
        return sense.distance == null ? 200 : Math.round(sense.distance);
      case "rep_color":
        return sense.color;
      case "rep_reflection":
        return Math.round(sense.reflection);
      case "rep_force":
        return Math.round(sense.force);
      case "rep_pitch":
        return Math.round(sense.pitch);
      case "rep_roll":
        return Math.round(sense.roll);
      case "rep_timer":
        return Math.round(sense.timer * 10) / 10;
      case "bool_pressed":
      case "event_press":
        return sense.pressed;
      case "bool_button":
        return sense.button;
      case "bool_distance":
      case "event_distance":
        return compareDistance(sense.distance, f.op, num(slot(block, "VALUE", token)));
      case "bool_color":
      case "event_color":
        return sense.color === f.color;
      case "bool_reflection":
      case "event_reflection":
        return compareNumber(sense.reflection, f.op, num(slot(block, "VALUE", token)));
      case "bool_predict": {
        const prediction = HM.lastPrediction;
        return !!(prediction && prediction.ready && prediction.classId === f.classId);
      }
      case "op_add":
        return num(slot(block, "A", token)) + num(slot(block, "B", token));
      case "op_sub":
        return num(slot(block, "A", token)) - num(slot(block, "B", token));
      case "op_mul":
        return num(slot(block, "A", token)) * num(slot(block, "B", token));
      case "op_div": {
        const right = num(slot(block, "B", token));
        if (right === 0) {
          HM.log("Cannot divide by zero");
          return 0;
        }
        return num(slot(block, "A", token)) / right;
      }
      case "op_random": {
        const low = Math.round(num(slot(block, "A", token)));
        const high = Math.round(num(slot(block, "B", token)));
        const a = Math.min(low, high);
        const b = Math.max(low, high);
        return a + Math.floor(Math.random() * (b - a + 1));
      }
      case "op_round":
        return Math.round(num(slot(block, "A", token)));
      case "op_compare":
        return compareNumber(num(slot(block, "A", token)), f.op, num(slot(block, "B", token)));
      case "op_and":
        return truthy(evalBlock(block.inputs.A, token)) && truthy(evalBlock(block.inputs.B, token));
      case "op_or":
        return truthy(evalBlock(block.inputs.A, token)) || truthy(evalBlock(block.inputs.B, token));
      case "op_not":
        return !truthy(evalBlock(block.inputs.A, token));
      case "var_get":
        return HM.vars[f.name] != null ? HM.vars[f.name] : 0;
      case "ml_predict":
        return predictionName();
      case "ml_confidence":
        return HM.lastPrediction && HM.lastPrediction.ready ? Math.round(HM.lastPrediction.confidence * 100) : 0;
      default:
        return false;
    }
  }

  async function runWhen(stack, token, matches) {
    const first = stack.blocks[0];
    while (!token.stopped) {
      await sleep(40, token);
      if (token.stopped) return;
      if (!matches()) continue;
      if (HM.editor) HM.editor.visit(first.id);
      await runSequence(stack.blocks.slice(1), token);
      while (!token.stopped && matches()) await sleep(40, token);
    }
  }

  function predictionMatches(classId) {
    const prediction = HM.lastPrediction;
    return !!(prediction && prediction.ready && prediction.classId === classId);
  }

  function predictionName() {
    const prediction = HM.lastPrediction;
    if (!prediction || !prediction.ready) return "";
    const found = (HM.project.ml.classes || []).find((item) => item.id === prediction.classId);
    return found ? found.name : "";
  }

  function compareNumber(left, op, right) {
    if (op === ">") return left > right;
    if (op === "=") return Math.abs(left - right) < 0.05;
    return left < right;
  }

  function motionState() {
    if (!HM.motion) HM.motion = HM.defaultMotion();
    return HM.motion;
  }

  function clampPercent(value) {
    return Math.max(-100, Math.min(100, num(value)));
  }

  function portSpeed(port) {
    const speed = motionState().speed[port];
    return clampPercent(speed == null ? 75 : speed);
  }

  function signedPercent(percent, flip) {
    return flip ? -percent : percent;
  }

  function pairPorts() {
    const motion = motionState();
    const left = motion.left || "A";
    const right = motion.right || "B";
    if (HM.drive && HM.drive.pair) {
      HM.drive.pair.left = left;
      HM.drive.pair.right = right;
    }
    return { left, right };
  }

  async function runTimed(port, dps, seconds, token) {
    if (!dps) return;
    await HM.drive.command(port, dps, null);
    await sleep(Math.max(0, seconds) * 1000, token);
    HM.drive.stop(port);
  }

  async function runPairTimed(left, right, dpsLeft, dpsRight, seconds, token) {
    await HM.drive.command(left, dpsLeft, null);
    if (right !== left) await HM.drive.command(right, dpsRight, null);
    await sleep(Math.max(0, seconds) * 1000, token);
    HM.drive.stop(left);
    if (right !== left) HM.drive.stop(right);
  }

  async function runPairDegrees(left, right, dps, sign, degrees, steering) {
    if (!dps || !degrees) return;
    const gains = HM.steerGains(steering);
    const jobs = [];
    function queue(port, gain) {
      const target = gain * sign * degrees;
      if (!target) return;
      jobs.push(HM.drive.command(port, Math.sign(target) * dps, target));
    }
    queue(left, gains.left);
    if (right !== left) queue(right, gains.right);
    if (jobs.length) await Promise.all(jobs);
  }

  function compareDistance(distance, op, right) {
    if (distance == null) return op === ">";
    return compareNumber(distance, op, right);
  }

  async function runSequence(blocks, token) {
    for (let i = 0; i < blocks.length; i++) {
      if (token.stopped) return;
      token.steps += 1;
      if (token.steps > 8000) throw new Error("This loop needs a wait so the hub can read sensors.");
      HM.editor.visit(blocks[i].id);
      await runOne(blocks[i], token);
    }
  }

  async function runOne(block, token) {
    const f = block.fields;
    switch (block.opcode) {
      case "event_start":
      case "event_button":
        return;
      case "sense_set":
        HM.sensePorts = {
          distance: f.distance || "D",
          color: f.color || "C",
          press: f.press || "E",
        };
        return;
      case "motor_degrees":
      case "move_cm":
      case "move_rot":
      case "turn_deg":
        await motion(block, token);
        return;
      case "motor_start": {
        const speed = HM.dpsFromPercent(slot(block, "speed", token));
        await HM.drive.command(f.port, speed, null);
        return;
      }
      case "motor_set_speed":
        motionState().speed[f.port] = clampPercent(slot(block, "speed", token));
        return;
      case "motor_run":
        await runMotor(block, token);
        return;
      case "motor_goto":
        await goToPosition(block, token);
        return;
      case "motor_spin": {
        const percent = signedPercent(portSpeed(f.port), f.direction === "ccw");
        await HM.drive.command(f.port, HM.dpsFromPercent(percent), null);
        return;
      }
      case "motor_stop":
        HM.drive.stop(f.port);
        return;
      case "move_set_motors":
        motionState().left = f.left || "A";
        motionState().right = f.right || "B";
        pairPorts();
        return;
      case "move_set_speed":
        motionState().moveSpeed = clampPercent(slot(block, "speed", token));
        return;
      case "move_set_rotation":
        motionState().cmPerRotation = Math.max(0.1, Math.abs(num(slot(block, "cm", token))) || HM.CM_PER_ROTATION);
        return;
      case "move_for":
      case "move_steer":
        await runMove(block, token);
        return;
      case "move_go": {
        const percent = signedPercent(clampPercent(motionState().moveSpeed), f.direction === "back");
        const dps = HM.dpsFromPercent(percent);
        const pair = pairPorts();
        await HM.drive.command(pair.left, dps, null);
        if (pair.right !== pair.left) await HM.drive.command(pair.right, dps, null);
        return;
      }
      case "move_steer_go": {
        const percent = clampPercent(motionState().moveSpeed);
        const dps = Math.abs(HM.dpsFromPercent(percent));
        const sign = Math.sign(HM.dpsFromPercent(percent)) || 1;
        const gains = HM.steerGains(slot(block, "steering", token));
        const pair = pairPorts();
        await HM.drive.command(pair.left, gains.left * sign * dps, null);
        if (pair.right !== pair.left) await HM.drive.command(pair.right, gains.right * sign * dps, null);
        return;
      }
      case "move_stop": {
        const pair = pairPorts();
        HM.drive.stop(pair.left);
        HM.drive.stop(pair.right);
        return;
      }
      case "move_start": {
        const sign = (f.direction === "back" ? -1 : 1);
        const speed = HM.dpsFromPercent(slot(block, "speed", token)) * sign;
        await HM.drive.command("A", speed, null);
        await HM.drive.command("B", speed, null);
        return;
      }
      case "turn_start": {
        const mag = Math.abs(HM.dpsFromPercent(slot(block, "speed", token)));
        const dir = f.direction === "left" ? -1 : 1;
        const signed = Math.sign(HM.dpsFromPercent(slot(block, "speed", token))) || 1;
        await HM.drive.command("A", dir * mag * signed, null);
        await HM.drive.command("B", -dir * mag * signed, null);
        return;
      }
      case "light_color":
        HM.hubColor = HM.hubColors[f.color] || "#2f6f62";
        return;
      case "matrix_image":
        HM.matrixApi.showImage(f.image);
        return;
      case "matrix_pixel":
        HM.matrixApi.setPixel(Number(f.col), Number(f.row), num(slot(block, "brightness", token)));
        return;
      case "matrix_clear":
        HM.matrixApi.clearMatrix();
        return;
      case "matrix_write":
        await HM.matrixApi.scrollText(slot(block, "TEXT", token), token);
        return;
      case "sound_beep":
        await HM.sound.beep(num(slot(block, "freq", token)), Math.max(0.05, num(slot(block, "seconds", token))));
        return;
      case "sound_stop":
        HM.sound.stop();
        return;
      case "ctrl_wait":
        await sleep(Math.max(0, num(slot(block, "seconds", token))) * 1000, token);
        return;
      case "ctrl_wait_until":
        while (!token.stopped && !truthy(evalBlock(block.inputs.COND, token))) await sleep(40, token);
        return;
      case "ctrl_repeat": {
        const times = Math.max(0, Math.min(10000, Math.floor(num(slot(block, "times", token)))));
        for (let i = 0; i < times; i++) {
          if (token.stopped) return;
          token.steps = 0;
          await runSequence(block.branches.DO, token);
        }
        return;
      }
      case "ctrl_forever":
        while (!token.stopped) {
          token.steps = 0;
          await runSequence(block.branches.DO, token);
          await sleep(16, token);
        }
        return;
      case "ctrl_repeat_until":
        while (!token.stopped && !truthy(evalBlock(block.inputs.COND, token))) {
          token.steps = 0;
          await runSequence(block.branches.DO, token);
          await sleep(16, token);
        }
        return;
      case "ctrl_if":
        if (truthy(evalBlock(block.inputs.COND, token))) await runSequence(block.branches.DO, token);
        return;
      case "ctrl_if_else":
        if (truthy(evalBlock(block.inputs.COND, token))) await runSequence(block.branches.DO, token);
        else await runSequence(block.branches.ELSE, token);
        return;
      case "ctrl_stop":
        if (f.mode === "all") {
          token.stopped = true;
          token.cancels.splice(0).forEach((fn) => fn());
          HM.drive.stopAll();
          return;
        }
        throw new StopStack();
      case "var_set":
        HM.vars[f.name] = slot(block, "VALUE", token);
        return;
      case "var_change":
        HM.vars[f.name] = num(HM.vars[f.name]) + num(slot(block, "VALUE", token));
        return;
      case "show_value":
        HM.log(String(slot(block, "VALUE", token)));
        return;
      default:
        return;
    }
  }

  async function runMotor(block, token) {
    const f = block.fields;
    const percent = signedPercent(portSpeed(f.port), f.direction === "ccw");
    const dps = Math.abs(HM.dpsFromPercent(percent));
    const sign = Math.sign(HM.dpsFromPercent(percent)) || 1;
    const amount = num(slot(block, "amount", token));
    if (f.unit === "seconds") {
      await runTimed(f.port, sign * dps, Math.abs(amount), token);
      return;
    }
    const raw = f.unit === "degrees" ? amount : amount * 360;
    const degrees = Math.abs(raw) * sign * (Math.sign(raw) || 1);
    if (!degrees || !dps) return;
    await HM.drive.command(f.port, Math.sign(degrees) * dps, degrees);
  }

  function wrap180(deg) {
    const wrapped = ((deg % 360) + 360) % 360;
    return wrapped > 180 ? wrapped - 360 : wrapped;
  }

  async function goToPosition(block, token) {
    const f = block.fields;
    const motor = HM.drive.motors[f.port];
    if (!motor) return;
    const target = wrap180(num(slot(block, "position", token)));
    const current = wrap180(motor.angle);
    let delta = target - current;
    const wrapped = ((delta % 360) + 360) % 360;
    if (f.direction === "cw") delta = wrapped === 0 ? 0 : wrapped;
    else if (f.direction === "ccw") delta = wrapped === 0 ? 0 : wrapped - 360;
    else delta = wrapped === 0 ? 0 : wrapped > 180 ? wrapped - 360 : wrapped;
    const dps = Math.abs(HM.dpsFromPercent(portSpeed(f.port)));
    if (!delta || !dps) return;
    await HM.drive.command(f.port, Math.sign(delta) * dps, delta);
  }

  async function runMove(block, token) {
    const f = block.fields;
    const steering = block.opcode === "move_steer" ? num(slot(block, "steering", token)) : 0;
    const percent = signedPercent(clampPercent(motionState().moveSpeed), block.opcode !== "move_steer" && f.direction === "back");
    const dps = Math.abs(HM.dpsFromPercent(percent));
    const sign = Math.sign(HM.dpsFromPercent(percent)) || 1;
    const amount = num(slot(block, "amount", token));
    const pair = pairPorts();
    if (f.unit === "seconds") {
      const gains = HM.steerGains(steering);
      await runPairTimed(pair.left, pair.right, gains.left * sign * dps, gains.right * sign * dps, Math.abs(amount), token);
      return;
    }
    const raw = HM.degreesForMove(amount, f.unit, motionState().cmPerRotation);
    const degrees = Math.abs(raw);
    const travelSign = sign * (Math.sign(raw) || 1);
    if (!degrees || !dps) return;
    await runPairDegrees(pair.left, pair.right, dps, travelSign, degrees, steering);
  }

  async function motion(block, token) {
    const speed = num(slot(block, "speed", token));
    const dps = Math.abs(HM.dpsFromPercent(speed));
    const sign = Math.sign(HM.dpsFromPercent(speed)) || 1;
    if (!dps) return;
    if (block.opcode === "motor_degrees") {
      const mag = Math.abs(num(slot(block, "degrees", token)));
      const signed = Math.sign(num(slot(block, "degrees", token)) || 1) * sign * mag;
      if (!signed) return;
      await HM.drive.command(block.fields.port, Math.sign(signed) * dps, signed);
      return;
    }
    if (block.opcode === "turn_deg") {
      const dir = block.fields.direction === "left" ? -1 : 1;
      const wheel = HM.wheelsForTurn(num(slot(block, "degrees", token))) * dir * sign;
      if (!wheel) return;
      await Promise.all([
        HM.drive.command("A", Math.sign(wheel) * dps, wheel),
        HM.drive.command("B", Math.sign(-wheel) * dps, -wheel),
      ]);
      return;
    }
    let degrees = 0;
    if (block.opcode === "move_cm") {
      const cm = num(slot(block, "cm", token)) * (block.fields.direction === "back" ? -1 : 1) * sign;
      degrees = HM.wheelsForTravel(cm);
    } else {
      degrees = num(slot(block, "rotations", token)) * 360 * (block.fields.direction === "back" ? -1 : 1) * sign;
    }
    if (!degrees) return;
    await Promise.all([
      HM.drive.command("A", Math.sign(degrees) * dps, degrees),
      HM.drive.command("B", Math.sign(degrees) * dps, degrees),
    ]);
    void token;
  }

  async function runStack(stack, token) {
    const first = stack.blocks[0];
    if (!first) return;
    const shape = HM.CATALOG[first.opcode].shape;
    if (shape === "reporter" || shape === "boolean") return;
    try {
      if (first.opcode === "event_button") {
        await runWhen(stack, token, () => !!HM.robot.button);
        return;
      }
      if (first.opcode === "event_predict") {
        await runWhen(stack, token, () => predictionMatches(first.fields.classId));
        return;
      }
      if (first.opcode === "event_distance" || first.opcode === "event_color" || first.opcode === "event_reflection" || first.opcode === "event_press") {
        await runWhen(stack, token, () => !!evalBlock(first, token));
        return;
      }
      const body = first.opcode === "event_start" ? stack.blocks.slice(1) : stack.blocks;
      await runSequence(body, token);
    } catch (err) {
      if (err instanceof StopStack) return;
      throw err;
    }
  }

  function runnable() {
    return HM.project.stacks.filter((stack) => stack.blocks.length).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  }

  async function run() {
    if (HM.running) return;
    const token = { stopped: false, cancels: [], steps: 0 };
    HM.token = token;
    HM.running = true;
    HM.timerMark = performance.now();
    HM.timerShown = 0;
    HM.vars = {};
    (HM.project.variables || []).forEach((name) => { HM.vars[name] = 0; });
    const keepSense = HM.hub && HM.hub.connected && HM.sensePorts;
    const keepLeft = HM.hub && HM.hub.connected && HM.motion ? HM.motion.left : "";
    const keepRight = HM.hub && HM.hub.connected && HM.motion ? HM.motion.right : "";
    HM.motion = HM.defaultMotion();
    if (keepLeft) HM.motion.left = keepLeft;
    if (keepRight) HM.motion.right = keepRight;
    if (HM.drive.pair) {
      HM.drive.pair.left = HM.motion.left;
      HM.drive.pair.right = HM.motion.right;
    }
    HM.sensePorts = keepSense ? Object.assign(HM.defaultSense(), HM.sensePorts) : HM.defaultSense();
    HM.drive.stopAll();
    HM.drive.resetAngles();
    HM.matrixApi.clearMatrix();
    HM.hubColor = "#2f6f62";
    HM.clearConsole();
    HM.log("Program started");
    HM.setRunning(true);
    if (audioResume) audioResume();
    try {
      await Promise.all(runnable().map((stack) => runStack(stack, token)));
      if (!token.stopped) HM.log("Program finished");
      else HM.log("Program stopped");
    } catch (err) {
      token.stopped = true;
      HM.log("Error: " + (err && err.message ? err.message : "program failed"));
      HM.toast(err && err.message ? err.message : "The program hit a problem.");
    } finally {
      token.stopped = true;
      token.cancels.splice(0).forEach((fn) => fn());
      HM.drive.stopAll();
      HM.sound.stop();
      HM.timerShown = (performance.now() - HM.timerMark) / 1000;
      HM.running = false;
      HM.token = null;
      HM.editor.visit(null);
      HM.setRunning(false);
    }
  }

  function stop() {
    const token = HM.token;
    if (!token) return;
    token.stopped = true;
    token.cancels.splice(0).forEach((fn) => fn());
    HM.drive.stopAll();
    HM.sound.stop();
  }

  let audioResume = null;
  function primeAudio() {
    const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return;
    if (!audioResume) {
      const ctx = new Ctx();
      audioResume = () => { if (ctx.state === "suspended") ctx.resume(); };
    }
    audioResume();
  }

  return { sleep, runProgram: run, stopProgram: stop, primeAudio };
});

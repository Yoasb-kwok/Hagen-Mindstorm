(function (root, factory) {
  const api = factory(root);
  root.HM = Object.assign(root.HM || {}, api);
  if (typeof module === "object" && module != null && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const HM = root.HM;
  const BOOL_OPS = {
    bool_pressed: true,
    bool_button: true,
    bool_distance: true,
    bool_color: true,
    bool_reflection: true,
    bool_predict: true,
    op_compare: true,
    op_and: true,
    op_or: true,
    op_not: true,
  };

  function pad(level) {
    return "    ".repeat(level);
  }

  function pyString(value) {
    return JSON.stringify(String(value));
  }

  function literal(value) {
    if (typeof value === "number") return HM.roundNum(value);
    if (typeof value === "boolean") return value ? "True" : "False";
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return HM.roundNum(Number(value));
    }
    return pyString(value == null ? "" : value);
  }

  function slotNumber(block, name) {
    return !block.inputs[name] && Number.isFinite(Number(block.fields[name]));
  }

  function exprSlot(block, name) {
    if (block.inputs[name]) return exprValue(block.inputs[name]);
    return literal(block.fields[name]);
  }

  function colorConst(name) {
    if (name === "violet") return "color.MAGENTA";
    return "color." + String(name || "WHITE").toUpperCase();
  }

  function usesLearn(project) {
    return usesOpcode(project, ["ml_predict", "ml_confidence", "bool_predict", "event_predict"]);
  }

  function learnRows(project) {
    if (!project.ml || project.ml.mode === "images") return [];
    return (project.ml.samples || []).filter((sample) => sample && sample.features && !Array.isArray(sample.features)).slice(0, 80);
  }

  function learnSensorKeys(project) {
    if (!usesLearn(project)) return [];
    if (!learnRows(project).length) return [];
    return HM.activeKeys(project.ml.use || {});
  }

  function emitLearner(project, lines, options) {
    if (!usesLearn(project)) return;
    const keys = learnSensorKeys(project);
    const samples = learnRows(project);
    if (project.ml && project.ml.mode === "images") {
      const photoText = options && options.photoText ? String(options.photoText) : "";
      lines.push("# The camera fills this class while Run is pressed.");
      lines.push("_photo_text = " + pyString(photoText));
      lines.push("class Learner:");
      lines.push("    def predict(self):");
      lines.push("        return _photo_text");
      lines.push("    def confidence(self):");
      lines.push("        return 100 if _photo_text else 0");
      lines.push("learner = Learner()");
      lines.push("");
      return;
    }
    if (!keys.length || !samples.length) {
      lines.push("class Learner:");
      lines.push("    def predict(self):");
      lines.push("        return \"\"");
      lines.push("    def confidence(self):");
      lines.push("        return 0");
      lines.push("learner = Learner()");
      lines.push("print(\"Train sensor samples in the Learn lab, then run again.\")");
      lines.push("");
      return;
    }
    lines.push("_learn_k = " + Math.max(1, Number(project.ml.k) || 1));
    lines.push("_learn_keys = (" + keys.map((key) => pyString(key)).join(", ") + (keys.length === 1 ? "," : "") + ")");
    lines.push("_learn_max = {" + keys.map((key) => {
      const feature = HM.FEATURES.find((item) => item.key === key);
      return pyString(key) + ": " + (feature ? feature.max : 1);
    }).join(", ") + "}");
    lines.push("_learn_samples = [");
    samples.forEach((sample) => {
      const fields = keys.map((key) => pyString(key) + ": " + (Number(sample.features[key]) || 0)).join(", ");
      lines.push("    (" + pyString(className(project, sample.classId)) + ", {" + fields + "}),");
    });
    lines.push("]");
    lines.push("def _learn_reading():");
    lines.push("    reading = {}");
    if (keys.indexOf("distance") !== -1) lines.push("    reading[\"distance\"] = distance_cm()");
    if (keys.indexOf("reflection") !== -1) lines.push("    reading[\"reflection\"] = color_sensor.reflection(_color_port)");
    if (keys.indexOf("color") !== -1) lines.push("    reading[\"color\"] = _learn_color()");
    if (keys.indexOf("force") !== -1) lines.push("    reading[\"force\"] = force_sensor.force(_press_port) / 10");
    if (keys.indexOf("pitch") !== -1) lines.push("    reading[\"pitch\"] = motion_sensor.tilt_angles()[1] / 10");
    if (keys.indexOf("roll") !== -1) lines.push("    reading[\"roll\"] = motion_sensor.tilt_angles()[2] / 10");
    lines.push("    return reading");
    if (keys.indexOf("color") !== -1) {
      lines.push("def _learn_color():");
      lines.push("    seen = color_sensor.color(_color_port)");
      lines.push("    if seen is color.BLACK: return 1");
      lines.push("    if seen is color.MAGENTA: return 2");
      lines.push("    if seen is color.BLUE: return 3");
      lines.push("    if seen is color.AZURE: return 4");
      lines.push("    if seen is color.GREEN: return 5");
      lines.push("    if seen is color.YELLOW: return 6");
      lines.push("    if seen is color.RED: return 7");
      lines.push("    if seen is color.WHITE: return 8");
      lines.push("    return 0");
    }
    lines.push("def _learn_vote():");
    lines.push("    reading = _learn_reading()");
    lines.push("    ranked = []");
    lines.push("    for name, features in _learn_samples:");
    lines.push("        total = 0");
    lines.push("        for key in _learn_keys:");
    lines.push("            delta = (reading[key] - features[key]) / _learn_max[key]");
    lines.push("            total += delta * delta");
    lines.push("        ranked.append((total, name))");
    lines.push("    ranked.sort()");
    lines.push("    take = _learn_k if _learn_k < len(ranked) else len(ranked)");
    lines.push("    picks = ranked[:take]");
    lines.push("    tally = {}");
    lines.push("    for _dist, name in picks:");
    lines.push("        tally[name] = tally.get(name, 0) + 1");
    lines.push("    best = picks[0][1]");
    lines.push("    best_n = tally[best]");
    lines.push("    for name in tally:");
    lines.push("        if tally[name] > best_n:");
    lines.push("            best = name");
    lines.push("            best_n = tally[name]");
    lines.push("    return (best, int(best_n * 100 / take))");
    lines.push("class Learner:");
    lines.push("    def predict(self):");
    lines.push("        return _learn_vote()[0]");
    lines.push("    def confidence(self):");
    lines.push("        return _learn_vote()[1]");
    lines.push("learner = Learner()");
    lines.push("");
  }

  function sensorHatName(block) {
    if (!block) return "when_sensor";
    if (block.opcode === "event_color") return "when_color_" + HM.pythonIdent(block.fields.color || "color");
    if (block.opcode === "event_reflection") return "when_reflected_light";
    if (block.opcode === "event_press") return "when_press";
    return "when_distance";
  }

  function className(project, id) {
    const found = (project.ml.classes || []).find((item) => item.id === id);
    return found ? found.name : String(id || "unknown");
  }

  function compareOp(op) {
    if (op === ">") return ">";
    if (op === "=") return "==";
    return "<";
  }

  function port(name) {
    return "port." + String(name || "A").toUpperCase();
  }

  function imageConst(name) {
    const map = {
      happy: "IMAGE_HAPPY",
      smile: "IMAGE_SMILE",
      sad: "IMAGE_SAD",
      heart: "IMAGE_HEART",
      yes: "IMAGE_YES",
      no: "IMAGE_NO",
      arrow_n: "IMAGE_ARROW_N",
      arrow_e: "IMAGE_ARROW_E",
      square: "IMAGE_SQUARE",
    };
    return map[name] || "IMAGE_HAPPY";
  }

  function exprValue(block) {
    if (!block) return "0";
    if (BOOL_OPS[block.opcode]) return exprBool(block);
    const f = block.fields;
    switch (block.opcode) {
      case "motor_angle":
        return "motor.relative_position(" + port(f.port) + ")";
      case "motor_pos":
        return "motor.absolute_position(" + port(f.port) + ")";
      case "motor_speed_get":
        return "int(motor.velocity(" + port(f.port) + ") / 720 * 100)";
      case "rep_distance":
        return "distance_cm()";
      case "rep_color":
        return "color_sensor.color(_color_port)";
      case "rep_reflection":
        return "color_sensor.reflection(_color_port)";
      case "rep_force":
        return "force_sensor.force(_press_port)";
      case "rep_pitch":
        return "motion_sensor.tilt_angles()[1] / 10";
      case "rep_roll":
        return "motion_sensor.tilt_angles()[2] / 10";
      case "rep_timer":
        return "timer_s()";
      case "op_add":
        return "(" + exprSlot(block, "A") + " + " + exprSlot(block, "B") + ")";
      case "op_sub":
        return "(" + exprSlot(block, "A") + " - " + exprSlot(block, "B") + ")";
      case "op_mul":
        return "(" + exprSlot(block, "A") + " * " + exprSlot(block, "B") + ")";
      case "op_div":
        return "(" + exprSlot(block, "A") + " / " + exprSlot(block, "B") + ")";
      case "op_random":
        return "random.randint(int(" + exprSlot(block, "A") + "), int(" + exprSlot(block, "B") + "))";
      case "op_round":
        return "round(" + exprSlot(block, "A") + ")";
      case "var_get":
        return HM.pythonIdent(f.name);
      case "ml_predict":
        return "learner.predict()";
      case "ml_confidence":
        return "learner.confidence()";
      default:
        return "0";
    }
  }

  function exprBool(block) {
    if (!block) return "False";
    const f = block.fields;
    switch (block.opcode) {
      case "bool_pressed":
      case "event_press":
        return "force_sensor.pressed(_press_port)";
      case "bool_button":
        return "button.pressed(button.LEFT) > 0";
      case "bool_distance":
      case "event_distance":
        return "distance_cm() " + compareOp(f.op) + " " + exprSlot(block, "VALUE");
      case "bool_color":
      case "event_color":
        return "color_sensor.color(_color_port) is " + colorConst(f.color);
      case "bool_reflection":
      case "event_reflection":
        return "color_sensor.reflection(_color_port) " + compareOp(f.op) + " " + exprSlot(block, "VALUE");
      case "bool_predict":
        return "learner.predict() == " + pyString(className(HM._codegenProject, f.classId));
      case "op_compare":
        return exprSlot(block, "A") + " " + compareOp(f.op) + " " + exprSlot(block, "B");
      case "op_and":
        return "(" + exprBool(block.inputs.A) + " and " + exprBool(block.inputs.B) + ")";
      case "op_or":
        return "(" + exprBool(block.inputs.A) + " or " + exprBool(block.inputs.B) + ")";
      case "op_not":
        return "(not " + exprBool(block.inputs.A) + ")";
      default:
        return "bool(" + exprValue(block) + ")";
    }
  }

  function speedKey(name) {
    return "_speed[" + pyString(name || "A") + "]";
  }

  function motorSign(name, direction) {
    const key = speedKey(name);
    if (direction === "ccw") return "(-1 if " + key + " >= 0 else 1)";
    return "(1 if " + key + " >= 0 else -1)";
  }

  function moveSign(direction) {
    if (direction === "back") return "(-1 if _move_speed >= 0 else 1)";
    return "(1 if _move_speed >= 0 else -1)";
  }

  function moveDegreesExpr(block) {
    const amount = "abs(" + exprSlot(block, "amount") + ")";
    const unit = block.fields.unit || "cm";
    if (unit === "degrees") return amount;
    if (unit === "rotations") return "(" + amount + " * 360)";
    if (unit === "in") return "(" + amount + " * 2.54 / _cm_per_rot * 360)";
    return "(" + amount + " / _cm_per_rot * 360)";
  }

  function emitSequence(blocks, level, ctx) {
    if (!blocks || !blocks.length) return pad(level) + "pass\n";
    return blocks.map((child) => emitBlock(child, level, ctx)).join("");
  }

  function emitBlock(block, level, ctx) {
    const p = pad(level);
    const f = block.fields;
    switch (block.opcode) {
      case "event_start":
      case "event_button":
      case "event_predict":
      case "event_distance":
      case "event_color":
      case "event_reflection":
      case "event_press":
        return "";
      case "sense_set":
        ctx.needs.add("sense_ports");
        return p + "_distance_port = " + port(f.distance) + "\n"
          + p + "_color_port = " + port(f.color) + "\n"
          + p + "_press_port = " + port(f.press) + "\n";
      case "motor_set_speed":
        ctx.needs.add("motor");
        ctx.needs.add("speed");
        return p + speedKey(f.port) + " = " + exprSlot(block, "speed") + "\n";
      case "motor_run": {
        ctx.needs.add("motor");
        ctx.needs.add("speed");
        const velocity = "abs(int(" + speedKey(f.port) + " / 100 * 720))";
        if (f.unit === "seconds") {
          const signed = "int(" + speedKey(f.port) + " / 100 * 720)" + (f.direction === "ccw" ? " * -1" : "");
          return p + "motor.run(" + port(f.port) + ", " + signed + ")\n"
            + p + "await runloop.sleep_ms(int(abs(" + exprSlot(block, "amount") + ") * 1000))\n"
            + p + "motor.stop(" + port(f.port) + ")\n";
        }
        const turns = "abs(" + exprSlot(block, "amount") + ")" + (f.unit === "degrees" ? "" : " * 360");
        const signedDegrees = "int(" + turns + " * " + motorSign(f.port, f.direction) + ")";
        return p + "await motor.run_for_degrees(" + port(f.port) + ", " + signedDegrees + ", " + velocity + ")\n";
      }
      case "motor_goto": {
        ctx.needs.add("motor");
        ctx.needs.add("speed");
        const toward = f.direction === "cw" ? "motor.CLOCKWISE" : f.direction === "ccw" ? "motor.COUNTERCLOCKWISE" : "motor.SHORTEST_PATH";
        const velocity = "abs(int(" + speedKey(f.port) + " / 100 * 720))";
        return p + "await motor.run_to_absolute_position(" + port(f.port) + ", int(" + exprSlot(block, "position") + "), " + velocity + ", direction=" + toward + ")\n";
      }
      case "motor_spin":
        ctx.needs.add("motor");
        ctx.needs.add("speed");
        return p + "motor.run(" + port(f.port) + ", int(" + speedKey(f.port) + " / 100 * 720)" + (f.direction === "ccw" ? " * -1" : "") + ")\n";
      case "motor_stop": {
        ctx.needs.add("motor");
        const mode = f.mode === "hold" ? "motor.HOLD" : f.mode === "coast" ? "motor.COAST" : "motor.BRAKE";
        return p + "motor.stop(" + port(f.port) + ", stop=" + mode + ")\n";
      }
      case "move_set_motors":
        ctx.needs.add("motor_pair");
        ctx.needs.add("move_state");
        return p + "motor_pair.pair(motor_pair.PAIR_1, " + port(f.left) + ", " + port(f.right) + ")\n";
      case "move_set_speed":
        ctx.needs.add("motor_pair");
        ctx.needs.add("move_state");
        return p + "_move_speed = " + exprSlot(block, "speed") + "\n";
      case "move_set_rotation":
        ctx.needs.add("motor_pair");
        ctx.needs.add("move_state");
        return p + "_cm_per_rot = " + exprSlot(block, "cm") + "\n";
      case "move_for":
      case "move_steer": {
        ctx.needs.add("motor_pair");
        ctx.needs.add("move_state");
        const steering = block.opcode === "move_steer" ? exprSlot(block, "steering") : "0";
        const direction = block.opcode === "move_steer" ? "forward" : f.direction;
        if ((f.unit || "cm") === "seconds") {
          const gains = direction === "back" ? " * -1" : "";
          return p + "motor_pair.move(motor_pair.PAIR_1, " + steering + ", velocity=int(_move_speed / 100 * 720)" + gains + ")\n"
            + p + "await runloop.sleep_ms(int(abs(" + exprSlot(block, "amount") + ") * 1000))\n"
            + p + "motor_pair.stop(motor_pair.PAIR_1)\n";
        }
        return p + "await motor_pair.move_for_degrees(motor_pair.PAIR_1, int(" + moveDegreesExpr(block) + ") * " + moveSign(direction) + ", " + steering + ", velocity=abs(int(_move_speed / 100 * 720)))\n";
      }
      case "move_go":
        ctx.needs.add("motor_pair");
        ctx.needs.add("move_state");
        return p + "motor_pair.move(motor_pair.PAIR_1, 0, velocity=int(_move_speed / 100 * 720)" + (f.direction === "back" ? " * -1" : "") + ")\n";
      case "move_steer_go":
        ctx.needs.add("motor_pair");
        ctx.needs.add("move_state");
        return p + "motor_pair.move(motor_pair.PAIR_1, " + exprSlot(block, "steering") + ", velocity=int(_move_speed / 100 * 720))\n";
      case "motor_degrees": {
        ctx.needs.add("motor");
        const vel = Math.round(Math.abs(HM.dpsFromPercent(slotNumber(block, "speed") ? f.speed : 50))) || 0;
        const sign = Math.sign(HM.dpsFromPercent(slotNumber(block, "speed") ? f.speed : 50)) || 1;
        if (slotNumber(block, "degrees")) {
          return p + "await motor.run_for_degrees(" + port(f.port) + ", " + Math.round(Number(f.degrees) * sign) + ", " + vel + ")\n";
        }
        return p + "await motor.run_for_degrees(" + port(f.port) + ", int(" + exprSlot(block, "degrees") + ") * " + sign + ", " + vel + ")\n";
      }
      case "motor_start":
        ctx.needs.add("motor");
        if (slotNumber(block, "speed")) {
          return p + "motor.run(" + port(f.port) + ", " + Math.round(HM.dpsFromPercent(f.speed)) + ")\n";
        }
        return p + "motor.run(" + port(f.port) + ", int((" + exprSlot(block, "speed") + ") / 100 * 720))\n";
      case "move_cm":
      case "move_rot": {
        ctx.needs.add("motor_pair");
        const back = f.direction === "back" ? -1 : 1;
        const speedSign = Math.sign(HM.dpsFromPercent(slotNumber(block, "speed") ? f.speed : 50)) || 1;
        const vel = Math.round(Math.abs(HM.dpsFromPercent(slotNumber(block, "speed") ? f.speed : 50)));
        let degreesExpr = "0";
        let note = "";
        if (block.opcode === "move_cm" && slotNumber(block, "cm")) {
          const cm = Number(f.cm) * back * speedSign;
          degreesExpr = String(Math.round(HM.wheelsForTravel(cm)));
          note = "  # " + Math.abs(Number(f.cm)) + " cm " + (cm < 0 ? "back" : "forward");
        } else if (block.opcode === "move_rot" && slotNumber(block, "rotations")) {
          degreesExpr = String(Math.round(Number(f.rotations) * 360 * back * speedSign));
          note = "  # " + Math.abs(Number(f.rotations)) + " rotation(s)";
        } else if (block.opcode === "move_cm") {
          ctx.helpers.add("cm");
          degreesExpr = "cm_to_degrees((" + exprSlot(block, "cm") + ") * " + back * speedSign + ")";
        } else {
          degreesExpr = "int((" + exprSlot(block, "rotations") + ") * 360 * " + back * speedSign + ")";
        }
        return p + "await motor_pair.move_for_degrees(motor_pair.PAIR_1, " + degreesExpr + ", 0, velocity=" + vel + ")" + note + "\n";
      }
      case "turn_deg": {
        ctx.needs.add("motor_pair");
        const speedSign = Math.sign(HM.dpsFromPercent(slotNumber(block, "speed") ? f.speed : 40)) || 1;
        const vel = Math.round(Math.abs(HM.dpsFromPercent(slotNumber(block, "speed") ? f.speed : 40)));
        const steering = (f.direction === "left" ? -100 : 100) * speedSign;
        let wheel = "0";
        let note = "";
        if (slotNumber(block, "degrees")) {
          wheel = String(Math.round(HM.wheelsForTurn(Number(f.degrees))));
          note = "  # turn " + f.direction + " " + f.degrees + "°";
        } else {
          wheel = "int((" + exprSlot(block, "degrees") + ") * " + HM.roundNum(HM.TRACK / (2 * HM.WHEEL_R)) + ")";
        }
        return p + "await motor_pair.move_for_degrees(motor_pair.PAIR_1, " + wheel + ", " + steering + ", velocity=" + vel + ")" + note + "\n";
      }
      case "move_start": {
        ctx.needs.add("motor_pair");
        const sign = f.direction === "back" ? -1 : 1;
        if (slotNumber(block, "speed")) {
          return p + "motor_pair.move(motor_pair.PAIR_1, 0, velocity=" + Math.round(HM.dpsFromPercent(f.speed) * sign) + ")\n";
        }
        return p + "motor_pair.move(motor_pair.PAIR_1, 0, velocity=int((" + exprSlot(block, "speed") + ") / 100 * 720 * " + sign + "))\n";
      }
      case "turn_start": {
        ctx.needs.add("motor_pair");
        const speedSign = Math.sign(HM.dpsFromPercent(slotNumber(block, "speed") ? f.speed : 40)) || 1;
        const vel = Math.round(Math.abs(HM.dpsFromPercent(slotNumber(block, "speed") ? f.speed : 40)));
        const steering = (f.direction === "left" ? -100 : 100) * speedSign;
        return p + "motor_pair.move(motor_pair.PAIR_1, " + steering + ", velocity=" + vel + ")\n";
      }
      case "move_stop":
        ctx.needs.add("motor_pair");
        return p + "motor_pair.stop(motor_pair.PAIR_1)\n";
      case "light_color":
        ctx.needs.add("light");
        ctx.needs.add("color");
        return p + "light.color(light.POWER, " + colorConst(f.color) + ")\n";
      case "matrix_image":
        ctx.needs.add("matrix");
        return p + "light_matrix.show_image(light_matrix." + imageConst(f.image) + ")\n";
      case "matrix_pixel":
        ctx.needs.add("matrix");
        return p + "light_matrix.set_pixel(" + Number(f.col) + ", " + Number(f.row) + ", int(" + exprSlot(block, "brightness") + "))\n";
      case "matrix_clear":
        ctx.needs.add("matrix");
        return p + "light_matrix.clear()\n";
      case "matrix_write":
        ctx.needs.add("matrix");
        if (block.inputs.TEXT) return p + "light_matrix.write(str(" + exprSlot(block, "TEXT") + "))\n";
        return p + "light_matrix.write(" + pyString(f.TEXT == null ? "" : f.TEXT) + ")\n";
      case "sound_beep":
        ctx.needs.add("sound");
        return p + "await hub.sound.beep(int(" + exprSlot(block, "freq") + "), int((" + exprSlot(block, "seconds") + ") * 1000))\n";
      case "sound_stop":
        ctx.needs.add("sound");
        return p + "hub.sound.stop()\n";
      case "ctrl_wait":
        return p + "await runloop.sleep_ms(int((" + exprSlot(block, "seconds") + ") * 1000))\n";
      case "ctrl_wait_until":
        return p + "while not (" + exprBool(block.inputs.COND) + "):\n" + pad(level + 1) + "await runloop.sleep_ms(50)\n";
      case "ctrl_repeat":
        return p + "for _ in range(int(" + exprSlot(block, "times") + ")):\n" + emitSequence(block.branches.DO, level + 1, ctx);
      case "ctrl_forever":
        return p + "while True:\n" + emitSequence(block.branches.DO, level + 1, ctx) + pad(level + 1) + "await runloop.sleep_ms(20)\n";
      case "ctrl_repeat_until":
        return p + "while not (" + exprBool(block.inputs.COND) + "):\n" + emitSequence(block.branches.DO, level + 1, ctx) + pad(level + 1) + "await runloop.sleep_ms(20)\n";
      case "ctrl_if":
        return p + "if " + exprBool(block.inputs.COND) + ":\n" + emitSequence(block.branches.DO, level + 1, ctx);
      case "ctrl_if_else":
        return p + "if " + exprBool(block.inputs.COND) + ":\n" +
          emitSequence(block.branches.DO, level + 1, ctx) +
          p + "else:\n" +
          emitSequence(block.branches.ELSE, level + 1, ctx);
      case "ctrl_stop":
        return f.mode === "all" ? p + "raise SystemExit  # stop all\n" : p + "return\n";
      case "var_set":
        ctx.vars.add(HM.pythonIdent(f.name));
        if (!block.inputs.VALUE && !Number.isFinite(Number(f.VALUE))) {
          return p + HM.pythonIdent(f.name) + " = " + pyString(f.VALUE == null ? "" : f.VALUE) + "\n";
        }
        return p + HM.pythonIdent(f.name) + " = " + exprSlot(block, "VALUE") + "\n";
      case "var_change":
        ctx.vars.add(HM.pythonIdent(f.name));
        return p + HM.pythonIdent(f.name) + " += " + exprSlot(block, "VALUE") + "\n";
      case "show_value":
        if (!block.inputs.VALUE && !Number.isFinite(Number(f.VALUE))) {
          return p + "print(" + pyString(f.VALUE == null ? "" : f.VALUE) + ")\n";
        }
        return p + "print(" + exprSlot(block, "VALUE") + ")\n";
      default:
        if (block.opcode === "rep_timer") ctx.helpers.add("timer");
        return "";
    }
  }

  function walk(blocks, visit) {
    (blocks || []).forEach((block) => {
      visit(block);
      Object.keys(block.inputs || {}).forEach((key) => {
        if (block.inputs[key]) walk([block.inputs[key]], visit);
      });
      Object.keys(block.branches || {}).forEach((key) => walk(block.branches[key], visit));
    });
  }

  function eachBlock(project, visit) {
    (project.stacks || []).forEach((stack) => walk(stack.blocks, visit));
  }

  function usesOpcode(project, opcodes) {
    let found = false;
    eachBlock(project, (block) => {
      if (opcodes.indexOf(block.opcode) !== -1) found = true;
    });
    return found;
  }

  function stackRole(stack) {
    const first = stack.blocks[0];
    if (!first) return "skip";
    const shape = HM.CATALOG[first.opcode].shape;
    if (shape === "reporter" || shape === "boolean") return "skip";
    if (first.opcode === "event_button") return "button";
    if (first.opcode === "event_predict") return "predict";
    if (first.opcode === "event_distance" || first.opcode === "event_color" || first.opcode === "event_reflection" || first.opcode === "event_press") return "sensor";
    return "start";
  }

  function bodyOf(stack) {
    const first = stack.blocks[0];
    if (first && (first.opcode === "event_start" || first.opcode === "event_button" || first.opcode === "event_predict" || first.opcode === "event_distance" || first.opcode === "event_color" || first.opcode === "event_reflection" || first.opcode === "event_press")) return stack.blocks.slice(1);
    return stack.blocks;
  }

  function addIndent(text, spaces) {
    const extra = " ".repeat(spaces);
    return text.split("\n").map((line) => (line ? extra + line : line)).join("\n").replace(/\n$/, "");
  }

  function watchLoop(lines, name, test, body) {
    lines.push("async def " + name + "():");
    lines.push("    while True:");
    lines.push("        if " + test + ":");
    lines.push(addIndent(body, 8));
    lines.push("            while " + test + ":");
    lines.push("                await runloop.sleep_ms(50)");
    lines.push("        await runloop.sleep_ms(50)");
    lines.push("");
  }

  function generatePython(project, options) {
    HM._codegenProject = project;
    const ctx = { needs: new Set(), helpers: new Set(), vars: new Set() };
    if (usesOpcode(project, ["rep_timer"])) ctx.helpers.add("timer");
    const ordered = (project.stacks || []).slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const scripts = [];
    ordered.forEach((stack) => {
      const role = stackRole(stack);
      if (role === "skip") return;
      const first = stack.blocks[0];
      scripts.push({
        role,
        classId: first && first.fields ? first.fields.classId : "",
        hat: first,
        body: emitSequence(bodyOf(stack), 1, ctx),
      });
    });
    let startN = 0;
    let buttonN = 0;
    const predictNames = new Set();
    scripts.forEach((script) => {
      if (script.role === "button") {
        buttonN += 1;
        script.name = buttonN === 1 ? "on_button" : "on_button_" + buttonN;
      } else if (script.role === "predict") {
        let name = "when_" + HM.pythonIdent(className(project, script.classId));
        if (predictNames.has(name)) {
          let n = 2;
          while (predictNames.has(name + "_" + n)) n += 1;
          name = name + "_" + n;
        }
        predictNames.add(name);
        script.name = name;
      } else if (script.role === "sensor") {
        let name = sensorHatName(script.hat);
        if (predictNames.has(name)) {
          let n = 2;
          while (predictNames.has(name + "_" + n)) n += 1;
          name = name + "_" + n;
        }
        predictNames.add(name);
        script.name = name;
      } else {
        startN += 1;
        script.name = startN === 1 ? "main" : "program_" + startN;
      }
    });

    const learnKeys = learnSensorKeys(project);
    const imports = ["import runloop"];
    if (ctx.needs.has("motor") || ctx.needs.has("motor_pair") || usesOpcode(project, ["motor_pos", "motor_speed_get", "motor_angle"])) imports.push("import motor");
    if (ctx.needs.has("motor_pair")) imports.push("import motor_pair");
    if (ctx.needs.has("color") || usesOpcode(project, ["bool_color", "event_color", "light_color"]) || learnKeys.indexOf("color") !== -1) imports.push("import color");
    if (usesOpcode(project, ["rep_color", "bool_color", "rep_reflection", "bool_reflection", "event_color", "event_reflection"]) || learnKeys.indexOf("color") !== -1 || learnKeys.indexOf("reflection") !== -1) imports.push("import color_sensor");
    if (usesOpcode(project, ["rep_distance", "bool_distance", "event_distance"]) || learnKeys.indexOf("distance") !== -1) imports.push("import distance_sensor");
    if (usesOpcode(project, ["rep_force", "bool_pressed", "event_press"]) || learnKeys.indexOf("force") !== -1) imports.push("import force_sensor");
    if (usesOpcode(project, ["op_random"])) imports.push("import random");
    if (ctx.helpers.has("timer")) imports.push("import time");
    const hubParts = ["port"];
    if (ctx.needs.has("matrix")) hubParts.push("light_matrix");
    if (ctx.needs.has("light")) hubParts.push("light");
    if (usesOpcode(project, ["bool_button", "event_button"])) hubParts.push("button");
    if (usesOpcode(project, ["rep_pitch", "rep_roll"]) || learnKeys.indexOf("pitch") !== -1 || learnKeys.indexOf("roll") !== -1) hubParts.push("motion_sensor");
    imports.push("from hub import " + unique(hubParts).join(", "));
    if (ctx.needs.has("sound")) imports.push("import hub");

    const lines = [];
    lines.push("# Hagen Mindstorm — generated from word blocks.");
    lines.push("# Motors, sensors, and the light matrix use SPIKE Prime Python names.");
    lines.push("# Default drive: A left wheel, B right wheel. Set movement motors chooses the pair.");
    lines.push("# Set distance, color, and press chooses those sensor ports. Defaults are D, C, and E.");
    lines.push("# Motor speed defaults to 75%. Movement speed defaults to 50%.");
    lines.push("# Distance word blocks use centimeters. distance_sensor.distance() returns millimeters.");
    if (usesLearn(project)) {
      lines.push("# learner.predict() is the Learn lab vote. Sensor samples run on the hub. Photo classes are sent from this browser.");
      lines.push("# when blocks keep watching. The stack runs once when its condition becomes true, then waits until that condition clears.");
    }
    lines.push(unique(imports).join("\n"));
    lines.push("");
    if (ctx.needs.has("motor_pair")) {
      lines.push("motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)");
      lines.push("");
    }
    if (ctx.needs.has("speed")) {
      lines.push("_speed = {" + HM.PORTS.map((name) => pyString(name) + ": 75").join(", ") + "}");
      lines.push("");
    }
    if (ctx.needs.has("move_state")) {
      lines.push("_move_speed = 50");
      lines.push("_cm_per_rot = " + HM.CM_PER_ROTATION);
      lines.push("");
    }
    if (usesOpcode(project, ["rep_distance", "bool_distance", "event_distance", "rep_color", "bool_color", "event_color", "rep_reflection", "bool_reflection", "event_reflection", "rep_force", "bool_pressed", "event_press", "sense_set"]) || learnKeys.indexOf("distance") !== -1 || learnKeys.indexOf("color") !== -1 || learnKeys.indexOf("reflection") !== -1 || learnKeys.indexOf("force") !== -1) {
      lines.push("_distance_port = port.D");
      lines.push("_color_port = port.C");
      lines.push("_press_port = port.E");
      lines.push("");
    }
    if (usesOpcode(project, ["rep_distance", "bool_distance", "event_distance"]) || learnKeys.indexOf("distance") !== -1) {
      lines.push("def distance_cm():");
      lines.push("    reading = distance_sensor.distance(_distance_port)  # millimeters, or -1");
      lines.push("    if reading == -1:");
      lines.push("        return 200");
      lines.push("    return reading / 10");
      lines.push("");
    }
    if (ctx.helpers.has("cm")) {
      lines.push("def cm_to_degrees(cm):");
      lines.push("    # Medium wheel, 5.6 cm diameter.");
      lines.push("    return int(cm / 5.6 * 360)");
      lines.push("");
    }
    if (ctx.helpers.has("timer")) {
      lines.push("_timer_mark = time.ticks_ms()");
      lines.push("");
      lines.push("def timer_s():");
      lines.push("    return (time.ticks_ms() - _timer_mark) / 1000");
      lines.push("");
    }
    ctx.vars.forEach((name) => lines.push(name + " = 0"));
    if (ctx.vars.size) lines.push("");
    emitLearner(project, lines, options);

    if (!scripts.length) {
      lines.push("async def main():");
      lines.push("    pass");
      lines.push("");
      lines.push("runloop.run(main())");
      lines.push("");
      return lines.join("\n");
    }

    scripts.forEach((script) => {
      if (script.role === "button") {
        watchLoop(lines, script.name, "button.pressed(button.LEFT) > 0", script.body);
      } else if (script.role === "predict" || script.role === "sensor") {
        const test = script.role === "predict"
          ? "learner.predict() == " + pyString(className(project, script.classId))
          : exprBool(script.hat);
        watchLoop(lines, script.name, test, script.body);
      } else {
        lines.push("async def " + script.name + "():");
        const body = script.body.replace(/\n$/, "");
        const keepAlive = script.name === "main" && body.trim() === "pass" && scripts.some((item) => item.role !== "start");
        if (keepAlive) {
          lines.push("    while True:");
          lines.push("        await runloop.sleep_ms(200)");
        } else {
          lines.push(body);
        }
        lines.push("");
      }
    });

    lines.push("runloop.run(" + scripts.map((script) => script.name + "()").join(", ") + ")");
    lines.push("");
    if (usesOpcode(project, ["ml_predict", "ml_confidence", "bool_predict", "event_predict"])) {
      lines.push("# Learn lab snapshot");
      lines.push("# k = " + project.ml.k);
      if (project.ml.mode === "images") {
        lines.push("# Photo model in this browser. Each class needs at least 9 photos.");
        const counts = HM.classPhotoCounts(project.ml.samples, project.ml.classes);
        (project.ml.classes || []).forEach((item) => {
          lines.push("#   " + item.name + ": " + (counts[item.id] || 0) + " photos");
        });
      } else {
        const keys = HM.activeKeys(project.ml.use);
        lines.push("# features: " + (keys.length ? keys.join(", ") : "none"));
        (project.ml.classes || []).forEach((item) => {
          const count = (project.ml.samples || []).filter((sample) => sample.classId === item.id && sample.kind !== "image").length;
          lines.push("#   " + item.name + ": " + count + " samples");
        });
      }
      lines.push("");
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function unique(list) {
    const seen = new Set();
    return list.filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  }

  function highlightPython(code) {
    const escaped = String(code).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return escaped.replace(/(#.*$)|(\b(?:async|await|def|import|from|while|for|in|if|elif|else|return|and|or|not|True|False|None|raise)\b)|(\".*?\"|'.*?')|(\b\d+(?:\.\d+)?\b)/gm, (match, comment, keyword, str, num) => {
      if (comment) return '<span class="tok-com">' + comment + "</span>";
      if (keyword) return '<span class="tok-kw">' + keyword + "</span>";
      if (str) return '<span class="tok-str">' + str + "</span>";
      if (num) return '<span class="tok-num">' + num + "</span>";
      return match;
    });
  }

  return { generatePython, highlightPython };
});

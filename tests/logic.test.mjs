import { createRequire } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
require("../js/util.js");
require("../js/hardware.js");
require("../js/ml.js");
require("../js/tree.js");
require("../js/catalog.js");
require("../js/codegen.js");
require("../js/lessons.js");
require("../js/vm.js");

const HM = globalThis.HM;

function nearly(actual, expected, tol) {
  assert.ok(Math.abs(actual - expected) <= tol, actual + " not near " + expected);
}

test("a 20 cm drive moves the robot north by 20 cm", async () => {
  const drive = HM.createDrive();
  const world = HM.preset("open");
  world.obstacles = [];
  const robot = { x: 75, y: 80, heading: 0 };
  const degrees = HM.wheelsForTravel(20);
  drive.command("A", 720, degrees);
  drive.command("B", 720, degrees);
  for (let i = 0; i < 80; i++) drive.step(0.05, robot, world);
  await new Promise((resolve) => setTimeout(resolve, 0));
  nearly(80 - robot.y, 20, 1.2);
  nearly(robot.heading, 0, 1);
  nearly(robot.x, 75, 1);
});

test("opposite wheels turn the robot right by 90 degrees", async () => {
  const drive = HM.createDrive();
  const world = HM.preset("open");
  world.obstacles = [];
  const robot = { x: 75, y: 50, heading: 0 };
  const degrees = HM.wheelsForTurn(90);
  drive.command("A", 720, degrees);
  drive.command("B", -720, -degrees);
  for (let i = 0; i < 80; i++) drive.step(0.05, robot, world);
  await new Promise((resolve) => setTimeout(resolve, 0));
  nearly(robot.heading, 90, 2);
  nearly(robot.x, 75, 2);
  nearly(robot.y, 50, 2);
});

test("distance ray sees a crate ahead", () => {
  const world = HM.preset("lane");
  const distance = HM.measureDistance({ x: 36, y: 50, heading: 90 }, world);
  assert.ok(distance > 20 && distance < 50, "distance was " + distance);
});

test("color sensor reads the red mat", () => {
  const world = HM.preset("mats");
  const surface = HM.sampleSurface(30, 24, world);
  assert.equal(surface.color, "red");
});

test("a wall stops the body but the motor command still finishes", async () => {
  const drive = HM.createDrive();
  const world = HM.preset("open");
  world.obstacles = [{ id: "box", x: 70, y: 20, w: 16, h: 40 }];
  const robot = { x: 40, y: 40, heading: 90 };
  const degrees = HM.wheelsForTravel(80);
  let finished = false;
  drive.command("A", 720, degrees).then(() => { finished = true; });
  drive.command("B", 720, degrees);
  for (let i = 0; i < 200; i++) drive.step(0.05, robot, world);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(robot.x < 70);
  assert.equal(finished, true);
});

test("k nearest neighbors votes with the closer class", () => {
  const samples = [];
  for (let i = 0; i < 4; i++) {
    samples.push({ classId: "open", features: { distance: 100 + i, reflection: 80, color: 8, force: 0, pitch: 0, roll: 0 } });
    samples.push({ classId: "obstacle", features: { distance: 12 + i, reflection: 40, color: 8, force: 0, pitch: 0, roll: 0 } });
  }
  const use = { distance: true, reflection: true, color: false, force: false, pitch: false, roll: false };
  const prediction = HM.knnPredict(samples, { distance: 14, reflection: 42, color: 8, force: 0, pitch: 0, roll: 0 }, 3, use);
  assert.equal(prediction.classId, "obstacle");
  assert.equal(HM.looScore(samples, 3, use), 1);
});

test("blocks can be inserted and the tail can be lifted", () => {
  const stack = { id: "s", x: 0, y: 0, blocks: [HM.makeBlock("event_start"), HM.makeBlock("move_stop")] };
  const added = HM.makeBlock("ctrl_wait");
  HM.insertAt(stack, [], 1, [added]);
  assert.equal(stack.blocks[1].opcode, "ctrl_wait");
  const tail = HM.takeTail(stack.blocks, 1);
  assert.equal(tail.length, 2);
  assert.equal(stack.blocks.length, 1);
  const found = HM.locate({ stacks: [stack] }, stack.blocks[0].id);
  assert.equal(found.block.opcode, "event_start");
});

test("every lesson generates SPIKE-style Python", () => {
  const project = {
    name: "test",
    variables: ["count"],
    ml: { k: 3, classes: HM.defaultClasses(), samples: [], use: HM.defaultUse() },
    stacks: [],
  };
  HM.project = project;
  HM.LESSONS.forEach((lesson) => {
    const built = lesson.build();
    project.stacks = built.stacks;
    if (built.use) project.ml.use = built.use;
    const code = HM.generatePython(project);
    assert.match(code, /async def main/);
    assert.match(code, /runloop\.run/);
    assert.doesNotThrow(() => HM.generatePython(project));
  });
  project.stacks = HM.LESSONS[1].build().stacks;
  assert.match(HM.generatePython(project), /distance_cm/);
  project.stacks = HM.LESSONS.find((lesson) => lesson.id === "model").build().stacks;
  assert.match(HM.generatePython(project), /learner\.predict/);
});

test("steering 100 spins right and one rotation is the wheel circumference", () => {
  assert.deepEqual(HM.steerGains(0), { left: 1, right: 1 });
  assert.deepEqual(HM.steerGains(100), { left: 1, right: -1 });
  assert.deepEqual(HM.steerGains(-100), { left: -1, right: 1 });
  nearly(HM.degreesForMove(HM.CM_PER_ROTATION, "cm", HM.CM_PER_ROTATION), 360, 0.2);
});

test("nine photos in two classes can be told apart", () => {
  function solid(r, g, b) {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
    return HM.featuresFromPixels(data, 4, 4);
  }
  const red = solid(220, 20, 20);
  const blue = solid(20, 40, 210);
  assert.equal(red.length, HM.IMAGE_GRID * HM.IMAGE_GRID * 3);
  const classes = [{ id: "apple", name: "apple" }, { id: "sky", name: "sky" }];
  const samples = [];
  for (let i = 0; i < 9; i++) {
    samples.push({ id: "r" + i, classId: "apple", kind: "image", features: red.slice() });
    samples.push({ id: "b" + i, classId: "sky", kind: "image", features: blue.slice() });
  }
  samples[0].features[0] = 200;
  const early = HM.imageReady(samples.slice(0, 10), classes);
  assert.equal(early.ok, false);
  const ready = HM.imageReady(samples, classes);
  assert.equal(ready.ok, true);
  assert.equal(ready.counts.apple, 9);
  const guess = HM.knnImagePredict(samples, red, 3);
  assert.equal(guess.classId, "apple");
  assert.equal(HM.imageScore(samples, 3), 1);
  const mixed = HM.knnPredict(samples.concat([{ id: "s", classId: "open", features: { distance: 10, reflection: 10, color: 1, force: 0, pitch: 0, roll: 0 } }]), { distance: 12, reflection: 12, color: 1, force: 0, pitch: 0, roll: 0 }, 1, { distance: true, reflection: true, color: false, force: false, pitch: false, roll: false });
  assert.equal(mixed.classId, "open");
});

test("motor and dual-motor blocks set the port and the speed", () => {
  const project = {
    name: "motors",
    variables: ["count"],
    ml: { k: 3, classes: HM.defaultClasses(), samples: [], use: HM.defaultUse() },
    stacks: [{
      id: "s",
      x: 0,
      y: 0,
      blocks: [
        HM.makeBlock("event_start"),
        Object.assign(HM.makeBlock("motor_set_speed"), { fields: { port: "A", speed: 40 } }),
        Object.assign(HM.makeBlock("motor_run"), { fields: { port: "F", direction: "cw", amount: 1, unit: "rotations" } }),
        Object.assign(HM.makeBlock("move_set_motors"), { fields: { left: "A", right: "B" } }),
        Object.assign(HM.makeBlock("move_set_speed"), { fields: { speed: 50 } }),
        Object.assign(HM.makeBlock("move_for"), { fields: { direction: "forward", amount: 20, unit: "cm" } }),
      ],
    }],
  };
  HM.project = project;
  const code = HM.generatePython(project);
  assert.match(code, /_speed\["A"\] = 40/);
  assert.match(code, /motor\.run_for_degrees\(port\.F, int\(abs\(1\) \* 360 \* \(1 if _speed\["F"\] >= 0 else -1\)\), abs\(int\(_speed\["F"\] \/ 100 \* 720\)\)\)/);
  const goto = Object.assign(HM.makeBlock("motor_goto"), { fields: { port: "A", direction: "short", position: 90 } });
  project.stacks[0].blocks.push(goto);
  const aimed = HM.generatePython(project);
  assert.match(aimed, /await motor\.run_to_absolute_position\(port\.A, int\(90\), abs\(int\(_speed\["A"\] \/ 100 \* 720\)\), direction=motor\.SHORTEST_PATH\)/);
  assert.match(code, /motor_pair\.pair\(motor_pair\.PAIR_1, port\.A, port\.B\)/);
  assert.match(code, /_move_speed = 50/);
  assert.match(code, /move_for_degrees/);
});

test("sensor ports are chosen before the distance, color, and press reads", () => {
  const project = {
    name: "ports",
    variables: [],
    ml: { k: 3, classes: HM.defaultClasses(), samples: [], use: HM.defaultUse() },
    stacks: [{
      id: "s",
      x: 0,
      y: 0,
      blocks: [
        HM.makeBlock("event_start"),
        Object.assign(HM.makeBlock("sense_set"), { fields: { distance: "A", color: "F", press: "B" } }),
        Object.assign(HM.makeBlock("show_value"), { inputs: { VALUE: HM.makeBlock("rep_distance") } }),
        Object.assign(HM.makeBlock("show_value"), { inputs: { VALUE: HM.makeBlock("rep_color") } }),
        Object.assign(HM.makeBlock("show_value"), { inputs: { VALUE: HM.makeBlock("rep_force") } }),
      ],
    }],
  };
  HM.project = project;
  const code = HM.generatePython(project);
  assert.match(code, /_distance_port = port\.A/);
  assert.match(code, /_color_port = port\.F/);
  assert.match(code, /_press_port = port\.B/);
  assert.match(code, /distance_sensor\.distance\(_distance_port\)/);
  assert.match(code, /color_sensor\.color\(_color_port\)/);
  assert.match(code, /force_sensor\.force\(_press_port\)/);
  assert.deepEqual(HM.configuredSense(), { distance: "A", color: "F", press: "B" });
  project.stacks = [{
    id: "old",
    x: 0,
    y: 0,
    blocks: [
      HM.makeBlock("event_start"),
      Object.assign(HM.makeBlock("show_value"), { inputs: { VALUE: HM.makeBlock("rep_distance") } }),
    ],
  }];
  const fallback = HM.generatePython(project);
  assert.match(fallback, /_distance_port = port\.D/);
  assert.match(fallback, /distance_sensor\.distance\(_distance_port\)/);
  assert.deepEqual(HM.configuredSense(), { distance: "D", color: "C", press: "E" });
});

test("when prediction is starts its own stack", () => {
  const project = {
    name: "predict",
    variables: [],
    ml: { k: 3, classes: HM.defaultClasses(), samples: [], use: HM.defaultUse() },
    stacks: [
      {
        id: "start",
        x: 0,
        y: 0,
        blocks: [
          HM.makeBlock("event_start"),
          Object.assign(HM.makeBlock("show_value"), { fields: { VALUE: "ready" } }),
        ],
      },
      {
        id: "when",
        x: 0,
        y: 80,
        blocks: [
          Object.assign(HM.makeBlock("event_predict"), { fields: { classId: "obstacle" } }),
          HM.makeBlock("move_stop"),
        ],
      },
    ],
  };
  HM.project = project;
  const code = HM.generatePython(project);
  assert.match(code, /async def main\(\)/);
  assert.match(code, /async def when_obstacle\(\)/);
  assert.match(code, /async def when_obstacle\(\):\n    while True:\n        if learner\.predict\(\) == "obstacle":/);
  assert.match(code, /class Learner/);
  assert.match(code, /learner = Learner\(\)/);
  const whenObstacle = code.split("async def when_obstacle")[1];
  assert.ok(whenObstacle.indexOf("motor_pair.stop") < whenObstacle.indexOf("while learner.predict() == \"obstacle\":"));
  assert.match(code, /runloop\.run\(main\(\), when_obstacle\(\)\)/);
  const main = code.split("async def when_obstacle")[0];
  assert.match(main, /async def main/);
  assert.doesNotMatch(main, /motor_pair\.stop/);
  assert.match(code.split("async def when_obstacle")[1], /motor_pair\.stop/);
});

test("the hub program defines learner from the sensor samples", () => {
  const project = {
    name: "learn",
    variables: [],
    ml: {
      k: 3,
      mode: "sensors",
      classes: HM.defaultClasses(),
      use: { distance: true, reflection: false, color: false, force: false, pitch: false, roll: false },
      samples: [
        { id: "a", classId: "red", features: { distance: 10, reflection: 0, color: 0, force: 0, pitch: 0, roll: 0 } },
        { id: "b", classId: "open", features: { distance: 80, reflection: 0, color: 0, force: 0, pitch: 0, roll: 0 } },
      ],
    },
    stacks: [{
      id: "when",
      x: 0,
      y: 0,
      blocks: [Object.assign(HM.makeBlock("event_predict"), { fields: { classId: "red" } })],
    }],
  };
  const code = HM.generatePython(project);
  assert.match(code, /class Learner/);
  assert.match(code, /learner = Learner\(\)/);
  assert.match(code, /_learn_samples = \[/);
  assert.match(code, /\("red", \{"distance": 10\}\)/);
  assert.match(code, /def distance_cm\(\)/);
  assert.match(code, /return _learn_vote\(\)\[0\]/);
  assert.doesNotMatch(code, /name 'learner'/);
});

test("photo classes are read from the label the browser sends", () => {
  const project = {
    name: "photos",
    variables: [],
    ml: {
      k: 3,
      mode: "images",
      classes: [{ id: "red", name: "red" }, { id: "background", name: "background" }],
      use: HM.defaultUse(),
      samples: [],
    },
    stacks: [
      { id: "start", x: 0, y: 0, blocks: [HM.makeBlock("event_start")] },
      {
        id: "when",
        x: 0,
        y: 40,
        blocks: [
          Object.assign(HM.makeBlock("event_predict"), { fields: { classId: "red" } }),
          Object.assign(HM.makeBlock("motor_spin"), { fields: { port: "C", direction: "cw" } }),
        ],
      },
    ],
  };
  const code = HM.generatePython(project);
  assert.match(code, /_photo_text = ""/);
  assert.match(code, /return _photo_text/);
  assert.match(code, /if learner\.predict\(\) == "red":/);
  assert.match(code, /motor\.run\(port\.C/);
  assert.match(code, /while learner\.predict\(\) == "red":/);
  assert.match(code, /while True:\n        await runloop\.sleep_ms\(200\)/);
  assert.doesNotMatch(code, /_photo_label/);
  const live = HM.generatePython(project, { photoText: "red" });
  assert.match(live, /_photo_text = "red"/);
  const red = live.split("async def when_red")[1];
  assert.ok(red.indexOf("motor.run") < red.indexOf("while learner.predict() == \"red\":"));
});

test("sensor when blocks start a stack and the same checks fit in if else", () => {
  const ifElse = HM.makeBlock("ctrl_if_else");
  ifElse.inputs.COND = Object.assign(HM.makeBlock("bool_color"), { fields: { color: "red" } });
  ifElse.branches.DO = [HM.makeBlock("move_stop")];
  ifElse.branches.ELSE = [HM.makeBlock("sound_stop")];
  const project = {
    name: "sensors",
    variables: [],
    ml: { k: 3, classes: HM.defaultClasses(), samples: [], use: HM.defaultUse() },
    stacks: [
      {
        id: "start",
        x: 0,
        y: 0,
        blocks: [HM.makeBlock("event_start"), ifElse],
      },
      {
        id: "near",
        x: 0,
        y: 80,
        blocks: [
          Object.assign(HM.makeBlock("event_distance"), { fields: { op: "<", VALUE: 15 } }),
          HM.makeBlock("matrix_clear"),
        ],
      },
      {
        id: "pressed",
        x: 0,
        y: 160,
        blocks: [HM.makeBlock("event_press"), HM.makeBlock("sound_stop")],
      },
    ],
  };
  HM.project = project;
  const code = HM.generatePython(project);
  assert.match(code, /if color_sensor\.color\(_color_port\) is color\.RED:/);
  assert.match(code, /else:/);
  assert.match(code, /async def when_distance\(\)/);
  assert.match(code, /if distance_cm\(\) < 15:/);
  assert.match(code, /while distance_cm\(\) < 15:/);
  assert.match(code, /async def when_press\(\)/);
  assert.match(code, /if force_sensor\.pressed\(_press_port\):/);
  assert.match(code, /while force_sensor\.pressed\(_press_port\):/);
  const main = code.split("async def when_distance")[0];
  assert.doesNotMatch(main, /async def when_distance/);
  assert.match(code, /runloop\.run\(main\(\), when_distance\(\), when_press\(\)\)/);
});

test("one rotation turns 360 degrees and shortest path reaches the absolute mark", async () => {
  HM.drive = HM.createDrive();
  HM.editor = { visit() {} };
  HM.setRunning = () => {};
  HM.clearConsole = () => {};
  HM.log = () => {};
  HM.toast = () => {};
  HM.sound = { stop() {} };
  HM.matrixApi = { clearMatrix() {} };
  HM.project = {
    name: "spin",
    variables: [],
    ml: { k: 3, classes: HM.defaultClasses(), samples: [], use: HM.defaultUse() },
    stacks: [{
      id: "s",
      x: 0,
      y: 0,
      blocks: [
        HM.makeBlock("event_start"),
        Object.assign(HM.makeBlock("motor_set_speed"), { fields: { port: "F", speed: 100 } }),
        Object.assign(HM.makeBlock("motor_run"), { fields: { port: "F", direction: "cw", amount: 1, unit: "rotations" } }),
        Object.assign(HM.makeBlock("motor_goto"), { fields: { port: "F", direction: "short", position: 90 } }),
      ],
    }],
  };
  const world = HM.preset("open");
  const robot = Object.assign({}, world.robot);
  const running = HM.runProgram();
  for (let i = 0; i < 80 && HM.running !== false; i++) {
    HM.drive.step(0.05, robot, world);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await running;
  const angle = ((HM.drive.motors.F.angle % 360) + 360) % 360;
  assert.ok(Math.abs(angle - 90) < 1, "angle " + HM.drive.motors.F.angle);
});

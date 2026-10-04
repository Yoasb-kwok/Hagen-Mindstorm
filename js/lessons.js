(function (root, factory) {
  const api = factory(root);
  root.HM = Object.assign(root.HM || {}, api);
  if (typeof module === "object" && module != null && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const HM = root.HM;

  function b(opcode, fields) {
    const block = HM.makeBlock(opcode);
    if (fields) Object.assign(block.fields, fields);
    return block;
  }

  function put(parent, input, child) {
    parent.inputs[input] = child;
    return parent;
  }

  function branch(parent, key, blocks) {
    parent.branches[key] = blocks;
    return parent;
  }

  function stack(x, y, blocks) {
    return { id: HM.uid("s"), x, y, blocks };
  }

  const LESSONS = [
    {
      id: "drive",
      title: "Drive the base",
      minutes: 10,
      summary: "A program is a stack of blocks. Run sends that stack to the virtual hub.",
      steps: [
        "Press Run. The robot drives, turns, and drives again.",
        "Dual motors starts by setting the two ports and the speed, the same way SPIKE Prime does.",
        "Change 20 cm to 40 cm and run it again.",
        "Steer 100 spins right. The number after it is wheel degrees, so 180 is a quarter turn of this base.",
        "Open the Python panel. Set movement motors becomes motor_pair.pair.",
      ],
      build: () => ({
        arena: "mats",
        robot: { x: 72, y: 86, heading: 0, pitch: 0, roll: 0 },
        stacks: [stack(40, 28, [
          b("event_start"),
          b("matrix_image", { image: "happy" }),
          b("move_set_motors", { left: "A", right: "B" }),
          b("move_set_speed", { speed: 50 }),
          b("move_for", { direction: "forward", amount: 20, unit: "cm" }),
          b("move_set_speed", { speed: 40 }),
          b("move_steer", { steering: 100, amount: Math.round(HM.wheelsForTurn(90)), unit: "degrees" }),
          b("move_set_speed", { speed: 50 }),
          b("move_for", { direction: "forward", amount: 10, unit: "cm" }),
        ])],
      }),
    },
    {
      id: "distance",
      title: "Read the distance sensor",
      minutes: 12,
      summary: "The distance sensor measures what is in front of the robot. Word blocks use centimeters.",
      steps: [
        "The first Sensors block chooses the ports. Distance starts on D, color on C, and the press sensor on E. Change the letters to match the plugs.",
        "When distance cm < 15 starts its own stack. The same distance, color, and press checks also fit in if and else.",
        "Look at the live distance on the virtual hub. Drag the robot toward the crate.",
        "Press Run. The base drives until the distance is under 15 cm, then stops.",
        "In Python, distance_sensor.distance() returns millimeters, or -1 if nothing is in range. distance_cm() is the bridge.",
        "Change 15 to 30 and see where it stops.",
      ],
      build: () => ({
        arena: "lane",
        robot: { x: 36, y: 50, heading: 90, pitch: 0, roll: 0 },
        stacks: [stack(40, 28, [
          b("event_start"),
          b("sense_set", { distance: "D", color: "C", press: "E" }),
          b("move_set_motors", { left: "A", right: "B" }),
          b("move_set_speed", { speed: 40 }),
          b("move_go", { direction: "forward" }),
          put(b("ctrl_wait_until"), "COND", b("bool_distance", { op: "<", VALUE: 15 })),
          b("move_stop"),
          put(b("show_value"), "VALUE", b("rep_distance")),
          b("matrix_image", { image: "heart" }),
        ])],
      }),
    },
    {
      id: "color",
      title: "Decide with color",
      minutes: 12,
      summary: "The color sensor reads the mat under the front of the robot. An if block chooses what happens next.",
      steps: [
        "The robot starts on the paper, facing the red mat.",
        "Run the program. It drives until the sensor sees red, then stops and plays a note.",
        "Add an else later if you want a different matrix image on every other color.",
        "Challenge: switch the arena to Line track and wait until reflected light is under 30.",
      ],
      build: () => ({
        arena: "mats",
        robot: { x: 78, y: 27, heading: 270, pitch: 0, roll: 0 },
        stacks: [stack(40, 28, [
          b("event_start"),
          b("sense_set", { distance: "D", color: "C", press: "E" }),
          b("move_set_motors", { left: "A", right: "B" }),
          b("move_set_speed", { speed: 35 }),
          b("move_go", { direction: "forward" }),
          branch(b("ctrl_forever"), "DO", [
            branch(put(b("ctrl_if"), "COND", b("bool_color", { color: "red" })), "DO", [
              b("move_stop"),
              b("sound_beep", { freq: 660, seconds: 0.2 }),
              b("matrix_image", { image: "heart" }),
              b("ctrl_stop", { mode: "stack" }),
            ]),
            b("ctrl_wait", { seconds: 0.05 }),
          ]),
        ])],
      }),
    },
    {
      id: "avoid",
      title: "Keep moving",
      minutes: 15,
      summary: "A forever loop checks the sensor again and again. That is how a robot keeps a habit.",
      steps: [
        "Run it. When the crate is close, the robot stops, turns, and sets off again.",
        "Drag the crate while the program runs. The habit should still fire.",
        "If the loop has no wait, the hub never gets a chance to read the sensor. The 0.05 second wait is the pause.",
        "Read the Python while True. The extra sleep_ms(20) is the same idea.",
      ],
      build: () => ({
        arena: "lane",
        robot: { x: 36, y: 50, heading: 90, pitch: 0, roll: 0 },
        stacks: [stack(36, 24, [
          b("event_start"),
          b("sense_set", { distance: "D", color: "C", press: "E" }),
          b("move_set_motors", { left: "A", right: "B" }),
          branch(b("ctrl_forever"), "DO", [
            branch(branch(put(b("ctrl_if_else"), "COND", b("bool_distance", { op: "<", VALUE: 18 })), "DO", [
              b("move_stop"),
              b("move_set_speed", { speed: 45 }),
              b("move_steer", { steering: 100, amount: Math.round(HM.wheelsForTurn(90)), unit: "degrees" }),
              b("move_set_speed", { speed: 40 }),
              b("move_for", { direction: "forward", amount: 12, unit: "cm" }),
            ]), "ELSE", [
              b("move_set_speed", { speed: 45 }),
              b("move_go", { direction: "forward" }),
            ]),
            b("ctrl_wait", { seconds: 0.05 }),
          ]),
        ])],
      }),
    },
    {
      id: "samples",
      title: "Collect a training set",
      minutes: 15,
      summary: "A classifier does not start with rules. It starts with examples you label.",
      steps: [
        "Open the Learn lab. Choose the class open. Back the robot away from the crate and capture 8 samples.",
        "Choose obstacle. Drive close to the crate, a little left, a little right, and capture 8 more.",
        "Distance and reflected light are the features. A feature is one number the model is allowed to see.",
        "Press Train. The score is leave-one-out: each sample is hidden once and guessed from the others.",
      ],
      build: () => ({
        arena: "open",
        robot: { x: 46, y: 50, heading: 90, pitch: 0, roll: 0 },
        use: { distance: true, reflection: true, color: false, force: false, pitch: false, roll: false },
        stacks: [stack(40, 28, [
          b("event_start"),
          b("matrix_image", { image: "square" }),
          b("show_value", { VALUE: "Collect open and obstacle samples" }),
        ])],
      }),
    },
    {
      id: "neighbors",
      title: "Neighbors and k",
      minutes: 12,
      summary: "k-nearest neighbors stores the samples and, at prediction time, takes a vote among the closest ones.",
      steps: [
        "With the lab open, drag the robot. The crosshair is the live reading. The list under the plot is the vote.",
        "Set k to 1. One noisy sample can win. Set k to 5. A single odd sample has less power.",
        "Confidence is the fraction of those k neighbors that agreed.",
        "This model does not learn a formula. Train only checks how well the neighbors agree.",
      ],
      build: () => ({
        arena: "open",
        keepSamples: true,
        use: { distance: true, reflection: true, color: false, force: false, pitch: false, roll: false },
        stacks: [stack(40, 28, [
          b("event_start"),
          put(b("show_value"), "VALUE", b("ml_predict")),
          put(b("show_value"), "VALUE", b("ml_confidence")),
        ])],
      }),
    },
    {
      id: "model",
      title: "Let the model drive",
      minutes: 15,
      summary: "The prediction block is a sensor you trained. The rest of the program is ordinary word blocks.",
      steps: [
        "Use the open and obstacle samples from the last lesson, or load the distance demo in the lab and press Train.",
        "Run the program. If the nearest samples say obstacle, the robot turns. Otherwise it drives.",
        "Cover the crate with your drag and watch the class change before the turn.",
        "In Python this is learner.predict(). That function lives in the lab, not on a SPIKE hub.",
        "When prediction is obstacle runs its stack once when the class becomes obstacle, then watches again. When the class changes, that when stack stops waiting and the other one can run.",
      ],
      build: () => ({
        arena: "open",
        keepSamples: true,
        robot: { x: 46, y: 50, heading: 90, pitch: 0, roll: 0 },
        use: { distance: true, reflection: true, color: false, force: false, pitch: false, roll: false },
        stacks: [stack(36, 24, [
          b("event_start"),
          b("sense_set", { distance: "D", color: "C", press: "E" }),
          b("move_set_motors", { left: "A", right: "B" }),
          branch(b("ctrl_forever"), "DO", [
            branch(branch(put(b("ctrl_if_else"), "COND", b("bool_predict", { classId: "obstacle" })), "DO", [
              b("move_stop"),
              b("matrix_image", { image: "no" }),
              b("move_set_speed", { speed: 45 }),
              b("move_steer", { steering: 100, amount: Math.round(HM.wheelsForTurn(90)), unit: "degrees" }),
              b("move_set_speed", { speed: 40 }),
              b("move_for", { direction: "forward", amount: 15, unit: "cm" }),
            ]), "ELSE", [
              b("matrix_image", { image: "yes" }),
              b("move_set_speed", { speed: 40 }),
              b("move_go", { direction: "forward" }),
            ]),
            b("ctrl_wait", { seconds: 0.08 }),
          ]),
        ])],
      }),
    },
    {
      id: "sort",
      title: "Sort colors with a model",
      minutes: 18,
      summary: "The same vote can learn colors. Here the useful features are the color code and the reflected light, not the distance.",
      steps: [
        "The lab switches features to color and reflected light. Old distance samples are still stored, but they do not vote.",
        "Capture about 6 samples each on red, blue, and the plain paper. Name the paper class floor, or use the color demo.",
        "Train, then run. Red shows a heart, blue shows an arrow, anything else keeps driving.",
        "Ask the class: what would go wrong if two mats had the same color code?",
      ],
      build: () => ({
        arena: "mats",
        keepSamples: true,
        robot: { x: 78, y: 27, heading: 270, pitch: 0, roll: 0 },
        use: { distance: false, reflection: true, color: true, force: false, pitch: false, roll: false },
        ensureClasses: [
          { id: "red", name: "red", color: "#d64545" },
          { id: "blue", name: "blue", color: "#3a5bd9" },
          { id: "floor", name: "floor", color: "#8d8678" },
        ],
        stacks: [stack(36, 20, [
          b("event_start"),
          b("sense_set", { distance: "D", color: "C", press: "E" }),
          b("move_set_motors", { left: "A", right: "B" }),
          b("move_set_speed", { speed: 30 }),
          b("move_go", { direction: "forward" }),
          branch(b("ctrl_forever"), "DO", [
            branch(branch(put(b("ctrl_if_else"), "COND", b("bool_predict", { classId: "red" })), "DO", [
              b("move_stop"),
              b("matrix_image", { image: "heart" }),
              b("ctrl_stop", { mode: "stack" }),
            ]), "ELSE", [
              branch(put(b("ctrl_if"), "COND", b("bool_predict", { classId: "blue" })), "DO", [
                b("move_stop"),
                b("matrix_image", { image: "arrow_e" }),
                b("ctrl_stop", { mode: "stack" }),
              ]),
            ]),
            b("ctrl_wait", { seconds: 0.05 }),
          ]),
        ])],
      }),
    },
  ];

  function demoSamples(kind) {
    const samples = [];
    function add(classId, features) {
      samples.push({ id: HM.uid("sample"), classId, features });
    }
    if (kind === "color") {
      for (let i = 0; i < 6; i++) {
        add("red", { distance: 40 + i * 3, reflection: 42 + (i % 3) * 4, color: 7, force: 0, pitch: 0, roll: 0 });
        add("blue", { distance: 36 + i * 4, reflection: 36 + (i % 3) * 3, color: 3, force: 0, pitch: 0, roll: 0 });
        add("floor", { distance: 50 + i * 8, reflection: 86 + (i % 2) * 4, color: 8, force: 0, pitch: 0, roll: 0 });
      }
      return samples;
    }
    for (let i = 0; i < 8; i++) {
      add("obstacle", { distance: 8 + i * 2.2, reflection: 34 + (i % 4) * 6, color: 8, force: 0, pitch: 0, roll: 0 });
      add("open", { distance: 70 + i * 12, reflection: 58 + (i % 3) * 8, color: 8, force: 0, pitch: 0, roll: 0 });
    }
    return samples;
  }

  function defaultClasses() {
    return [
      { id: "open", name: "open", color: "#3d8fd1" },
      { id: "obstacle", name: "obstacle", color: "#e07a2f" },
      { id: "red", name: "red", color: "#d64545" },
      { id: "blue", name: "blue", color: "#3a5bd9" },
    ];
  }

  function defaultUse() {
    return { distance: true, reflection: true, color: true, force: false, pitch: false, roll: false };
  }

  return { LESSONS, demoSamples, defaultClasses, defaultUse };
});

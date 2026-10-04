(function (root, factory) {
  const api = factory(root);
  root.HM = Object.assign(root.HM || {}, api);
  if (typeof module === "object" && module != null && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const CATEGORIES = [
    { id: "events", label: "Events", hint: "A start block is the first block in a stack." },
    { id: "motors", label: "Motor", hint: "Choose a port, then set its speed. Run, start, and go-to-position use that speed. The default is 75%." },
    { id: "move", label: "Dual motors", hint: "Set the two ports first: the first port is the left wheel, the second is the right. Then set the speed. Steering 0 drives straight, 100 spins right, and -100 spins left." },
    { id: "light", label: "Light", hint: "The hub light and the 5×5 matrix. Pixels are numbered 0 to 4." },
    { id: "sound", label: "Sound", hint: "Short beeps from the virtual hub." },
    { id: "control", label: "Control", hint: "Waits, repeats, and decisions." },
    { id: "sense", label: "Sensors", hint: "Set the ports first, or connect the hub and it fills them from the devices it finds. Each when block keeps watching. The stack runs once when the sensor matches, then waits until it changes. The same checks fit in if and else. Distance uses centimeters." },
    { id: "ops", label: "Operators", hint: "Math, comparisons, and random numbers." },
    { id: "vars", label: "Variables", hint: "Remember a number or a word between blocks." },
    { id: "learn", label: "Learn", hint: "When prediction is keeps watching. The stack runs once when that class appears, then waits until the class changes. Switch from background to red and the red stack runs. The same check also fits in if and else." },
  ];

  function block(category, shape, parts, extra) {
    return Object.assign({ category, shape, parts: parts || [] }, extra || {});
  }

  const text = (value) => ({ type: "text", text: value });
  const menu = (field, options, fallback) => ({ type: "menu", field, options, default: fallback });
  const num = (input, fallback) => ({ type: "slot", input, fallback, kind: "number" });
  const word = (input, fallback) => ({ type: "slot", input, fallback, kind: "text" });
  const bool = (input) => ({ type: "bool", input });

  const CATALOG = {
    event_start: block("events", "hat", [text("when program starts")]),
    event_button: block("events", "hat", [text("when hub button pressed")]),

    motor_run: block("motors", "stack", [
      text("run"), menu("port", "ports", "A"), menu("direction", "spin", "cw"),
      text("for"), num("amount", 1), menu("unit", "motorUnit", "rotations"),
    ]),
    motor_goto: block("motors", "stack", [
      text("go to position"), menu("port", "ports", "A"),
      menu("direction", "path", "short"), num("position", 0),
    ]),
    motor_spin: block("motors", "stack", [
      text("start motor"), menu("port", "ports", "A"), menu("direction", "spin", "cw"),
    ]),
    motor_stop: block("motors", "stack", [
      text("stop motor"), menu("port", "ports", "A"), menu("mode", "halt", "brake"),
    ]),
    motor_set_speed: block("motors", "stack", [
      text("set speed"), menu("port", "ports", "A"), text("to"), num("speed", 75), text("%"),
    ]),
    motor_pos: block("motors", "reporter", [text("position of"), menu("port", "ports", "A")]),
    motor_speed_get: block("motors", "reporter", [text("speed of"), menu("port", "ports", "A")]),

    move_set_motors: block("move", "stack", [
      text("set movement motors"), menu("left", "ports", "A"), menu("right", "ports", "B"),
    ]),
    move_set_speed: block("move", "stack", [
      text("set movement speed to"), num("speed", 50), text("%"),
    ]),
    move_for: block("move", "stack", [
      text("move"), menu("direction", "heading", "forward"),
      text("for"), num("amount", 10), menu("unit", "moveUnit", "cm"),
    ]),
    move_steer: block("move", "stack", [
      text("steer"), num("steering", 0),
      text("for"), num("amount", 10), menu("unit", "moveUnit", "cm"),
    ]),
    move_go: block("move", "stack", [
      text("start moving"), menu("direction", "heading", "forward"),
    ]),
    move_steer_go: block("move", "stack", [
      text("start steering"), num("steering", 0),
    ]),
    move_stop: block("move", "stack", [text("stop moving")]),
    move_set_rotation: block("move", "stack", [
      text("set 1 rotation to"), num("cm", 17.6), text("cm"),
    ]),

    motor_degrees: block("motors", "stack", [
      text("run motor"), menu("port", "ports", "A"),
      text("for"), num("degrees", 360),
      text("degrees at"), num("speed", 50), text("%"),
    ], { hidden: true }),
    motor_start: block("motors", "stack", [
      text("start motor"), menu("port", "ports", "A"),
      text("at"), num("speed", 50), text("%"),
    ], { hidden: true }),
    motor_angle: block("motors", "reporter", [text("position of motor"), menu("port", "ports", "A")], { hidden: true }),

    move_cm: block("move", "stack", [
      text("move"), menu("direction", "travel", "forward"),
      num("cm", 20), text("cm at"), num("speed", 50), text("%"),
    ], { hidden: true }),
    move_rot: block("move", "stack", [
      text("move"), menu("direction", "travel", "forward"),
      num("rotations", 1), text("rotations at"), num("speed", 50), text("%"),
    ], { hidden: true }),
    turn_deg: block("move", "stack", [
      text("turn"), menu("direction", "turn", "right"),
      num("degrees", 90), text("degrees at"), num("speed", 40), text("%"),
    ], { hidden: true }),
    move_start: block("move", "stack", [
      text("start moving"), menu("direction", "travel", "forward"),
      text("at"), num("speed", 50), text("%"),
    ], { hidden: true }),
    turn_start: block("move", "stack", [
      text("start turning"), menu("direction", "turn", "right"),
      text("at"), num("speed", 40), text("%"),
    ], { hidden: true }),

    light_color: block("light", "stack", [text("set hub light to"), menu("color", "colors", "green")]),
    matrix_image: block("light", "stack", [text("show"), menu("image", "images", "happy"), text("on light matrix")]),
    matrix_pixel: block("light", "stack", [
      text("set pixel row"), menu("row", "pixels", "0"),
      text("column"), menu("col", "pixels", "0"),
      text("to"), num("brightness", 100), text("%"),
    ]),
    matrix_clear: block("light", "stack", [text("clear light matrix")]),
    matrix_write: block("light", "stack", [text("write"), word("TEXT", "Hi"), text("on light matrix")]),

    sound_beep: block("sound", "stack", [
      text("play note"), num("freq", 440), text("Hz for"), num("seconds", 0.2), text("seconds"),
    ]),
    sound_stop: block("sound", "stack", [text("stop sounds")]),

    sense_set: block("sense", "stack", [
      text("set distance"), menu("distance", "ports", "D"),
      text("color"), menu("color", "ports", "C"),
      text("press"), menu("press", "ports", "E"),
    ]),
    event_distance: block("sense", "hat", [
      text("when distance cm"), menu("op", "compare", "<"), num("VALUE", 15),
    ]),
    event_color: block("sense", "hat", [text("when color is"), menu("color", "colors", "red")]),
    event_reflection: block("sense", "hat", [
      text("when reflected light"), menu("op", "compare", "<"), num("VALUE", 50),
    ]),
    event_press: block("sense", "hat", [text("when press sensor pressed")]),
    rep_distance: block("sense", "reporter", [text("distance cm")]),
    rep_color: block("sense", "reporter", [text("color")]),
    rep_reflection: block("sense", "reporter", [text("reflected light")]),
    rep_force: block("sense", "reporter", [text("press sensor N")]),
    rep_pitch: block("sense", "reporter", [text("pitch")]),
    rep_roll: block("sense", "reporter", [text("roll")]),
    rep_timer: block("sense", "reporter", [text("timer")]),
    bool_pressed: block("sense", "boolean", [text("press sensor pressed")]),
    bool_button: block("sense", "boolean", [text("hub button pressed")]),
    bool_distance: block("sense", "boolean", [
      text("distance cm"), menu("op", "compare", "<"), num("VALUE", 15),
    ]),
    bool_color: block("sense", "boolean", [text("color is"), menu("color", "colors", "red")]),
    bool_reflection: block("sense", "boolean", [
      text("reflected light"), menu("op", "compare", "<"), num("VALUE", 50),
    ]),

    ctrl_wait: block("control", "stack", [text("wait"), num("seconds", 1), text("seconds")]),
    ctrl_wait_until: block("control", "stack", [text("wait until"), bool("COND")]),
    ctrl_repeat: block("control", "c", [text("repeat"), num("times", 10)], {
      branches: [{ key: "DO" }],
    }),
    ctrl_forever: block("control", "c", [text("forever")], { branches: [{ key: "DO" }] }),
    ctrl_repeat_until: block("control", "c", [text("repeat until"), bool("COND")], {
      branches: [{ key: "DO" }],
    }),
    ctrl_if: block("control", "c", [text("if"), bool("COND")], { branches: [{ key: "DO" }] }),
    ctrl_if_else: block("control", "c", [text("if"), bool("COND")], {
      branches: [{ key: "DO" }, { key: "ELSE", label: "else" }],
    }),
    ctrl_stop: block("control", "stack", [text("stop"), menu("mode", "stop", "stack")]),

    op_add: block("ops", "reporter", [num("A", 0), text("+"), num("B", 0)]),
    op_sub: block("ops", "reporter", [num("A", 0), text("−"), num("B", 0)]),
    op_mul: block("ops", "reporter", [num("A", 0), text("×"), num("B", 0)]),
    op_div: block("ops", "reporter", [num("A", 0), text("÷"), num("B", 1)]),
    op_random: block("ops", "reporter", [text("pick random"), num("A", 1), text("to"), num("B", 10)]),
    op_round: block("ops", "reporter", [text("round"), num("A", 1.5)]),
    op_compare: block("ops", "boolean", [num("A", 0), menu("op", "compare", ">"), num("B", 50)]),
    op_and: block("ops", "boolean", [bool("A"), text("and"), bool("B")]),
    op_or: block("ops", "boolean", [bool("A"), text("or"), bool("B")]),
    op_not: block("ops", "boolean", [text("not"), bool("A")]),

    var_set: block("vars", "stack", [text("set"), menu("name", "variables", "count"), text("to"), word("VALUE", "0")]),
    var_change: block("vars", "stack", [text("change"), menu("name", "variables", "count"), text("by"), num("VALUE", 1)]),
    var_get: block("vars", "reporter", [menu("name", "variables", "count")]),
    show_value: block("vars", "stack", [text("show"), word("VALUE", "Hello")]),

    event_predict: block("learn", "hat", [text("when prediction is"), menu("classId", "classes", "obstacle")]),
    ml_predict: block("learn", "reporter", [text("prediction")]),
    ml_confidence: block("learn", "reporter", [text("confidence %")]),
    bool_predict: block("learn", "boolean", [text("prediction is"), menu("classId", "classes", "obstacle")]),
  };

  const MENU_LISTS = {
    ports: [["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"], ["E", "E"], ["F", "F"]],
    spin: [["cw", "clockwise"], ["ccw", "counterclockwise"]],
    path: [["short", "shortest path"], ["cw", "clockwise"], ["ccw", "counterclockwise"]],
    motorUnit: [["rotations", "rotations"], ["degrees", "degrees"], ["seconds", "seconds"]],
    moveUnit: [["cm", "cm"], ["in", "inches"], ["rotations", "rotations"], ["degrees", "degrees"], ["seconds", "seconds"]],
    halt: [["brake", "brake"], ["hold", "hold"], ["coast", "coast"]],
    heading: [["forward", "forward"], ["back", "backward"]],
    travel: [["forward", "forward"], ["back", "back"]],
    turn: [["right", "right"], ["left", "left"]],
    compare: [["<", "<"], [">", ">"], ["=", "="]],
    stop: [["stack", "this stack"], ["all", "all"]],
    pixels: [["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]],
    colors: [
      ["black", "black"], ["violet", "violet"], ["blue", "blue"], ["azure", "azure"],
      ["green", "green"], ["yellow", "yellow"], ["red", "red"], ["white", "white"], ["orange", "orange"],
    ],
    images: [
      ["happy", "happy"], ["smile", "smile"], ["sad", "sad"], ["heart", "heart"],
      ["yes", "yes"], ["no", "no"], ["arrow_n", "arrow up"], ["arrow_e", "arrow right"], ["square", "square"],
    ],
  };

  function menuOptions(key) {
    if (key === "variables") {
      const names = (root.HM.project && root.HM.project.variables) || ["count"];
      const list = names.length ? names : ["count"];
      return list.map((name) => [name, name]);
    }
    if (key === "classes") {
      const classes = (root.HM.project && root.HM.project.ml && root.HM.project.ml.classes) || [];
      if (!classes.length) return [["obstacle", "obstacle"]];
      return classes.map((item) => [item.id, item.name]);
    }
    return MENU_LISTS[key] || [];
  }

  function collectDefaults(parts, fields) {
    (parts || []).forEach((part) => {
      if (part.field) fields[part.field] = part.default;
      if (part.input && part.fallback !== undefined) fields[part.input] = part.fallback;
    });
  }

  function makeBlock(opcode) {
    const def = CATALOG[opcode];
    if (!def) throw new Error("Unknown block " + opcode);
    const fields = {};
    collectDefaults(def.parts, fields);
    const branches = {};
    (def.branches || []).forEach((branch) => {
      branches[branch.key] = [];
    });
    return {
      id: root.HM.uid("b"),
      opcode,
      fields,
      inputs: {},
      branches,
    };
  }

  return { CATEGORIES, CATALOG, menuOptions, makeBlock };
});

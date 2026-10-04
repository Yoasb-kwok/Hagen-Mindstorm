import { createRequire } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
require("../js/util.js");
require("../js/ble.js");

const HM = globalThis.HM;

test("SPIKE frames round-trip and match the published encoder", () => {
  const samples = [
    new Uint8Array([0x00]),
    new Uint8Array([0, 1, 2, 3, 255, 10]),
    new TextEncoder().encode("import runloop\nprint('hi')\n"),
    Uint8Array.from({ length: 90 }, (_, i) => i),
  ];
  const packed = [
    [0, 0, 2],
    [0, 84, 168, 5, 0, 252, 9, 2],
    [29, 106, 110, 115, 108, 113, 119, 35, 113, 118, 109, 111, 108, 108, 115, 9, 115, 113, 106, 109, 119, 43, 36, 107, 106, 36, 42, 9, 2],
    [0, 84, 168, 252, 0, 7, 6, 5, 4, 11, 10, 9, 8, 15, 14, 13, 12, 19, 18, 17, 16, 23, 22, 21, 20, 27, 26, 25, 24, 31, 30, 29, 28, 35, 34, 33, 32, 39, 38, 37, 36, 43, 42, 41, 40, 47, 46, 45, 44, 51, 50, 49, 48, 55, 54, 53, 52, 59, 58, 57, 56, 63, 62, 61, 60, 67, 66, 65, 64, 71, 70, 69, 68, 75, 74, 73, 72, 79, 78, 77, 76, 83, 82, 81, 80, 87, 86, 85, 5, 84, 91, 90, 2],
  ];
  samples.forEach((sample, index) => {
    const frame = HM.hub.pack(sample);
    if (packed[index]) assert.deepEqual(Array.from(frame), packed[index]);
    assert.deepEqual(Array.from(HM.hub.unpack(frame)), Array.from(sample));
  });
});

test("CRC matches the SPIKE file checksum", () => {
  assert.equal(HM.hub.crc32Aligned(new TextEncoder().encode("hello"), 0), 4279481629);
  assert.equal(HM.hub.crc32Aligned(new TextEncoder().encode("program.py\n"), 0), 585128109);
});

test("device notifications decode distance, color, and force", () => {
  const payload = new Uint8Array([
    0x0d, 3, 150, 0,
    0x0c, 2, 9, 0, 4, 0, 1, 0, 0,
    0x0b, 4, 40, 1,
  ]);
  const found = HM.hub.parseDevices(payload);
  assert.equal(found[0].port, "D");
  assert.equal(found[0].distance, 15);
  assert.equal(found[1].color, "red");
  assert.equal(found[1].port, "C");
  assert.equal(found[2].force, 4);
  assert.equal(found[2].pressed, true);
});

test("a hub message names the motor or sensor on each port", () => {
  const sensors = HM.hub.parseDevices(new Uint8Array([
    0x0d, 5, 200, 0,
    0x0c, 0, 3, 0, 0, 0, 0, 0, 0,
    0x0b, 1, 10, 0,
  ]));
  const layout = HM.hub.deviceLayout(sensors);
  assert.equal(layout.F, "distance");
  assert.equal(layout.A, "color");
  assert.equal(layout.B, "force");
  const assigned = HM.hub.assignPorts(layout, { distance: "D", color: "C", press: "E" }, { left: "A", right: "B" });
  assert.deepEqual(assigned.sense, { distance: "F", color: "A", press: "B" });

  const motorPayload = new Uint8Array(24);
  motorPayload[0] = 0x0a;
  motorPayload[1] = 2;
  motorPayload[12] = 0x0a;
  motorPayload[13] = 3;
  const motors = HM.hub.deviceLayout(HM.hub.parseDevices(motorPayload));
  assert.deepEqual(motors, { C: "motor", D: "motor" });
  const pair = HM.hub.assignPorts(motors, { distance: "D", color: "C", press: "E" }, { left: "A", right: "B" });
  assert.deepEqual(pair.motors, ["C", "D"]);
  assert.deepEqual(pair.motion, { left: "C", right: "D" });
});

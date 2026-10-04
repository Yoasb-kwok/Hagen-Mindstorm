(function (root, factory) {
  const api = factory(root);
  root.HM = Object.assign(root.HM || {}, api);
  if (typeof module === "object" && module != null && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const HM = root.HM;
  const SERVICE = "0000fd02-0000-1000-8000-00805f9b34fb";
  const RX = "0000fd02-0001-1000-8000-00805f9b34fb";
  const TX = "0000fd02-0002-1000-8000-00805f9b34fb";
  const DELIMITER = 0x02;
  const MAX_BLOCK = 84;
  const XOR = 3;
  const SLOT = 0;
  const PORTS = ["A", "B", "C", "D", "E", "F"];
  const HUB_COLOR = [
    ["black", 1, "#1c1c1c"],
    ["violet", 2, "#7a3e9d"],
    ["violet", 2, "#7a3e9d"],
    ["blue", 3, "#2a4bdb"],
    ["azure", 4, "#3db7e0"],
    ["azure", 4, "#3db7e0"],
    ["green", 5, "#3aaa45"],
    ["yellow", 6, "#f2c230"],
    ["yellow", 6, "#e09020"],
    ["red", 7, "#d64545"],
    ["white", 8, "#f4f4f4"],
  ];

  function crc32(data, seed) {
    let c = ((seed || 0) ^ 0xffffffff) >>> 0;
    for (let i = 0; i < data.length; i++) {
      c ^= data[i];
      for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function crc32Aligned(data, seed) {
    const extra = data.length % 4;
    if (!extra) return crc32(data, seed);
    const padded = new Uint8Array(data.length + (4 - extra));
    padded.set(data);
    return crc32(padded, seed);
  }

  function encodeCobs(data) {
    const buffer = [];
    let codeIndex = 0;
    let block = 0;
    function beginBlock() {
      codeIndex = buffer.length;
      buffer.push(0xff);
      block = 1;
    }
    beginBlock();
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      if (byte > DELIMITER) {
        buffer.push(byte);
        block += 1;
      }
      if (byte <= DELIMITER || block > MAX_BLOCK) {
        if (byte <= DELIMITER) buffer[codeIndex] = byte * MAX_BLOCK + block + DELIMITER;
        beginBlock();
      }
    }
    buffer[codeIndex] = block + DELIMITER;
    return buffer;
  }

  function decodeCobs(data) {
    const buffer = [];
    function unescape(code) {
      if (code === 0xff) return [null, MAX_BLOCK + 1];
      let value = Math.floor((code - DELIMITER) / MAX_BLOCK);
      let block = (code - DELIMITER) % MAX_BLOCK;
      if (block === 0) {
        block = MAX_BLOCK;
        value -= 1;
      }
      return [value, block];
    }
    let pair = unescape(data[0]);
    let value = pair[0];
    let block = pair[1];
    for (let i = 1; i < data.length; i++) {
      block -= 1;
      if (block > 0) {
        buffer.push(data[i]);
        continue;
      }
      if (value != null) buffer.push(value);
      pair = unescape(data[i]);
      value = pair[0];
      block = pair[1];
    }
    return new Uint8Array(buffer);
  }

  function pack(data) {
    const encoded = encodeCobs(data);
    const frame = new Uint8Array(encoded.length + 1);
    for (let i = 0; i < encoded.length; i++) frame[i] = encoded[i] ^ XOR;
    frame[encoded.length] = DELIMITER;
    return frame;
  }

  function unpack(frame) {
    let start = 0;
    if (frame[0] === 0x01) start = 1;
    const body = new Uint8Array(frame.length - start - 1);
    for (let i = 0; i < body.length; i++) body[i] = frame[start + i] ^ XOR;
    return decodeCobs(body);
  }

  function u16(view, offset) {
    return view.getUint16(offset, true);
  }
  function i16(view, offset) {
    return view.getInt16(offset, true);
  }

  function parseDevices(payload) {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const found = [];
    let offset = 0;
    while (offset < payload.length) {
      const kind = payload[offset];
      if (kind === 0x00 && offset + 2 <= payload.length) {
        found.push({ kind: "battery", percent: payload[offset + 1] });
        offset += 2;
      } else if (kind === 0x01 && offset + 21 <= payload.length) {
        found.push({
          kind: "imu",
          pitch: i16(view, offset + 5) / 10,
          roll: i16(view, offset + 7) / 10,
        });
        offset += 21;
      } else if (kind === 0x02 && offset + 26 <= payload.length) {
        found.push({ kind: "matrix", pixels: payload.slice(offset + 1, offset + 26) });
        offset += 26;
      } else if (kind === 0x0a && offset + 12 <= payload.length) {
        found.push({ kind: "motor", port: PORTS[payload[offset + 1]] || "?" });
        offset += 12;
      } else if (kind === 0x0b && offset + 4 <= payload.length) {
        found.push({
          kind: "force",
          port: PORTS[payload[offset + 1]] || "?",
          force: payload[offset + 2] / 10,
          pressed: payload[offset + 3] === 1,
        });
        offset += 4;
      } else if (kind === 0x0c && offset + 9 <= payload.length) {
        const code = view.getInt8(offset + 2);
        const named = code >= 0 && code < HUB_COLOR.length ? HUB_COLOR[code] : ["none", 0, "#888888"];
        const red = u16(view, offset + 3);
        const green = u16(view, offset + 5);
        const blue = u16(view, offset + 7);
        found.push({
          kind: "color",
          port: PORTS[payload[offset + 1]] || "?",
          color: named[0],
          colorId: named[1],
          fill: named[2],
          reflection: Math.round(((red + green + blue) / 3) / 1023 * 100),
        });
        offset += 9;
      } else if (kind === 0x0d && offset + 4 <= payload.length) {
        const mm = i16(view, offset + 2);
        found.push({
          kind: "distance",
          port: PORTS[payload[offset + 1]] || "?",
          mm: mm,
          distance: mm < 0 ? null : mm / 10,
        });
        offset += 4;
      } else if (kind === 0x0e && offset + 11 <= payload.length) {
        offset += 11;
      } else break;
    }
    return found;
  }

  function messageOf(bytes) {
    if (!bytes.length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const id = bytes[0];
    if (id === 0x01 && bytes.length >= 17) {
      return {
        id: id,
        maxPacket: u16(view, 9),
        maxChunk: u16(view, 13),
        firmware: bytes[5] + "." + bytes[6] + "." + u16(view, 7),
      };
    }
    if (id === 0x0d || id === 0x11 || id === 0x1f || id === 0x29 || id === 0x47) {
      return { id: id, ok: bytes[1] === 0 };
    }
    if (id === 0x20) return { id: id, stop: bytes[1] === 1 };
    if (id === 0x21) {
      let end = bytes.length;
      while (end > 1 && bytes[end - 1] === 0) end -= 1;
      return { id: id, text: new TextDecoder().decode(bytes.subarray(1, end)) };
    }
    if (id === 0x3c && bytes.length >= 3) {
      const size = u16(view, 1);
      return { id: id, devices: parseDevices(bytes.subarray(3, 3 + size)) };
    }
    return { id: id };
  }

  function leBytes(length) {
    const bytes = new Uint8Array(length);
    return { bytes: bytes, view: new DataView(bytes.buffer) };
  }

  const hub = {
    connected: false,
    name: "",
    sending: false,
    programRunning: false,
    sensors: null,
    reading: null,
    ports: {},
    imu: null,
    pack: pack,
    unpack: unpack,
    crc32Aligned: crc32Aligned,
    photoFollow: false,
    photoAction: "",
    quietStop: false,
    parseDevices: parseDevices,
    liveSense: liveSense,
    deviceLayout: deviceLayout,
    freshPorts: freshPorts,
    assignPorts: assignPorts,
    messageOf: messageOf,
  };

  let device = null;
  let rx = null;
  let info = null;
  let buffer = [];
  let pending = null;
  let generation = 0;

  function setButton() {
    const button = document.getElementById("hub-connect");
    if (!button) return;
    button.classList.toggle("is-hub", hub.connected);
    button.textContent = hub.connected ? (hub.name || "Hub") : "Hub";
    button.title = hub.connected
      ? "Disconnect " + (hub.name || "the hub")
      : "Connect a SPIKE Prime hub. Turn it on, then pick it in the browser list. Chrome or Edge, on this computer.";
  }

  function fail(error) {
    const message = error && error.message ? error.message : "The hub did not answer.";
    if (HM.toast) HM.toast(message);
    if (HM.log) HM.log(message);
  }

  function waitFor(id, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending && pending.id === id) pending = null;
        reject(new Error("The hub did not answer."));
      }, ms || 8000);
      pending = {
        id: id,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      };
    });
  }

  function onMessage(message) {
    if (!message) return;
    if (pending && pending.id === message.id) {
      const waiter = pending;
      pending = null;
      waiter.resolve(message);
    }
    if (message.id === 0x21 && message.text && HM.log) HM.log(message.text);
    if (message.id === 0x20 && message.stop) {
      if (hub.quietStop) return;
      hub.programRunning = false;
      hub.photoFollow = false;
      hub.sending = false;
      if (HM.setRunning) HM.setRunning(false);
      if (HM.log) HM.log("Program finished on the hub");
    }
    if (message.id === 0x3c) applyDevices(message.devices);
  }

  function liveSense() {
    const want = HM.configuredSense ? HM.configuredSense() : { distance: "D", color: "C", press: "E" };
    const ports = hub.ports || {};
    const distance = ports[want.distance];
    const color = ports[want.color];
    const press = ports[want.press];
    const imu = hub.imu;
    const reading = {
      distance: 200,
      reflection: 0,
      color: 0,
      force: 0,
      pitch: imu ? imu.pitch : 0,
      roll: imu ? imu.roll : 0,
    };
    const sensors = {
      distance: null,
      color: "none",
      fill: "#888888",
      reflection: 0,
      force: 0,
      pitch: reading.pitch,
      roll: reading.roll,
    };
    if (distance && distance.kind === "distance") {
      sensors.distance = distance.distance;
      reading.distance = distance.mm < 0 ? 200 : distance.mm / 10;
    }
    if (color && color.kind === "color") {
      sensors.color = color.color;
      sensors.fill = color.fill;
      sensors.reflection = color.reflection;
      reading.color = color.colorId;
      reading.reflection = color.reflection;
    }
    if (press && press.kind === "force") {
      sensors.force = press.force;
      sensors.pressed = !!press.pressed;
      reading.force = press.force;
    }
    return { sensors: sensors, reading: reading };
  }

  function applyDevices(devices) {
    if (!devices) return;
    if (!hub.ports) hub.ports = {};
    const now = Date.now();
    devices.forEach((item) => {
      if (item.port) {
        item.seen = now;
        hub.ports[item.port] = item;
      }
      if (item.kind === "imu") hub.imu = item;
      if (item.kind === "matrix" && HM.matrix && item.pixels) {
        for (let i = 0; i < 25; i++) HM.matrix[i] = item.pixels[i] || 0;
      }
    });
    const live = liveSense();
    hub.sensors = live.sensors;
    hub.reading = live.reading;
    HM.lastReading = live.reading;
    if (HM.syncHubPorts) HM.syncHubPorts();
  }

  function deviceLayout(devices) {
    const layout = {};
    (devices || []).forEach((item) => {
      if (!item || !item.port || item.port === "?") return;
      if (item.kind === "motor" || item.kind === "distance" || item.kind === "color" || item.kind === "force") {
        if (!layout[item.port]) layout[item.port] = item.kind;
      }
    });
    return layout;
  }

  function freshPorts() {
    const now = Date.now();
    const list = [];
    PORTS.forEach((letter) => {
      const item = hub.ports[letter];
      if (!item || !item.seen || now - item.seen > 4000) return;
      if (item.kind !== "motor" && item.kind !== "distance" && item.kind !== "color" && item.kind !== "force") return;
      list.push({ port: letter, kind: item.kind });
    });
    return list;
  }

  function assignPorts(layout, sense, motion) {
    const nextSense = {
      distance: (sense && sense.distance) || "D",
      color: (sense && sense.color) || "C",
      press: (sense && sense.press) || "E",
    };
    const motors = [];
    const claimed = {};
    PORTS.forEach((letter) => {
      const kind = layout[letter];
      if (kind === "motor") motors.push(letter);
      if (kind === "distance" && !claimed.distance) {
        nextSense.distance = letter;
        claimed.distance = true;
      }
      if (kind === "color" && !claimed.color) {
        nextSense.color = letter;
        claimed.color = true;
      }
      if (kind === "force" && !claimed.press) {
        nextSense.press = letter;
        claimed.press = true;
      }
    });
    const nextMotion = {
      left: (motion && motion.left) || "A",
      right: (motion && motion.right) || "B",
    };
    if (motors.length === 1) nextMotion.left = motors[0];
    else if (motors.length >= 2) {
      nextMotion.left = motors[0];
      nextMotion.right = motors[1];
    }
    return { sense: nextSense, motion: nextMotion, motors: motors };
  }

  function takeFrames(chunk) {
    for (let i = 0; i < chunk.length; i++) buffer.push(chunk[i]);
    let end = buffer.indexOf(DELIMITER);
    while (end >= 0) {
      const frame = new Uint8Array(buffer.slice(0, end + 1));
      buffer = buffer.slice(end + 1);
      try {
        onMessage(messageOf(unpack(frame)));
      } catch (err) {
        if (HM.log) HM.log("Hub message could not be read.");
      }
      end = buffer.indexOf(DELIMITER);
    }
    if (buffer.length > 8192) buffer = [];
  }

  async function writeFrame(frame) {
    const size = Math.max(20, Math.min((info && info.maxPacket) || frame.length, 244));
    const write = rx.properties && rx.properties.writeWithoutResponse === false
      ? (slice) => rx.writeValue(slice)
      : (slice) => rx.writeValueWithoutResponse(slice);
    for (let offset = 0; offset < frame.length; offset += size) {
      await write(frame.subarray(offset, offset + size));
    }
  }

  async function request(bytes, responseId) {
    const waiting = waitFor(responseId);
    await writeFrame(pack(bytes));
    return waiting;
  }

  async function connect() {
    if (!navigator.bluetooth) {
      HM.toast("Bluetooth needs Chrome or Edge on this computer.");
      return;
    }
    let picked;
    try {
      picked = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE] }],
        optionalServices: [SERVICE],
      });
    } catch (err) {
      if (err && err.name === "NotFoundError") return;
      fail(err);
      return;
    }
    try {
      const server = await picked.gatt.connect();
      const service = await server.getPrimaryService(SERVICE);
      rx = await service.getCharacteristic(RX);
      const tx = await service.getCharacteristic(TX);
      buffer = [];
      info = null;
      device = picked;
      device.addEventListener("gattserverdisconnected", onDisconnect);
      await tx.startNotifications();
      tx.addEventListener("characteristicvaluechanged", (event) => {
        const view = event.target.value;
        takeFrames(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      });
      info = await request(new Uint8Array([0x00]), 0x01);
      const notes = leBytes(3);
      notes.bytes[0] = 0x28;
      notes.view.setUint16(1, 250, true);
      const enabled = await request(notes.bytes, 0x29);
      if (!enabled.ok) throw new Error("The hub did not start sensor updates.");
      hub.connected = true;
      hub.name = picked.name || "SPIKE hub";
      hub.sensors = null;
      hub.ports = {};
      hub.imu = null;
      setButton();
      HM.log("Connected to " + hub.name);
      HM.toast("Connected to " + hub.name + ". Run sends this program to slot 0.");
    } catch (err) {
      if (picked && picked.gatt.connected) picked.gatt.disconnect();
      device = null;
      rx = null;
      fail(err);
    }
  }

  function onDisconnect() {
    hub.connected = false;
    hub.sending = false;
    hub.programRunning = false;
    hub.photoFollow = false;
    hub.photoAction = "";
    hub.sensors = null;
    hub.ports = {};
    hub.imu = null;
    if (HM.syncHubPorts) HM._hubPortSignature = "";
    if (HM.describePorts) HM.describePorts();
    device = null;
    rx = null;
    info = null;
    pending = null;
    generation += 1;
    setButton();
    if (HM.setRunning) HM.setRunning(!!HM.running);
    if (HM.log) HM.log("Hub disconnected");
  }

  function disconnect() {
    generation += 1;
    if (device && device.gatt.connected) device.gatt.disconnect();
    else onDisconnect();
  }

  async function stopProgram() {
    if (!hub.connected || !rx) return;
    generation += 1;
    hub.sending = false;
    const bytes = new Uint8Array([0x1e, 1, SLOT]);
    try {
      await request(bytes, 0x1f);
    } catch (err) {
      fail(err);
    }
    hub.programRunning = false;
    hub.photoFollow = false;
    if (HM.setRunning) HM.setRunning(!!HM.running);
    if (HM.log) HM.log("Stop sent to the hub");
  }

  function photoName() {
    if (!HM.project || !HM.project.ml || HM.project.ml.mode !== "images") return null;
    const prediction = HM.lastPrediction;
    if (!prediction || !prediction.ready || !prediction.classId) return "";
    const found = (HM.project.ml.classes || []).find((item) => item.id === prediction.classId);
    return found && found.name ? String(found.name).replace(/[\r\n]/g, "").trim().slice(0, 32) : "";
  }

  async function uploadBytes(slot, bytes, token, startProgram) {
    const cleared = await request(new Uint8Array([0x46, slot]), 0x47);
    if (token !== generation) return false;
    if (!cleared.ok && slot === SLOT) HM.log("Slot 0 was empty. Continuing.");
    const name = new TextEncoder().encode("program.py");
    const start = new Uint8Array(1 + name.length + 1 + 1 + 4);
    const startView = new DataView(start.buffer);
    const whole = crc32Aligned(bytes, 0);
    start[0] = 0x0c;
    start.set(name, 1);
    start[name.length + 2] = slot;
    startView.setUint32(name.length + 3, whole, true);
    const opened = await request(start, 0x0d);
    if (!opened.ok) throw new Error(slot === SLOT ? "The hub refused the program." : "The hub refused the photo class.");
    const chunkSize = Math.max(16, info.maxChunk || 64);
    let running = 0;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      if (token !== generation) return false;
      const chunk = bytes.subarray(offset, offset + chunkSize);
      running = crc32Aligned(chunk, running);
      const packet = leBytes(7 + chunk.length);
      packet.bytes[0] = 0x10;
      packet.view.setUint32(1, running, true);
      packet.view.setUint16(5, chunk.length, true);
      packet.bytes.set(chunk, 7);
      const sent = await request(packet.bytes, 0x11);
      if (!sent.ok) throw new Error("A piece of the program did not arrive.");
    }
    if (!startProgram) return true;
    const started = await request(new Uint8Array([0x1e, 0, slot]), 0x1f);
    if (!started.ok) throw new Error("The hub did not start the program.");
    return token === generation;
  }

  function hushStop() {
    hub.quietStop = true;
    if (hub.quietTimer) clearTimeout(hub.quietTimer);
    hub.quietTimer = setTimeout(() => { hub.quietStop = false; }, 1200);
  }

  function followPhoto() {
    if (!hub.photoFollow || !hub.connected || hub.sending) return;
    const name = photoName();
    if (!name || name === hub.photoAction || name === hub.photoCandidate) return;
    hub.photoCandidate = name;
    if (hub.photoTimer) clearTimeout(hub.photoTimer);
    hub.photoTimer = setTimeout(() => {
      hub.photoTimer = null;
      const chosen = photoName();
      hub.photoCandidate = "";
      if (!hub.photoFollow || !chosen || chosen === hub.photoAction || chosen !== name) return;
      launchPhotoAction(chosen);
    }, 300);
  }

  async function launchPhotoAction(name) {
    if (!hub.connected || !rx || hub.sending || !HM.generatePython) return;
    const source = HM.generatePython(HM.project, { photoText: name });
    if (!source) return;
    const token = ++generation;
    hub.sending = true;
    hub.programRunning = true;
    hushStop();
    HM.log("Camera sees " + name + ". That when stack runs once, then every when block keeps watching.");
    try {
      const stored = await uploadBytes(SLOT, new TextEncoder().encode(source), token, true);
      if (!stored || token !== generation) return;
      hub.photoAction = name;
      hub.sending = false;
      hushStop();
      if (HM.setRunning) HM.setRunning(true);
    } catch (err) {
      hub.sending = false;
      if (token === generation) fail(err);
    }
  }

  async function runCurrent() {
    if (!hub.connected || !rx) {
      HM.toast("Connect the hub first.");
      return;
    }
    if (hub.sending) return;
    const preview = HM.generatePython(HM.project);
    const photo = !!(HM.project && HM.project.ml && HM.project.ml.mode === "images" && preview.indexOf("_photo_text") >= 0);
    const seen = photo ? (photoName() || "") : "";
    hub.photoFollow = photo;
    hub.photoAction = seen;
    hub.photoCandidate = "";
    const source = photo && seen ? HM.generatePython(HM.project, { photoText: seen }) : preview;
    if (photo) {
      HM.toast("When blocks keep watching. Each stack runs once when its class appears. Switch class and the other stack runs.");
    } else if (source.indexOf("class Learner") >= 0) {
      HM.toast("The hub will vote with the sensor samples from the Learn lab.");
    }
    const token = ++generation;
    hub.sending = true;
    hub.programRunning = true;
    if (HM.setRunning) HM.setRunning(true);
    if (HM.clearConsole) HM.clearConsole();
    HM.log("Uploading to " + (hub.name || "the hub") + ", slot 0");
    try {
      if (photo && HM.vision) HM.vision.arm();
      hushStop();
      const file = new TextEncoder().encode(source);
      const stored = await uploadBytes(SLOT, file, token, true);
      if (!stored || token !== generation) return;
      hub.sending = false;
      const run = document.getElementById("run");
      const stop = document.getElementById("stop");
      if (run) run.disabled = false;
      if (stop) stop.disabled = false;
      HM.log(photo ? "Program started on the hub. When blocks keep watching." : "Program started on the hub");
      if (photo) followPhoto();
    } catch (err) {
      hub.sending = false;
      hub.programRunning = false;
      hub.photoFollow = false;
      if (HM.setRunning) HM.setRunning(!!HM.running);
      if (token === generation) fail(err);
    }
  }

  function mount() {
    const button = document.getElementById("hub-connect");
    if (!button) return;
    button.addEventListener("click", () => {
      if (hub.connected) disconnect();
      else connect();
    });
    setButton();
  }

  hub.connect = connect;
  hub.disconnect = disconnect;
  hub.runCurrent = runCurrent;
  hub.stopProgram = stopProgram;
  hub.mount = mount;
  hub.followPhoto = followPhoto;

  return { hub: hub };
});

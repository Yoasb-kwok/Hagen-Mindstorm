(function (root, factory) {
  const api = factory(root);
  root.HM = Object.assign(root.HM || {}, api);
  if (typeof module === "object" && module != null && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const HM = root.HM;
  let stream = null;
  let facing = "environment";
  let sampleCanvas = null;
  let lastGuessAt = 0;

  function videoEl() {
    return document.getElementById("camera-preview");
  }

  function setStatus(message) {
    const el = document.getElementById("camera-status");
    if (el) el.textContent = message;
  }

  function setGuess(message) {
    const el = document.getElementById("photo-guess");
    if (el) el.textContent = message;
  }

  function sourceSize(source) {
    return {
      width: source.videoWidth || source.naturalWidth || source.width || 0,
      height: source.videoHeight || source.naturalHeight || source.height || 0,
    };
  }

  function drawSource(source, maxSide) {
    const size = sourceSize(source);
    if (!size.width || !size.height) return null;
    const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
    const canvas = sampleCanvas || (sampleCanvas = document.createElement("canvas"));
    canvas.width = Math.max(1, Math.round(size.width * scale));
    canvas.height = Math.max(1, Math.round(size.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function featuresFromSource(source) {
    const canvas = drawSource(source, 64);
    if (!canvas) return null;
    const data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    return HM.featuresFromPixels(data.data, canvas.width, canvas.height);
  }

  function thumbFromSource(source) {
    const size = sourceSize(source);
    if (!size.width || !size.height) return "";
    const canvas = document.createElement("canvas");
    const edge = 72;
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext("2d");
    const scale = Math.max(edge / size.width, edge / size.height);
    const dw = size.width * scale;
    const dh = size.height * scale;
    ctx.drawImage(source, (edge - dw) / 2, (edge - dh) / 2, dw, dh);
    return canvas.toDataURL("image/jpeg", 0.62);
  }

  function chosenClass() {
    const chosen = document.querySelector("input[name=lab-class]:checked");
    return (chosen && chosen.value) || HM.activeClass || (HM.project.ml.classes[0] && HM.project.ml.classes[0].id);
  }

  function remember(features, thumb) {
    const classId = chosenClass();
    if (!classId) {
      HM.toast("Add a class and select it before adding photos.");
      return;
    }
    const backup = HM.serialize();
    HM.project.ml.samples.push({
      id: HM.uid("sample"),
      classId,
      kind: "image",
      features,
      thumb,
    });
    const images = HM.imageSamples(HM.project.ml.samples);
    if (images.length > 180) {
      const oldest = images[0];
      HM.project.ml.samples = HM.project.ml.samples.filter((sample) => sample.id !== oldest.id);
    }
    HM.project.ml.score = null;
    HM.lastPhotoFeatures = features;
    HM.activeClass = classId;
    HM.pushHistory(backup);
    HM.refresh();
    const item = HM.project.ml.classes.find((cls) => cls.id === classId);
    const count = HM.classPhotoCounts(HM.project.ml.samples, HM.project.ml.classes)[classId] || 0;
    HM.toast((item ? item.name : "Class") + " now has " + count + " of 9 photos.");
  }

  function removeSample(id) {
    const backup = HM.serialize();
    HM.project.ml.samples = HM.project.ml.samples.filter((sample) => sample.id !== id);
    HM.project.ml.score = null;
    HM.pushHistory(backup);
    HM.refresh();
  }

  function commitSource(source) {
    const features = featuresFromSource(source);
    if (!features) {
      HM.toast("That photo could not be read. Use a JPEG or PNG.");
      return;
    }
    remember(features, thumbFromSource(source));
    describe(HM.knnImagePredict(HM.project.ml.samples, features, HM.project.ml.k));
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("unreadable"));
      };
      image.src = url;
    });
  }

  async function addFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    const classId = chosenClass();
    if (!classId) {
      HM.toast("Add a class and select it before adding photos.");
      return;
    }
    const backup = HM.serialize();
    let added = 0;
    let skipped = 0;
    for (let i = 0; i < list.length; i++) {
      try {
        const image = await loadImage(list[i]);
        const features = featuresFromSource(image);
        if (!features) {
          skipped += 1;
          continue;
        }
        HM.project.ml.samples.push({
          id: HM.uid("sample"),
          classId,
          kind: "image",
          features,
          thumb: thumbFromSource(image),
        });
        HM.lastPhotoFeatures = features;
        added += 1;
      } catch (err) {
        skipped += 1;
      }
    }
    if (!added) {
      HM.toast("Those photos could not be read. Use JPEG or PNG.");
      return;
    }
    const images = HM.imageSamples(HM.project.ml.samples);
    while (images.length > 180) {
      const oldest = images.shift();
      HM.project.ml.samples = HM.project.ml.samples.filter((sample) => sample.id !== oldest.id);
    }
    HM.project.ml.score = null;
    HM.activeClass = classId;
    HM.pushHistory(backup);
    HM.refresh();
    const count = HM.classPhotoCounts(HM.project.ml.samples, HM.project.ml.classes)[classId] || 0;
    const item = HM.project.ml.classes.find((cls) => cls.id === classId);
    const name = item ? item.name : "Class";
    HM.toast(name + " now has " + count + " of 9 photos." + (skipped ? " Skipped " + skipped + " unreadable file" + (skipped === 1 ? "" : "s") + "." : ""));
  }

  function cameraLive() {
    const video = videoEl();
    return !!(stream && video && video.readyState >= 2 && video.videoWidth);
  }

  function syncCameraButton() {
    const button = document.getElementById("camera-start");
    if (!button) return;
    button.textContent = stream ? "Stop camera" : "Start camera";
    const video = videoEl();
    if (video) video.classList.toggle("is-mirror", facing === "user" && !!stream);
  }

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("This browser has no live camera. Use Take photo or Upload photos.");
      return false;
    }
    if (!window.isSecureContext) {
      setStatus("Open this studio at http://127.0.0.1:8765/ to use the live camera. Upload still works here.");
    }
    stopTracks();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      const video = videoEl();
      video.srcObject = stream;
      await video.play();
      setStatus("Fill the frame with one object, then take a photo for the selected class.");
      syncCameraButton();
      return true;
    } catch (err) {
      stream = null;
      syncCameraButton();
      setStatus("The live camera is blocked. Take photo opens the device camera, and Upload photos works on every device.");
      return false;
    }
  }

  function stopTracks() {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    const video = videoEl();
    if (video) video.srcObject = null;
  }

  function stop() {
    stopTracks();
    syncCameraButton();
    const dock = document.getElementById("camera-dock");
    if (dock) dock.classList.remove("is-floating");
  }

  function arm() {
    if (!HM.project || HM.project.ml.mode !== "images" || stream) return;
    start();
  }

  function park(open) {
    const dock = document.getElementById("camera-dock");
    const stage = document.getElementById("photo-stage");
    if (!dock || !stage) return;
    if (open) {
      stage.insertBefore(dock, stage.firstChild);
      dock.classList.remove("is-floating");
      return;
    }
    if (stream) {
      document.body.appendChild(dock);
      dock.classList.add("is-floating");
    }
  }

  async function takePhoto() {
    if (cameraLive()) {
      commitSource(videoEl());
      return;
    }
    const input = document.getElementById("photo-capture");
    if (input) input.click();
  }

  function describe(prediction) {
    if (!prediction || !prediction.ready) {
      setGuess("Take or upload at least one photo to see a guess.");
      return;
    }
    const names = {};
    (HM.project.ml.classes || []).forEach((item) => { names[item.id] = item.name; });
    const report = HM.imageReady(HM.project.ml.samples, HM.project.ml.classes);
    const name = names[prediction.classId] || "class";
    const percent = Math.round(prediction.confidence * 100);
    const note = report.ok ? "" : " Train after every class has 9 photos.";
    setGuess("Looks like " + name + " · " + percent + "%." + note);
  }

  function predictFrame(now) {
    if (!HM.project || HM.project.ml.mode !== "images") return;
    const stamp = now || performance.now();
    if (stamp - lastGuessAt < 280) return;
    if (cameraLive()) {
      lastGuessAt = stamp;
      const features = featuresFromSource(videoEl());
      if (!features) return;
      HM.lastPhotoFeatures = features;
      const prediction = HM.knnImagePredict(HM.project.ml.samples, features, HM.project.ml.k);
      HM.lastPrediction = prediction;
      describe(prediction);
      return;
    }
    if (HM.lastPhotoFeatures) {
      lastGuessAt = stamp;
      HM.lastPrediction = HM.knnImagePredict(HM.project.ml.samples, HM.lastPhotoFeatures, HM.project.ml.k);
    }
  }

  function renderGallery() {
    const host = document.getElementById("photo-grid");
    if (!host || !HM.project) return;
    host.innerHTML = "";
    const counts = HM.classPhotoCounts(HM.project.ml.samples, HM.project.ml.classes);
    HM.project.ml.classes.forEach((item) => {
      const photos = HM.imageSamples(HM.project.ml.samples).filter((sample) => sample.classId === item.id);
      if (!photos.length) return;
      const block = document.createElement("section");
      const title = document.createElement("h3");
      title.textContent = item.name + " · " + (counts[item.id] || 0) + "/9";
      block.appendChild(title);
      const row = document.createElement("div");
      row.className = "photo-row";
      photos.forEach((sample) => {
        const card = document.createElement("figure");
        card.className = "photo-card";
        const img = document.createElement("img");
        img.src = sample.thumb || "";
        img.alt = item.name;
        const del = document.createElement("button");
        del.type = "button";
        del.textContent = "×";
        del.setAttribute("aria-label", "Delete " + item.name + " photo");
        del.addEventListener("click", () => removeSample(sample.id));
        card.append(img, del);
        row.appendChild(card);
      });
      block.appendChild(row);
      host.appendChild(block);
    });
  }

  function mount() {
    const startButton = document.getElementById("camera-start");
    const flip = document.getElementById("camera-flip");
    const shot = document.getElementById("camera-shot");
    const uploadButton = document.getElementById("photo-upload-btn");
    const upload = document.getElementById("photo-upload");
    const capture = document.getElementById("photo-capture");
    if (startButton) {
      startButton.addEventListener("click", () => {
        if (stream) stop();
        else start();
      });
    }
    if (flip) {
      flip.addEventListener("click", () => {
        facing = facing === "environment" ? "user" : "environment";
        if (stream) start();
        else setStatus(facing === "user" ? "The next camera start uses the front camera." : "The next camera start uses the back camera.");
      });
    }
    if (shot) shot.addEventListener("click", () => takePhoto());
    if (uploadButton && upload) uploadButton.addEventListener("click", () => upload.click());
    if (upload) {
      upload.addEventListener("change", () => {
        addFiles(upload.files);
        upload.value = "";
      });
    }
    if (capture) {
      capture.addEventListener("change", () => {
        addFiles(capture.files);
        capture.value = "";
      });
    }
    syncCameraButton();
  }

  return {
    vision: {
      mount,
      start,
      stop,
      arm,
      park,
      renderGallery,
      predictFrame,
      addFiles,
    },
  };
});

(function (root, factory) {
  const api = factory();
  root.HM = Object.assign(root.HM || {}, api);
  if (typeof module === "object" && module != null && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FEATURES = [
    { key: "distance", label: "Distance", unit: "cm", max: 200 },
    { key: "reflection", label: "Reflected light", unit: "%", max: 100 },
    { key: "color", label: "Color code", unit: "", max: 8 },
    { key: "force", label: "Force", unit: "N", max: 10 },
    { key: "pitch", label: "Pitch", unit: "°", max: 90 },
    { key: "roll", label: "Roll", unit: "°", max: 90 },
  ];

  function activeKeys(use) {
    return FEATURES.filter((feature) => use && use[feature.key]).map((feature) => feature.key);
  }

  function featureDistance(a, b, keys) {
    let sum = 0;
    for (let i = 0; i < keys.length; i++) {
      const feature = FEATURES.find((item) => item.key === keys[i]);
      const delta = ((Number(a[keys[i]]) || 0) - (Number(b[keys[i]]) || 0)) / feature.max;
      sum += delta * delta;
    }
    return Math.sqrt(sum);
  }

  function knnPredict(samples, reading, k, use) {
    const keys = activeKeys(use);
    const rows = sensorSamples(samples);
    if (!rows.length || !keys.length) {
      return { classId: null, confidence: 0, neighbors: [], ready: false };
    }
    const ranked = rows.map((sample) => ({
      sample,
      d: featureDistance(reading, sample.features, keys),
    }));
    ranked.sort((a, b) => a.d - b.d);
    const take = Math.max(1, Math.min(Number(k) || 1, ranked.length));
    const nearest = ranked.slice(0, take);
    const votes = new Map();
    nearest.forEach((item) => {
      votes.set(item.sample.classId, (votes.get(item.sample.classId) || 0) + 1);
    });
    let bestId = nearest[0].sample.classId;
    let bestCount = 0;
    votes.forEach((count, id) => {
      if (count > bestCount) {
        bestCount = count;
        bestId = id;
      }
    });
    return {
      classId: bestId,
      confidence: bestCount / take,
      neighbors: nearest.map((item) => ({ classId: item.sample.classId, d: item.d })),
      ready: true,
    };
  }

  function sensorSamples(samples) {
    return (samples || []).filter((sample) => sample.features && !Array.isArray(sample.features));
  }

  function looScore(samples, k, use) {
    const rows = sensorSamples(samples);
    if (rows.length < 2 || !activeKeys(use).length) return null;
    let correct = 0;
    for (let i = 0; i < rows.length; i++) {
      const train = rows.filter((_, index) => index !== i);
      const prediction = knnPredict(train, rows[i].features, k, use);
      if (prediction.classId === rows[i].classId) correct += 1;
    }
    return correct / rows.length;
  }

  const IMAGE_GRID = 8;
  const MIN_CLASS_PHOTOS = 9;

  function imageSamples(samples) {
    return (samples || []).filter((sample) => sample.kind === "image" && Array.isArray(sample.features));
  }

  function featuresFromPixels(data, width, height) {
    const grid = IMAGE_GRID;
    const out = [];
    for (let gy = 0; gy < grid; gy++) {
      const y0 = Math.floor(gy * height / grid);
      const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * height / grid));
      for (let gx = 0; gx < grid; gx++) {
        const x0 = Math.floor(gx * width / grid);
        const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * width / grid));
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * width + x) * 4;
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            n += 1;
          }
        }
        out.push(Math.round(r / n), Math.round(g / n), Math.round(b / n));
      }
    }
    return out;
  }

  function imageDistance(a, b) {
    const n = Math.min(a.length, b.length);
    if (!n) return Infinity;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const delta = ((Number(a[i]) || 0) - (Number(b[i]) || 0)) / 255;
      sum += delta * delta;
    }
    return Math.sqrt(sum / n);
  }

  function knnImagePredict(samples, vector, k) {
    const rows = imageSamples(samples);
    if (!rows.length || !vector || !vector.length) {
      return { classId: null, confidence: 0, neighbors: [], ready: false };
    }
    const ranked = rows.map((sample) => ({
      sample,
      d: imageDistance(vector, sample.features),
    }));
    ranked.sort((a, b) => a.d - b.d);
    const take = Math.max(1, Math.min(Number(k) || 1, ranked.length));
    const nearest = ranked.slice(0, take);
    const votes = new Map();
    nearest.forEach((item) => {
      votes.set(item.sample.classId, (votes.get(item.sample.classId) || 0) + 1);
    });
    let bestId = nearest[0].sample.classId;
    let bestCount = 0;
    votes.forEach((count, id) => {
      if (count > bestCount) {
        bestCount = count;
        bestId = id;
      }
    });
    return {
      classId: bestId,
      confidence: bestCount / take,
      neighbors: nearest.map((item) => ({ classId: item.sample.classId, d: item.d })),
      ready: true,
    };
  }

  function imageScore(samples, k) {
    const rows = imageSamples(samples);
    if (rows.length < 2) return null;
    let correct = 0;
    for (let i = 0; i < rows.length; i++) {
      const train = rows.filter((_, index) => index !== i);
      const prediction = knnImagePredict(train, rows[i].features, k);
      if (prediction.classId === rows[i].classId) correct += 1;
    }
    return correct / rows.length;
  }

  function classPhotoCounts(samples, classes) {
    const counts = {};
    (classes || []).forEach((item) => { counts[item.id] = 0; });
    imageSamples(samples).forEach((sample) => {
      counts[sample.classId] = (counts[sample.classId] || 0) + 1;
    });
    return counts;
  }

  function imageReady(samples, classes) {
    const counts = classPhotoCounts(samples, classes);
    const present = (classes || []).filter((item) => counts[item.id] > 0);
    const short = present.filter((item) => counts[item.id] < MIN_CLASS_PHOTOS);
    const ready = present.filter((item) => counts[item.id] >= MIN_CLASS_PHOTOS);
    return { counts, short, ready, ok: ready.length >= 2 && short.length === 0 };
  }

  return {
    FEATURES,
    activeKeys,
    knnPredict,
    looScore,
    IMAGE_GRID,
    MIN_CLASS_PHOTOS,
    featuresFromPixels,
    imageSamples,
    knnImagePredict,
    imageScore,
    classPhotoCounts,
    imageReady,
  };
});

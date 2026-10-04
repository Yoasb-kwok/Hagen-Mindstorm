(function (root, factory) {
  const api = factory();
  root.HM = Object.assign(root.HM || {}, api);
  if (typeof module === "object" && module != null && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function pythonIdent(name) {
    let text = String(name || "value").trim().replace(/[^A-Za-z0-9_]/g, "_");
    if (!text || /^[0-9]/.test(text)) text = "var_" + text;
    return text;
  }

  function roundNum(n) {
    if (!Number.isFinite(n)) return "0";
    const rounded = Math.round(n * 1000) / 1000;
    return String(rounded);
  }

  return { uid, clamp, clone, pythonIdent, roundNum };
});

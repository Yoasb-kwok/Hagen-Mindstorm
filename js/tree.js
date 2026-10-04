(function (root, factory) {
  const api = factory();
  root.HM = Object.assign(root.HM || {}, api);
  if (typeof module === "object" && module != null && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function encodePath(path) {
    return (path || []).join("/");
  }

  function decodePath(text) {
    if (!text) return [];
    return String(text).split("/").map((part, index) => (index % 2 === 0 ? Number(part) : part));
  }

  function sequence(stack, seqPath) {
    let list = stack.blocks;
    for (let i = 0; i < seqPath.length; i += 2) {
      const block = list[seqPath[i]];
      const branch = seqPath[i + 1];
      if (!block || !block.branches || !block.branches[branch]) {
        throw new Error("This block path is out of date.");
      }
      list = block.branches[branch];
    }
    return list;
  }

  function insertAt(stack, seqPath, index, blocks) {
    const list = sequence(stack, seqPath);
    const at = Math.max(0, Math.min(index, list.length));
    list.splice(at, 0, ...blocks);
    return at;
  }

  function takeTail(list, index) {
    return list.splice(index);
  }

  function scanList(list, stack, id) {
    for (let index = 0; index < list.length; index++) {
      const block = list[index];
      if (block.id === id) return { kind: "seq", list, index, block, stack };
      const inner = scanBlock(block, stack, id);
      if (inner) return inner;
    }
    return null;
  }

  function scanBlock(block, stack, id) {
    const inputs = block.inputs || {};
    const keys = Object.keys(inputs);
    for (let i = 0; i < keys.length; i++) {
      const child = inputs[keys[i]];
      if (!child) continue;
      if (child.id === id) return { kind: "socket", parent: block, input: keys[i], block: child, stack };
      const inner = scanBlock(child, stack, id);
      if (inner) return inner;
    }
    const branches = block.branches || {};
    const names = Object.keys(branches);
    for (let i = 0; i < names.length; i++) {
      const hit = scanList(branches[names[i]], stack, id);
      if (hit) return hit;
    }
    return null;
  }

  function locate(project, id) {
    const stacks = project.stacks || [];
    for (let i = 0; i < stacks.length; i++) {
      const hit = scanList(stacks[i].blocks, stacks[i], id);
      if (hit) return hit;
    }
    return null;
  }

  function pruneStack(project, stack) {
    if (stack.blocks.length === 0) {
      project.stacks = project.stacks.filter((item) => item !== stack);
    }
  }

  return { encodePath, decodePath, sequence, insertAt, takeTail, locate, pruneStack };
});

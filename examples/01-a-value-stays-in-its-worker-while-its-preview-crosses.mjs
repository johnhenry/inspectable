// The value (with a function and a cycle) lives in a worker thread. Only its
// preview crosses, by structured clone; a deeper level is fetched later by handle.
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";

const worker = new Worker(
  `
  const { parentPort } = require("node:worker_threads");
  import(${JSON.stringify(new URL("../src/index.mjs", import.meta.url).href)}).then(({ createInspector }) => {
    const inspector = createInspector({ depth: 1 });
    const value = { greet: (name) => "hi " + name, nested: { deep: { answer: 42 } } };
    value.self = value;
    parentPort.on("message", (msg) => {
      if (msg.type === "preview") parentPort.postMessage(inspector.serialize(value, { scope: "cell" }));
      if (msg.type === "expand") parentPort.postMessage(inspector.expand(msg.handle));
    });
    parentPort.postMessage("ready");
  });
  `,
  { eval: true },
);
const next = () => new Promise((resolve) => worker.once("message", resolve));
await next(); // ready
worker.postMessage({ type: "preview" });
const preview = await next();
const byKey = Object.fromEntries(preview.entries.map((e) => [e.key, e.value]));
assert.equal(byKey.greet.text, "(name) => …");
assert.ok(byKey.nested.handle, "level 2 stays in the worker until asked for");
assert.equal(byKey.self.handle !== undefined || byKey.self.type === "circular", true);

worker.postMessage({ type: "expand", handle: byKey.nested.handle });
const level2 = await next();
assert.equal(level2.entries[0].key, "deep");
await worker.terminate();
console.log("ok: previewed", preview.text, "and expanded", byKey.nested.text, "->", level2.entries[0].value.text);

import { test } from "node:test";
import assert from "node:assert/strict";
import { createInspector, serialize, toTable, promiseState } from "../src/index.mjs";

const cloneable = (x) => assert.deepEqual(structuredClone(x), x) || JSON.stringify(x);

test("primitives keep clone-safe values and readable text", () => {
  assert.deepEqual(serialize(1), { type: "number", text: "1", value: 1 });
  assert.deepEqual(serialize(true), { type: "boolean", text: "true", value: true });
  assert.deepEqual(serialize(null), { type: "null", text: "null" });
  assert.deepEqual(serialize(undefined), { type: "undefined", text: "undefined" });
  assert.equal(serialize("hi").text, "'hi'");
  assert.equal(serialize("hi").value, "hi");
  assert.equal(serialize(10n).text, "10n");
  assert.equal(serialize(Symbol("s")).text, "Symbol(s)");
});

test("non-finite numbers and -0 have no value field, only text (JSON can't hold them)", () => {
  assert.deepEqual(serialize(NaN), { type: "number", text: "NaN" });
  assert.deepEqual(serialize(-Infinity), { type: "number", text: "-Infinity" });
  assert.deepEqual(serialize(-0), { type: "number", text: "-0" });
});

test("long strings are truncated with a `more` count", () => {
  const p = serialize("x".repeat(50), { maxString: 10 });
  assert.equal(p.value.length, 11); // 10 + ellipsis
  assert.equal(p.size, 50);
  assert.equal(p.more, 40);
});

test("functions report kind, name, params and source", () => {
  assert.equal(serialize(function add(a, b) {}).text, "ƒ add(a, b)");
  assert.equal(serialize((x) => x + 1).text, "(x) => …");
  assert.equal(serialize(async (x) => x).text, "async (x) => …");
  assert.equal(serialize(class Foo {}).text, "class Foo");
  assert.equal(serialize(function* gen() {}).kind, "generator");
  assert.match(serialize((x) => x + 1).source, /x \+ 1/);
});

test("arrays, objects, maps and sets expand to `depth` and report sizes", () => {
  const p = serialize({ a: [1, 2], m: new Map([["k", 1]]), s: new Set([1]) }, { depth: 2 });
  assert.equal(p.type, "object");
  const byKey = Object.fromEntries(p.entries.map((e) => [e.key, e.value]));
  assert.equal(byKey.a.text, "[2]");
  assert.deepEqual(byKey.a.entries.map((e) => e.value.value), [1, 2]);
  assert.equal(byKey.m.text, "Map(1)");
  assert.equal(byKey.m.entries[0].key.value, "k");
  assert.equal(byKey.s.text, "Set(1)");
});

test("class instances are named by their constructor", () => {
  class Point {
    constructor() {
      this.x = 1;
    }
  }
  assert.equal(serialize(new Point()).name, "Point");
  assert.equal(serialize(new Point()).text, "Point {…}");
  assert.equal(serialize(Object.create(null)).name, "Object");
});

test("dates, regexps, urls, errors, buffers and typed arrays", () => {
  assert.equal(serialize(new Date(0)).text, "1970-01-01T00:00:00.000Z");
  assert.equal(serialize(new Date(NaN)).text, "Invalid Date");
  assert.equal(serialize(/a+/g).text, "/a+/g");
  assert.equal(serialize(new URL("https://example.com/x")).text, "https://example.com/x");
  const e = serialize(new TypeError("bad"));
  assert.equal(e.type, "error");
  assert.equal(e.text, "TypeError: bad");
  assert.match(e.source, /TypeError: bad/);
  assert.equal(serialize(new ArrayBuffer(8)).text, "ArrayBuffer(8)");
  assert.equal(serialize(new Uint8Array([1, 2, 3])).text, "Uint8Array(3)");
  assert.deepEqual(serialize(new Uint8Array([1, 2, 3])).entries.map((x) => x.value.value), [1, 2, 3]);
});

test("promises, weak collections and module-like values are previewed without walking them", () => {
  assert.equal(serialize(Promise.resolve(1)).type, "promise");
  assert.equal(serialize(Promise.resolve(1)).source, undefined, "no made-up state: promiseState() reads it");
  assert.equal(serialize(new WeakMap()).type, "weak");
});

test("circular references are cut, not looped", () => {
  const a = { name: "a" };
  a.self = a;
  const p = serialize(a, { depth: 5 });
  const self = p.entries.find((e) => e.key === "self").value;
  assert.equal(self.type, "circular");
});

test("maxEntries cuts children and reports the rest as `more`", () => {
  const p = serialize(Array.from({ length: 10 }, (_, i) => i), { maxEntries: 3 });
  assert.equal(p.entries.length, 3);
  assert.equal(p.more, 7);
});

test("sparse arrays show holes", () => {
  // eslint-disable-next-line no-sparse-arrays
  const p = serialize([1, , 3]);
  assert.equal(p.entries[1].value.text, "<empty>");
});

test("getters are not invoked", () => {
  let called = false;
  const obj = {
    get boom() {
      called = true;
      throw new Error("no");
    },
  };
  const p = serialize(obj);
  assert.equal(called, false);
  assert.equal(p.entries[0].value.type, "getter");
});

test("a throwing proxy becomes `unreadable` instead of throwing", () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  assert.equal(serialize(proxy).type, "unreadable");
  assert.equal(serialize({ inner: proxy }, { depth: 2 }).entries[0].value.type, "unreadable");
});

test("every preview is structured-clone and JSON safe", () => {
  const value = { f: (x) => x, e: new Error("x"), m: new Map([[{ k: 1 }, new Set([1n])]]), d: new Date(0), n: NaN, u: undefined, s: Symbol("q") };
  const p = serialize(value, { depth: 4 });
  cloneable(p);
  assert.doesNotThrow(() => JSON.stringify(p));
});

test("handles expand deeper levels lazily, and release drops them", () => {
  const inspector = createInspector({ depth: 1 });
  const deep = { a: { b: { c: 42 } } };
  const p = inspector.serialize(deep, { scope: "cell1" });
  const a = p.entries[0].value;
  assert.ok(a.handle, "level 2 is a handle");
  assert.equal(a.entries, undefined);
  const level2 = inspector.expand(a.handle);
  assert.equal(level2.entries[0].key, "b");
  const b = level2.entries[0].value;
  const level3 = inspector.expand(b.handle);
  assert.equal(level3.entries[0].value.value, 42);
  assert.ok(inspector.size >= 2);
  inspector.release("cell1");
  assert.equal(inspector.size, 0);
  assert.equal(inspector.expand(a.handle), undefined);
});

test("functions with own properties can be expanded; plain ones carry no handle", () => {
  const inspector = createInspector();
  const plain = inspector.serialize(() => 1);
  assert.equal(plain.handle, undefined);
  function withProps() {}
  withProps.version = 3;
  const p = inspector.serialize(withProps);
  assert.ok(p.handle);
  assert.equal(inspector.expand(p.handle).entries[0].key, "version");
});

test("the stateless serialize() keeps no handles in its output", () => {
  const p = serialize({ a: { b: 1 } }, { depth: 1 });
  assert.equal(p.entries[0].value.handle, undefined);
});

test("toTable turns arrays of objects, arrays of arrays and objects of objects into rows", () => {
  const t = toTable([{ a: 1, b: "x" }, { a: 2, c: true }]);
  assert.deepEqual(t.columns, ["a", "b", "c"]);
  assert.deepEqual(t.rows, [[1, "x", null], [2, null, true]]);
  assert.equal(t.total, 2);
  assert.deepEqual(toTable([[1, 2], [3, 4]]).rows, [[1, 2], [3, 4]]);
  const byId = toTable({ x: { v: 1 }, y: { v: 2 } });
  assert.deepEqual(byId.index, ["x", "y"]);
  assert.equal(toTable(5), undefined);
  assert.equal(toTable([1, 2]), undefined);
  assert.equal(toTable([]), undefined);
  assert.deepEqual(toTable([{ d: new Date(0), n: NaN }]).rows[0], ["1970-01-01T00:00:00.000Z", "NaN"]);
});

test("toTable respects maxRows but reports the total", () => {
  const t = toTable(Array.from({ length: 5 }, (_, i) => ({ i })), { maxRows: 2 });
  assert.equal(t.rows.length, 2);
  assert.equal(t.total, 5);
});

test("promiseState reports fulfilled, rejected and pending", async () => {
  assert.deepEqual(await promiseState(Promise.resolve(1)), { state: "fulfilled", value: 1 });
  const rejected = await promiseState(Promise.reject(new Error("r")));
  assert.equal(rejected.state, "rejected");
  assert.deepEqual(await promiseState(new Promise(() => {})), { state: "pending" });
});

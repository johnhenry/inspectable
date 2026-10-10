import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";

let window;
let mod;
before(async () => {
  window = new Window();
  for (const key of ["document", "HTMLElement", "customElements", "Node"]) globalThis[key] = window[key];
  mod = await import("../src/element.mjs");
});
after(async () => {
  await window.happyDOM.close();
});

const { createInspector, serialize, toTable } = await import("../src/index.mjs");
const tick = () => new Promise((r) => setTimeout(r, 0));

test("leaves render as one span with the type as class", () => {
  const node = mod.renderPreview(serialize(42), { document });
  assert.equal(node.textContent, "42");
  assert.ok(node.querySelector(".number"));
});

test("objects render as details/summary with keyed children", () => {
  const node = mod.renderPreview(serialize({ a: 1, b: "x" }), { document, open: true });
  assert.equal(node.tagName, "DETAILS");
  assert.equal(node.open, true);
  const keys = [...node.querySelectorAll(".key")].map((k) => k.textContent);
  assert.deepEqual(keys, ["a", "b"]);
  assert.ok(node.querySelector(".string"));
});

test("hostile strings render as text, never as markup", () => {
  const node = mod.renderPreview(serialize({ "<img src=x onerror=alert(1)>": "<script>alert(1)</script>" }), { document, open: true });
  assert.equal(node.querySelector("img"), null);
  assert.equal(node.querySelector("script"), null);
  assert.match(node.textContent, /<script>alert\(1\)<\/script>/);
});

test("handles are fetched through `expand` only when opened", async () => {
  const inspector = createInspector({ depth: 1 });
  const preview = inspector.serialize({ deep: { x: 1 } });
  const calls = [];
  const node = mod.renderPreview(preview, {
    document,
    open: true,
    expand: async (handle) => {
      calls.push(handle);
      return inspector.expand(handle);
    },
  });
  const inner = node.querySelector("li details");
  assert.ok(inner, "the nested object is collapsible");
  assert.equal(calls.length, 0, "nothing fetched before opening");
  inner.open = true;
  inner.dispatchEvent(new window.Event("toggle"));
  await tick();
  assert.equal(calls.length, 1);
  assert.match(inner.textContent, /x: 1/);
});

test("an expired handle says so instead of throwing", async () => {
  const preview = { type: "object", text: "{…}", name: "Object", handle: "gone:1" };
  const node = mod.renderPreview(preview, { document, expand: async () => undefined });
  node.open = true;
  node.dispatchEvent(new window.Event("toggle"));
  await tick();
  assert.match(node.textContent, /no longer available/);
});

test("`more` counts are shown", () => {
  const node = mod.renderPreview(serialize([1, 2, 3, 4], { maxEntries: 2 }), { document, open: true });
  assert.match(node.textContent, /… 2 more/);
});

test("rawStrings shows a root string unquoted", () => {
  const node = mod.renderPreview(serialize("line 1\nline 2"), { document, rawStrings: true });
  assert.equal(node.textContent, "line 1\nline 2");
});

test("functions show their source when opened", () => {
  const node = mod.renderPreview(serialize((x) => x * 2), { document, open: true });
  assert.ok(node.querySelector("pre.source"));
  assert.match(node.querySelector("pre.source").textContent, /x \* 2/);
});

test("renderTable builds a table with header, index and typed cells", () => {
  const table = mod.renderTable(toTable({ r1: { a: 1, b: null } }), { document });
  assert.equal(table.tagName, "TABLE");
  assert.deepEqual([...table.querySelectorAll("thead th")].map((th) => th.textContent), ["", "a", "b"]);
  assert.equal(table.querySelector("tbody th").textContent, "r1");
  assert.equal(table.querySelector("td.number").textContent, "1");
  assert.ok(table.querySelector("td.null"));
});

test("<value-inspector> renders into its shadow root and re-renders on value change", () => {
  mod.defineValueInspector();
  const el = document.createElement("value-inspector");
  document.body.append(el);
  el.value = serialize({ a: 1 });
  assert.match(el.shadowRoot.textContent, /a: 1/);
  el.value = serialize("hello");
  assert.match(el.shadowRoot.textContent, /'hello'/);
  el.setAttribute("raw-strings", "");
  assert.doesNotMatch(el.shadowRoot.lastElementChild.textContent, /'/);
});

test("defineValueInspector is idempotent and supports another tag", () => {
  const a = mod.defineValueInspector();
  const b = mod.defineValueInspector();
  assert.equal(a, b);
  const Other = mod.defineValueInspector("x-inspect");
  assert.ok(Other);
  assert.notEqual(Other, a);
});

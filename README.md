# inspectable

[![npm version](https://img.shields.io/npm/v/%40johnhenry%2Finspectable.svg)](https://www.npmjs.com/package/@johnhenry/inspectable)
[![CI](https://github.com/johnhenry/inspectable/actions/workflows/ci.yml/badge.svg)](https://github.com/johnhenry/inspectable/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/%40johnhenry%2Finspectable.svg)](LICENSE)

Show a JavaScript value that lives somewhere else.

A REPL, a notebook cell or an agent's tool result often produces a value inside a Web Worker, a sandboxed iframe or another process, and the page that wants to *show* it can't receive it: functions, class instances, cycles, proxies and DOM nodes don't survive `postMessage`. inspectable turns any value into a small preview tree that does survive it (structured-clone safe and JSON safe), keeps the value where it is, and lets the viewer fetch deeper levels lazily by handle. A `<value-inspector>` element renders the tree.

Zero dependencies. ESM. The serializer touches no DOM, so it runs in Workers, iframes and Node.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [The preview tree](#the-preview-tree)
- [API](#api)
- [`<value-inspector>`](#value-inspector)
- [Security model](#security-model)
- [Family](#family)
- [License](#license)

## Install

```sh
npm install @johnhenry/inspectable
```

**Provenance:** a new package, never published under another name. Under npm's caret rules `^0.0.0` matches only `0.0.0`, so pin exactly until a deliberate `0.1.0`.

## Quick start

In the realm that owns the value (a Worker here):

```js
import { createInspector } from "@johnhenry/inspectable";

const inspector = createInspector({ depth: 1 });
const value = { greet: (name) => `hi ${name}`, nested: { deep: { answer: 42 } } };
value.self = value;

postMessage({ preview: inspector.serialize(value, { scope: "cell-1" }) });
onmessage = ({ data }) => {
  if (data.expand) postMessage({ children: inspector.expand(data.expand) });
  if (data.release) inspector.release("cell-1"); // the cell reran: let the old value go
};
```

On the page:

```js
import "@johnhenry/inspectable/global"; // registers <value-inspector>

const view = document.querySelector("value-inspector");
view.expand = (handle) => askWorker({ expand: handle }); // resolves to { entries, more }
view.value = preview; // from the worker
```

`serialize(value, options)` is the stateless shortcut when nothing needs to be expanded later. Runnable versions: [`examples/`](examples/).

## The preview tree

```js
serialize({ a: [1, 2], f(x) {}, e: new TypeError("bad") }, { depth: 2 });
// {
//   type: "object", text: "{…}", name: "Object", size: 3,
//   entries: [
//     { key: "a", value: { type: "array", text: "[2]", size: 2, entries: [...] } },
//     { key: "f", value: { type: "function", text: "ƒ f(x)", kind: "function", source: "f(x) {}" } },
//     { key: "e", value: { type: "error", text: "TypeError: bad", source: "TypeError: bad\n    at …", entries: [...] } },
//   ]
// }
```

Every node has `type` and `text`. Others appear when they apply: `value` (clone-safe primitives only; `NaN`, `-0` and `Infinity` are text-only because JSON can't hold them), `name`, `size`, `entries` (`{ key, value }`, where a `Map` key is itself a node), `more` (how many children or characters the limits cut), `handle` (fetch the children later), `source` (function source, error stack, element markup, all truncated; a promise's state can't be read synchronously, so its preview has none: use `promiseState()`) and `kind` for functions (`function`, `arrow`, `async`, `generator`, `class`).

Types: `undefined` `null` `boolean` `number` `bigint` `string` `symbol` `function` `array` `object` `map` `set` `date` `regexp` `error` `promise` `typedarray` `arraybuffer` `dataview` `url` `module` `weak` `element` `getter` `circular` `unreadable`.

## API

`@johnhenry/inspectable` (no DOM):

| Export | Does |
| --- | --- |
| `createInspector({ depth = 1, maxEntries = 100, maxString = 2000, maxSource = 400 })` | An inspector with a handle registry. |
| `inspector.serialize(value, { depth, maxEntries, maxString, maxSource, scope })` | Preview with `depth` levels inline; deeper expandable values get a `handle` prefixed by `scope`. |
| `inspector.expand(handle, options)` | `{ entries, more }` one level down, or `undefined` once released. |
| `inspector.release(scope?)` | Drop every handle (or one scope's) so the values can be garbage collected. `inspector.size` counts live handles. |
| `serialize(value, options)` | Stateless preview; no handles in the output. |
| `toTable(value, { maxRows = 1000, maxColumns = 50 })` | `{ columns, index, rows, total }` for an array of objects, an array of arrays, or an object of objects; `undefined` otherwise. Cells are JSON primitives. |
| `promiseState(promise, { wait = 0 })` | `{ state: "fulfilled", value }`, `{ state: "rejected", reason }` or `{ state: "pending" }` after one macrotask turn. |

`@johnhenry/inspectable/serialize` is the same serializer as a single file with no imports, for shipping into a Worker or sandbox as source text (for example `sandbox.defineModule("inspectable", source)` in [andbox](https://github.com/johnhenry/andbox), or `?raw` in a bundler).

`@johnhenry/inspectable/element` (DOM): `renderPreview(preview, { expand, document, open, rawStrings, label })`, `renderTable(table, { document, caption })`, `isExpandable(preview)`, `ValueInspector` and `defineValueInspector(tag = "value-inspector")`. `@johnhenry/inspectable/global` registers the element.

## `<value-inspector>`

| | |
| --- | --- |
| `value` property | A preview node. Setting it re-renders. |
| `expand` property | `async (handle) => ({ entries, more })`, called the first time a collapsed node with a `handle` is opened. Without one, such a node says it can't be expanded here. |
| `open` attribute | Expand the root. |
| `raw-strings` attribute | Show a root string as plain, wrapped text instead of a quoted literal (good for text output). |
| CSS | `--inspectable-font`, `--inspectable-text`, `--inspectable-string`, `--inspectable-number`, `--inspectable-keyword`, `--inspectable-key`, `--inspectable-function`, `--inspectable-error`, `--inspectable-muted`, `--inspectable-focus`. Defaults use `light-dark()`, so they follow the page's `color-scheme`. |

The tree is native `<details>`/`<summary>`, so it is keyboard- and screen-reader-operable without extra script.

## Security model

inspectable sits on a boundary: it reads values produced by code you may not trust and draws them on a page you do.

**What inspectable guarantees:**

- **Rendering never interprets text as markup.** Every label, key, string, function source and error stack is set with `textContent`; nothing is assigned through `innerHTML` or an equivalent sink, and no URL from a preview is ever loaded. A preview built from hostile data renders as inert text (covered by the "hostile strings render as text" test).
- **Previews are plain data.** The output contains only strings, finite numbers, booleans, arrays and plain objects, so it is safe to `structuredClone`, `JSON.stringify` and `postMessage`.
- **Own getters are not invoked.** Accessor properties are reported as `getter` without calling them (example 02).
- **A throwing value can't sink the preview.** Any exception while reading a value (a revoked Proxy, a throwing trap) becomes an `unreadable` node.
- **Output is bounded** by `depth`, `maxEntries`, `maxString` and `maxSource`.

**What is still yours:**

- **Serializing runs the value's realm's own code in a few places.** Proxy traps (`ownKeys`, `getOwnPropertyDescriptor`, `getPrototypeOf`) run when a Proxy is previewed, a prototype's `constructor` getter (if someone defined one) runs when the class name is read, and `Function.prototype.toString` runs on functions. Serialize inside the realm that already runs the untrusted code (the Worker or iframe), never by pulling the value into your page first.
- **Handles keep values alive** until `release()`. A long-lived inspector that never releases is a memory leak by design; scope handles per cell or per result.
- **`text` is a description, not a parser-grade representation.** Don't `eval` or re-parse it.

## Family

inspectable is the "show" step for values that live in someone else's realm.

- **[`@johnhenry/andbox`](https://github.com/johnhenry/andbox)** -- where values live. Load `@johnhenry/inspectable/serialize` into the sandbox (`defineModule` or a remote `sandboxImport`), return `inspector.serialize(result)` from `sandbox.evaluate()`, and expose `expand` as another `evaluate` call; the value never leaves the Worker or iframe.
- **[`@johnhenry/dataflow`](https://github.com/johnhenry/dataflow)** -- a preview is a natural `run()` result: `state.result` of a notebook cell can be the preview the page renders with `<value-inspector>`.
- **[`@johnhenry/data-plot`](https://github.com/johnhenry/data-plot)** -- `toTable()` produces the columns and rows that `<data-plot>`'s `<table>` data source is built from.

## License

MIT

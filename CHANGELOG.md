# Changelog

## 0.1.0 (2026-10-20)

- **Binary values carry their bytes.** `arraybuffer`, `dataview` and `typedarray` previews gain `byteLength`, `bytes` (the first `maxBytes` bytes, default 256, each 0-255) and `bytesMore`; `maxBytes: 0` omits them. Clone-safe, so a hex view can be drawn on the other side of a Worker. Fixes #1.
- **`renderValue(preview, { document })` hook** on `renderPreview()` and a `renderValue` property on `<value-inspector>`: called for every value, nested ones included; a returned node replaces that value's default rendering. A hook that throws or returns nothing falls back to the default. Fixes #1.
- **`hexDump(bytes, { width, offset })`** formats bytes as offset, hex pairs and ASCII.

## 0.0.0 (2026-10-09)

First release. A new package, never published under another name.

- **`createInspector()` / `serialize()`: any value to a structured-clone-safe preview tree.** Functions (with kind, params and source), cycles, Maps (with node keys), Sets, errors (with stack and cause), typed arrays, buffers, dates, regexps, URLs, promises, weak collections, module namespaces and DOM nodes; limits by depth, entries, string and source length.
- **Lazy expansion by handle.** Past `depth`, expandable values get a `handle`; `expand(handle)` returns the next level and `release(scope)` lets the values go.
- **Hostile values can't sink a preview.** Own getters aren't invoked, throwing proxies become `unreadable`. A truncated string's `more` count was one short (it counted the ellipsis); fixed before release, covered by the "long strings are truncated" test.
- **`toTable()`** for record-shaped data and **`promiseState()`**. A promise's preview claims no state (it can't be read synchronously; an earlier draft always said "pending").
- **`<value-inspector>` without an `expand` callback** says a collapsed node can't be expanded here, instead of reporting every handle as expired; setting `expand` re-renders.
- **`<value-inspector>`, `renderPreview()` and `renderTable()`**: native `<details>` trees, text-only rendering (no HTML sinks), theming through `--inspectable-*` custom properties with `light-dark()` defaults.
- Built for the miso spatial notebook, where cell values live in an `@johnhenry/andbox` Worker.

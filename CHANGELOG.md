# Changelog

## 0.0.0 (2026-10-09)

First release. A new package, never published under another name.

- **`createInspector()` / `serialize()`: any value to a structured-clone-safe preview tree.** Functions (with kind, params and source), cycles, Maps (with node keys), Sets, errors (with stack and cause), typed arrays, buffers, dates, regexps, URLs, promises, weak collections, module namespaces and DOM nodes; limits by depth, entries, string and source length.
- **Lazy expansion by handle.** Past `depth`, expandable values get a `handle`; `expand(handle)` returns the next level and `release(scope)` lets the values go.
- **Hostile values can't sink a preview.** Own getters aren't invoked, throwing proxies become `unreadable`. A truncated string's `more` count was one short (it counted the ellipsis); fixed before release, covered by the "long strings are truncated" test.
- **`toTable()`** for record-shaped data and **`promiseState()`**. A promise's preview claims no state (it can't be read synchronously; an earlier draft always said "pending").
- **`<value-inspector>` without an `expand` callback** says a collapsed node can't be expanded here, instead of reporting every handle as expired; setting `expand` re-renders.
- **`<value-inspector>`, `renderPreview()` and `renderTable()`**: native `<details>` trees, text-only rendering (no HTML sinks), theming through `--inspectable-*` custom properties with `light-dark()` defaults.
- Built for the miso spatial notebook, where cell values live in an `@johnhenry/andbox` Worker.

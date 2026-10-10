/**
 * Render inspectable previews in the DOM.
 *
 * `renderPreview(preview, options)` builds a tree of plain elements;
 * `ValueInspector` (`<value-inspector>`) wraps it in a shadow root with
 * themable styles and lazy expansion through an `expand(handle)` callback,
 * which is how children of a value that lives in another realm (a Worker, an
 * iframe) are fetched only when the user opens them.
 *
 * Nothing here evaluates strings or assigns HTML: every label is set with
 * `textContent`, so a preview built from hostile data renders as text.
 */

const CSS = `
:host {
  display: block;
  font: var(--inspectable-font, 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  color: var(--inspectable-text, light-dark(#1f2328, #e6edf3));
  --_string: var(--inspectable-string, light-dark(#0a7c2f, #7ee787));
  --_number: var(--inspectable-number, light-dark(#0550ae, #79c0ff));
  --_keyword: var(--inspectable-keyword, light-dark(#8250df, #d2a8ff));
  --_muted: var(--inspectable-muted, light-dark(#6e7781, #8b949e));
  --_key: var(--inspectable-key, light-dark(#953800, #ffa657));
  --_error: var(--inspectable-error, light-dark(#cf222e, #ff7b72));
  --_function: var(--inspectable-function, light-dark(#6639ba, #d2a8ff));
}
:host([hidden]) { display: none; }
ul { list-style: none; margin: 0; padding: 0 0 0 1.1em; }
li { margin: 0; white-space: nowrap; }
details > summary { cursor: pointer; list-style: none; white-space: nowrap; }
details > summary::-webkit-details-marker { display: none; }
details > summary::before { content: "▸"; display: inline-block; width: 1em; color: var(--_muted); transition: transform .1s; }
details[open] > summary::before { transform: rotate(90deg); }
details > summary:focus-visible { outline: 2px solid var(--inspectable-focus, Highlight); outline-offset: 1px; border-radius: 2px; }
.leaf { padding-left: 1em; }
.key { color: var(--_key); }
.sep { color: var(--_muted); }
.string { color: var(--_string); white-space: pre; }
.number, .bigint { color: var(--_number); }
.boolean, .null, .undefined, .symbol { color: var(--_keyword); }
.undefined, .null { color: var(--_muted); }
.function { color: var(--_function); font-style: italic; }
.error { color: var(--_error); }
.circular, .more, .getter, .weak, .unreadable, .promise { color: var(--_muted); font-style: italic; }
.raw { white-space: pre-wrap; word-break: break-word; display: block; }
pre.source { margin: .2em 0 .2em 1em; padding: .3em .5em; color: var(--_muted); white-space: pre-wrap; border-left: 2px solid color-mix(in srgb, var(--_muted) 40%, transparent); max-height: 16em; overflow: auto; }
.loading { color: var(--_muted); padding-left: 1em; }
`;

const EXPANDABLE = new Set(["array", "object", "map", "set", "error", "typedarray", "module", "function"]);

const el = (doc, tag, className, text) => {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** True when a preview node has (or can fetch) children. */
export const isExpandable = (preview) =>
  Boolean(preview && EXPANDABLE.has(preview.type) && (preview.entries?.length || preview.handle || preview.more || (preview.type === "function" && preview.source)));

/**
 * Build DOM for a preview node.
 * @param {object} preview a node from `serialize()` / `inspector.serialize()`
 * @param {{ expand?: (handle: string) => Promise<{ entries: any[], more?: number } | undefined>,
 *           document?: Document, open?: boolean, rawStrings?: boolean, label?: Node }} [options]
 */
export function renderPreview(preview, options = {}) {
  const doc = options.document ?? globalThis.document;
  const { expand, open = false, rawStrings = false, label } = options;

  const valueSpan = (node) => {
    const span = el(doc, "span", node.type, node.text);
    if (node.type === "function" && node.source) span.title = node.source;
    if (node.type === "element" && node.source) span.title = node.source;
    return span;
  };

  if (!isExpandable(preview)) {
    if (rawStrings && preview.type === "string" && !label) return el(doc, "span", "string raw", preview.value ?? preview.text);
    const span = el(doc, "span", "leaf");
    if (label) span.append(label);
    span.append(valueSpan(preview));
    return span;
  }

  const details = el(doc, "details");
  const summary = el(doc, "summary");
  if (label) summary.append(label);
  summary.append(valueSpan(preview));
  details.append(summary);

  const fill = (entries, more) => {
    const list = el(doc, "ul");
    list.setAttribute("role", "group");
    if (preview.type === "function" && preview.source) {
      const li = el(doc, "li");
      li.append(el(doc, "pre", "source", preview.source));
      list.append(li);
    }
    if (preview.type === "error" && preview.source) {
      const li = el(doc, "li");
      li.append(el(doc, "pre", "source", preview.source));
      list.append(li);
    }
    for (const entry of entries ?? []) {
      const li = el(doc, "li");
      const keyLabel = doc.createDocumentFragment();
      if (typeof entry.key === "string") keyLabel.append(el(doc, "span", "key", entry.key), el(doc, "span", "sep", ": "));
      else {
        keyLabel.append(renderPreview(entry.key, { expand, document: doc }), el(doc, "span", "sep", " => "));
      }
      li.append(renderPreview(entry.value, { expand, document: doc, label: keyLabel }));
      list.append(li);
    }
    if (more) list.append(el(doc, "li", "more", `… ${more} more`));
    return list;
  };

  let loaded = Boolean(preview.entries);
  if (loaded) details.append(fill(preview.entries, preview.more));
  else if (!preview.handle) {
    loaded = true;
    details.append(fill([], preview.more));
  }

  details.addEventListener("toggle", async () => {
    if (!details.open || loaded) return;
    loaded = true;
    if (!expand) {
      details.append(el(doc, "div", "loading", "(not expandable here)"));
      return;
    }
    const loading = el(doc, "div", "loading", "…");
    details.append(loading);
    try {
      const result = await expand(preview.handle);
      loading.remove();
      if (!result) {
        details.append(el(doc, "div", "loading", "(no longer available)"));
        return;
      }
      details.append(fill(result.entries, result.more));
    } catch (error) {
      loading.textContent = `(failed to expand: ${error?.message ?? error})`;
    }
  });

  if (open) details.open = true;
  return details;
}

/** Render a `toTable()` result as an HTML `<table>`. */
export function renderTable(table, { document: doc = globalThis.document, caption } = {}) {
  const t = el(doc, "table");
  if (caption) t.append(el(doc, "caption", undefined, caption));
  const thead = el(doc, "thead");
  const hr = el(doc, "tr");
  if (table.index) hr.append(el(doc, "th"));
  for (const c of table.columns) hr.append(el(doc, "th", undefined, c));
  thead.append(hr);
  const tbody = el(doc, "tbody");
  table.rows.forEach((row, i) => {
    const tr = el(doc, "tr");
    if (table.index) {
      const th = el(doc, "th", undefined, table.index[i]);
      th.scope = "row";
      tr.append(th);
    }
    for (const cell of row) tr.append(el(doc, "td", cell === null ? "null" : typeof cell, cell === null ? "" : String(cell)));
    tbody.append(tr);
  });
  t.append(thead, tbody);
  return t;
}

const HTMLElementBase = globalThis.HTMLElement ?? class {};

/**
 * `<value-inspector>`: shows one preview.
 *
 * Properties: `value` (a preview node), `expand` (async handle => children).
 * Attributes: `open` (expand the root), `raw-strings` (show a root string as
 * plain text, not a quoted literal).
 */
export class ValueInspector extends HTMLElementBase {
  static get observedAttributes() {
    return ["open", "raw-strings"];
  }

  #value = undefined;
  #expand = undefined;
  #root;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.#root.append(style, document.createElement("div"));
  }

  get value() {
    return this.#value;
  }
  set value(preview) {
    this.#value = preview;
    this.#render();
  }

  get expand() {
    return this.#expand;
  }
  set expand(fn) {
    this.#expand = fn;
  }

  attributeChangedCallback() {
    this.#render();
  }

  #render() {
    const host = this.#root.lastElementChild;
    if (!host) return;
    if (this.#value === undefined) {
      host.replaceChildren();
      return;
    }
    host.replaceChildren(
      renderPreview(this.#value, {
        expand: (handle) => (this.#expand ? this.#expand(handle) : Promise.resolve(undefined)),
        document: this.ownerDocument,
        open: this.hasAttribute("open"),
        rawStrings: this.hasAttribute("raw-strings"),
      }),
    );
  }
}

/** Register `<value-inspector>` (or a different tag). Safe to call twice. */
export function defineValueInspector(tag = "value-inspector", registry = globalThis.customElements) {
  if (!registry) throw new Error("defineValueInspector: no customElements registry here");
  if (!registry.get(tag)) registry.define(tag, tag === "value-inspector" ? ValueInspector : class extends ValueInspector {});
  return registry.get(tag);
}

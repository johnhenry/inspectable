/**
 * Turn any JavaScript value into a small, structured-clone-safe (and
 * JSON-safe) preview tree, so a value living in a Worker, iframe or other
 * realm can be shown somewhere else without moving the value itself.
 *
 * Deep values are not walked eagerly: past `depth`, an expandable node gets a
 * `handle`, and `inspector.expand(handle)` returns its children later. That is
 * what makes previews of huge or cyclic structures cheap.
 *
 * This file has no imports and touches no DOM, so it can be shipped into a
 * Worker as source text.
 *
 * Preview node shape (every field optional except `type` and `text`):
 *   type     "undefined" | "null" | "boolean" | "number" | "bigint" | "string" |
 *            "symbol" | "function" | "array" | "object" | "map" | "set" |
 *            "date" | "regexp" | "error" | "promise" | "typedarray" |
 *            "arraybuffer" | "dataview" | "url" | "module" | "weak" |
 *            "element" | "circular" | "unreadable"
 *   text     a one-line display string ("[3]", "Map(2)", "'hi'", "ƒ add(a, b)")
 *   value    the primitive itself when it is clone-safe (booleans, finite numbers, strings)
 *   name     constructor, class, function or error name
 *   size     length / size / byteLength
 *   byteLength  for binary values (buffers, views, typed arrays): their size in bytes
 *   bytes    for binary values: the first `maxBytes` bytes, as an array of 0-255
 *   bytesMore   how many bytes `bytes` leaves out
 *   entries  [{ key, value }] children (key is a string, or a node for Map keys)
 *   more     how many children were cut off by maxEntries
 *   handle   pass to expand() to fetch children not included yet
 *   source   function source (truncated), message/stack for errors, element markup
 */

const DEFAULTS = { depth: 1, maxEntries: 100, maxString: 2000, maxSource: 400, maxBytes: 256 };

/** `{ byteLength, bytes, bytesMore }` for a binary value, `maxBytes` at most. */
function binaryInfo(value, maxBytes) {
  try {
    const isBuffer = value instanceof ArrayBuffer || (typeof SharedArrayBuffer === "function" && value instanceof SharedArrayBuffer);
    const byteLength = value.byteLength;
    const count = Math.max(0, Math.min(byteLength, maxBytes));
    if (!count) return { byteLength };
    const view = isBuffer ? new Uint8Array(value, 0, count) : new Uint8Array(value.buffer, value.byteOffset, count);
    return { byteLength, bytes: Array.from(view), ...(byteLength > count ? { bytesMore: byteLength - count } : {}) };
  } catch {
    return {}; // a detached buffer has nothing to read
  }
}

const TYPED_ARRAY = Object.getPrototypeOf(Int8Array);

const ctorName = (value) => {
  try {
    const proto = Object.getPrototypeOf(value);
    if (proto === null) return "Object";
    const ctor = proto?.constructor;
    return typeof ctor === "function" && typeof ctor.name === "string" && ctor.name ? ctor.name : "Object";
  } catch {
    return "Object";
  }
};

const truncate = (s, max) => (s.length > max ? `${s.slice(0, max)}…` : s);

const quote = (s) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;

const numberText = (n) => (Object.is(n, -0) ? "-0" : String(n));

function functionInfo(fn, maxSource) {
  let source = "";
  try {
    source = Function.prototype.toString.call(fn);
  } catch {
    source = "";
  }
  const isClass = /^class[\s{]/.test(source);
  const isAsync = /^async[\s(]/.test(source);
  const isGenerator = /^(async\s+)?function\s*\*/.test(source);
  const isArrow = !isClass && /^(async\s*)?(\([^)]*\)|[\w$]+)\s*=>/.test(source);
  const name = fn.name || "";
  const params = (() => {
    const m = source.match(/^[^(]*\(([^)]*)\)/);
    if (isArrow) {
      const a = source.match(/^(?:async\s*)?(\([^)]*\)|[\w$]+)\s*=>/);
      return a ? a[1].replace(/^\(|\)$/g, "") : "";
    }
    return m ? m[1] : "";
  })();
  let text;
  if (isClass) text = `class ${name || "(anonymous)"}`;
  else if (isArrow) text = `${isAsync ? "async " : ""}(${params.trim()}) => …`;
  else text = `${isAsync ? "async " : ""}ƒ${isGenerator ? "*" : ""} ${name || "(anonymous)"}(${params.trim()})`;
  return { text, name, source: truncate(source, maxSource), kind: isClass ? "class" : isArrow ? "arrow" : isGenerator ? "generator" : isAsync ? "async" : "function" };
}

const isModuleNamespace = (value) => {
  try {
    return Object.prototype.toString.call(value) === "[object Module]";
  } catch {
    return false;
  }
};

const isElementLike = (value) =>
  typeof value === "object" &&
  value !== null &&
  typeof value.nodeType === "number" &&
  typeof value.nodeName === "string" &&
  typeof globalThis.Node === "function" &&
  value instanceof globalThis.Node;

/**
 * Create an inspector with a handle registry for lazy expansion.
 * @param {{ depth?: number, maxEntries?: number, maxString?: number, maxSource?: number, maxBytes?: number }} [defaults]
 */
export function createInspector(defaults = {}) {
  const options = { ...DEFAULTS, ...defaults };
  const handles = new Map();
  let next = 0;

  const register = (value, scope) => {
    const handle = `${scope ?? "h"}:${(next++).toString(36)}`;
    handles.set(handle, { value, scope });
    return handle;
  };

  /** Children of an expandable value, as [{ key, value }] previews, plus a `more` count. */
  function children(value, type, depth, seen, opts, scope) {
    const out = [];
    let more = 0;
    const limit = opts.maxEntries;
    const push = (key, child) => {
      if (out.length >= limit) {
        more++;
        return;
      }
      out.push({ key, value: node(child, depth, seen, opts, scope) });
    };
    const safeGet = (obj, key) => {
      try {
        return obj[key];
      } catch (error) {
        return { [UNREADABLE]: error };
      }
    };
    if (type === "array") {
      for (let i = 0; i < value.length; i++) {
        if (out.length >= limit) {
          more = value.length - i;
          break;
        }
        push(String(i), i in value ? safeGet(value, i) : HOLE);
      }
      // Non-index own properties on arrays (rare, but shown like DevTools does).
      for (const key of Object.keys(value)) if (!/^\d+$/.test(key)) push(key, safeGet(value, key));
    } else if (type === "typedarray") {
      const len = value.length;
      for (let i = 0; i < Math.min(len, limit); i++) push(String(i), value[i]);
      if (len > limit) more = len - limit;
    } else if (type === "map") {
      for (const [k, v] of value) {
        if (out.length >= limit) {
          more++;
          continue;
        }
        out.push({ key: node(k, depth, seen, opts, scope), value: node(v, depth, seen, opts, scope) });
      }
    } else if (type === "set") {
      let i = 0;
      for (const v of value) push(String(i++), v);
    } else if (type === "error") {
      push("message", value.message);
      if (value.cause !== undefined) push("cause", value.cause);
      if (Array.isArray(value.errors)) push("errors", value.errors);
      for (const key of Object.keys(value)) if (!["message", "cause", "errors", "stack"].includes(key)) push(key, safeGet(value, key));
    } else {
      // Plain objects, class instances, module namespaces.
      let keys;
      try {
        keys = Reflect.ownKeys(value);
      } catch {
        keys = [];
      }
      for (const key of keys) {
        let desc;
        try {
          desc = Object.getOwnPropertyDescriptor(value, key);
        } catch {
          desc = undefined;
        }
        if (desc && !desc.enumerable && type !== "module") continue;
        const label = typeof key === "symbol" ? `[${String(key)}]` : key;
        if (desc && "get" in desc && !("value" in desc)) {
          if (out.length >= limit) more++;
          else out.push({ key: label, value: { type: "getter", text: "(…)" } });
          continue;
        }
        push(label, desc ? desc.value : safeGet(value, key));
      }
    }
    return { entries: out, more };
  }

  function node(value, depth, seen, opts, scope) {
    // Proxies (revoked or with throwing traps) and exotic host objects can
    // throw from almost any operation; one bad value must not sink the preview.
    try {
      return nodeUnsafe(value, depth, seen, opts, scope);
    } catch (error) {
      return { type: "unreadable", text: `<threw ${String(error?.message ?? error)}>` };
    }
  }

  function nodeUnsafe(value, depth, seen, opts, scope) {
    if (value === HOLE) return { type: "undefined", text: "<empty>" };
    if (value && typeof value === "object" && UNREADABLE in value) {
      return { type: "unreadable", text: `<threw ${String(value[UNREADABLE]?.message ?? value[UNREADABLE])}>` };
    }
    switch (typeof value) {
      case "undefined":
        return { type: "undefined", text: "undefined" };
      case "boolean":
        return { type: "boolean", text: String(value), value };
      case "number":
        return Number.isFinite(value) && !Object.is(value, -0)
          ? { type: "number", text: String(value), value }
          : { type: "number", text: numberText(value) };
      case "bigint":
        return { type: "bigint", text: `${value}n` };
      case "string": {
        const shown = truncate(value, opts.maxString);
        const cut = value.length > opts.maxString ? value.length - opts.maxString : 0;
        return { type: "string", text: quote(shown), value: shown, size: value.length, ...(cut ? { more: cut } : {}) };
      }
      case "symbol":
        return { type: "symbol", text: String(value) };
      case "function": {
        const info = functionInfo(value, opts.maxSource);
        const out = { type: "function", text: info.text, name: info.name, source: info.source, kind: info.kind };
        // Functions carry own properties too (static members, attached data); only expand on request.
        let ownKeys = [];
        try {
          ownKeys = Object.keys(value);
        } catch {
          ownKeys = [];
        }
        if (ownKeys.length) out.handle = register(value, scope);
        return out;
      }
    }
    if (value === null) return { type: "null", text: "null" };

    if (seen.includes(value)) return { type: "circular", text: "[Circular]", name: ctorName(value) };

    let type = "object";
    let text;
    let name = ctorName(value);
    let size;
    let extra = {};
    try {
      if (Array.isArray(value)) {
        type = "array";
        size = value.length;
        text = `${name === "Array" ? "" : name}[${size}]`;
      } else if (value instanceof Map) {
        type = "map";
        size = value.size;
        text = `${name}(${size})`;
      } else if (value instanceof Set) {
        type = "set";
        size = value.size;
        text = `${name}(${size})`;
      } else if (value instanceof Date) {
        type = "date";
        text = Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
        return { type, text, name };
      } else if (value instanceof RegExp) {
        return { type: "regexp", text: String(value), name };
      } else if (value instanceof Error) {
        type = "error";
        name = value.name || name;
        text = `${name}: ${value.message}`;
        extra = { source: truncate(String(value.stack ?? ""), opts.maxSource * 4) };
      } else if (typeof Promise === "function" && value instanceof Promise) {
        // Its state can't be read synchronously; promiseState() can.
        return { type: "promise", text: "Promise", name };
      } else if (value instanceof TYPED_ARRAY) {
        type = "typedarray";
        size = value.length;
        text = `${name}(${size})`;
        extra = binaryInfo(value, opts.maxBytes);
      } else if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer === "function" && value instanceof SharedArrayBuffer)) {
        return { type: "arraybuffer", text: `${name}(${value.byteLength})`, name, size: value.byteLength, ...binaryInfo(value, opts.maxBytes) };
      } else if (value instanceof DataView) {
        return { type: "dataview", text: `DataView(${value.byteLength})`, name, size: value.byteLength, ...binaryInfo(value, opts.maxBytes) };
      } else if (typeof URL === "function" && value instanceof URL) {
        return { type: "url", text: value.href, name };
      } else if (value instanceof WeakMap || value instanceof WeakSet || (typeof WeakRef === "function" && value instanceof WeakRef)) {
        return { type: "weak", text: `${name} {}`, name };
      } else if (isModuleNamespace(value)) {
        type = "module";
        name = "Module";
        size = Object.keys(value).length;
        text = `Module {${size} exports}`;
      } else if (isElementLike(value)) {
        const el = value;
        const tag = String(el.nodeName).toLowerCase();
        const id = el.id ? `#${el.id}` : "";
        const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
        return { type: "element", text: el.nodeType === 1 ? `<${tag}${id}${cls}>` : tag, name, source: truncate(String(el.outerHTML ?? el.textContent ?? ""), opts.maxSource) };
      } else {
        let count = 0;
        try {
          count = Object.keys(value).length;
        } catch {
          count = 0;
        }
        size = count;
        text = name === "Object" ? `{${count ? "…" : ""}}` : `${name} {${count ? "…" : ""}}`;
      }
    } catch (error) {
      return { type: "unreadable", text: `<threw ${String(error?.message ?? error)}>` };
    }

    const out = { type, text, name, ...(size !== undefined ? { size } : {}), ...extra };
    if (depth > 0) {
      const { entries, more } = children(value, type, depth - 1, [...seen, value], opts, scope);
      out.entries = entries;
      if (more) out.more = more;
    } else {
      out.handle = register(value, scope);
    }
    return out;
  }

  return {
    /**
     * Preview a value. `depth` levels of children are included inline; deeper
     * expandable values get a `handle` for `expand()`. `scope` prefixes the
     * handles so `release(scope)` can drop them together (for example, one
     * scope per notebook cell, released when the cell reruns).
     */
    serialize(value, { depth = options.depth, maxEntries = options.maxEntries, maxString = options.maxString, maxSource = options.maxSource, maxBytes = options.maxBytes, scope } = {}) {
      return node(value, depth, [], { maxEntries, maxString, maxSource, maxBytes }, scope);
    },

    /** One more level of children for a node's `handle`. Returns `undefined` for an unknown or released handle. */
    expand(handle, { depth = 1, maxEntries = options.maxEntries, maxString = options.maxString, maxSource = options.maxSource, maxBytes = options.maxBytes } = {}) {
      const entry = handles.get(handle);
      if (!entry) return undefined;
      const opts = { maxEntries, maxString, maxSource, maxBytes };
      const value = entry.value;
      if (typeof value === "function") {
        const { entries, more } = children(value, "object", depth - 1, [value], opts, entry.scope);
        return { entries, ...(more ? { more } : {}) };
      }
      const preview = node(value, depth, [], opts, entry.scope);
      return { entries: preview.entries ?? [], ...(preview.more ? { more: preview.more } : {}) };
    },

    /** Drop handles (all of them, or one scope's) so their values can be garbage collected. */
    release(scope) {
      if (scope === undefined) handles.clear();
      else for (const [handle, entry] of handles) if (entry.scope === scope) handles.delete(handle);
    },

    /** How many handles are alive (for tests and leak checks). */
    get size() {
      return handles.size;
    },
  };
}

const HOLE = Symbol("hole");
const UNREADABLE = Symbol("unreadable");

/** Stateless preview: no handles are kept, so nothing past `depth` can be expanded later. */
export function serialize(value, opts = {}) {
  const inspector = createInspector();
  const preview = inspector.serialize(value, opts);
  inspector.release();
  return strip(preview);
}

function strip(node) {
  if (!node || typeof node !== "object") return node;
  const { handle, ...rest } = node;
  if (rest.entries) rest.entries = rest.entries.map((e) => ({ key: typeof e.key === "object" ? strip(e.key) : e.key, value: strip(e.value) }));
  return rest;
}

/** Settle a promise's state without waiting on it: "fulfilled" / "rejected" / "pending" after one macrotask turn. */
export async function promiseState(promise, { wait = 0 } = {}) {
  const PENDING = Symbol("pending");
  const timer = new Promise((resolve) => setTimeout(() => resolve(PENDING), wait));
  try {
    const result = await Promise.race([promise, timer]);
    return result === PENDING ? { state: "pending" } : { state: "fulfilled", value: result };
  } catch (reason) {
    return { state: "rejected", reason };
  }
}

/**
 * A rows/columns view of tabular data (an array of objects, an array of
 * arrays, or an object of objects), JSON-safe, for table and chart renderers.
 * Returns `undefined` when the value isn't table-shaped.
 */
export function toTable(value, { maxRows = 1000, maxColumns = 50 } = {}) {
  let rows;
  let index = null;
  if (Array.isArray(value)) rows = value;
  else if (value && typeof value === "object" && Object.values(value).every((v) => v && typeof v === "object")) {
    index = Object.keys(value);
    rows = Object.values(value);
  } else return undefined;
  if (!rows.length || !rows.every((r) => r !== null && typeof r === "object")) return undefined;
  const cell = (v) => {
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : String(v);
    if (v === undefined) return null;
    return serialize(v, { depth: 0 }).text;
  };
  const arrayRows = rows.every(Array.isArray);
  const columns = [];
  if (arrayRows) {
    const width = Math.min(maxColumns, Math.max(...rows.map((r) => r.length)));
    for (let i = 0; i < width; i++) columns.push(String(i));
  } else {
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!columns.includes(key) && columns.length < maxColumns) columns.push(key);
      }
    }
  }
  const shown = rows.slice(0, maxRows);
  return {
    columns,
    index: index ? index.slice(0, maxRows) : null,
    rows: shown.map((row) => columns.map((c) => cell(arrayRows ? row[Number(c)] : row[c]))),
    total: rows.length,
  };
}

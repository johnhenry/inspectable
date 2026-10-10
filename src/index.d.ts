export type PreviewType =
  | "undefined" | "null" | "boolean" | "number" | "bigint" | "string" | "symbol"
  | "function" | "array" | "object" | "map" | "set" | "date" | "regexp" | "error"
  | "promise" | "typedarray" | "arraybuffer" | "dataview" | "url" | "module" | "weak"
  | "element" | "circular" | "unreadable" | "getter";

export interface Preview {
  type: PreviewType;
  /** One-line display text. */
  text: string;
  /** The primitive itself, when clone-safe (booleans, finite numbers, possibly truncated strings). */
  value?: boolean | number | string;
  /** Constructor, class, function or error name. */
  name?: string;
  /** length / size / byteLength. */
  size?: number;
  /** Children included inline (up to `depth`). Map entries have a Preview key. */
  entries?: Array<{ key: string | Preview; value: Preview }>;
  /** Children (or string characters) cut off by the limits. */
  more?: number;
  /** Pass to `expand()` for children not included yet. */
  handle?: string;
  /** Function source, error stack or element markup (truncated). A promise's state isn't previewed: use promiseState(). */
  source?: string;
  /** For functions: "function" | "arrow" | "async" | "generator" | "class". */
  kind?: string;
}

export interface SerializeOptions {
  /** Levels of children to include inline. Default 1. */
  depth?: number;
  /** Children per level. Default 100. */
  maxEntries?: number;
  /** Characters per string. Default 2000. */
  maxString?: number;
  /** Characters of function source. Default 400. */
  maxSource?: number;
  /** Prefix for handles, so `release(scope)` drops them together. */
  scope?: string;
}

export interface Inspector {
  serialize(value: unknown, options?: SerializeOptions): Preview;
  expand(handle: string, options?: Omit<SerializeOptions, "scope">): { entries: Preview["entries"]; more?: number } | undefined;
  release(scope?: string): void;
  readonly size: number;
}

export function createInspector(defaults?: Omit<SerializeOptions, "scope">): Inspector;
/** Stateless: no handles survive, so nothing past `depth` can be expanded later. */
export function serialize(value: unknown, options?: Omit<SerializeOptions, "scope">): Preview;

export interface Table {
  columns: string[];
  index: string[] | null;
  rows: Array<Array<string | number | boolean | null>>;
  total: number;
}
export function toTable(value: unknown, options?: { maxRows?: number; maxColumns?: number }): Table | undefined;

export function promiseState<T>(promise: Promise<T>, options?: { wait?: number }): Promise<
  { state: "pending" } | { state: "fulfilled"; value: T } | { state: "rejected"; reason: unknown }
>;

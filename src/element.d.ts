import type { Preview, Table } from "./index.js";

export type ExpandFn = (handle: string) => Promise<{ entries: Preview["entries"]; more?: number } | undefined>;

export type RenderValueFn = (preview: Preview, context: { document: Document }) => Node | null | undefined;

/** A hex dump of byte values (a preview's `bytes`): offset, hex pairs, ASCII. */
export function hexDump(bytes: ArrayLike<number>, options?: { width?: number; offset?: number }): string;

export function isExpandable(preview: Preview): boolean;
export function renderPreview(
  preview: Preview,
  options?: { expand?: ExpandFn; document?: Document; open?: boolean; rawStrings?: boolean; label?: Node; renderValue?: RenderValueFn },
): HTMLElement;
export function renderTable(table: Table, options?: { document?: Document; caption?: string }): HTMLTableElement;

export class ValueInspector extends HTMLElement {
  static readonly observedAttributes: string[];
  value: Preview | undefined;
  expand: ExpandFn | undefined;
  /** Called for every value, nested ones included; return a node to render it with, or null for the default. */
  renderValue: RenderValueFn | undefined;
}
export function defineValueInspector(tag?: string, registry?: CustomElementRegistry): CustomElementConstructor;

declare global {
  interface HTMLElementTagNameMap {
    "value-inspector": ValueInspector;
  }
}

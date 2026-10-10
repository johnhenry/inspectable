import type { Preview, Table } from "./index.js";

export type ExpandFn = (handle: string) => Promise<{ entries: Preview["entries"]; more?: number } | undefined>;

export function isExpandable(preview: Preview): boolean;
export function renderPreview(
  preview: Preview,
  options?: { expand?: ExpandFn; document?: Document; open?: boolean; rawStrings?: boolean; label?: Node },
): HTMLElement;
export function renderTable(table: Table, options?: { document?: Document; caption?: string }): HTMLTableElement;

export class ValueInspector extends HTMLElement {
  static readonly observedAttributes: string[];
  value: Preview | undefined;
  expand: ExpandFn | undefined;
}
export function defineValueInspector(tag?: string, registry?: CustomElementRegistry): CustomElementConstructor;

declare global {
  interface HTMLElementTagNameMap {
    "value-inspector": ValueInspector;
  }
}

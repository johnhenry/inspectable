// toTable() turns record-shaped data into columns + rows for a table or chart renderer.
import assert from "node:assert/strict";
import { toTable } from "@johnhenry/inspectable";

const table = toTable([
  { city: "Lisbon", rain: 690 },
  { city: "Oslo", rain: 760, sun: 1670 },
]);
assert.deepEqual(table.columns, ["city", "rain", "sun"]);
assert.deepEqual(table.rows, [["Lisbon", 690, null], ["Oslo", 760, 1670]]);
assert.equal(toTable("not a table"), undefined);
console.log("ok:", table.columns.join(", "), "x", table.total, "rows");

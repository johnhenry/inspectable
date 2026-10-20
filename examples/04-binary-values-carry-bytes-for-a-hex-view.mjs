// A buffer nested in an object carries its first bytes across as clone-safe data, so a hex view can be drawn elsewhere.
import assert from "node:assert/strict";
import { serialize } from "@johnhenry/inspectable";
import { hexDump } from "@johnhenry/inspectable/element";

const preview = serialize({ png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1]).buffer }, { maxBytes: 4 });
const buffer = preview.entries[0].value;
assert.equal(buffer.byteLength, 6);
assert.deepEqual(buffer.bytes, [0x89, 0x50, 0x4e, 0x47]);
assert.equal(buffer.bytesMore, 2);
assert.deepEqual(structuredClone(buffer), buffer);
assert.equal(hexDump(buffer.bytes), "00000000  89 50 4e 47" + " ".repeat(38) + "|.PNG|");
console.log("ok:", buffer.byteLength, "bytes,", buffer.bytes.length, "carried");

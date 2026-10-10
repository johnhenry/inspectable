// Getters aren't invoked, revoked proxies read as "unreadable", cycles are cut,
// and huge collections are capped -- the preview always comes back.
import assert from "node:assert/strict";
import { serialize } from "@johnhenry/inspectable";

let getterRan = false;
const { proxy, revoke } = Proxy.revocable({}, {});
revoke();
const nasty = {
  get trap() {
    getterRan = true;
    throw new Error("side effect!");
  },
  revoked: proxy,
  big: Array.from({ length: 100_000 }, (_, i) => i),
};
nasty.loop = nasty;

const preview = serialize(nasty, { depth: 2, maxEntries: 5 });
const byKey = Object.fromEntries(preview.entries.map((e) => [e.key, e.value]));
assert.equal(getterRan, false);
assert.equal(byKey.trap.type, "getter");
assert.equal(byKey.revoked.type, "unreadable");
assert.equal(byKey.loop.type, "circular");
assert.equal(byKey.big.entries.length, 5);
assert.equal(byKey.big.more, 99_995);
assert.doesNotThrow(() => JSON.stringify(preview));
console.log("ok:", Object.entries(byKey).map(([k, v]) => `${k}=${v.type}`).join(" "));

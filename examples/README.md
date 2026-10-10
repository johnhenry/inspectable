# inspectable examples

Runnable, self-verifying examples. Each one asserts the behavior it demonstrates and exits 0 on success.

| Example | Demonstrates |
| --- | --- |
| [`01-a-value-stays-in-its-worker-while-its-preview-crosses.mjs`](./01-a-value-stays-in-its-worker-while-its-preview-crosses.mjs) | A value holding a function and a cycle stays in a real worker thread; only its structured-clone preview crosses, and a deeper level is fetched later by `handle` through `expand()`. |
| [`02-hostile-values-cannot-break-a-preview.mjs`](./02-hostile-values-cannot-break-a-preview.mjs) | `serialize()` never invokes getters, reports a revoked Proxy as `unreadable`, cuts cycles, caps a 100,000-item array at `maxEntries` with a `more` count, and always returns JSON-safe output. |
| [`03-arrays-of-records-become-tables.mjs`](./03-arrays-of-records-become-tables.mjs) | `toTable()` unions record keys into columns, fills gaps with `null`, and returns `undefined` for values that aren't table-shaped. |

## Running

```sh
npm run examples      # run all in sequence
npm run example:01    # run one
```

## Runtime requirements (honest edition)

Plain Node >= 26. Example 01 uses `node:worker_threads` as a stand-in for a browser Web Worker; the serializer is the same code in both. The `<value-inspector>` element needs a DOM, so it is covered by `test/element.test.mjs` (happy-dom) rather than an example.

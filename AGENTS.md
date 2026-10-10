# Agent playbook

`@johnhenry/inspectable` -- previews any JavaScript value as a structured-clone-safe tree, with lazy expansion by handle, plus a `<value-inspector>` element. Single package, Node >= 26, `node:test` (`npm test`; element tests run under happy-dom), ships source; no build step. `src/serialize.mjs` must stay import-free and DOM-free: consumers ship it into Workers and sandboxes as source text.

`CLAUDE.md` in this directory is a symlink to this file.

## The verification loop (before every push)

1. `npm test` -- `node --test test/` (serializer + happy-dom element tests), then every `examples/NN-*.mjs`. 0 failed, 0 skipped.
2. `npm pack --dry-run` -- the file list is `src/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`.
3. A genuinely fresh clone: `git clone . /tmp/inspectable-verifyN && cd $_ && npm ci && npm test`.
4. Commit, push, close the issue with a comment naming the commit SHA.

CI (`.github/workflows/ci.yml`) calls `johnhenry/workflows`' reusable `ci.yml@v1` with `npm test`, plus `workflow-lint`.

## Repo-specific gotchas

- **Never render through an HTML sink.** `element.mjs` uses `textContent` only; the "hostile strings render as text" test guards it. A "nicer" rendering via `innerHTML` turns every previewed string into an XSS.
- **Never invoke an own getter while serializing.** Read property descriptors, not properties; the `getter` node type exists for this. Proxies are the exception you can't avoid (their traps run); the README's Security model says so.
- **Every new value type must stay clone-safe.** Add it to the "every preview is structured-clone and JSON safe" test; `NaN`/`-0`/`Infinity`/`bigint` are text-only for that reason.
- **Truncation counts are easy to get off by one** (the ellipsis character is not original content); the string test pins it.

## Definition of done

- A regression test exists for any bug fixed; a new value type has a serializer test and, if it renders differently, an element test.
- Limitations are stated in the README, not only in issues.
- `CHANGELOG.md` cites the commit/PR; `examples/README.md` lists every example; `.d.ts` files match the runtime API.

## Releases

`main` is the release branch. Bump `version` and add the dated `CHANGELOG.md` entry in a PR; merging publishes through `.github/workflows/publish.yml` (npm trusted publishing, idempotent `npm view` guard), which then creates the `v<version>` tag and GitHub Release. Don't rename `publish.yml`: npm trusted publishing is bound to that filename.

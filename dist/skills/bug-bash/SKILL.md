---
name: bug-bash
description: MANUAL TRIGGER ONLY - never auto-invoke. Use only when your human partner explicitly asks for a bug bash / flow stress test of their web app. After shipping new UI you may SUGGEST a bug bash in one sentence, but do not run it without an explicit yes. Web apps only, and only when browser-based automated testing (Playwright + Chromium) is available or installable. Findings become tasks in docs/mvp/tasks.jsonl, not inline fixes.
---

# Bug Bash

A repeatable pass for finding the bugs a green unit suite cannot see: audit every flow from the code, build one Chromium suite per flow against a live server, then add the two suites that find what scripted flows never will — a **seeded random walk** checking model invariants after every step, and an **API fuzz** of the HTTP surface. Confirmed bugs are appended to `docs/mvp/tasks.jsonl` as a bug-bash feature for the normal task flow to burn through.

**Announce at start:** "I'm using the bug-bash skill to stress-test the app's flows."

## Invocation rules (hard gate)

- **Never auto-trigger.** This skill runs only on an explicit request ("bug bash", "stress test the flows", "hunt for bugs in the app").
- **Suggesting is allowed, running is not.** After a feature that shipped or changed web UI, you may offer once: "This added new UI — want a bug bash before moving on?" If the answer isn't an explicit yes, drop it.
- This pass costs real time (budget: a working day for a mid-sized app, most of it fixing). Not worth it for a UI still changing shape daily — say so if asked mid-churn.

## Preflight (both must pass, or decline)

1. **Web app check.** The project must serve a browser UI (a dev/prod server and client bundle — look for a web framework, an `index.html`, a server entry point). If it's a CLI, library, or native app: decline — "bug-bash currently supports web apps only" — and stop.
2. **Browser automation check.** Playwright must be present (`package.json` dependency or `npx playwright --version`) with a Chromium binary, or installable now (`npm i -D playwright && npx playwright install chromium` — ask before adding the dependency). No browser automation possible (no Node toolchain, sandboxed env, user declines the install): decline and stop.

Also confirm you can run the app's server **twice** (once for real, once for you) and set an identity per request (header or cookie) so runs stay isolated. If the app handles media, `ffmpeg` is needed for fixtures.

## The pass

Work through the phases in order. Run suites as you write them — do not write twelve suites and then start debugging.

### 1. Audit the flows from the code, not the spec

Read every route, component, and hook; write a numbered table of what a user can actually reach (`| # | Flow | Entry point |`). The spec describes what was intended; the code is what shipped, and the gap is where the bugs are. Reading closely is itself a bug-finding pass — record suspicions to confirm later in the browser.

### 2. Build a rig that cannot damage anything

- **Git worktree**, not the live checkout (`mvp:using-git-worktrees`) — rebuilds must never swap a bundle under a live site.
- **Second server on another port with its own data directory.** Real data never enters the loop.
- **Isolate by identity, not database** — per-suite user (e.g. `Remote-User: flow-<name>-${Date.now()}`) so suites can run in any order against one server.
- **Script the restart; kill by port, never `pkill -f`.** Wait for the socket, then verify the listener is the PID you started.
- **Generate fixtures, one per edge you mean to push** (for media: normal, portrait, very long, silent, 200 ms, odd container, name full of `& # é 漢`, non-video bytes with a video extension).

### 3. Write the harness before the suites

Capture the right failure signals on every page:

```js
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text())
})
page.on('response', (r) => {
  if (r.status() >= 500) errors.push(`http ${r.status()}: ${r.request().method()} ${r.url()}`)
})
```

Do **not** treat `requestfailed` as a bug signal — Chromium reports every 204 as `net::ERR_ABORTED`. Watch HTTP 5xx instead. Every suite ends by asserting the error list is empty: a silent page error is a bug you have not noticed yet.

### 4. One suite per flow

- **Assert on the server's state, not just the DOM.** "It appeared" and "it was saved" are different claims; the gap is a bug class of its own.
- **Assert the thing the user is actually promised** — the contract, not the surface ("the halves meet at the cut", not "split makes two clips").
- **Assert that nothing else moved** after a rejection: state equals before.

### 5. The two suites scripted flows can't replace

- **Seeded random walk with invariants:** pick ~15 operations, walk them randomly from a seed (env-overridable), re-check every model invariant after every step. Report seed + operation sequence on failure — a random test you cannot replay is a rumour. When the walk fails, first check what the model actually guarantees; the invariant may be wrong, not the code.
- **API fuzz of the trust boundary:** unknown action kinds, `null` where an object belongs, wrong types, negative/non-finite numbers, unknown enum members, path traversal in ids, oversized bodies, duplicate resends. **Two rules: nothing may answer 5xx, and nothing may change state.**

### 6. Evidence before filing

When a suite fails, probe before reading source: `document.elementFromPoint`, DOM event counts by type, patched `fetch` logging, server state before/after, a screenshot. A finding without evidence is a suspicion, not a bug.

## Findings → tasks (the mvp part)

Do **not** fix inline. Each **confirmed** bug becomes one task appended to the configured `<artifacts_dir>/tasks.jsonl` (resolve via mvp:configuring-mvp; default `docs/mvp`), following `mvp:task-breakdown` rules — file-wide sequential IDs, append-only:

- `feature`: `bug-bash-YYYY-MM-DD` (one slug per bash run)
- `goal`: `"Fix: <one-sentence bug statement>"` — the defect, not the symptom's location
- `success_criteria`: the reproducing test now passing — e.g. `"node --test suites/flow-dnd.test.mjs passes, including the currently-failing 'drop preserves clip' case"`. Write the failing test as part of filing the task if the suite doesn't already encode it.
- `resources`: the suite file, the evidence (probe output, failing assertion), and the source files implicated. Note the layer that owns the invariant — fixes belong there, not where the symptom surfaced.
- `dependencies`: usually none; bugs are independent unless one corrupts state another relies on.
- `complexity`: rate honestly — a one-line guard is `low`; a race or cross-layer invariant fix is `high`. It picks the fixer's model.

Keep the bash honest in a findings note (`<artifacts_dir>/specs/YYYY-MM-DD-bug-bash-findings.md`):
- what **held up** (so the next pass doesn't re-test it),
- what you **chose not to file** and why (design decisions and missing features are not bugs; mixing them in makes the list untrustworthy),
- candidates **investigated and rejected**, with the evidence.

Then display the DAG and offer delivery: `mvp:executing-tasks` for the swarm (bug fixes are usually independent), or `mvp:subagent-driven-development` when fixes touch the same code. Fix-wave rules: every fix ships with the test that failed first; mutation-test the risky ones (break the fix, confirm the test fails, restore); a fix that makes an *old* assertion fail means one of them encoded the buggy behaviour — decide which before touching either.

## Traps

| Trap | What it does to you |
|---|---|
| `pkill -f` for a restart | Old process survives, new one dies on `EADDRINUSE`, stale code keeps serving |
| Rebuilding mid-run | Poisons the run; failures you cannot reproduce |
| `requestfailed` as failure signal | Every 204 looks like a bug |
| jsdom for anything visual | Measures zeros; the test passes and means nothing |
| Fixed ids in a persisting test | Passes once, fails on the second run |
| Asserting through the UI only | "It appeared" is not "it was saved" |
| Your own stale expectations | A fix "fails" a test that encoded the bug |

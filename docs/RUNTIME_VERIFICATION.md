# DeepSeek Harness runtime verification — feasibility plugin

> **Stage 0 slice (2026-09-24, later run, label `stage0-win32`).** Added scenarios `service`
> (`roundtableCodeHealth` Cordis service consumed via `inject`, API, `roundtable/code-health/scan` event,
> in-flight `requestScan` rejected with `ROUNDTABLE_STOPPED` on unload, restart on re-enable) and
> `partial-coverage` (OS-unreadable file via ACL deny → `status: partial`, `failedFiles: [{path, code: EPERM}]`,
> finding stays `open`, cleared after access is restored); `lifecycle` now also asserts that a file change
> triggers a **targeted** one-file scan. First full run: 8/9 (`custom-ledger-path` saw one unexpected full scan
> while idle). After adding raw watch-event logging (`ROUNDTABLE_DEBUG_WATCH=1`, always on in `check.js`) the full
> run passed 9/9 and 6 further repetitions of `lifecycle` + `custom-ledger-path` passed 12/12; the idle flake did
> not reproduce locally, so its cause is **unknown**, not fixed. If it recurs, the failing check now prints every
> raw event and its scheduling decision. Evidence: `docs/evidence/dsh-runtime/2026-09-24-win32-stage0.json`.
> Scanner micro-benchmark (`scripts/bench-scanner.js`, Windows, warm cache, median of 3): full scan
> 2000×64 KB 811 → 783 ms; targeted one-file scan in the same workspace 4 ms (not available before);
> location lookup for 8000 matches in 1.4 MB 716 → 7 ms.


**Date:** 2026-09-24
**Status:** see §8 (cross-platform CI). Sections 1–7 describe the original local Windows verification.
**Evidence:** `docs/evidence/dsh-runtime/*.json` (machine-readable, local paths replaced by `<HOME>`).

Every result below comes from booting a real `dsh --profile <name>` process with the plugin installed through
`dsh plugin add`. Nothing here is inferred from source inspection.

## 1. Environment

| Item | Value |
|---|---|
| OS | Windows 10 22H2 (`10.0.19045`), x64 |
| Node.js | v24.15.0 |
| DeepSeek Harness | `@deepseek-ai/dsh@0.1.6-alpha.1` from npm (all 90+ `@deepseek-ai/dsh-*` packages pinned to the same version) |
| Cordis | `@deepseek-ai/cordis@4.0.4`, `cordis-plugin-loader@1.0.5`, `cordis-plugin-hmr@1.0.19` |
| pnpm (required by `dsh plugin`) | 10.34.5, installed locally next to dsh |
| Profile bundles | `@deepseek-ai/dsh-base` + `dsh-roundtable-beta` (custom profile, `patchReload: live`) |
| Plugin install form | `npm pack` tarball → `dsh plugin --profile <p> add <abs-path>.tgz` |

The npm release carries no `gitHead`, so the tested artifact is identified by npm version, not by the
upstream commit `0d1f5000…` recorded in `BETA_README.md` (that commit was source-inspected earlier; the
two were not proven identical).

## 2. Reproduction

```powershell
# 1. Pinned Harness in a directory outside the repository
mkdir C:\dsh-pin; copy scripts\dsh-runtime\runtime-package.json C:\dsh-pin\package.json
cd C:\dsh-pin; npm.cmd install --no-fund --no-audit
# 2. From the repository root: install, boot, and exercise the plugin (≈4 min)
node scripts/dsh-runtime/check.js --dsh-dir C:\dsh-pin --label <label>
```

`check.js` creates an isolated `DSH_HOME`, synthetic workspaces (no private code), sets
`DSH_TELEMETRY_DISABLED=1`, and writes `results-<label>.json`. No model provider, network call, or API key
is used; only npm registry downloads during installation.

Observation channels are implementation-independent so the same harness judges old and new plugin code:
plugin report lines on stdout (one line = one completed scan), ledger contents, a test-only probe plugin
(`scripts/dsh-runtime/probe-plugin.js`) sampling `process.getActiveResourcesInfo()`, and a preload
(`scripts/dsh-runtime/preload.js`) recording whether the process exited by natural event-loop drain
(`beforeExit`) or by `process.exit`.

## 3. Results

| Scenario | Plugin at `9c25d0f` (baseline) | Fixed plugin |
|---|---|---|
| install: pack, `dsh plugin add`, profile layer, `--dump-config` | pass (after dependency fix, §4.1) | pass |
| config validation: `debounceMs: 10` rejected by Schemastery, host keeps running, no scan, no ledger | pass | pass |
| initial scan + `.roundtable/findings.json` creation | pass (boot→scan 1.7 s) | pass (1.7 s) |
| idle: ledger write does not retrigger a scan | **fail** (1 self-triggered rescan) | pass (0) |
| single change → exactly one rescan | pass (270 ms) | pass (271 ms) |
| 30 writes in 465 ms → one scan | pass | pass |
| sustained edits every 150 ms for 3 s still produce a scan | **fail** (0 scans: debounce starvation) | pass (1) |
| writes under `node_modules`/`.git` ignored | **fail** (1 rescan) | pass (0) |
| custom `ledgerPath` outside `.roundtable` | **fail** (12 rescans in 3 s idle; ledger scanned as source → infinite loop) | pass (0) |
| HMR config change re-applies plugin, no watcher leak | pass | pass |
| 5 HMR unload/reload cycles: watcher removed (8→7 `FSEventWrap`), no scans while unloaded, no leak | pass | pass |
| bounded app exit: natural drain, no forced exit | pass (≈100 ms) | pass (57 ms) |
| cancellation: exit during a full scan of 4000×64 KB files | **fail** (disposer awaited the scan; host force-exited at its 5 s grace, `FSReqPromise` alive) | pass (106 ms, natural drain, previous ledger kept, no `.tmp`) |
| watched root renamed away while running | pass | pass |
| SIGINT path (emitted in-process) | disposal ran, exit 130 | disposal ran, plugin logged `stopped`, exit 130 in 41 ms |

Baseline: 3/7 scenarios passed. Fixed: 7/7.

## 4. Defects found and fixed

1. **Unpublished dependency version.** `package.json` required `@deepseek-ai/schemastery@3.18.0`, which does
   not exist on npm; installation from a tarball failed (`ERR_PNPM_NO_MATCHING_VERSION`). A `link:` install
   also failed at import time because the plugin's own `node_modules` was absent. Fixed to `^3.18.2`, the range
   used by DSH's own packages.
2. **Self-triggered rescans on Windows.** Reading directories during a scan produces `change` events for the
   directory itself. The watcher now ignores `change` events for non-source paths (`isRelevantChange`).
3. **Ledger feedback loop.** Only paths containing `.roundtable` were ignored; any other `ledgerPath` made each
   ledger write trigger a scan that also parsed the ledger JSON as source. The ledger and its temporaries are
   now excluded both from watching and from scanning.
4. **Ignored directories not ignored by the watcher.** Scanning skipped `node_modules`, `.git`, etc., but events
   under them still triggered full rescans.
5. **Debounce starvation.** A pure trailing debounce never fired under continuous edits. `lib/schedule.js` adds
   `maxWaitMs` (default 2000 ms).
6. **No cancellation.** Unload awaited an in-flight full scan. `scanWorkspace` now accepts an `AbortSignal`,
   checked between file operations and before the ledger write; an aborted scan never replaces the ledger.
7. **Unhandled watcher error.** An `FSWatcher` `error` event would crash the whole host; it is now logged and the
   watcher closed.

Unit tests for these behaviors: `test/lifecycle.test.js`.

## 5. Findings about the host (not plugin defects)

- `npm install @deepseek-ai/dsh@0.1.6-alpha.1` resolves most transitive `dsh-*` packages to `0.1.6-alpha.2`
  (caret ranges on prereleases); the launcher then fails with
  `does not provide an export named 'watchUserPatches'`. A coherent install needs `overrides` pinning every
  `@deepseek-ai/dsh-*` package (`scripts/dsh-runtime/runtime-package.json`).
- `dsh plugin` shells out to `pnpm`; it must be on `PATH`.
- On this Windows host 7 base entries stay inactive in every run (`sandbox` "failed to import", and six entries
  waiting for `sandbox`/`shell`), independent of Roundtable. The module imports fine from plain Node, so the cause
  is inside DSH activation and was not investigated further. Consequence: this run does not exercise any
  interaction with sandboxed shell tools.
- DSH bounds shutdown to 5 s and then calls `process.exit`; a plugin that does not cancel work is killed
  mid-operation rather than hanging the process.

## 6. Limits of this evidence

- **Platforms:** local runs are Windows 10 x64 only (no WSL/Docker on the test machine). Linux and macOS are
  covered by GitHub Actions hosted runners (§8), which are ephemeral VMs, not developer workstations.
- **Signals:** SIGINT was emitted inside the process (`process.emit`), exercising DSH's handler and the plugin
  disposer, but not OS signal delivery or Ctrl+C in a console. Real SIGTERM on POSIX is untested.
- **Harness surface:** a custom base-only profile was booted; `web`, `headless`, `sdk`, and Desktop profiles were
  not. No agent session, model call, tool use, or UI was involved.
- **Scale:** addressed in the Stage 0 slice (targeted rescans, O(n) locations; see the note at the top).
  Full scans still run at startup and on directory renames or unattributed events.
- **Version drift:** DSH is a developer preview; `next`/`alpha` tags were already at `0.1.7-*` on the test date.
  Results apply to `0.1.6-alpha.1` only.

## 7. Manual reproduction on another machine

CI (§8) now covers Linux and macOS automatically. To reproduce on a workstation with Node `^22.19.0 || >=24`:

```sh
mkdir ~/dsh-pin && cp scripts/dsh-runtime/runtime-package.json ~/dsh-pin/package.json
(cd ~/dsh-pin && npm install --no-fund --no-audit)
node scripts/dsh-runtime/check.js --dsh-dir ~/dsh-pin --label linux   # or macos
```

Commit the resulting `results-<label>.json` under `docs/evidence/dsh-runtime/` (replace the home path), and
additionally send a real `kill -INT` / `kill -TERM` to the dsh process once to confirm OS signal delivery.

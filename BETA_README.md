# Roundtable DeepSeek Harness feasibility plugin

This branch contains a runnable host-only feasibility spike for the planned Roundtable plugin. It proves the package and Cordis lifecycle shape for an agent-independent code-health worker; it is not the full MAS/MAD beta.

## Pinned upstream

- Repository: `deepseek-ai/deepseek-harness`
- Commit inspected: `0d1f50007f9bca3f52b06e1c3074fa14d5fb0720`
- Package version observed: `0.1.6-alpha.1`
- Runtime: Node.js `^22.19.0 || >=24.0.0`

DeepSeek Harness is a developer preview. This pin is evidence, not a claim of compatibility with later commits.

## What works in this spike

- installable DSH bundle manifest and `cordis.patch.yml`;
- Cordis `apply` plus `ctx.effect()` teardown;
- initial and debounced filesystem scans independent of agent activity;
- deterministic seed rules for conflict markers, empty catches, explicit stubs, unexplained `@ts-ignore`, and probable hardcoded credentials;
- redaction of probable credential values;
- stable finding fingerprints and persistent new/existing/fixed/regressed ledger states;
- atomic ledger writes to `.roundtable/findings.json`;
- deterministic project/public claim routing skeleton;
- dependency-free unit tests for the scanner core.

## Local validation

```sh
npm test
```

The pure scanner can also be called directly from `lib/scanner.js`. Full DSH activation requires a compatible DSH installation.

## Install into DSH

After checking out this branch locally:

```sh
dsh plugin --profile roundtable-beta add /absolute/path/to/mas-harness-project
dsh --profile roundtable-beta --dump-config
dsh --profile roundtable-beta
```

Set `ROUND_TABLE_WORKSPACE` to the repository that should be scanned. Do not point the spike at an untrusted filesystem tree.

## Important limitations

- Runtime-verified only on Windows 10 x64 with `@deepseek-ai/dsh@0.1.6-alpha.1` (`docs/RUNTIME_VERIFICATION.md`); Linux and macOS are unverified.
- Install from a packed tarball (`npm pack`) or registry; a `link:` install of a checkout without its own `node_modules` fails to import `@deepseek-ai/schemastery`.
- File events currently coalesce into a full text scan (debounce `debounceMs`, bounded by `maxWaitMs`); production needs changed-file/range scheduling.
- The ledger is JSON, not the planned transactional SQLite/WAL store.
- Rules are regex heuristics, not AST analysis and not proof of AI authorship.
- The Claim Critic has only a deterministic routing skeleton; no web provider or model is wired.
- There is no Problems-panel UI, model-call interception, MAD workflow, sandbox integration, or approval flow yet.
- The scanner logs failures but does not yet expose a DSH runtime health service.

## Next gate

Done for Windows: `node scripts/dsh-runtime/check.js --dsh-dir <pinned dsh dir>` proves load, config validation, file events, debounce, HMR unload, cancellation, clean shutdown, and ledger creation. Remaining: run it on Linux and macOS. Next engineering stage: formal service seam, changed-file scheduling, transactional store, analyzer subprocess adapters, UI.

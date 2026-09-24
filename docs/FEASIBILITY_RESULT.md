# Stage -1 feasibility result

## Verdict

**Runtime pass on Windows; Linux/macOS unverified.** The official DeepSeek Harness architecture has appropriate extension seams for Roundtable: Cordis plugins, reversible effects, typed events, background jobs, tool interception, settings cards, and client modules. A host-only code-health worker can be shipped as an out-of-tree bundle without modifying Harness core.

**Update 2026-09-24:** the plugin was installed and exercised in a real `@deepseek-ai/dsh@0.1.6-alpha.1` process on Windows 10 x64 (see `docs/RUNTIME_VERIFICATION.md`). The original spike failed 4 of 7 runtime scenarios (self-triggered rescans, ledger feedback loop, debounce starvation, no cancellation) and could not be installed from a tarball; all were fixed and the fixed plugin passes 7/7. The remaining gap is platform coverage and real OS signal delivery. The earlier text below is retained as the pre-runtime assessment.

## Confirmed upstream contracts

- A plugin exports `name` and `apply(ctx, config)`.
- `ctx.effect()` owns resources and returns their unload disposer.
- Required services are declared with `inject`.
- Installed plugins ship as bundles with `package.json#dsh.bundle.patch` and `cordis.patch.yml`.
- `dsh plugin --profile <name> add <package>` installs a bundle into a profile.
- Background work belongs behind the `ctx.jobs` seam when exposed to agents.
- UI settings require separate Host and Client halves; out-of-tree client bundles must reproduce DSH's bundle format.
- Durable, model-visible inputs must be represented in session events.

## Architectural consequence

The beta should not patch AgentLoop. `CodeHealthService` starts as a host plugin managed by Cordis lifecycle. Later it exposes a formal service and persists findings transactionally. Agent context receives compact findings through documented agent/session seams. `ClaimCritic` belongs at a request or team-message boundary, with public retrieval provided by an injected web seam and corrections recorded as durable evidence.

## Risks discovered

1. **API churn:** DSH explicitly allows compatibility-breaking changes.
2. **UI packaging:** external browser bundles lack a published build preset, so UI is a later risk.
3. **Model-visible audit rule:** injected finding or correction text must be logged, not only held in memory.
4. **Filesystem semantics:** recursive watch behavior and event coalescing need platform tests.
5. **Public-search safety:** the critic needs a capability-restricted retriever and must treat pages as untrusted.
6. **Install-time trust:** Git-based packages with build scripts require explicit pnpm build permission; this spike avoids a build script by shipping JavaScript directly.

## Go/no-go gate

Status 2026-09-24: all items below are recorded for Windows in `docs/RUNTIME_VERIFICATION.md`; the platform item is resolved as "Windows only until Linux/macOS runs exist".

Proceed to Stage 0 only after a developer runs the documented installation against the pinned upstream commit and records:

- successful bundle resolution and config validation;
- initial scan and ledger creation;
- changed-file rescan latency;
- HMR/unload cleanup with no surviving watcher;
- process shutdown with no hanging handle;
- behavior on Linux, macOS, and Windows or an explicit supported-platform decision.

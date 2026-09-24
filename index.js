import { watch } from 'node:fs'
import Schema from '@deepseek-ai/schemastery'
import { CodeHealthService, SCAN_EVENT, SERVICE_NAME } from './lib/service.js'

export const name = 'roundtable-code-health'

const PREFIX = '[roundtable-code-health]'

export const Config = Schema.object({
  root: Schema.string().default(process.cwd()),
  ledgerPath: Schema.string().default('.roundtable/findings.json'),
  debounceMs: Schema.number().min(50).max(5000).step(1).default(250),
  // Upper bound on how long continuous edits may postpone a scan (debounce starvation guard).
  maxWaitMs: Schema.number().min(100).max(60_000).step(1).default(2000),
  maxFileBytes: Schema.number().min(1024).max(10_000_000).step(1).default(1_000_000),
  watch: Schema.boolean().default(true),
})

function report(result) {
  const open = result.findings.filter(finding => finding.status !== 'fixed')
  const newCount = open.filter(finding => finding.baselineStatus === 'new' || finding.baselineStatus === 'worsened').length
  const extra = result.status === 'partial'
    ? ` [partial: ${result.coverage.failedFiles.length} failed, ${result.coverage.carriedFailures.length} carried]`
    : ''
  console.log(`${PREFIX} ${open.length} open findings (${newCount} new/regressed); ${result.coverage.scannedFiles} files scanned (${result.mode})${extra}`)
}

export function apply(ctx, config) {
  const service = new CodeHealthService({
    ...config,
    onResult: result => {
      report(result)
      ctx.emit(SCAN_EVENT, { scanId: result.scanId, mode: result.mode, status: result.status, summary: result.summary })
    },
    onError: error => console.error(`${PREFIX} scan failed`, error),
    onListenerError: error => console.error(`${PREFIX} scan listener failed`, error),
  })

  // `ctx.roundtableCodeHealth`: consumers declare `inject: ['roundtableCodeHealth']`.
  // Registered through the fiber, so it is withdrawn automatically on unload/HMR.
  ctx.provide(SERVICE_NAME, service.api())

  ctx.effect(() => {
    service.start()
    let watcher
    if (config.watch) {
      // ROUNDTABLE_DEBUG_WATCH=1 logs every raw watch event and its scheduling decision.
      const debugWatch = process.env.ROUNDTABLE_DEBUG_WATCH === '1'
      watcher = watch(service.root, { recursive: true }, (eventType, filename) => {
        const request = service.handleWatchEvent(eventType, filename)
        if (debugWatch) console.log(`${PREFIX} watch ${eventType} ${JSON.stringify(filename)} -> ${request.kind}${request.path ? ` ${request.path}` : ''}`)
      })
      // An unhandled FSWatcher 'error' would crash the whole DSH host process.
      watcher.on('error', error => {
        console.error(`${PREFIX} file watcher failed; continuous scanning stopped until reload`, error)
        watcher.close()
      })
    }
    return async () => {
      watcher?.close()
      const { cancelled } = await service.dispose()
      console.log(`${PREFIX} stopped${cancelled ? ' (active scan cancelled)' : ''}`)
    }
  }, 'roundtable code-health lifecycle')
}

export { CodeHealthEngine, scanWorkspace } from './lib/scanner.js'
export { CodeHealthService, SCAN_EVENT, SERVICE_NAME } from './lib/service.js'
export { classifyClaim, claimCheckDecision } from './lib/claim-critic.js'

import { watch } from 'node:fs'
import { resolve } from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { createScanScheduler } from './lib/schedule.js'
import { isRelevantChange, scanWorkspace } from './lib/scanner.js'

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
  console.log(`${PREFIX} ${open.length} open findings (${newCount} new/regressed); ${result.coverage.scannedFiles} files scanned`)
}


export function apply(ctx, config) {
  ctx.effect(() => {
    const root = resolve(config.root)
    let closed = false
    let active = Promise.resolve()
    let controller

    const runScan = () => {
      active = active.then(async () => {
        if (closed) return
        controller = new AbortController()
        try {
          report(await scanWorkspace({ ...config, signal: controller.signal }))
        } catch (error) {
          if (!(closed && controller.signal.aborted)) console.error(`${PREFIX} scan failed`, error)
        } finally {
          controller = undefined
        }
      })
    }

    const scheduler = createScanScheduler({ debounceMs: config.debounceMs, maxWaitMs: config.maxWaitMs, run: runScan })
    scheduler.request()

    let watcher
    if (config.watch) {
      watcher = watch(root, { recursive: true }, (eventType, filename) => {
        if (isRelevantChange(eventType, filename, { root, ledgerPath: config.ledgerPath })) scheduler.request()
      })
      // An unhandled FSWatcher 'error' would crash the whole DSH host process.
      watcher.on('error', error => {
        console.error(`${PREFIX} file watcher failed; continuous scanning stopped until reload`, error)
        watcher.close()
      })
    }

    return async () => {
      closed = true
      scheduler.close()
      watcher?.close()
      const cancelled = controller !== undefined
      controller?.abort()
      await active
      console.log(`${PREFIX} stopped${cancelled ? ' (active scan cancelled)' : ''}`)
    }
  }, 'roundtable code-health lifecycle')
}

export { scanWorkspace } from './lib/scanner.js'
export { classifyClaim, claimCheckDecision } from './lib/claim-critic.js'

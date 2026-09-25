// Test-only consumer of the `roundtableCodeHealth` Cordis service, used by
// scripts/dsh-runtime/check.js. It depends on the service through `inject`, so Cordis
// starts it only while the Roundtable plugin is active and disposes it on unload.
import { appendFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'roundtable-service-probe'
export const inject = ['roundtableCodeHealth']

export function apply(ctx, config) {
  const log = (event, extra = {}) => {
    appendFileSync(config.logPath, `${JSON.stringify({ t: Date.now(), event, ...extra })}\n`)
  }
  const consume = flag => {
    const path = join(config.controlDir, flag)
    if (!existsSync(path)) return false
    rmSync(path, { force: true })
    return true
  }

  ctx.effect(() => {
    const service = ctx.roundtableCodeHealth
    log('service-available', {
      version: service.version,
      frozen: Object.isFrozen(service),
      methods: Object.keys(service).sort(),
      status: service.status(),
    })
    const unsubscribe = service.onScan(summary => log('service-scan', { summary }))
    const offEvent = ctx.on('roundtable/code-health/scan', payload => log('cordis-event', { payload }))
    const timer = setInterval(() => {
      if (consume('service-request')) {
        log('service-request-sent')
        service.requestScan({ paths: ['src/seed.js'] }).then(
          result => {
            const snapshot = service.snapshot()
            log('service-request-result', {
              mode: result.mode,
              status: result.status,
              requestedPaths: result.requestedPaths,
              scannedFiles: result.coverage.scannedFiles,
              snapshotScanId: snapshot?.scanId === result.scanId,
              snapshotFindings: snapshot?.findings.length,
            })
          },
          error => log('service-request-error', { name: error?.name, code: error?.code, message: String(error?.message) }),
        )
      }
      if (consume('service-invalid')) {
        // requestScan reports validation errors as a rejected promise, never a synchronous throw.
        service.requestScan({ paths: ['../outside.js'] }).then(
          () => log('service-invalid-accepted'),
          error => log('service-invalid-rejected', { name: error?.name }),
        )
      }
      if (consume('service-slow')) {
        // Full scan that the test interrupts by unloading the provider mid-scan.
        log('service-slow-sent')
        service.requestScan().then(
          result => log('service-slow-result', { mode: result.mode }),
          error => log('service-slow-error', { name: error?.name, code: error?.code }),
        )
      }
    }, config.intervalMs ?? 100)
    timer.unref()
    return () => {
      clearInterval(timer)
      unsubscribe()
      offEvent()
      log('service-probe-stop')
    }
  }, 'roundtable service probe')
}

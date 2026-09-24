// Test-only Cordis plugin used by scripts/dsh-runtime/check.js.
// It observes the host process from inside the DSH tree without touching the
// Roundtable plugin: it samples active libuv resources and executes control
// commands dropped as flag files (request bounded app exit, emulate SIGINT).
import { appendFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'roundtable-runtime-probe'

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
    log('probe-start', { pid: process.pid, platform: process.platform, node: process.version })
    const timer = setInterval(() => {
      log('resources', { resources: process.getActiveResourcesInfo() })
      if (consume('app-exit')) {
        log('app-exit-requested')
        const exit = ctx.get('appExit')
        if (typeof exit === 'function') exit(0)
        else log('app-exit-unavailable')
      }
      if (consume('sigint')) {
        log('sigint-emulated')
        process.emit('SIGINT', 'SIGINT')
      }
    }, config.intervalMs ?? 200)
    timer.unref()
    return () => {
      clearInterval(timer)
      log('probe-stop')
    }
  }, 'roundtable runtime probe')
}

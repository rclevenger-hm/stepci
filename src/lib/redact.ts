// Redact copies at the output boundary; never change values used by checks.
const sensitiveKey = /^(authorization|proxy-authorization|cookie|set-cookie|password|passwd|client_secret|token|access_token|refresh_token|api[-_]?key|secret|privateKey|passphrase)$/i

export class Redactor {
  private values = new Set<string>()

  add(value: unknown) {
    if (typeof value !== 'string' || !value) return
    const variants = [value, JSON.stringify(value).slice(1, -1), Buffer.from(value).toString('base64')]
    try { variants.push(encodeURIComponent(value), encodeURI(value)) } catch { /* Invalid Unicode still gets literal redaction. */ }
    for (const variant of variants) {
      this.values.add(variant)
    }
  }

  arguments(args: string[]) {
    let secrets = false
    for (const arg of args) {
      if (arg === '--secret' || arg === '-s') { secrets = true; continue }
      if (/^(--secret=|-s.)/.test(arg)) {
        const entry = arg.replace(/^(--secret=|-s=?)/, '')
        this.add(entry.includes('=') ? entry.slice(entry.indexOf('=') + 1) : entry)
        secrets = false
      } else if (arg.startsWith('-')) secrets = false
      else if (secrets) this.add(arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : arg)
    }
  }

  collect(value: unknown, seen = new WeakSet<object>()) {
    if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || seen.has(value)) return
    seen.add(value)
    for (const [key, item] of Object.entries(value)) {
      if (sensitiveKey.test(key)) {
        for (const secret of Array.isArray(item) ? item : [item]) {
          this.add(secret)
          if (typeof secret === 'string' && /authorization/i.test(key)) {
            this.add(secret.replace(/^(Bearer|Basic)\s+/i, ''))
            if (/^Basic /i.test(secret)) {
              const decoded = Buffer.from(secret.slice(6), 'base64').toString()
              this.add(decoded)
              this.add(decoded.slice(decoded.indexOf(':') + 1))
            }
          }
        }
      }
      this.collect(item, seen)
    }
  }

  text(value: string): string {
    // Longest first prevents a shorter secret exposing a longer one's suffix.
    for (const secret of [...this.values].sort((a, b) => b.length - a.length)) {
      value = value.split(secret).join('[REDACTED]')
    }
    return value
  }

  value<T>(value: T): T {
    this.collect(value)
    const seen = new WeakMap<object, any>()
    const visit = (item: any): any => {
      if (typeof item === 'string') return this.text(item)
      if (!item || typeof item !== 'object' || item instanceof Date) return item
      if (Buffer.isBuffer(item)) return Buffer.from(this.text(item.toString()))
      if (item instanceof Error) return this.text(`${item.name}: ${item.message}`)
      if (seen.has(item)) return '[Circular]'
      const result: any = Array.isArray(item) ? [] : {}
      seen.set(item, result)
      for (const [key, child] of Object.entries(item)) {
        result[this.text(key)] = sensitiveKey.test(key) ? '[REDACTED]' : visit(child)
      }
      return result
    }
    return visit(value)
  }
}

export function redactConsole(redactor: Redactor) {
  for (const method of ['log', 'error', 'warn', 'info', 'debug'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: any[]) => {
      args.forEach(arg => redactor.collect(arg))
      original(...args.map(arg => redactor.value(arg)))
    }
  }
}

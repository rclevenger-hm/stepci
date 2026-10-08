#!/usr/bin/env node
const path = require('node:path')
const { spawn } = require('node:child_process')

// Legacy whitespace/quoted inputs remain supported, without shell expansion.
// Prefer JSON arrays or objects when values contain spaces or punctuation.
function inputArguments(input = '') {
  if (!input.trim()) return []
  if (/^[\[{]/.test(input.trim())) {
    let parsed
    try { parsed = JSON.parse(input) } catch { throw new Error('Action input must contain valid JSON') }
    if (Array.isArray(parsed) && parsed.every(value => typeof value === 'string')) return parsed
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
      Object.values(parsed).every(value => typeof value === 'string')) {
      return Object.entries(parsed).map(([key, value]) => `${key}=${value}`)
    }
    throw new Error('Action input must be a JSON string array or an object with string values')
  }
  const args = []
  let word = '', quote = '', escaped = false, started = false
  for (const char of input) {
    if (escaped) { word += char; escaped = false; started = true; continue }
    if (char === '\\' && quote !== "'") { escaped = true; started = true; continue }
    if (quote) {
      if (char === quote) quote = ''
      else word += char
    } else if (char === '"' || char === "'") { quote = char; started = true }
    else if (/\s/.test(char)) {
      if (started) args.push(word)
      word = ''; started = false
    } else { word += char; started = true }
  }
  if (escaped || quote) throw new Error('Action input has an unfinished quote or escape')
  if (started) args.push(word)
  return args
}

function main() {
  const args = [path.resolve(__dirname, '../dist/index.js'), 'run', ...process.argv.slice(2)]
  const env = { ...process.env }
  for (const [name, option] of [['ENV', '--env'], ['SECRETS', '--secret']]) {
    const values = inputArguments(process.env[name])
    if (values.some(value => !/^\w+=.+$/s.test(value))) throw new Error(`${name} entries must be key=value`)
    if (name === 'SECRETS' && values.length) {
      env.STEPCI_SECRETS = JSON.stringify(Object.fromEntries(values.map(value => {
        const split = value.indexOf('=')
        return [value.slice(0, split), value.slice(split + 1)]
      })))
    } else for (const value of values) args.push(option, value)
  }
  delete env.SECRETS
  if (process.env.VERBOSE === 'true') args.push('--verbose')
  if (process.env.LOADTEST === 'true') args.push('--loadtest')
  if (process.env.CONCURRENCY) {
    if (!/^\d+$/.test(process.env.CONCURRENCY)) throw new Error('CONCURRENCY must be a non-negative integer')
    args.push('--concurrency', process.env.CONCURRENCY)
  }
  const child = spawn(process.execPath, args, { stdio: 'inherit', env })
  const forward = signal => child.kill(signal)
  const signals = ['SIGTERM', 'SIGINT']
  const handlers = signals.map(signal => () => forward(signal))
  signals.forEach((signal, index) => process.on(signal, handlers[index]))
  child.on('error', () => { console.error('Unable to start the StepCI CLI'); process.exitCode = 1 })
  child.on('exit', (code, signal) => {
    signals.forEach((name, index) => process.removeListener(name, handlers[index]))
    if (signal) process.kill(process.pid, signal)
    else process.exitCode = code ?? 1
  })
}
if (require.main === module) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { inputArguments }

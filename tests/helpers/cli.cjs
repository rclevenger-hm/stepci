const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const cli = path.resolve(process.env.STEPCI_TEST_CLI || path.join(__dirname, '../../dist/index.js'))

async function runCLI(workflow, extra = [], options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'stepci-fixture-'))
  const workflowPath = path.join(directory, 'workflow with spaces.yml')
  const networkLog = path.join(directory, 'network.log')
  const mode = options.mode || process.env.STEPCI_TEST_MODE || 'cli'
  try {
    if (workflow !== null) await fs.writeFile(workflowPath, workflow)
    // No inherited credentials, proxy configuration, NODE_OPTIONS or NODE_PATH.
    const env = {
      PATH: path.dirname(process.execPath), HOME: directory, USERPROFILE: directory,
      XDG_CONFIG_HOME: directory, APPDATA: directory, LOCALAPPDATA: directory,
      STEPCI_TEST_NETWORK_LOG: networkLog,
      NO_COLOR: '1', NO_PROXY: '*', CI: 'true', TZ: 'UTC',
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      ...(options.env || {})
    }
    if (mode === 'action') env.NODE_OPTIONS = `--require=${path.join(__dirname, 'loopback-only.cjs')}`
    if (options.recordArgs) {
      env.NODE_OPTIONS += ` --require=${path.join(__dirname, 'record-pid.cjs')}`
      env.STEPCI_TEST_RECORD_ARGS = path.join(directory, 'arguments.json')
    }
    const result = await new Promise((resolve, reject) => {
      let executable = process.execPath
      let args = ['--require', path.join(__dirname, 'loopback-only.cjs'),
        mode === 'action' ? path.resolve(cli, '../../scripts/action-entrypoint.cjs') : cli,
        ...(mode === 'action' ? [] : [options.command || 'run']), workflowPath, ...extra]
      if (mode === 'container' || mode === 'container-action') {
        executable = 'docker'
        const containerEnv = { ...env, HOME: '/case', USERPROFILE: '/case', XDG_CONFIG_HOME: '/case',
          APPDATA: '/case', LOCALAPPDATA: '/case', STEPCI_TEST_NETWORK_LOG: '/case/network.log',
          NODE_OPTIONS: '--require=/fixtures/loopback-only.cjs' }
        delete containerEnv.PATH
        args = ['run', '--rm', '--network', 'host',
          '--volume', `${directory}:/case`, '--volume', `${__dirname}:/fixtures:ro`,
          '--workdir', '/case', ...Object.entries(containerEnv).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
          ...(mode === 'container' ? ['--entrypoint', 'node'] : []),
          process.env.STEPCI_TEST_IMAGE || 'stepci:dev-test',
          ...(mode === 'container' ? ['/app/dist/index.js', options.command || 'run'] : []),
          '/case/workflow with spaces.yml', ...extra]
        env.PATH = process.env.PATH
      }
      const child = spawn(executable, args, { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, mode.startsWith('container') ? 20000 : 10000)
      child.stdout.on('data', data => { output += data })
      child.stderr.on('data', data => { output += data })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('close', (code, signal) => {
        clearTimeout(timer)
        resolve({ code, signal, timedOut, output: output.replace(/\x1b\[[0-9;]*m/g, '') })
      })
    })
    assert.equal(result.timedOut, false, `CLI exceeded 10 seconds:\n${result.output}`)
    assert.equal(result.signal, null, `CLI killed by ${result.signal}:\n${result.output}`)
    const attempts = await fs.readFile(networkLog, 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error
      return ''
    })
    assert.equal(attempts, '', 'CLI attempted network access outside the fixture')
    result.files = await fs.readdir(directory, { recursive: true })
    if (options.readFile) result.file = await fs.readFile(path.join(directory, options.readFile), 'utf8')
    if (options.recordArgs) result.arguments = JSON.parse(await fs.readFile(path.join(directory, 'arguments.json'), 'utf8'))
    return result
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

function workflowFor(url, { check = 'status: 200', extra = '', timeout = '2s' } = {}) {
  return `version: "1.1"
name: Local deployment check
tests:
  deployment:
    steps:
      - name: Check deployment
        http:
          url: ${JSON.stringify(url)}
          method: GET
          timeout: ${timeout}
          retries: 0
${extra ? extra.split('\n').map(line => '          ' + line).join('\n') + '\n' : ''}          check:
${check.split('\n').map(line => '            ' + line).join('\n')}
`
}
function expectCode(result, code) {
  assert.equal(result.code, code, result.output)
}
module.exports = { runCLI, workflowFor, expectCode }

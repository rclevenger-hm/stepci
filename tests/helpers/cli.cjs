const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const cli = path.resolve(process.env.STEPCI_TEST_CLI || path.join(__dirname, '../../dist/index.js'))

async function runCLI(workflow, extra = []) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'stepci-fixture-'))
  const workflowPath = path.join(directory, 'workflow with spaces.yml')
  const networkLog = path.join(directory, 'network.log')
  try {
    if (workflow !== null) await fs.writeFile(workflowPath, workflow)
    // No inherited credentials, proxy configuration, NODE_OPTIONS or NODE_PATH.
    const env = {
      PATH: path.dirname(process.execPath), HOME: directory, USERPROFILE: directory,
      XDG_CONFIG_HOME: directory, APPDATA: directory, LOCALAPPDATA: directory,
      STEPCI_DISABLE_ANALYTICS: '1', STEPCI_TEST_NETWORK_LOG: networkLog,
      NO_COLOR: '1', NO_PROXY: '*', CI: 'true', TZ: 'UTC',
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {})
    }
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--require', path.join(__dirname, 'loopback-only.cjs'),
        cli, 'run', workflowPath, ...extra], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, 10000)
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

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { test, before, after } = require('node:test')
const { startFixture, TOKEN } = require('./helpers/fixture.cjs')
const { runCLI, workflowFor, expectCode } = require('./helpers/cli.cjs')
const cli = path.resolve(process.env.STEPCI_TEST_CLI || 'dist/index.js')
const launcher = path.resolve(cli, '../../scripts/action-entrypoint.cjs')
const { inputArguments } = require(launcher)
let fixture
before(async () => { fixture = await startFixture() })
after(async () => { await fixture?.close() })

test('Action accepts spaces, quotes and shell metacharacters as literal values', async () => {
  const value = 'two words "quoted"; $(touch injected) `touch injected` & | *'
  const result = await runCLI(workflowFor(`${fixture.url}/health`, {
    extra: 'headers:\n  X-Fixture-Marker: ${{ env.marker }}\nauth:\n  bearer:\n    token: ${{ secrets.token }}'
  }), [], { mode: 'action', env: { ENV: JSON.stringify({ marker: value }),
    SECRETS: JSON.stringify({ token: value }), VERBOSE: 'true', CONCURRENCY: '2' } })
  expectCode(result, 0)
  assert.equal(fixture.requests.at(-1).marker, value)
  assert.equal(fixture.requests.at(-1).authorization, `Bearer ${value}`)
  assert.ok(!result.output.includes(value), result.output)
  assert.ok(!result.files.includes('injected'))
})

test('legacy quoted inputs are parsed without command or variable expansion', () => {
  assert.deepEqual(inputArguments('one="two words" two=\'literal $HOME;`id`\''),
    ['one=two words', 'two=literal $HOME;`id`'])
  assert.throws(() => inputArguments('one="unfinished'), /unfinished quote/)
})

test('Action passes secrets without exposing them in the CLI child arguments', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/auth`, {
    extra: 'auth:\n  bearer:\n    token: ${{ secrets.token }}'
  }), [], { mode: 'action', recordArgs: true, env: { SECRETS: JSON.stringify({ token: TOKEN }) } })
  expectCode(result, 0)
  assert.ok(!JSON.stringify(result.arguments).includes(TOKEN))
  assert.equal(fixture.requests.at(-1).authorization, `Bearer ${TOKEN}`)
})

test('Action propagates check failure and input-error exit codes', async () => {
  expectCode(await runCLI(workflowFor(`${fixture.url}/broken`), [], { mode: 'action' }), 5)
  const result = await runCLI(workflowFor(`${fixture.url}/health`), [],
    { mode: 'action', env: { SECRETS: '["private-fixture-secret' } })
  expectCode(result, 1)
  assert.ok(!result.output.includes('private-fixture-secret'))
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`Action forwards ${signal} and reaps the CLI child`, { skip: process.platform !== 'linux', timeout: 10000 }, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'stepci-cancel-'))
    const file = path.join(directory, 'workflow.yml')
    let child, descendant
    try {
      await fs.writeFile(file, workflowFor(`${fixture.url}/slow`, { timeout: '9s' }))
      const count = fixture.requests.length
      child = spawn(process.execPath, [launcher, file], { stdio: 'ignore', env: {
        PATH: path.dirname(process.execPath), HOME: directory,
        STEPCI_TEST_RECORD_PID: path.join(directory, 'cli.pid'),
        NODE_OPTIONS: `--require=${path.join(__dirname, 'helpers/loopback-only.cjs')} --require=${path.join(__dirname, 'helpers/record-pid.cjs')}`
      } })
      const closed = once(child, 'close')
      const deadline = Date.now() + 4000
      while (fixture.requests.length === count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
      assert.ok(fixture.requests.length > count, 'CLI never started its request')
      descendant = Number(await fs.readFile(path.join(directory, 'cli.pid'), 'utf8'))
      assert.ok(descendant > 0)
      child.kill(signal)
      const [code, endedBy] = await closed
      assert.equal(code, null)
      assert.equal(endedBy, signal)
      assert.throws(() => process.kill(descendant, 0), error => error.code === 'ESRCH')
      descendant = undefined
    } finally {
      if (descendant) { try { process.kill(descendant, 'SIGKILL') } catch {} }
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
}

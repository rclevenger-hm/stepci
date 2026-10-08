const assert = require('node:assert/strict')
const fs = require('node:fs')
const { startFixture, TOKEN } = require('./helpers/fixture.cjs')
const { workflowFor } = require('./helpers/cli.cjs')
const root = 'artifacts/action-fixture'
if (process.argv[2] === 'verify') {
  assert.equal(process.env.BROKEN_OUTCOME, 'failure')
  const requests = JSON.parse(fs.readFileSync(`${root}/requests.json`, 'utf8'))
  assert.ok(requests.some(request => request.url === '/auth' && request.authorization === `Bearer ${TOKEN}` &&
    request.marker === 'two words; $(touch injected)'))
  assert.ok(requests.some(request => request.url === '/broken'))
  assert.equal(fs.existsSync('injected'), false)
  console.log('Reusable Action passed the healthy check, failed the broken check and preserved literal inputs.')
} else {
  startFixture(process.env.FIXTURE_HOST).then(fixture => {
    fs.mkdirSync(root, { recursive: true })
    fixture.server.on('request', () => fs.writeFileSync(`${root}/requests.json`, JSON.stringify(fixture.requests)))
    fs.writeFileSync(`${root}/healthy.yml`, workflowFor(`${fixture.url}/auth`, {
      extra: 'headers:\n  X-Fixture-Marker: ${{ env.marker }}\nauth:\n  bearer:\n    token: ${{ secrets.token }}'
    }))
    fs.writeFileSync(`${root}/broken.yml`, workflowFor(`${fixture.url}/broken`))
    fs.writeFileSync(`${root}/ready`, 'ready')
    process.on('SIGTERM', () => fixture.close().then(() => process.exit(0)))
  }).catch(error => { console.error(error); process.exitCode = 1 })
}

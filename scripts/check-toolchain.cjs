const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const expectedNode = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim()
const expectedNpm = require('../package.json').packageManager.slice(4)
assert.equal(process.versions.node, expectedNode, `Build with Node ${expectedNode} (nvm use)`)
assert.equal(process.env.npm_config_user_agent?.split(' ')[0], `npm/${expectedNpm}`,
  `Build with npm ${expectedNpm}; invoke through npm run`)

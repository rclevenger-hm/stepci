// Regenerate the contributor's compiled runner with its own locked compiler.
// Source and runtime dependency graphs remain separate and are both recorded.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { sha256 } = require('./provenance.cjs')
const root = path.resolve(__dirname, '..')
const revision = require('../runner-revision.json')
const manifest = require('../package.json')
const locked = require('../package-lock.json').packages['node_modules/@stepci/runner']
assert.equal(manifest.dependencies['@stepci/runner'], revision.archive)
assert.equal(locked.resolved, revision.archive)
assert.match(locked.integrity, /^sha512-/)
const installed = path.dirname(require.resolve('@stepci/runner/package.json'))
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stepci-runner-source-'))
const tree = (directory, prefix = '') => fs.readdirSync(directory, { withFileTypes: true })
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  .flatMap(entry => entry.isDirectory()
    ? tree(path.join(directory, entry.name), prefix + entry.name + '/') : [prefix + entry.name])
try {
  for (const file of ['src', 'package.json', 'package-lock.json', 'tsconfig.json']) {
    fs.cpSync(path.join(installed, file), path.join(temp, file), { recursive: true })
  }
  execFileSync(process.execPath, [process.env.npm_execpath, 'ci', '--ignore-scripts',
    '--no-audit', '--no-fund'], { cwd: temp, stdio: 'inherit', timeout: 180000 })
  execFileSync(process.execPath, [path.join(temp, 'node_modules/typescript/bin/tsc'),
    '-p', 'tsconfig.json'], { cwd: temp, stdio: 'inherit', timeout: 60000 })
  const files = tree(path.join(temp, 'dist'))
  assert.deepEqual(files, tree(path.join(installed, 'dist')), 'Runner compiled file inventory differs')
  for (const file of files) {
    assert.equal(sha256(path.join(temp, 'dist', file)), sha256(path.join(installed, 'dist', file)),
      `Runner source/artifact mismatch: ${file}`)
  }
  fs.cpSync(path.join(temp, 'dist'), path.join(installed, 'dist'), { recursive: true })
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true })
  fs.writeFileSync(path.join(root, 'artifacts/runner-rebuild.json'), JSON.stringify({
    ...revision, integrity: locked.integrity,
    compiler: JSON.parse(fs.readFileSync(path.join(temp, 'node_modules/typescript/package.json'))).version,
    sourceLockSha256: sha256(path.join(temp, 'package-lock.json')),
    artifacts: Object.fromEntries(files.map(file => [file, sha256(path.join(temp, 'dist', file))]))
  }, null, 2) + '\n')
  console.log(`Regenerated ${files.length} runner artifacts from ${revision.commit}; all bytes match.`)
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

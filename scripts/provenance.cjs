const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')

const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
function files(root, directory = '') {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .filter(entry => entry.name !== 'node_modules')
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .flatMap(entry => {
      const name = directory ? `${directory}/${entry.name}` : entry.name
      return entry.isDirectory() ? files(root, name) : [name]
    })
}
function snapshot(root, lock) {
  const requireCLI = createRequire(path.join(root, 'dist/index.js'))
  const dependencies = {}
  for (const name of ['@stepci/runner', '@stepci/plugin-openapi']) {
    const manifestPath = requireCLI.resolve(`${name}/package.json`)
    const directory = path.dirname(manifestPath)
    const manifest = read(manifestPath)
    const locked = lock.packages[`node_modules/${name}`]
    assert.equal(manifest.version, locked.version, `${name}: installed version differs from lock`)
    assert.equal(read(path.join(root, 'package.json')).dependencies[name], locked.version,
      `${name}: direct dependency must be pinned exactly`)
    dependencies[name] = {
      version: manifest.version, resolved: locked.resolved, integrity: locked.integrity,
      entrypoint: path.relative(directory, requireCLI.resolve(name)).split(path.sep).join('/'),
      files: Object.fromEntries(files(directory)
        .map(file => [file, sha256(path.join(directory, file))]))
    }
  }
  // Verify the whole production graph, not only the top-level version labels.
  const production = {}
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location || entry.dev) continue
    let resolver = requireCLI
    let installed
    for (const name of location.replace(/^node_modules\//, '').split('/node_modules/')) {
      const manifestPath = resolver.resolve.paths('stepci-dependency-inspection')
        .map(directory => path.join(directory, name, 'package.json'))
        .find(file => fs.existsSync(file))
      assert.ok(manifestPath, `${location}: production dependency missing`)
      installed = read(manifestPath)
      resolver = createRequire(manifestPath)
    }
    assert.equal(installed.version, entry.version, `${location}: production dependency drift`)
    production[location] = { version: entry.version, integrity: entry.integrity }
  }
  return {
    dependencies, production,
    artifacts: Object.fromEntries(['package.json', 'schema.json', ...files(root, 'dist')]
      .filter(file => file !== 'dist/build-manifest.json')
      .map(file => [file, sha256(path.join(root, file))]))
  }
}
function main() {
  const [command, target] = process.argv.slice(2)
  const root = path.resolve(target || path.join(__dirname, '..'))
  const lockfile = fs.existsSync(path.join(root, 'npm-shrinkwrap.json'))
    ? 'npm-shrinkwrap.json' : 'package-lock.json'
  const lock = read(path.join(root, lockfile))
  const current = snapshot(root, lock)
  const output = path.join(root, 'dist/build-manifest.json')
  if (command === 'write') {
    const sourceFiles = [...files(root, 'src'), ...files(root, 'scripts'), 'tsconfig.json', '.nvmrc']
    const manifest = {
      format: 1,
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      sourceFiles: Object.fromEntries(sourceFiles.map(file => [file, sha256(path.join(root, file))])),
      node: process.versions.node,
      npm: process.env.npm_config_user_agent?.split(' ')[0],
      lockSha256: sha256(path.join(root, lockfile)),
      ...current
    }
    fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n')
  } else {
    assert.equal(command, 'verify', 'Usage: provenance.cjs write|verify [artifact root]')
    const manifest = read(output)
    assert.equal(sha256(path.join(root, lockfile)), manifest.lockSha256, 'Lock differs from build')
    for (const key of ['dependencies', 'production', 'artifacts']) {
      assert.deepEqual(current[key], manifest[key], `${key}: artifact differs from verified build`)
    }
    console.log(`Verified runner ${current.dependencies['@stepci/runner'].version}, OpenAPI ${current.dependencies['@stepci/plugin-openapi'].version}, schema and ${Object.keys(current.production).length} production dependencies`)
  }
}
if (require.main === module) main()
module.exports = { sha256 }

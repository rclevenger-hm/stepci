const fs = require('node:fs')
const path = require('node:path')
fs.rmSync(path.resolve(__dirname, '../dist'), { recursive: true, force: true })
fs.rmSync(path.resolve(__dirname, '../schema.json'), { force: true })

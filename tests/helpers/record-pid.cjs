const fs = require('node:fs')
const path = require('node:path')
if (process.env.STEPCI_TEST_RECORD_PID && path.basename(process.argv[1] || '') === 'index.js') {
  fs.writeFileSync(process.env.STEPCI_TEST_RECORD_PID, String(process.pid))
}
if (process.env.STEPCI_TEST_RECORD_ARGS && path.basename(process.argv[1] || '') === 'index.js') {
  fs.writeFileSync(process.env.STEPCI_TEST_RECORD_ARGS, JSON.stringify(process.argv))
}

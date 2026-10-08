const http = require('node:http')
const { once } = require('node:events')
const TOKEN = 'stepci-fixture-token-not-a-real-credential'

async function startFixture(host = '127.0.0.1') {
  const requests = []
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization,
      marker: request.headers['x-fixture-marker'] })
    if (request.url === '/slow') return // The CLI's request timeout must end this.
    if (request.url === '/disconnect') return request.socket.destroy()
    if (request.url === '/bad-json') return response.end('{invalid json')
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/auth') {
      response.statusCode = request.headers.authorization === `Bearer ${TOKEN}` ? 200 : 401
      return response.end(JSON.stringify({ authenticated: response.statusCode === 200 }))
    }
    if (request.url === '/broken') {
      response.statusCode = 503
      return response.end(JSON.stringify({ status: 'broken' }))
    }
    if (request.url === '/echo-secret') return response.end(JSON.stringify({ token: TOKEN }))
    if (request.url !== '/health') {
      response.statusCode = 404
      return response.end(JSON.stringify({ error: 'not found' }))
    }
    response.end(JSON.stringify({ name: 'Widget', status: 'healthy', items: [],
      nullable: null, count: 42, flag: false, object: { nested: true }, numbers: [1, 2] }))
  })
  server.listen(0, host)
  await once(server, 'listening')
  return {
    url: `http://${host}:${server.address().port}`, requests, server,
    close: () => new Promise(resolve => {
      server.close(resolve)
      server.closeAllConnections()
    })
  }
}
module.exports = { startFixture, TOKEN }

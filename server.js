const http = require('node:http');
const path = require('node:path');
const frontendDir = path.join(__dirname, 'frontend');
require('./frontend/node_modules/@next/env').loadEnvConfig(frontendDir);
const next = require('./frontend/node_modules/next');
const handlers = require('./backend/src/handler');
const routes = [
  ['GET', /^\/health$/, 'health'],
  ['GET', /^\/now\/products$/, 'listNowProducts'],
  ['POST', /^\/now\/plan\/guest$/, 'generateGuestNowPlan'],
  ['POST', /^\/now\/plan$/, 'generateNowPlan'],
  ['POST', /^\/now\/checkout$/, 'checkoutNowOrder'],
  ['GET', /^\/now\/orders$/, 'listNowOrders'],
  ['GET', /^\/now\/orders\/([^/]+)\/track$/, 'trackNowOrder', 'orderId'],
  ['POST', /^\/now\/feedback$/, 'saveNowFeedback'],
  ['GET', /^\/now\/cart$/, 'getNowCart'],
  ['PUT', /^\/now\/cart$/, 'saveNowCart'],
  ['DELETE', /^\/now\/cart$/, 'clearNowCart'],
  ['GET', /^\/admin\/inventory$/, 'listAdminInventory'],
  ['POST', /^\/admin\/inventory$/, 'createAdminInventory'],
  ['PATCH', /^\/admin\/inventory\/([^/]+)$/, 'updateAdminInventory', 'id'],
  ['DELETE', /^\/admin\/inventory\/([^/]+)$/, 'deleteAdminInventory', 'id'],
  ['GET', /^\/admin\/analytics$/, 'getAdminAnalytics'],
  ['POST', /^\/admin\/analytics\/insights$/, 'generateAdminInsights'],
  ['POST', /^\/ask$/, 'askModel', null, true],
  ['GET', /^\/items$/, 'listItems', null, true],
  ['POST', /^\/items$/, 'createItem', null, true],
  ['POST', /^\/now\/seed$/, 'seedNowInventory', null, true],
  ['POST', /^\/now\/embed-products$/, 'embedProducts', null, true],
];
async function handleApi(req, res, url, route) {
  const reply = (status, data) => { res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(data)); };
  if (!route) return reply(404, {success: false, message: 'API route not found.'});
  let body = ''; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) return reply(413, {success: false, message: 'Request body is too large.'});
    body += chunk;
  }
  const match = url.pathname.match(route[1]);
  const event = {body, headers: req.headers, queryStringParameters: Object.fromEntries(url.searchParams), pathParameters: route[3] ? {[route[3]]: decodeURIComponent(match[1])} : {}, requestContext: {}};
  if (route[4]) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const {data, error} = await require('./backend/src/storage').getClient().auth.getUser(token);
    if (error || !data.user?.app_metadata?.groups?.includes('admin')) return reply(403, {success: false, message: 'Administrator access is required.'});
  }
  const token = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
  const result = await require('./backend/src/storage').requestAuth.run(token, () => handlers[route[2]](event));
  res.writeHead(result.statusCode, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  res.end(result.body);
}
async function start() {
  const port = Number(process.env.PORT || 3000);
  const app = next({dev: process.env.NODE_ENV !== 'production', dir: frontendDir, hostname: '0.0.0.0', port});
  await app.prepare();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      // Prefix avoids the /admin page and /admin/inventory page/API collision.
      if (url.pathname.startsWith('/api/')) {
        url.pathname = url.pathname.slice(4);
        return await handleApi(req, res, url, routes.find(x => x[0] === req.method && x[1].test(url.pathname)));
      }
      if (url.pathname === '/health') return await handleApi(req, res, url, routes[0]);
      await app.getRequestHandler()(req, res);
    } catch (error) {
      console.error('Request failed:', error.message);
      if (!res.headersSent) res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({success: false, message: 'The request could not be completed.'}));
    }
  });
  server.listen(port, '0.0.0.0', () => console.log(`InstaKart listening on port ${port}`));
  process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 25000).unref(); });
}
start().catch(error => { console.error(error.message); process.exit(1); });

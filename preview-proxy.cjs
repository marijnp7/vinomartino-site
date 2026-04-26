const http = require('http');

const UPSTREAM = 'http://127.0.0.1:3101';
const PORT = 80;
const USERNAME = 'marijn';
const PASSWORD = 'VinoMartino2026!Preview';

function checkAuth(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) return false;
  const decoded = Buffer.from(auth.slice(6), 'base64').toString();
  const [user, pass] = decoded.split(':');
  return user === USERNAME && pass === PASSWORD;
}

const server = http.createServer((req, res) => {
  if (!checkAuth(req)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="VinoMartino Preview"',
      'Content-Type': 'text/plain'
    });
    res.end('Toegang geweigerd — log in om de preview te bekijken.');
    return;
  }

  const options = {
    hostname: '127.0.0.1',
    port: 3101,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: '127.0.0.1:3101' }
  };
  delete options.headers.authorization;

  const proxy = http.request(options, (upRes) => {
    res.writeHead(upRes.statusCode, upRes.headers);
    upRes.pipe(res);
  });

  proxy.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Preview-site niet beschikbaar.');
  });

  req.pipe(proxy);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Preview proxy running on port ${PORT} — basic auth enabled`);
});

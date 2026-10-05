import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { ApiError, invalid } from './errors.mjs';

const BODY_LIMIT = 4096;
const COOKIE = 'frontierdom_session';

function cookieToken(header = '') {
  if (header.length > 8192) throw invalid();
  const matches = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${COOKIE}=`));
  if (matches.length > 1) throw invalid('Ambiguous session cookie.');
  return matches.length ? matches[0].slice(COOKIE.length + 1) : undefined;
}

async function jsonBody(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw invalid('JSON is required.');
  if (Number(req.headers['content-length']) > BODY_LIMIT) throw invalid('Request body is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw invalid('Request body is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw invalid('Malformed JSON.'); }
}

function clientIP(req, trustProxy) {
  const peer = req.socket.remoteAddress || 'unknown';
  // Only a configured local reverse proxy may supply an address; it must
  // overwrite X-Real-IP with $remote_addr, never pass through client headers.
  if (trustProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) {
    const address = req.headers['x-real-ip'];
    if (typeof address !== 'string' || !isIP(address)) throw invalid('Invalid proxy address.');
    return address;
  }
  return peer;
}

export function createApiServer({ service, siteOrigin, secureCookies = true, trustProxy = false, onError = () => {} }) {
  if (!siteOrigin || new URL(siteOrigin).origin !== siteOrigin ||
      !['https:', 'http:'].includes(new URL(siteOrigin).protocol)) throw new Error('SITE_ORIGIN must be an exact HTTP(S) origin.');
  if (secureCookies && !siteOrigin.startsWith('https://')) throw new Error('Production cookies require an HTTPS origin.');
  const server = createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.method !== 'GET' && req.method !== 'POST') throw new ApiError('NOT_FOUND', 'Endpoint not found.', 404);
      if (req.method === 'POST' && req.headers.origin !== siteOrigin) throw new ApiError('FORBIDDEN', 'Origin is not allowed.', 403);
      const url = new URL(req.url, siteOrigin);
      if (url.search) throw invalid('Query parameters are not supported.');
      const path = url.pathname;
      const token = cookieToken(req.headers.cookie);
      const ip = clientIP(req, trustProxy);
      await service.rate(ip, 'ip', 240, 60);
      let body;
      if (req.method === 'POST') body = await jsonBody(req);
      let result;
      if (req.method === 'POST' && path === '/api/v1/session') {
        if (!token) {
          await service.rate(ip, 'new-session', 5, 3600);
          await service.cleanup();
        }
        const session = await service.session(token, body);
        res.setHeader('Set-Cookie', `${COOKIE}=${session.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session.maxAge}${secureCookies ? '; Secure' : ''}`);
        result = session.body;
      } else if (req.method === 'GET' && path === '/api/v1/state') {
        result = await service.state(token);
      } else if (req.method === 'POST' && path === '/api/v1/quotes') {
        if (token) await service.rate(token, 'quotes', 60, 60);
        result = await service.quote(token, body);
      } else if (req.method === 'POST' && path === '/api/v1/commands') {
        if (token) await service.rate(token, 'commands', 60, 60);
        result = await service.command(token, body);
      } else throw new ApiError('NOT_FOUND', 'Endpoint not found.', 404);
      res.end(JSON.stringify(result));
    } catch (error) {
      const known = error instanceof ApiError;
      if (!known) onError(error);
      res.statusCode = known ? error.status : 503;
      if ([429, 503].includes(res.statusCode)) res.setHeader('Retry-After', res.statusCode === 429 ? '60' : '5');
      res.end(JSON.stringify({ apiVersion: 1, error: {
        code: known ? error.code : 'UNAVAILABLE',
        message: known ? error.message : 'Service temporarily unavailable. Retry the same command ID.',
        retryable: known ? error.retryable : true,
      } }));
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  return server;
}

import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { ApiError, invalid, exactObject, uuid } from './errors.mjs';

const BODY_LIMIT = 4096;
const GUEST_COOKIE = 'frontierdom_session';
const ACCOUNT_COOKIE = 'frontierdom_account';
const FLOW_COOKIE = 'frontierdom_oauth';

function cookieToken(header = '', name = GUEST_COOKIE) {
  if (header.length > 8192) throw invalid();
  const matches = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (matches.length > 1) throw invalid('Ambiguous session cookie.');
  return matches.length ? matches[0].slice(name.length + 1) : undefined;
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

export function createApiServer({ service, auth, authMode = 'supabase', siteOrigin, secureCookies = true, trustProxy = false, onError = () => {} }) {
  if (!siteOrigin || new URL(siteOrigin).origin !== siteOrigin ||
      !['https:', 'http:'].includes(new URL(siteOrigin).protocol)) throw new Error('SITE_ORIGIN must be an exact HTTP(S) origin.');
  if (secureCookies && !siteOrigin.startsWith('https://')) throw new Error('Production cookies require an HTTPS origin.');
  if (!['supabase','guest'].includes(authMode) || (authMode==='supabase' && !auth)) throw new Error('Explicit, configured Auth mode is required.');
  if (secureCookies && authMode==='guest') throw new Error('Guest mode is disabled in production.');
  const cookie = (name, token, maxAge, path='/') => `${name}=${token}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  const server = createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    try {
      if (req.method !== 'GET' && req.method !== 'POST') throw new ApiError('NOT_FOUND', 'Endpoint not found.', 404);
      if (req.method === 'POST' && req.headers.origin !== siteOrigin) throw new ApiError('FORBIDDEN', 'Origin is not allowed.', 403);
      const url = new URL(req.url, siteOrigin);
      const path = url.pathname;
      const encounterPath=path.match(/^\/api\/v1\/encounters\/([^/]+)$/);
      if (url.search && path!=='/api/v1/auth/callback' && !encounterPath) throw invalid('Query parameters are not supported.');
      if (req.url.length>4096) throw invalid('Request URL too large.');
      const token = cookieToken(req.headers.cookie,authMode==='supabase' ? ACCOUNT_COOKIE : GUEST_COOKIE);
      const ip = clientIP(req, trustProxy);
      await service.rate(ip, 'ip', 240, 60);
      let body;
      if (req.method === 'POST') body = await jsonBody(req);
      let result;
      if (authMode==='supabase' && path.startsWith('/api/v1/auth/')) {
        if(req.method==='GET' && path==='/api/v1/auth/session') {
          result=await auth.session(token);
          if(!result.user) res.setHeader('Set-Cookie',cookie(ACCOUNT_COOKIE,'',0));
        } else if(req.method==='POST' && path==='/api/v1/auth/google') {
          await service.rate(ip,'google-login',10,3600);
          const flow=await auth.start(body,token);
          res.setHeader('Set-Cookie',cookie(FLOW_COOKIE,flow.token,flow.maxAge,'/api/v1/auth/callback'));
          result=flow.body;
        } else if(req.method==='GET' && path==='/api/v1/auth/callback') {
          res.setHeader('Set-Cookie',cookie(FLOW_COOKIE,'',0,'/api/v1/auth/callback'));
          let callback;
          try { callback=await auth.callback(cookieToken(req.headers.cookie,FLOW_COOKIE),url.searchParams); }
          catch(error) { if(error instanceof ApiError && error.status===401) callback={redirect:'/?auth=failed'}; else throw error; }
          if(callback.token) res.setHeader('Set-Cookie',[
            cookie(FLOW_COOKIE,'',0,'/api/v1/auth/callback'),cookie(ACCOUNT_COOKIE,callback.token,callback.maxAge)]);
          res.statusCode=303; res.setHeader('Location',callback.redirect); res.end(); return;
        } else if(req.method==='POST' && path==='/api/v1/auth/logout') {
          exactObject(body,[]);
          res.setHeader('Set-Cookie',cookie(ACCOUNT_COOKIE,'',0));
          result=await auth.logout(token,body);
        } else throw new ApiError('NOT_FOUND','Endpoint not found.',404);
      } else if(req.method==='GET' && encounterPath) {
        const names=[...url.searchParams.keys()],raw=url.searchParams.get('from') ?? '0';
        if(names.length>1 || names.some(name=>name!=='from') || !/^(0|[1-9][0-9]{0,3})$/.test(raw) || Number(raw)>2048) throw invalid('Invalid event cursor.');
        const id=uuid(encounterPath[1]),from=Number(raw);
        result=authMode==='supabase' ? await auth.withUser(token,({client})=>service.encounter(token,id,from,client)) : await service.encounter(token,id,from);
      } else if (req.method === 'POST' && path === '/api/v1/session' && authMode==='supabase') {
        result=await auth.withUser(token,({user,client})=>service.accountSession(token,user,body,client));
      } else if (req.method === 'POST' && path === '/api/v1/session') {
        if (!token) {
          await service.rate(ip, 'new-session', 5, 3600);
          await service.cleanup();
        }
        const session = await service.session(token, body);
        res.setHeader('Set-Cookie',cookie(GUEST_COOKIE,session.token,session.maxAge));
        result = session.body;
      } else if (req.method === 'GET' && path === '/api/v1/state') {
        result = authMode==='supabase' ? await auth.withUser(token,({client})=>service.state(token,client)) : await service.state(token);
      } else if (req.method === 'POST' && path === '/api/v1/quotes') {
        if (token) await service.rate(token, 'quotes', 60, 60);
        result = authMode==='supabase' ? await auth.withUser(token,({client})=>service.quote(token,body,client)) : await service.quote(token,body);
      } else if (req.method === 'POST' && path === '/api/v1/commands') {
        if (token) await service.rate(token, 'commands', 60, 60);
        const expectedCompanyId=(authMode==='supabase' || req.headers['x-frontierdom-company-id']!==undefined)
          ? uuid(req.headers['x-frontierdom-company-id']) : undefined;
        result = authMode==='supabase' ? await auth.withUser(token,({client})=>service.command(token,body,client,expectedCompanyId))
          : await service.command(token,body,undefined,expectedCompanyId);
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

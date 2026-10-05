import { createPool } from './database.mjs';
import { createService } from './service.mjs';
import { createApiServer } from './http.mjs';
import { createAccountAuth } from './auth.mjs';
import { createSupabaseAuth } from './supabase-auth.mjs';
import * as economy from '../src/sim/economy/index.js';

const pool = createPool(process.env.DATABASE_URL);
const production = process.env.NODE_ENV === 'production';
const authMode=process.env.AUTH_MODE || 'supabase';
const expedition=process.env.EXPEDITION_MODE==='1';
if(process.env.EXPEDITION_MODE!==undefined && !['0','1'].includes(process.env.EXPEDITION_MODE)) throw new Error('Invalid EXPEDITION_MODE.');
if(production && authMode!=='supabase') throw new Error('Production requires Supabase Auth.');
const auth=authMode==='supabase' ? createAccountAuth({pool,encryptionKey:process.env.AUTH_ENCRYPTION_KEY,
  provider:createSupabaseAuth({url:process.env.SUPABASE_URL,publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY,
    callbackUrl:`${process.env.SITE_ORIGIN}/api/v1/auth/callback`})}) : undefined;
const server = createApiServer({ service: createService(pool, economy,{expedition}), auth, authMode, siteOrigin: process.env.SITE_ORIGIN,
  secureCookies: production, trustProxy: process.env.TRUST_PROXY === '1',
  // Print classifications only: database errors can contain query values or URLs.
  onError: error => console.error('API request failed:', /^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : 'INTERNAL'),
});
const port = Number(process.env.PORT || 3097);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
await pool.query('select 1 from frontierdom.companies limit 1');
server.listen(port, '127.0.0.1', () => console.log(`FRONTIERDOM API listening on 127.0.0.1:${port}`));
const shutdown = () => {
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

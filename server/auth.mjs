import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { transaction } from './database.mjs';
import { ApiError, exactObject } from './errors.mjs';
import { tokenHash } from './service.mjs';

const denied = () => new ApiError('SESSION_REQUIRED', 'Google sign-in is required.', 401);
const hash = token => {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw denied();
  return tokenHash(token);
};
const opaque = () => randomBytes(32).toString('base64url');
const MAX_AGE = 30*24*60*60;

export function createAccountAuth({ pool, provider, encryptionKey }) {
  const key = Buffer.from(encryptionKey || '', 'base64');
  if (key.length !== 32 || key.toString('base64') !== encryptionKey) throw new Error('AUTH_ENCRYPTION_KEY must be canonical base64 of 32 random bytes.');
  function seal(storage, binding) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from(binding));
    const content = JSON.stringify(storage);
    if (Buffer.byteLength(content)>32768) throw new Error('Auth storage too large.');
    const ciphertext = Buffer.concat([cipher.update(content,'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64');
  }
  function open(value, binding) {
    const data = Buffer.from(value,'base64');
    const decipher = createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
    decipher.setAuthTag(data.subarray(12,28)); decipher.setAAD(Buffer.from(binding));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));
  }
  async function alive(client, identity) {
    const { rows } = await client.query('select id from auth.sessions where id=$1 and user_id=$2', [identity.sessionId,identity.user.id]);
    if (!rows[0]) throw denied();
  }
  async function withUser(token, run) {
    const tokenDigest = hash(token);
    return transaction(pool, async client => {
      const { rows: [row] } = await client.query(`select * from frontierdom.account_sessions
        where token_hash=$1 and expires_at>clock_timestamp() for update`,[tokenDigest]);
      if (!row) throw denied();
      const storage = open(row.sealed_storage,`account:${tokenDigest}`);
      const identity = await provider.verify(storage);
      if (identity.user.id!==row.auth_user_id || identity.sessionId!==row.auth_session_id) throw denied();
      await alive(client,identity);
      await client.query('update frontierdom.account_sessions set sealed_storage=$2 where token_hash=$1',
        [tokenDigest,seal(storage,`account:${tokenDigest}`)]);
      // Trading uses this SAME transaction/connection. Logout cannot overtake
      // a verified command; refresh rotation is serialized across processes.
      return run({ ...identity, client });
    });
  }
  return {
    withUser,
    async session(token) {
      try { return await withUser(token, ({ user }) => ({ apiVersion:1,user,provider:'google' })); }
      catch(error) { if(error instanceof ApiError && error.status===401) return { apiVersion:1,user:null,provider:'google' }; throw error; }
    },
    async start(body, previousToken) {
      exactObject(body,[]);
      const token = opaque(), tokenDigest = hash(token), storage = {};
      const url = await provider.start(storage);
      await transaction(pool,async client => {
        await client.query('select pg_advisory_xact_lock(617349023)');
        await client.query('delete from frontierdom.oauth_flows where expires_at<clock_timestamp()');
        const { rows: [count] }=await client.query('select count(*)::int as count from frontierdom.oauth_flows');
        if(count.count>=2000) throw new ApiError('RATE_LIMITED','Sign-in capacity reached. Try again shortly.',429);
        await client.query(`insert into frontierdom.oauth_flows(token_hash,sealed_storage,previous_token_hash,expires_at)
          values($1,$2,$3,clock_timestamp()+interval '10 minutes')`,
        [tokenDigest,seal(storage,`flow:${tokenDigest}`),previousToken ? hash(previousToken) : null]);
      });
      return { body:{apiVersion:1,url},token,maxAge:600 };
    },
    async callback(token, params) {
      const tokenDigest=hash(token);
      // Consume before external exchange; even a failed/retried callback never
      // reuses a verifier. SDK/Auth exchange is the authority for code validity.
      const { rows: [flow] }=await pool.query(`delete from frontierdom.oauth_flows where token_hash=$1
        returning *,expires_at<=clock_timestamp() as expired`,[tokenDigest]);
      if(!flow || flow.expired) throw denied();
      const names=[...params.keys()];
      if(names.length>6 || names.some(name=>!['code','sb_flow_id','error','error_code','error_description'].includes(name)) ||
          new Set(names).size!==names.length) throw denied();
      if(params.get('error')) return { redirect: params.get('error')==='access_denied' ? '/?auth=cancelled' : '/?auth=failed' };
      const code=params.get('code'), flowId=params.get('sb_flow_id');
      if(!code || code.length>2048 || (flowId && !/^[a-zA-Z0-9_-]{1,128}$/.test(flowId))) throw denied();
      const storage=open(flow.sealed_storage,`flow:${tokenDigest}`);
      const identity=await provider.exchange(storage,code,flowId);
      const accountToken=opaque(), digest=hash(accountToken);
      await transaction(pool,async client=>{
        await alive(client,identity);
        await client.query('select pg_advisory_xact_lock(617349024)');
        // Expired account credentials may be removed; companies/commands never are.
        await client.query(`delete from frontierdom.sessions where token_hash in
          (select token_hash from frontierdom.account_sessions where expires_at<clock_timestamp())`);
        await client.query('delete from frontierdom.account_sessions where expires_at<clock_timestamp()');
        if(flow.previous_token_hash) {
          await client.query('select token_hash from frontierdom.account_sessions where token_hash=$1 for update',[flow.previous_token_hash]);
          await client.query('delete from frontierdom.sessions where token_hash=$1',[flow.previous_token_hash]);
          await client.query('delete from frontierdom.account_sessions where token_hash=$1',[flow.previous_token_hash]);
        }
        const { rows:[count] }=await client.query(`select count(*)::int as total,
          count(*) filter(where auth_user_id=$1)::int as own from frontierdom.account_sessions`,[identity.user.id]);
        if(count.total>=5000 || count.own>=10) throw new ApiError('RATE_LIMITED','Account session capacity reached.',429);
        await client.query(`insert into frontierdom.account_sessions(token_hash,auth_user_id,auth_session_id,sealed_storage,expires_at)
          values($1,$2,$3,$4,clock_timestamp()+interval '30 days')`,
        [digest,identity.user.id,identity.sessionId,seal(storage,`account:${digest}`)]);
        // Pending-command recovery starts with GET state after fresh sign-in.
        // Bind only this verified user's existing company; creation remains an
        // explicit POST session operation and never happens during recovery.
        await client.query(`insert into frontierdom.sessions(token_hash,company_id,expires_at)
          select a.token_hash,c.id,a.expires_at from frontierdom.account_sessions a
          join frontierdom.companies c on c.auth_user_id=a.auth_user_id
          where a.token_hash=$1`,[digest]);
      });
      return { token:accountToken,maxAge:MAX_AGE,redirect:'/' };
    },
    async logout(token,body) {
      exactObject(body,[]);
      if(!token) return {apiVersion:1,user:null,provider:'google'};
      const tokenDigest=hash(token);
      let remoteError;
      await transaction(pool,async client=>{
        const { rows:[row] }=await client.query('select * from frontierdom.account_sessions where token_hash=$1 for update',[tokenDigest]);
        if(row) {
          try { await provider.logout(open(row.sealed_storage,`account:${tokenDigest}`)); } catch(error) { remoteError=error; }
          await client.query('delete from frontierdom.sessions where token_hash=$1',[tokenDigest]);
          await client.query('delete from frontierdom.account_sessions where token_hash=$1',[tokenDigest]);
        }
      });
      // Local revocation is committed even if Supabase is down; never claim
      // remote revocation succeeded during an outage. Opaque cookie stays dead.
      if(remoteError && remoteError.status!==401) throw remoteError;
      return {apiVersion:1,user:null,provider:'google'};
    },
  };
}

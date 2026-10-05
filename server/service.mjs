import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { transaction } from './database.mjs';
import { ApiError, actionInput, commandInput, exactObject, uuid } from './errors.mjs';
import { assertExpeditionAction, expeditionBinding, assertExpeditionQuote } from './expedition-boundary.mjs';
import { freezeEncounter, loadEncounter, continueEncounter, companyEncounter } from './encounter-store.mjs';
import {openingInput,beginOpening,validateAdvance,advanceOpening,projectEncounter} from './opening-battle.mjs';

const SESSION_SECONDS = 30 * 24 * 60 * 60;
const QUOTE_SECONDS = 60;
const MAX_COMPANIES = 500;
const MAX_COMMANDS = 1000;
const MAX_STATE_BYTES = 32768;
const MAX_RESPONSE_BYTES = 65536;
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
const unauthorized = () => new ApiError('SESSION_REQUIRED', 'A valid browser session is required.', 401);
const fail = (code, message, status = 409) => { throw new ApiError(code, message, status); };

function checkedToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw unauthorized();
  return tokenHash(token);
}

async function company(client, token, lock = false) {
  const { rows } = await client.query(`select c.id, c.state, c.command_count from frontierdom.companies c
    join frontierdom.sessions s on s.company_id = c.id
    where s.token_hash = $1 and s.expires_at > clock_timestamp()
    ${lock ? 'for update of c' : ''}`, [checkedToken(token)]);
  if (!rows[0]) throw unauthorized();
  return rows[0];
}

// Rule failures come only from the trusted Economy kernel, never client input.
function rules(run) {
  try { return run(); } catch (error) {
    const statuses = { INVALID_REQUEST: 400, NOT_FOUND: 404, INVALID_ROUTE: 409,
      INSUFFICIENT_CASH: 409, INSUFFICIENT_STOCK: 409, INSUFFICIENT_CARGO: 409, CAPACITY_EXCEEDED: 409, STALE_STATE:409 };
    if (Object.hasOwn(statuses, error.code)) throw new ApiError(error.code, error.message, statuses[error.code]);
    throw error;
  }
}

export function createService(pool, economy, { expedition = false } = {}) {
  if(expedition && typeof economy.migrateExpeditionState!=='function') throw new Error('Expedition requires the accepted Economy migration helper.');
  const runTransaction = (client, run) => client ? run(client) : transaction(pool, run);
  const battleReady=typeof economy.applyBattleProgress==='function' && typeof economy.applyBattleSettlement==='function';
  async function snapshot(client,row) {
    return {apiVersion:1,state:row.state,...(expedition?{encounter:projectEncounter(await companyEncounter(client,row.id))}:{})};
  }
  async function prepare(client,row) {
    if(!expedition) return row;
    const state=rules(()=>economy.migrateExpeditionState(row.state));
    for(const key of Object.keys(row.state)) {
      if(key!=='expedition' && key!=='finances' && !isDeepStrictEqual(row.state[key],state[key])) throw new Error('Migration changed existing company state.');
    }
    for(const key of Object.keys(row.state.finances)) {
      if(!isDeepStrictEqual(row.state.finances[key],state.finances[key])) throw new Error('Migration changed existing financial totals.');
    }
    if(Buffer.byteLength(JSON.stringify(state))>MAX_STATE_BYTES) throw new Error('Migrated state exceeds storage bound.');
    if(!isDeepStrictEqual(state,row.state)) await client.query('update frontierdom.companies set state=$2 where id=$1',[row.id,state]);
    row.state=state;return row;
  }
  function allowed(state,action) {
    if(!expedition) return;
    assertExpeditionAction(state,action);
    // Run/fight must never debit a fee or strand a journey before the accepted
    // nonlethal Combat + Economy terminal settlement adapter is installed.
    if(!battleReady && (action.type==='battle_advance' || (action.type==='encounter_choice' && ['run','fight'].includes(action.choice)))) {
      throw new ApiError('UNAVAILABLE','Battle continuation is awaiting the accepted settlement adapter.',503,true);
    }
  }
  return {
    async session(token, body) {
      exactObject(body, []);
      return transaction(pool, async client => {
        if (token) {
          const row = await prepare(client,await company(client, token,expedition));
          await client.query(`update frontierdom.sessions set expires_at = clock_timestamp() + interval '30 days'
            where token_hash = $1`, [checkedToken(token)]);
          return { body: await snapshot(client,row), token, maxAge: SESSION_SECONDS };
        }
        // Serialize global admission independently of company commands.
        await client.query('select pg_advisory_xact_lock(617349021)');
        const { rows: [count] } = await client.query('select count(*)::int as count from frontierdom.companies');
        if (count.count >= MAX_COMPANIES) fail('RATE_LIMITED', 'Prototype company capacity reached.', 429);
        const id = randomUUID();
        const state = rules(() => economy.createInitialState(id));
        if (Buffer.byteLength(JSON.stringify(state)) > MAX_STATE_BYTES) throw new Error('Initial state exceeds storage bound.');
        const newToken = randomBytes(32).toString('base64url');
        await client.query('insert into frontierdom.companies(id, state) values($1, $2)', [id, state]);
        await client.query(`insert into frontierdom.sessions(token_hash, company_id, expires_at)
          values($1, $2, clock_timestamp() + interval '30 days')`, [tokenHash(newToken), id]);
        return { body: { apiVersion: 1, state }, token: newToken, maxAge: SESSION_SECONDS };
      });
    },

    async accountSession(token, user, body, client) {
      exactObject(body, []);
      const userId = uuid(user.id);
      // Called only inside Auth's verified, locked account-session transaction.
      const { rows: [account] } = await client.query(`select auth_user_id, expires_at from frontierdom.account_sessions
        where token_hash=$1 and expires_at>clock_timestamp() for update`, [checkedToken(token)]);
      if (!account || account.auth_user_id !== userId) throw unauthorized();
      await client.query('select pg_advisory_xact_lock(617349021)');
      let { rows: [row] } = await client.query('select id,state from frontierdom.companies where auth_user_id=$1 for update', [userId]);
      if (!row) {
        const { rows: [count] } = await client.query('select count(*)::int as count from frontierdom.companies');
        if (count.count >= MAX_COMPANIES) fail('RATE_LIMITED', 'Prototype company capacity reached.', 429);
        const id = randomUUID();
        const state = rules(() => economy.createInitialState(id));
        await client.query('insert into frontierdom.companies(id,state,auth_user_id) values($1,$2,$3)', [id, state, userId]);
        row = { id, state };
      }
      await prepare(client,row);
      await client.query(`insert into frontierdom.sessions(token_hash,company_id,expires_at) values($1,$2,$3)
        on conflict(token_hash) do update set expires_at=excluded.expires_at
        where frontierdom.sessions.company_id=excluded.company_id`, [checkedToken(token), row.id, account.expires_at]);
      return snapshot(client,row);
    },

    async state(token, client) {
      if(!expedition) return {apiVersion:1,state:(await company(client||pool,token)).state};
      return runTransaction(client,async connection=>snapshot(connection,await prepare(connection,await company(connection,token,true))));
    },

    async encounter(token,id,from=0,existingClient) {
      if(!expedition) throw new ApiError('NOT_FOUND','Endpoint not found.',404);
      return runTransaction(existingClient,async client=>{
        const row=await company(client,token,true);
        return {apiVersion:1,encounter:projectEncounter(await loadEncounter(client,row.id,id),from)};
      });
    },

    async quote(token, body, existingClient) {
      exactObject(body, ['action']);
      const action = actionInput(body.action,{expedition});
      return runTransaction(existingClient, async client => {
        const row = await prepare(client,await company(client, token, true));
        allowed(row.state,action);
        if(action.type==='battle_advance') validateAdvance(await loadEncounter(client,row.id,action.encounterId),action);
        if(action.type==='encounter_choice' && ['run','fight'].includes(action.choice)) openingInput(await loadEncounter(client,row.id,action.encounterId),action);
        const prices = rules(() => economy.quoteAction(row.state, action));
        const disclosures=expedition && typeof economy.describeExpeditionAction==='function' &&
          ['enroll_expedition','encounter_choice','repair','buy_upgrade','secure_relay'].includes(action.type) ?
          rules(()=>economy.describeExpeditionAction(row.state,action)) : undefined;
        const { rows: [clock] } = await client.query('select clock_timestamp() as now');
        const expiresAt = new Date(clock.now.getTime() + QUOTE_SECONDS * 1000).toISOString();
        const quote = { id: randomUUID(), action, expectedRevision: row.state.revision,
          expiresAt, debitPence: prices.debitPence, creditPence: prices.creditPence,
          ...(expedition ? {rulesVersion:'expedition-1',...expeditionBinding(row.state),...(disclosures?{disclosures}:{}),
            encounter: row.state.expedition.pendingJourney ? {
              id:row.state.expedition.pendingJourney.encounterId,
              demands:row.state.expedition.pendingJourney.demands,
              startingHull:row.state.expedition.pendingJourney.startingHull,
            } : null} : {}) };
        const market = row.state.markets.find(item => item.locationId === row.state.locationId);
        const stored = { ...quote, locationId: row.state.locationId, marketRevision: market.revision };
        await client.query('delete from frontierdom.quotes where company_id = $1 and expires_at <= clock_timestamp()', [row.id]);
        const { rows: [count] } = await client.query('select count(*)::int as count from frontierdom.quotes where company_id = $1', [row.id]);
        if (count.count >= 20) fail('RATE_LIMITED', 'Too many outstanding quotes. Wait for expiry.', 429);
        await client.query('insert into frontierdom.quotes(id, company_id, quote, expires_at) values($1,$2,$3,$4)',
          [quote.id, row.id, stored, expiresAt]);
        return { apiVersion: 1, quote };
      });
    },

    async command(token, body, existingClient, expectedCompanyId) {
      const payload = commandInput(body);
      return runTransaction(existingClient, async client => {
        const row = await company(client, token, true);
        if(expectedCompanyId!==undefined && expectedCompanyId!==row.id) {
          fail('ACCOUNT_CHANGED','This pending command belongs to another company. Sign back into the original account to recover it.');
        }
        // Serialize even different IDs against the same company. Receipts and
        // original snapshots are committed with state, so lost responses replay.
        const { rows: [previous] } = await client.query(`select response, payload = $3::jsonb as matches
          from frontierdom.commands where company_id = $1 and command_id = $2`,
        [row.id, payload.commandId, payload]);
        if (previous) {
          if (!previous.matches) fail('IDEMPOTENCY_CONFLICT', 'Command ID was already used with different input.');
          return { ...previous.response, replayed: true };
        }
        if (row.command_count >= MAX_COMMANDS) fail('RATE_LIMITED', 'Prototype command capacity reached. Existing receipts remain replayable.', 429);
        await prepare(client,row);
        const { rows: [stored] } = await client.query(`select quote, expires_at <= clock_timestamp() as expired
          from frontierdom.quotes where id = $1 and company_id = $2`, [payload.quoteId, row.id]);
        // Unknown and foreign quote IDs have the same response: no ownership leak.
        if (!stored) fail('NOT_FOUND', 'Quote not found.', 404);
        if (stored.expired) fail('QUOTE_EXPIRED', 'Quote expired. Request a fresh quote.', 410);
        const quote = stored.quote;
        if(expedition) { assertExpeditionQuote(row.state,quote);allowed(row.state,quote.action); }
        if (payload.expectedRevision !== row.state.revision) fail('STALE_STATE', 'Company state changed. Refresh before trading.');
        const market = row.state.markets.find(item => item.locationId === row.state.locationId);
        if (quote.expectedRevision !== row.state.revision || quote.locationId !== row.state.locationId ||
            quote.marketRevision !== market.revision) fail('STALE_QUOTE', 'Quote no longer matches the market.');
        const prices = rules(() => economy.quoteAction(row.state, quote.action));
        if (prices.debitPence !== quote.debitPence || prices.creditPence !== quote.creditPence) {
          fail('STALE_QUOTE', 'Quote price changed.');
        }
        const { rows: [clock] } = await client.query('select clock_timestamp() as now');
        const beforePending=row.state.expedition?.pendingJourney;
        const metadata={commandId:payload.commandId,receiptId:randomUUID(),occurredAt:clock.now.toISOString(),
          ...(expedition ? {encounterId:beforePending?.encounterId ?? randomUUID(),seed:beforePending?.seed ?? randomBytes(4).readUInt32LE(0)} : {})};
        let record=null,transition=null,eventFrom;
        if(expedition && beforePending && (quote.action.type==='battle_advance' || (quote.action.type==='encounter_choice' && ['run','fight'].includes(quote.action.choice)))) {
          record=await loadEncounter(client,row.id,beforePending.encounterId,{lock:true});
          eventFrom=record.continuation?.events.length || 0;
          transition=quote.action.type==='battle_advance' ? advanceOpening(record,quote.action) : beginOpening(record,quote.action);
          metadata.acceptedCommands=transition.schedule;
        }
        // Keep the final lifetime slot for an actual terminal settlement. The
        // trusted resolver runs purely; rejected choices charge no service fee.
        if(transition && !transition.result && row.command_count>=MAX_COMMANDS-1) {
          fail('RATE_LIMITED','The final command slot is reserved for terminal settlement. Request a terminal advance or pay/drop choice.',429);
        }
        const result=rules(()=>transition?.result ? economy.applyBattleSettlement(row.state,quote.action,transition.result,metadata) :
          quote.action.type==='battle_advance' ? economy.applyBattleProgress(row.state,quote.action,metadata) : economy.applyAction(row.state,quote.action,metadata));
        if(expedition && !beforePending && result.state.expedition.pendingJourney) {
          // Economy alone decides whether this departure reserves an encounter;
          // require departure + settlement capacity before any fare is persisted.
          if(row.command_count>=MAX_COMMANDS-1) fail('RATE_LIMITED','This crossing requires two available command slots for departure and settlement.',429);
          const pending=result.state.expedition.pendingJourney;
          record=await freezeEncounter(client,{id:pending.encounterId,companyId:row.id,departureCommandId:payload.commandId,
            sourceRevision:row.state.revision,seed:pending.seed,input:{pendingJourney:pending,ship:row.state.ship,crew:row.state.crew}});
        } else if(transition) {
          record=await continueEncounter(client,record,transition);
        } else if(expedition && beforePending && !result.state.expedition.pendingJourney) {
          const previous=await loadEncounter(client,row.id,beforePending.encounterId,{lock:true});
          record=await continueEncounter(client,previous,{status:'resolved',choice:quote.action.choice,tick:0,schedule:[],continuation:null,
            result:{kind:'noncombat',receipt:result.receipt}});
        }
        const response = { apiVersion: 1, commandId: payload.commandId, state: result.state,
          receipt: result.receipt, replayed: false,...(expedition ? {encounter:projectEncounter(record||await companyEncounter(client,row.id),eventFrom)} : {}) };
        if (Buffer.byteLength(JSON.stringify(result.state)) > MAX_STATE_BYTES ||
            Buffer.byteLength(JSON.stringify(response)) > MAX_RESPONSE_BYTES) {
          fail('RATE_LIMITED', 'Prototype storage capacity reached.', 429);
        }
        await client.query('update frontierdom.companies set state = $2, command_count = command_count + 1 where id = $1', [row.id, result.state]);
        await client.query('insert into frontierdom.commands(company_id, command_id, payload, response) values($1,$2,$3,$4)',
          [row.id, payload.commandId, payload, response]);
        return response;
      });
    },

    async rate(identity, scope, limit, seconds) {
      const key = `${scope}:${tokenHash(identity)}`;
      const row = await transaction(pool, async client => {
        // A distinct-IP flood must not create unbounded limiter rows. All bucket
        // admission is serialized; expired rows are reclaimed without a timer.
        await client.query('select pg_advisory_xact_lock(617349022)');
        await client.query(`delete from frontierdom.rate_buckets where key in
          (select key from frontierdom.rate_buckets where expires_at < clock_timestamp() limit 16)`);
        const { rows: [capacity] } = await client.query(`select count(*)::int as count,
          exists(select 1 from frontierdom.rate_buckets where key=$1) as present from frontierdom.rate_buckets`, [key]);
        if (!capacity.present && capacity.count >= 5000) fail('RATE_LIMITED', 'Prototype request capacity reached.', 429);
        const { rows: [bucket] } = await client.query(`insert into frontierdom.rate_buckets(key, window_id, hits, expires_at)
          values($1, floor(extract(epoch from clock_timestamp()) / $2), 1,
            clock_timestamp() + ($2 * interval '1 second'))
          on conflict(key) do update set
            hits = case when frontierdom.rate_buckets.window_id = excluded.window_id then least(frontierdom.rate_buckets.hits + 1, 1000000) else 1 end,
            window_id = excluded.window_id, expires_at = excluded.expires_at returning hits`, [key, seconds]);
        return bucket;
      });
      if (row.hits > limit) fail('RATE_LIMITED', 'Too many requests. Try again shortly.', 429);
    },

    // Opportunistic bounded cleanup, invoked on guest creation; no scheduler.
    async cleanup() {
      await pool.query(`delete from frontierdom.rate_buckets where key in
        (select key from frontierdom.rate_buckets where expires_at < clock_timestamp() limit 256)`);
      await pool.query(`delete from frontierdom.quotes where id in
        (select id from frontierdom.quotes where expires_at < clock_timestamp() limit 256)`);
    },
  };
}

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { transaction } from './database.mjs';
import { ApiError, actionInput, commandInput, exactObject } from './errors.mjs';

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
      INSUFFICIENT_CASH: 409, INSUFFICIENT_STOCK: 409, INSUFFICIENT_CARGO: 409, CAPACITY_EXCEEDED: 409 };
    if (Object.hasOwn(statuses, error.code)) throw new ApiError(error.code, error.message, statuses[error.code]);
    throw error;
  }
}

export function createService(pool, economy) {
  return {
    async session(token, body) {
      exactObject(body, []);
      return transaction(pool, async client => {
        if (token) {
          const row = await company(client, token);
          await client.query(`update frontierdom.sessions set expires_at = clock_timestamp() + interval '30 days'
            where token_hash = $1`, [checkedToken(token)]);
          return { body: { apiVersion: 1, state: row.state }, token, maxAge: SESSION_SECONDS };
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

    async state(token) {
      const row = await company(pool, token);
      return { apiVersion: 1, state: row.state };
    },

    async quote(token, body) {
      exactObject(body, ['action']);
      const action = actionInput(body.action);
      return transaction(pool, async client => {
        const row = await company(client, token, true);
        const prices = rules(() => economy.quoteAction(row.state, action));
        const { rows: [clock] } = await client.query('select clock_timestamp() as now');
        const expiresAt = new Date(clock.now.getTime() + QUOTE_SECONDS * 1000).toISOString();
        const quote = { id: randomUUID(), action, expectedRevision: row.state.revision,
          expiresAt, debitPence: prices.debitPence, creditPence: prices.creditPence };
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

    async command(token, body) {
      const payload = commandInput(body);
      return transaction(pool, async client => {
        const row = await company(client, token, true);
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
        const { rows: [stored] } = await client.query(`select quote, expires_at <= clock_timestamp() as expired
          from frontierdom.quotes where id = $1 and company_id = $2`, [payload.quoteId, row.id]);
        // Unknown and foreign quote IDs have the same response: no ownership leak.
        if (!stored) fail('NOT_FOUND', 'Quote not found.', 404);
        if (stored.expired) fail('QUOTE_EXPIRED', 'Quote expired. Request a fresh quote.', 410);
        const quote = stored.quote;
        if (payload.expectedRevision !== row.state.revision) fail('STALE_STATE', 'Company state changed. Refresh before trading.');
        const market = row.state.markets.find(item => item.locationId === row.state.locationId);
        if (quote.expectedRevision !== row.state.revision || quote.locationId !== row.state.locationId ||
            quote.marketRevision !== market.revision) fail('STALE_QUOTE', 'Quote no longer matches the market.');
        const prices = rules(() => economy.quoteAction(row.state, quote.action));
        if (prices.debitPence !== quote.debitPence || prices.creditPence !== quote.creditPence) {
          fail('STALE_QUOTE', 'Quote price changed.');
        }
        const { rows: [clock] } = await client.query('select clock_timestamp() as now');
        const result = rules(() => economy.applyAction(row.state, quote.action,
          { commandId: payload.commandId, receiptId: randomUUID(), occurredAt: clock.now.toISOString() }));
        const response = { apiVersion: 1, commandId: payload.commandId, state: result.state,
          receipt: result.receipt, replayed: false };
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
